#!/usr/bin/env node
/**
 * Attach rail-line membership to each operating station, so the UI can show which line
 * a station is on.
 *
 * Line codes come from the same Wikipedia "In operation" tables used for the station
 * list, NOT from OneMap: OneMap returns a single code per station and sometimes a future
 * one (it answers "Choa Chu Kang" with JS1, its unopened Jurong Region Line code, rather
 * than NS4/BP1). The tables give every line at an interchange.
 *
 * Colours are the official line colours, read from Wikipedia's rail-colour data modules
 * (Module:Adjacent stations/SMRT and .../Singapore LRT) rather than from memory.
 *
 * Updates mrt-stations.json in place, adding: lines: ["NS","EW"]
 */
const fs = require('fs');
const path = require('path');

// Official line colours. Keyed by the two-letter station-code prefix.
const LINE = {
  NS: { name: 'North South',          color: '#d42e12' },
  EW: { name: 'East West',            color: '#009645' },
  CG: { name: 'Changi Airport Branch', color: '#b85600' },
  NE: { name: 'North East',           color: '#9900aa' },
  CC: { name: 'Circle',               color: '#fa9e0d' },
  CE: { name: 'Circle',               color: '#fa9e0d' },
  DT: { name: 'Downtown',             color: '#005ec4' },
  TE: { name: 'Thomson-East Coast',   color: '#9D5B25' },
  // All three LRT systems share one colour on the official map.
  BP: { name: 'Bukit Panjang LRT',    color: '#748477' },
  SE: { name: 'Sengkang LRT',         color: '#748477' },
  SW: { name: 'Sengkang LRT',         color: '#748477' },
  STC:{ name: 'Sengkang LRT',         color: '#748477' },
  PE: { name: 'Punggol LRT',          color: '#748477' },
  PW: { name: 'Punggol LRT',          color: '#748477' },
  PTC:{ name: 'Punggol LRT',          color: '#748477' }
};

function parseStationLines(file, startHeading, endHeading) {
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  const start = lines.findIndex(l => l.startsWith(startHeading));
  const end = lines.findIndex(l => l.startsWith(endHeading));
  const block = lines.slice(start, end === -1 ? undefined : end);

  const clean = raw => {
    raw = raw.replace(/\{\{sort\|[^|]*\|(.*?)\}\}/g, '$1')
             .replace(/\[\[[^|\]]*\|([^\]]*)\]\]/g, '$1')
             .replace(/\[\[([^\]]*)\]\]/g, '$1')
             .replace(/\{\{[^{}]*\}\}/g, '');
    return raw.replace(/[‡†*^]/g, '').trim();
  };

  const out = new Map();
  for (let i = 0; i < block.length; i++) {
    const m = block[i].match(/^!\s*scope="row"[^|]*\|\s*(.+)$/);
    if (!m) continue;
    const name = clean(m.group ? m.group(1) : m[1]);
    if (!name) continue;
    const codes = new Set();
    for (let j = i + 1; j < Math.min(i + 12, block.length); j++) {
      if (/^!\s*scope="row"/.test(block[j])) break;
      // An interchange puts every line in ONE call as alternating pairs:
      //   {{SMRT code|NS|24|NE|6|CC|1}}  -> NS, NE, CC
      // and the LRT tables use {{SLRT code|SE|3}}. Match either template, then pull
      // every parameter that is a known line prefix.
      for (const call of block[j].matchAll(/\{\{S(?:M|L)RT code\|([^}]*)\}\}/g)) {
        for (const param of call[1].split('|')) {
          const t = param.trim().toUpperCase();
          if (LINE[t]) codes.add(t);
        }
      }
    }
    if (codes.size) out.set(name, [...codes]);
  }
  return out;
}

const T = path.join(__dirname);
const mrt = parseStationLines(path.join(T, 'mrt-wiki.txt'), '===In operation===', '===Non-operational===');
const lrt = parseStationLines(path.join(T, 'lrt-wiki.txt'), '=== In operation ===', '=== Closed stations ===');

const STATIONS = path.join(__dirname, '..', 'mrt-stations.json');
const stations = JSON.parse(fs.readFileSync(STATIONS, 'utf8'));

let withLines = 0;
const unknown = [];
for (const s of stations) {
  const codes = [...new Set([...(mrt.get(s.name) || []), ...(lrt.get(s.name) || [])])]
    .filter(c => LINE[c]);
  if (codes.length) { s.lines = codes; withLines++; }
  else { delete s.lines; unknown.push(s.name); }
}
fs.writeFileSync(STATIONS, JSON.stringify(stations, null, 1));

console.log(`stations with line data: ${withLines}/${stations.length}`);
if (unknown.length) console.log(`no line found (${unknown.length}): ${unknown.join(', ')}`);
const counts = {};
for (const s of stations) for (const c of (s.lines || [])) counts[c] = (counts[c] || 0) + 1;
console.log('stations per line:', counts);
const multi = stations.filter(s => (s.lines || []).length > 1);
console.log(`interchanges (2+ lines): ${multi.length}`);
console.log('  e.g. ' + multi.slice(0, 6).map(s => `${s.name}[${s.lines.join('/')}]`).join(', '));

fs.writeFileSync(path.join(__dirname, 'line-colours.json'), JSON.stringify(LINE, null, 1));
console.log('wrote tools/line-colours.json');
