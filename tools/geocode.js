#!/usr/bin/env node
/**
 * Geocode Singapore postal codes via OneMap's free search API.
 *
 * Results are cached in postal-to-latlong.json, keyed by postal code, so reruns
 * only query codes we have not resolved yet. Failures are recorded separately in
 * geocode-failures.json rather than dropped silently -- a postal code that cannot
 * be resolved is a data problem worth looking at, not a row to discard.
 *
 * Usage:
 *   node tools/geocode.js tools/sample-postals.json    # geocode a specific list
 *   node tools/geocode.js tools/postals.json           # full run
 *   node tools/geocode.js tools/postals.json --limit 50
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CACHE = path.join(ROOT, 'postal-to-latlong.json');
const FAILURES = path.join(ROOT, 'tools', 'geocode-failures.json');

const API = 'https://www.onemap.gov.sg/api/common/elastic/search';
const DELAY_MS = 180;      // OneMap allows ~250 req/min; this stays well under
const MAX_RETRIES = 3;

const load = (f, fallback) => {
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return fallback; }
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function geocodeOne(postal) {
  const url = `${API}?searchVal=${postal}&returnGeom=Y&getAddrDetails=Y`;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();

      // OneMap currently returns an "Authentication token missing" note alongside
      // valid results for basic search. Treat it as fatal ONLY if no results came
      // back, so we notice if the endpoint ever truly closes to anonymous use.
      if (!json.results || json.results.length === 0) {
        if (json.error) return { ok: false, reason: `api_error: ${json.error}` };
        return { ok: false, reason: 'no_results' };
      }

      // Prefer an exact postal match; OneMap sometimes returns fuzzy neighbours.
      const exact = json.results.find(r => r.POSTAL === postal) || json.results[0];
      if (exact.POSTAL !== postal) return { ok: false, reason: `postal_mismatch: got ${exact.POSTAL}` };

      const lat = parseFloat(exact.LATITUDE), lon = parseFloat(exact.LONGITUDE);
      if (!isFinite(lat) || !isFinite(lon)) return { ok: false, reason: 'bad_coords' };
      // Sanity-bound to Singapore; anything outside is wrong regardless of what the API said.
      if (lat < 1.15 || lat > 1.48 || lon < 103.6 || lon > 104.1) {
        return { ok: false, reason: `outside_sg: ${lat},${lon}` };
      }

      return {
        ok: true,
        value: {
          lat: +lat.toFixed(6),
          lon: +lon.toFixed(6),
          addr: exact.ADDRESS || '',
          road: exact.ROAD_NAME || '',
          blk: exact.BLK_NO || '',
          building: exact.BUILDING && exact.BUILDING !== 'NIL' ? exact.BUILDING : ''
        }
      };
    } catch (err) {
      if (attempt === MAX_RETRIES) return { ok: false, reason: `fetch_failed: ${err.message}` };
      await sleep(DELAY_MS * attempt * 3); // back off before retrying
    }
  }
}

(async () => {
  const listFile = process.argv[2];
  if (!listFile) { console.error('usage: node tools/geocode.js <postals.json> [--limit N]'); process.exit(1); }
  const limitArg = process.argv.indexOf('--limit');
  const limit = limitArg > -1 ? parseInt(process.argv[limitArg + 1], 10) : Infinity;

  const all = load(listFile, []);
  const cache = load(CACHE, {});
  const failures = load(FAILURES, {});

  const todo = all.filter(p => !cache[p]).slice(0, limit);
  console.log(`${all.length} postal codes | ${Object.keys(cache).length} cached | ${todo.length} to fetch`);
  if (!todo.length) { console.log('nothing to do'); return; }

  let done = 0, failed = 0;
  for (const postal of todo) {
    const r = await geocodeOne(postal);
    if (r.ok) {
      cache[postal] = r.value;
      delete failures[postal];
      done++;
    } else {
      failures[postal] = r.reason;
      failed++;
      console.warn(`  FAIL ${postal}: ${r.reason}`);
    }
    const n = done + failed;
    if (n % 100 === 0 || n === todo.length) {
      fs.writeFileSync(CACHE, JSON.stringify(cache, null, 0));
      fs.writeFileSync(FAILURES, JSON.stringify(failures, null, 1));
      console.log(`  ${n}/${todo.length} (${done} ok, ${failed} failed)`);
    }
    await sleep(DELAY_MS);
  }

  fs.writeFileSync(CACHE, JSON.stringify(cache, null, 0));
  fs.writeFileSync(FAILURES, JSON.stringify(failures, null, 1));
  console.log(`\ndone: ${done} geocoded, ${failed} failed`);
  console.log(`cache: ${Object.keys(cache).length} total in postal-to-latlong.json`);
  if (failed) console.log(`failures listed in tools/geocode-failures.json`);
})();
