#!/usr/bin/env node
/**
 * Second-pass geocoding for postal codes that do not exist in OneMap.
 *
 * The primary pass (tools/geocode.js) looks up postal codes. 48 of them return no
 * result, because they are wrong in the source PDF -- transpositions (532201 for the
 * real 523201), placeholders (500000), and similar. Those rows lose their nearest-MRT
 * and planning-area tags.
 *
 * This pass geocodes the merchant's ADDRESS instead, then checks that what came back is
 * actually the address we asked for. That check is the whole point: OneMap answers a
 * fuzzy address query with something nearby rather than nothing, so an unverified match
 * would place merchants on the wrong street with no visible sign of it.
 *
 * Accepted only when the block number AND the road name both match. Everything else is
 * written out for a human to look at, not quietly used.
 *
 * Output: tools/postal-rescued.json
 *   { "<bad postal>": { lat, lon, realPostal, matchedAddr, query, confidence } }
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const API = 'https://www.onemap.gov.sg/api/common/elastic/search';
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Road-type abbreviations as they appear in this dataset, so "AVE 8" and "AVENUE 8"
// compare equal. Deliberately small: only forms actually present in the failing rows.
const EXPAND = {
  ST: 'STREET', STR: 'STREET', AVE: 'AVENUE', AV: 'AVENUE', RD: 'ROAD',
  CRES: 'CRESCENT', CRESENT: 'CRESCENT', DR: 'DRIVE', LOR: 'LORONG',
  JLN: 'JALAN', CTRL: 'CENTRAL', BLK: ''
};

function normalize(s) {
  return (s || '').toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    // "ST25" -> "ST 25", so an unspaced abbreviation still expands. Only splits
    // LETTER-then-DIGIT; block numbers like "289H" are digit-then-letter and must
    // stay intact.
    .replace(/([A-Z])(\d)/g, '$1 $2')
    .split(/\s+/).filter(Boolean)
    .map(t => (EXPAND[t] !== undefined ? EXPAND[t] : t))
    .filter(Boolean)
    .join(' ');
}

// "727 CLEMENTI WEST STREET 2" -> { blk: "727", road: "CLEMENTI WEST STREET 2" }
function splitAddress(addr) {
  const n = normalize(addr);
  const m = n.match(/^(\d+[A-Z]?)\s+(.*)$/);
  return m ? { blk: m[1], road: m[2] } : { blk: null, road: n };
}

async function lookup(term) {
  const url = `${API}?searchVal=${encodeURIComponent(term)}&returnGeom=Y&getAddrDetails=Y`;
  for (let a = 1; a <= 3; a++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
      const j = await res.json();
      return j.results || [];
    } catch { await sleep(600 * a); }
  }
  return [];
}

function verify(results, query) {
  const want = splitAddress(query);
  if (!want.blk) return { ok: false, reason: 'no_block_number_in_source_address' };

  for (const r of results) {
    const gotBlk = normalize(r.BLK_NO);
    const gotRoad = normalize(r.ROAD_NAME);
    if (gotBlk !== want.blk) continue;
    // Road must match exactly once both sides are normalised. Anything looser starts
    // accepting a different street with the same block number, which is a real risk in
    // an HDB estate.
    if (gotRoad !== want.road) continue;
    if (!/^\d{6}$/.test(r.POSTAL || '')) return { ok: false, reason: 'match_has_no_postal' };
    const lat = parseFloat(r.LATITUDE), lon = parseFloat(r.LONGITUDE);
    if (!isFinite(lat) || lat < 1.15 || lat > 1.48 || lon < 103.6 || lon > 104.1) {
      return { ok: false, reason: 'coords_outside_sg' };
    }
    return { ok: true, lat, lon, realPostal: r.POSTAL, matchedAddr: r.ADDRESS };
  }
  return { ok: false, reason: results.length ? 'no_result_matched_block_and_road' : 'no_results' };
}

(async () => {
  const src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const DATA = eval(src.split('\n').find(l => l.startsWith('const DATA = ['))
    .replace(/^const DATA = /, '').replace(/;$/, ''));
  const failures = JSON.parse(fs.readFileSync(path.join(__dirname, 'geocode-failures.json'), 'utf8'));
  const bad = Object.keys(failures).sort();

  const rescuedPath = path.join(__dirname, 'postal-rescued.json');
  const rescued = fs.existsSync(rescuedPath) ? JSON.parse(fs.readFileSync(rescuedPath, 'utf8')) : {};
  const unresolved = {};

  for (const postal of bad) {
    if (rescued[postal]) continue;   // already resolved on an earlier run
    const rows = DATA.filter(r => r[3] === postal);
    // Distinct addresses, most common first: when one bad postal carries two addresses
    // they cannot both be right, so prefer the one more rows agree on.
    const counts = new Map();
    for (const r of rows) counts.set(r[1], (counts.get(r[1]) || 0) + 1);
    const addrs = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(x => x[0]);

    let done = null, reasons = [];
    for (const addr of addrs) {
      const results = await lookup(addr);
      const v = verify(results, addr);
      await sleep(200);
      if (v.ok) { done = { ...v, query: addr, confidence: 'verified_block_and_road' }; break; }
      reasons.push(`${addr} -> ${v.reason}`);
    }

    if (done) {
      rescued[postal] = done;
      const note = done.realPostal !== postal ? `  (source says ${postal}, actually ${done.realPostal})` : '';
      console.log(`  OK   S${postal} -> ${done.matchedAddr}${note}`);
    } else {
      unresolved[postal] = { rows: rows.length, addresses: addrs, reasons };
      console.log(`  SKIP S${postal} :: ${reasons.join(' ; ')}`);
    }
  }

  fs.writeFileSync(path.join(__dirname, 'postal-rescued.json'), JSON.stringify(rescued, null, 1));
  fs.writeFileSync(path.join(__dirname, 'postal-unresolved.json'), JSON.stringify(unresolved, null, 1));

  const rescuedRows = Object.keys(rescued).reduce((n, p) => n + DATA.filter(r => r[3] === p).length, 0);
  const totalRows = bad.reduce((n, p) => n + DATA.filter(r => r[3] === p).length, 0);
  console.log(`\nrescued ${Object.keys(rescued).length}/${bad.length} postal codes (${rescuedRows}/${totalRows} rows)`);
  console.log(`still unresolved: ${Object.keys(unresolved).length} -> tools/postal-unresolved.json`);
  const corrected = Object.entries(rescued).filter(([p, v]) => v.realPostal !== p);
  console.log(`of the rescued, ${corrected.length} have a different real postal code than the source claims`);
})();
