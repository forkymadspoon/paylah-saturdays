#!/usr/bin/env node
/**
 * Assign each geocoded postal code to a URA Master Plan 2019 Planning Area.
 *
 * Replaces the DBS document's ~26 marketing-style area groupings ("Tampines, Pasir Ris",
 * "Hillview, Dairy Farm, Bukit Panjang, Choa Chu Kang") with the 55 official planning
 * areas, which are geographic rather than editorial and are what Singaporeans actually
 * use to describe where something is.
 *
 * Source: data.gov.sg dataset d_4765db0e87b9c86336792efe8a1f7a66 (URA, "No Sea" variant,
 * i.e. clipped to land, which is what we want for point-in-polygon).
 *
 * Output: tools/postal-to-area.json  { postal: "Tampines" }
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const geo = JSON.parse(fs.readFileSync(path.join(__dirname, 'planning-areas.geojson'), 'utf8'));
const cache = JSON.parse(fs.readFileSync(path.join(ROOT, 'postal-to-latlong.json'), 'utf8'));

const titleCase = s => s.toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase())
  .replace(/\bSt\b/g, 'St').replace(/-([a-z])/g, (m, c) => '-' + c.toUpperCase());

// Ray casting. `ring` is [[lon,lat], ...]; returns true when the point is inside.
function inRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// A GeoJSON polygon is [outerRing, ...holes]; a point in a hole is outside the polygon.
function inPolygon(lon, lat, poly) {
  if (!poly.length || !inRing(lon, lat, poly[0])) return false;
  for (let i = 1; i < poly.length; i++) if (inRing(lon, lat, poly[i])) return false;
  return true;
}

// Precompute bounding boxes; the box test rejects almost every candidate in O(1) and
// keeps the whole run fast enough to not bother with a spatial index.
const areas = geo.features.map(f => {
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  let minLon = 1e9, maxLon = -1e9, minLat = 1e9, maxLat = -1e9;
  for (const poly of polys) for (const [lon, lat] of poly[0]) {
    if (lon < minLon) minLon = lon; if (lon > maxLon) maxLon = lon;
    if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat;
  }
  return { name: titleCase(f.properties.PLN_AREA_N), region: titleCase(f.properties.REGION_N), polys, minLon, maxLon, minLat, maxLat };
});

function areaFor(lat, lon) {
  for (const a of areas) {
    if (lon < a.minLon || lon > a.maxLon || lat < a.minLat || lat > a.maxLat) continue;
    for (const poly of a.polys) if (inPolygon(lon, lat, poly)) return a.name;
  }
  return null;
}

const out = {};
const unmatched = [];
for (const [postal, g] of Object.entries(cache)) {
  const a = areaFor(g.lat, g.lon);
  if (a) out[postal] = a; else unmatched.push(postal);
}

fs.writeFileSync(path.join(__dirname, 'postal-to-area.json'), JSON.stringify(out, null, 0));

const counts = {};
for (const a of Object.values(out)) counts[a] = (counts[a] || 0) + 1;
console.log(`planning areas in source: ${areas.length}`);
console.log(`postal codes assigned: ${Object.keys(out).length} / ${Object.keys(cache).length}`);
console.log(`unmatched: ${unmatched.length}${unmatched.length ? ' -> ' + unmatched.slice(0, 10).join(', ') : ''}`);
console.log(`distinct areas used: ${Object.keys(counts).length}`);
console.log('\ntop 12 by merchant postal count:');
Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 12)
  .forEach(([a, n]) => console.log(`  ${a.padEnd(22)} ${n}`));
