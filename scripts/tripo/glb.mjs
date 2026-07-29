import fs from 'node:fs';

/**
 * Minimal GLB reader for the §6.6 QC gate.
 *
 * Reads the container and the glTF JSON chunk only — enough to answer every §6.6
 * question about budgets, materials, colour spaces and alpha mode without pulling in a
 * loader. scripts/check_tripo_quality.py already proved the principle (it is how we
 * established the existing generation is 4K, not 8K); this is the Node side so the gate
 * runs in the same place as every other validator.
 *
 * Deliberately does NOT decode buffers. Triangle counts come from accessor counts, which
 * is exact for indexed primitives and the right number for a budget check.
 */
export function readGlb(file) {
  const buf = fs.readFileSync(file);
  if (buf.length < 12 || buf.readUInt32LE(0) !== 0x46546c67) {
    throw new Error('not a GLB (bad magic)');
  }
  const version = buf.readUInt32LE(4);
  let off = 12;
  let json = null;
  let binLength = 0;
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32LE(off);
    const type = buf.readUInt32LE(off + 4);
    const start = off + 8;
    if (type === 0x4e4f534a) json = JSON.parse(buf.subarray(start, start + len).toString('utf8'));
    else if (type === 0x004e4942) binLength = len;
    off = start + len + ((4 - (len % 4)) % 4);
  }
  if (!json) throw new Error('GLB has no JSON chunk');
  return { json, version, binLength, fileSize: buf.length };
}

/** Triangle count across every primitive, from accessor counts. */
export function triangleCount(gltf) {
  let tris = 0;
  for (const mesh of gltf.meshes ?? []) {
    for (const p of mesh.primitives ?? []) {
      // mode 4 (or absent) is TRIANGLES; anything else is not a triangle budget item
      if (p.mode !== undefined && p.mode !== 4) continue;
      const n = p.indices !== undefined
        ? gltf.accessors?.[p.indices]?.count ?? 0
        : gltf.accessors?.[p.attributes?.POSITION]?.count ?? 0;
      tris += Math.floor(n / 3);
    }
  }
  return tris;
}

/** Embedded image dimensions, read from the PNG/JPEG headers inside the buffer. */
export function imageSizes(file) {
  const buf = fs.readFileSync(file);
  const out = [];
  // PNG: 89 50 4E 47 ... IHDR at +16 gives width/height big-endian
  for (let i = 0; i + 24 < buf.length; i++) {
    if (buf[i] === 0x89 && buf[i + 1] === 0x50 && buf[i + 2] === 0x4e && buf[i + 3] === 0x47) {
      out.push({ type: 'png', w: buf.readUInt32BE(i + 16), h: buf.readUInt32BE(i + 20) });
      i += 24;
    }
  }
  return out;
}

export function materialSummary(gltf) {
  return (gltf.materials ?? []).map((m) => {
    const pbr = m.pbrMetallicRoughness ?? {};
    return {
      name: m.name ?? '(unnamed)',
      baseColorTexture: pbr.baseColorTexture?.index,
      metallicRoughnessTexture: pbr.metallicRoughnessTexture?.index,
      normalTexture: m.normalTexture?.index,
      occlusionTexture: m.occlusionTexture?.index,
      emissiveTexture: m.emissiveTexture?.index,
      metallicFactor: pbr.metallicFactor ?? 1,
      roughnessFactor: pbr.roughnessFactor ?? 1,
      baseColorFactor: pbr.baseColorFactor ?? [1, 1, 1, 1],
      alphaMode: m.alphaMode ?? 'OPAQUE',
      doubleSided: m.doubleSided === true,
    };
  });
}
