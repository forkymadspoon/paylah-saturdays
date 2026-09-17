#!/usr/bin/env node
/**
 * Resolve coordinates for every currently-operating MRT/LRT station.
 *
 * Station names come from Wikipedia's "In operation" tables (parsed separately, so
 * stations that are built-but-unopened -- Bedok South, Sungei Bedok, Marina South,
 * Mount Pleasant -- are excluded by construction rather than by memory). Coordinates
 * come from OneMap, the same authority used for merchant postal codes, so station
 * and merchant positions are on a consistent basis.
 *
 * Output: mrt-stations.json  [{name, lat, lon, kind}]
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'mrt-stations.json');
const API = 'https://www.onemap.gov.sg/api/common/elastic/search';
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function lookup(term) {
  const url = `${API}?searchVal=${encodeURIComponent(term)}&returnGeom=Y&getAddrDetails=Y`;
  for (let a = 1; a <= 3; a++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
      const j = await res.json();
      return j.results || [];
    } catch { await sleep(500 * a); }
  }
  return [];
}

// Pick the result that actually looks like the station we asked for, not a nearby
// shop or road that merely shares the name.
function pickStation(results, name, kind) {
  const up = name.toUpperCase();

  // Require an EXACT station-name match first. Without this, a short name matches a
  // longer one -- "Tampines" hits TAMPINES EAST, "Pasir Ris" hits PASIR RIS EAST (a
  // Cross Island Line station that is not even open yet), "Punggol" hits PUNGGOL
  // COAST, "Orchard" hits ORCHARD BOULEVARD. Silent, and wrong by kilometres.
  const strip = t => (t || '').toUpperCase().replace(/\s*\([^)]*\)\s*$/, '').trim();
  const exactWanted = [`${up} ${kind} STATION`, `${up} MRT/LRT STATION`, `${up} STATION`];
  for (const r of results) {
    if (exactWanted.includes(strip(r.SEARCHVAL)) || exactWanted.includes(strip(r.BUILDING))) return r;
  }

  const scored = results.map(r => {
    const sv = (r.SEARCHVAL || '').toUpperCase();
    const bl = (r.BUILDING || '').toUpperCase();
    let score = 0;
    if (/\b(MRT|LRT)\b/.test(sv) || /\b(MRT|LRT)\b/.test(bl)) score += 10;
    if (/STATION/.test(sv) || /STATION/.test(bl)) score += 5;
    if (sv.startsWith(up) || bl.startsWith(up)) score += 4;
    if (sv.includes(up) || bl.includes(up)) score += 2;
    if (/EXIT|ENTRANCE/.test(sv)) score -= 3;   // exits are offset from the station box
    return { r, score };
  }).sort((a, b) => b.score - a.score);
  return scored.length && scored[0].score > 0 ? scored[0].r : null;
}

(async () => {
  const mrt = JSON.parse(fs.readFileSync(path.join(__dirname, 'mrt-names.json'), 'utf8'));
  const lrt = JSON.parse(fs.readFileSync(path.join(__dirname, 'lrt-names.json'), 'utf8'));
  const wanted = [
    ...mrt.map(s => ({ name: s.name, kind: 'MRT' })),
    ...lrt.filter(s => !mrt.some(m => m.name === s.name)).map(s => ({ name: s.name, kind: 'LRT' }))
  ];

  const existing = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : [];
  const have = new Map(existing.map(s => [s.name, s]));
  const out = [...existing];
  const failed = [];

  console.log(`${wanted.length} stations | ${have.size} cached`);
  for (const st of wanted) {
    if (have.has(st.name)) continue;
    const suffix = st.kind === 'LRT' ? 'LRT STATION' : 'MRT STATION';
    let results = await lookup(`${st.name} ${suffix}`);
    let hit = pickStation(results, st.name, st.kind);
    if (!hit) { // some are signed "MRT/LRT STATION"
      await sleep(180);
      results = await lookup(`${st.name} STATION`);
      hit = pickStation(results, st.name, st.kind);
    }
    if (!hit) { failed.push(st.name); console.warn(`  FAIL ${st.name}`); await sleep(180); continue; }
    const lat = parseFloat(hit.LATITUDE), lon = parseFloat(hit.LONGITUDE);
    if (!isFinite(lat) || lat < 1.15 || lat > 1.48 || lon < 103.6 || lon > 104.1) {
      failed.push(`${st.name} (bad coords)`); console.warn(`  FAIL ${st.name} coords`); await sleep(180); continue;
    }
    out.push({ name: st.name, kind: st.kind, lat: +lat.toFixed(6), lon: +lon.toFixed(6), matched: hit.SEARCHVAL });
    await sleep(180);
  }

  out.sort((a, b) => a.name.localeCompare(b.name));
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
  console.log(`\nresolved ${out.length}/${wanted.length}`);
  if (failed.length) console.log(`failed (${failed.length}):`, failed.join(', '));
})();
