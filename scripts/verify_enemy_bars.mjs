#!/usr/bin/env node
/**
 * Fast, asset-free guard for compact floating enemy markers.
 *
 * A miniature paper-doll canvas used to stay 44×48 CSS pixels even when its
 * mech was hundreds of metres away. It covered the real model and looked like
 * a black box. The complete paper dolls belong only to the self and selected
 * target readouts.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(ROOT, 'src', 'ui', 'hud.ts'), 'utf8');
const start = source.indexOf('private drawEnemyBars(');
const end = source.indexOf('/** Screen-space nav marker:', start);
const enemyBars = start >= 0 && end > start ? source.slice(start, end) : '';

let passed = 0;
const check = (condition, label) => {
  if (!condition) {
    console.error(`✗ ${label}`);
    process.exitCode = 1;
    return;
  }
  passed++;
  console.log(`✓ ${label}`);
};

check(Boolean(enemyBars), 'enemy marker implementation is present');
check(!enemyBars.includes('<canvas'), 'floating enemy markers contain no canvas');
check(!enemyBars.includes('drawDoll('), 'floating enemy markers never draw paper dolls');
check(
  enemyBars.includes('bar.innerHTML = `<div class="nm"></div><div class="bg"><div class="f"></div></div>`'),
  'floating enemy markers keep the name and hull-health bar',
);
check(!source.includes('.ebar .mc'), 'obsolete floating paper-doll styling is absent');
check(
  source.includes('this.drawDoll(this.targetCanvas, target, subtarget);'),
  'selected-target paper doll remains available',
);
check(
  source.includes('this.drawDoll(this.selfCanvas, player, null);'),
  'self paper doll remains available',
);

if (process.exitCode) {
  console.error(`\nEnemy marker source guard failed (${passed}/7 checks passed)`);
} else {
  console.log(`\n${passed} enemy marker source checks passed`);
}
