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

/**
 * Embedded image dimensions.
 *
 * WebP handling is not optional here. The first version of this scanned for PNG headers
 * only — and every one of the 153 shipped models is WebP (EXT_texture_webp), so the
 * §6.6 texture-budget check silently examined nothing and reported a pass for all of
 * them. That is precisely the failure the NOT_ENFORCED list exists to prevent, shipped
 * inside the gate that prints it. Any format added to the pipeline must be added here
 * too, or the budget check quietly stops applying.
 */
export function imageSizes(file) {
  const buf = fs.readFileSync(file);
  const out = [];

  for (let i = 0; i + 30 < buf.length; i++) {
    // PNG: 89 50 4E 47, IHDR width/height big-endian at +16
    if (buf[i] === 0x89 && buf[i + 1] === 0x50 && buf[i + 2] === 0x4e && buf[i + 3] === 0x47) {
      out.push({ type: 'png', w: buf.readUInt32BE(i + 16), h: buf.readUInt32BE(i + 20) });
      i += 24;
      continue;
    }
    // WebP: 'RIFF' .... 'WEBP' <chunk>
    if (buf[i] === 0x52 && buf[i + 1] === 0x49 && buf[i + 2] === 0x46 && buf[i + 3] === 0x46
        && buf[i + 8] === 0x57 && buf[i + 9] === 0x45 && buf[i + 10] === 0x42 && buf[i + 11] === 0x50) {
      const tag = buf.toString('ascii', i + 12, i + 16);
      if (tag === 'VP8X') {
        // extended: 24-bit canvas width-1 / height-1, little-endian, at +24
        out.push({
          type: 'webp',
          w: (buf.readUIntLE(i + 24, 3) & 0xffffff) + 1,
          h: (buf.readUIntLE(i + 27, 3) & 0xffffff) + 1,
        });
      } else if (tag === 'VP8L') {
        // lossless: 14 bits each, packed little-endian after the 0x2f signature
        const b = buf.readUInt32LE(i + 21);
        out.push({ type: 'webp', w: (b & 0x3fff) + 1, h: ((b >> 14) & 0x3fff) + 1 });
      } else if (tag === 'VP8 ') {
        // lossy: 16-bit width/height (14 significant bits) after the start code
        out.push({
          type: 'webp',
          w: buf.readUInt16LE(i + 26) & 0x3fff,
          h: buf.readUInt16LE(i + 28) & 0x3fff,
        });
      }
      i += 16;
      continue;
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
