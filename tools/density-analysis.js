#!/usr/bin/env node
/**
 * Measures two things that decide the Near Me strategy:
 *   1. What the current full-dataset distance sort actually costs.
 *   2. How merchant density varies across Singapore -- i.e. what radius contains a
 *      useful number of merchants, and how much that differs between dense heartland
 *      and sparse industrial areas.
 *
 * The point is to pick a radius from the data rather than guess a round number.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

const DATA = eval(src.split('\n').find(l => l.startsWith('const DATA = [')).replace(/^const DATA = /, '').replace(/;$/, ''));
const block = src.match(/\/\/ GEO-DATA-START\n([\s\S]*?)\/\/ GEO-DATA-END/)[1];
const { POSTAL, STATIONS, AREAS } = new Function(block + '\nreturn {POSTAL, STATIONS, AREAS};')();

const R = 6371000, rad = d => d * Math.PI / 180;
function hav(lat1, lon1, lat2, lon2) {
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 +
            Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

const pts = DATA.map(r => POSTAL[r[3]]).filter(Boolean).map(p => [p[0], p[1]]);
console.log(`merchant rows with coordinates: ${pts.length}\n`);

// ---- 1. cost of the current approach ----------------------------------------
const origin = [1.3316, 103.8685]; // Potong Pasir
function timed(label, fn, reps = 20) {
  fn(); // warm up
  const t = process.hrtime.bigint();
  for (let i = 0; i < reps; i++) fn();
  const ms = Number(process.hrtime.bigint() - t) / 1e6 / reps;
  console.log(`  ${label.padEnd(38)} ${ms.toFixed(2)} ms`);
  return ms;
}
console.log('COST (per Near Me invocation, desktop):');
timed('distance calc over all rows', () => { for (const p of pts) hav(origin[0], origin[1], p[0], p[1]); });
timed('distance + full sort (current)', () => {
  pts.map(p => ({ p, d: hav(origin[0], origin[1], p[0], p[1]) })).sort((a, b) => a.d - b.d);
});
timed('distance + partial select (top 100)', () => {
  const top = [];
  for (const p of pts) {
    const d = hav(origin[0], origin[1], p[0], p[1]);
    if (top.length < 100) { top.push(d); if (top.length === 100) top.sort((a, b) => a - b); }
    else if (d < top[99]) { top[99] = d; let i = 99; while (i > 0 && top[i] < top[i - 1]) { [top[i], top[i - 1]] = [top[i - 1], top[i]]; i--; } }
  }
});

// ---- 2. density: distance to the Nth nearest merchant ------------------------
// Sample origins from merchant locations themselves: that is where people actually
// are when they open this, far better than a uniform grid over reservoirs and sea.
const sample = [];
for (let i = 0; i < pts.length; i += Math.max(1, Math.floor(pts.length / 400))) sample.push(pts[i]);

const Ns = [10, 20, 50, 100];
const results = {};
for (const N of Ns) results[N] = [];
const radii = [250, 500, 1000, 2000, 5000];
const countsAt = {};
for (const r of radii) countsAt[r] = [];

for (const o of sample) {
  const ds = pts.map(p => hav(o[0], o[1], p[0], p[1])).sort((a, b) => a - b);
  for (const N of Ns) results[N].push(ds[Math.min(N - 1, ds.length - 1)]);
  for (const r of radii) countsAt[r].push(ds.filter(d => d <= r).length);
}
const pct = (arr, p) => { const s = [...arr].sort((a, b) => a - b); return s[Math.floor(s.length * p)]; };

console.log(`\nDENSITY (${sample.length} sampled origins at real merchant locations)`);
console.log('\nRadius needed to reach N merchants:');
console.log('   N      median      p90       p99        max');
for (const N of Ns) {
  const a = results[N];
  console.log(`  ${String(N).padStart(3)}   ${(pct(a,.5)/1000).toFixed(2)}km    ${(pct(a,.9)/1000).toFixed(2)}km   ${(pct(a,.99)/1000).toFixed(2)}km   ${(Math.max(...a)/1000).toFixed(1)}km`);
}
console.log('\nMerchants found within a fixed radius:');
console.log('  radius   median     p10      p90      max');
for (const r of radii) {
  const a = countsAt[r];
  console.log(`  ${String(r).padStart(5)}m   ${String(pct(a,.5)).padStart(5)}    ${String(pct(a,.1)).padStart(5)}    ${String(pct(a,.9)).padStart(5)}    ${String(Math.max(...a)).padStart(5)}`);
}
