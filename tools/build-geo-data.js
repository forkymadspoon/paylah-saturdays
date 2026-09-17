#!/usr/bin/env node
/**
 * Turn the geocode cache + station list into the compact blocks embedded in index.html.
 *
 * Nearest stations are resolved here, at build time, rather than in the browser: the
 * naive runtime version is 3,619 postal codes x 184 stations = ~666k haversine calls
 * on every page load, for an answer that never changes between builds.
 *
 * Emits tools/geo-data.js containing:
 *   STATIONS  [[name, lat, lon], ...]
 *   POSTAL    { "520107": [lat, lon, s1, d1, s2, d2] }   s* = index into STATIONS
 *                                                        d* = metres, rounded to 10
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const cache = JSON.parse(fs.readFileSync(path.join(ROOT, 'postal-to-latlong.json'), 'utf8'));
const stations = JSON.parse(fs.readFileSync(path.join(ROOT, 'mrt-stations.json'), 'utf8'));
// URA planning area per postal code, produced by tools/assign-areas.js.
const postalArea = fs.existsSync(path.join(__dirname, 'postal-to-area.json'))
  ? JSON.parse(fs.readFileSync(path.join(__dirname, 'postal-to-area.json'), 'utf8'))
  : {};

const R = 6371000, rad = d => d * Math.PI / 180;
function haversine(lat1, lon1, lat2, lon2) {
  const dLat = rad(lat2 - lat1), dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

const ST = stations.map(s => [s.name, +s.lat.toFixed(5), +s.lon.toFixed(5)]);
// Planning-area names are stored once and referenced by index, since ~3,600 postal
// codes share only ~55 of them.
const AREAS = [...new Set(Object.values(postalArea))].sort();
const areaIdx = new Map(AREAS.map((a, i) => [a, i]));

const POSTAL = {};
let worstNearest = { d: 0, postal: null };
for (const [postal, g] of Object.entries(cache)) {
  const ranked = ST
    .map((s, i) => ({ i, d: haversine(g.lat, g.lon, s[1], s[2]) }))
    .sort((a, b) => a.d - b.d);
  const [a, b] = ranked;
  const ai = areaIdx.has(postalArea[postal]) ? areaIdx.get(postalArea[postal]) : -1;
  POSTAL[postal] = [
    +g.lat.toFixed(5), +g.lon.toFixed(5),
    a.i, Math.round(a.d / 10) * 10,
    b.i, Math.round(b.d / 10) * 10,
    ai
  ];
  if (a.d > worstNearest.d) worstNearest = { d: a.d, postal };
}

const out =
  `const STATIONS = ${JSON.stringify(ST)};\n` +
  `const AREAS = ${JSON.stringify(AREAS)};\n` +
  `const POSTAL = ${JSON.stringify(POSTAL)};\n`;

// Inject straight into index.html between the markers, so the page and the cache
// can never drift apart.
const PAGE = path.join(ROOT, 'index.html');
let html = fs.readFileSync(PAGE, 'utf8');
const A = '// GEO-DATA-START\n', B = '// GEO-DATA-END';
const i = html.indexOf(A), j = html.indexOf(B);
if (i === -1 || j === -1) throw new Error('GEO-DATA markers not found in index.html');
html = html.slice(0, i + A.length) + out + html.slice(j);
fs.writeFileSync(PAGE, html);
console.log('injected into index.html');

console.log(`stations: ${ST.length}`);
console.log(`planning areas: ${AREAS.length}`);
console.log(`postal codes: ${Object.keys(POSTAL).length}`);
console.log(`geo-data.js: ${(out.length / 1024).toFixed(0)} KB`);
console.log(`furthest any merchant is from a station: ${(worstNearest.d / 1000).toFixed(1)} km (S${worstNearest.postal})`);

// Distribution sanity check -- if most merchants were kilometres from a station,
// something would be wrong with either the coordinates or the station list.
const d = Object.values(POSTAL).map(v => v[3]).sort((a, b) => a - b);
const pct = p => d[Math.floor(d.length * p)];
console.log(`nearest-station distance: median ${pct(0.5)}m, p90 ${pct(0.9)}m, p99 ${pct(0.99)}m, max ${d[d.length - 1]}m`);
