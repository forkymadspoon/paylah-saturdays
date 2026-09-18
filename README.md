# DBS PayLah! Saturdays — Merchant Search

A fast, searchable version of the DBS/POSB PayLah! Saturdays participating-merchant
list. The official list is a PDF you have to Ctrl+F through; this is the same data,
searchable by name, postal code, address, planning area or nearest MRT — with a
"Near Me" mode that ranks merchants by distance from where you actually are.

**Live:** https://forkymadspoon.github.io/paylah-saturdays/

The campaign runs every Saturday from **29 August to 19 December 2026** — 100% cashback
capped at S$3, for the first 160,000 redemptions each week from 6am. See the
[official DBS promotion page](https://www.dbs.com.sg/personal/promotion/paylah-saturdays)
for the full terms.

## Features

- **Search** across merchant name, address, unit, postal code, planning area, category
  and nearest MRT station.
- **Per-merchant nearest MRT/LRT**, with distances (`Simei 350m`), computed from the
  merchant's own geocoded position rather than a broad area label.
- **Near Me** — ranks merchants by distance from your device location, or from a postal
  code you type if you'd rather not share it.
- **Map view** — Leaflet + OpenStreetMap, lazy-loaded only when opened.
- **Category filters** and a deep-linkable search (`?q=tampines`).

## The data

15,153 entries parsed from the official DBS/POSB merchant PDF:

| Category | Entries |
|---|---:|
| Heartland Merchant | 8,823 |
| Hawker Centres | 3,132 |
| Coffeeshops | 2,073 |
| Wet Market | 881 |
| Industrial Canteens | 244 |
| **Total** | **15,153** |

Enriched from three public sources, none of which need an API key:

| Source | Used for |
|---|---|
| [OneMap](https://www.onemap.gov.sg/apidocs/) | Geocoding all 3,619 distinct postal codes to lat/long |
| [data.gov.sg](https://data.gov.sg/datasets/d_4765db0e87b9c86336792efe8a1f7a66/view) | URA Master Plan 2019 Planning Area boundaries |
| Wikipedia | The list of currently-operating MRT/LRT stations |

**Coverage:** 3,593 of 3,619 postal codes geocoded (99.3%), giving full geo data for
15,112 of 15,153 rows (99.73%).

### Caveats worth knowing

- **Distances are straight-line (haversine), not walking distance.** Real walking
  distance is always longer.
- **Heartland shop rows** carry a real per-merchant postal code. **Hawker centre, wet
  market, coffeeshop and industrial canteen rows** carry the postal code of the
  *building*, so every stall inside one shares a position.
- **48 postal codes do not exist in OneMap** — genuine errors in the source PDF, not
  geocoding failures. A second pass (`tools/geocode-fallback.js`) geocodes the merchant's
  *address* instead and recovers 22 of them, each verified by exact block number and road
  name. Those rows now display the real postal code (`532201` → `523201`) while the
  original stays searchable, so old links still work. The remaining 26 codes affect 41
  rows (0.27%), which fall back to the DBS area label and show no MRT tag rather than a
  wrong one — see `tools/postal-unresolved.json` for why each one failed.
- **Stall unit numbers are best-effort.** Some are misparsed because of how text wraps
  in the source PDF; ~120 rows have a unit number in the name field instead of a
  merchant name, and these sort to the bottom.
- **Some stalls appear twice**, listed under two categories (typically both Hawker
  Centres and Wet Market). That mirrors the source data.

When it matters, cross-check against the
[original DBS PDF](https://www.dbs.com.sg/iwov-resources/media/pdf/deposits/promotions/paylah/saturdays/dbs-paylah-saturdays-participating-merchants.pdf)
or the in-app list.

## How it works

One self-contained `index.html` — no build step for the page itself, no framework, no
dependencies at runtime except Leaflet, which loads from a CDN only if you open the map.
Merchant data and geo lookups are inlined, so the page is a single 1.8MB file that
compresses to ~250KB and loads in under 100ms.

Each merchant row is a fixed six-element array:

```js
// [name, address, unit, postal, area, category]
["BARISTART COFFEE SINGAPORE", "65 TRAS STREET", "", "079004", "Anson, Tanjong Pagar", "Heartland Merchant"]
```

Geo data lives in a generated block between `// GEO-DATA-START` and `// GEO-DATA-END`:

```js
LINES     { NS: {name, color}, ... }                          // official line colours
STATIONS  [name, lat, lon, ["NS","EW"]]                      // 184 operating stations
AREAS     ["Ang Mo Kio", "Bedok", ...]                        // 46 planning areas in use
POSTAL    { "520107": [lat, lon, st1, m1, st2, m2, areaIdx] } // per postal code
```

### Sorting

`DATA` is sorted once at load, not per keystroke. Every filter preserves array order, so
sorting once fixes the order everywhere — search results, category views and pagination
alike.

The comparator is a **total order**: merchant name (A–Z, case- and accent-insensitive),
then postal code, address, unit and category, with a final raw-value tiebreak. Because
it's total, output never depends on the order rows arrived in. Names not starting with a
letter or digit rank last, keeping the misparsed unit-number rows out of the default view.

### Nearest MRT and planning areas

Both are resolved **at build time**, not in the browser. Doing it at runtime would be
3,619 postal codes × 184 stations ≈ 666k haversine calls on every page load, for an
answer that never changes between builds.

Station names come from Wikipedia's *"In operation"* tables, so stations that are built
but not yet open (Bedok South, Sungei Bedok) are excluded structurally rather than from
memory. The list includes Punggol Coast (Dec 2024), Hume (Feb 2025) and the Circle Line
Stage 6 stations (Jul 2026).

Planning areas replace the DBS document's 26 marketing-style groupings — which lumped
Simei, Tampines and Pasir Ris under one label despite being kilometres apart — with the
55 official URA areas, assigned by point-in-polygon. 46 contain merchants; the other 9
are water catchments, military zones, offshore islands and undeveloped reclaimed land.
The old DBS groupings remain searchable as aliases.

### Near Me

Ranks by distance within a **2km ceiling**, capped at **50 results**, widening to 5km and
then everywhere on request.

The ceiling exists because "nearest N" is not the same as "near". Merchant density varies
about 12× across Singapore — 500m of a town centre holds ~290 merchants, the same radius
in an industrial estate holds ~23 — so an uncapped "nearest 100" reaches 6km in sparse
areas while still calling itself *Near me*. The radius is disclosed in the banner
(*"Nearest 50 of 936 within 2km"*) so nobody concludes they've seen everything nearby.

There is deliberately **no spatial index**. A linear scan over 15k points costs ~1ms; a
geohash or k-d tree would optimise something that isn't slow. Run
`node tools/density-analysis.js` to reproduce those measurements.

## Repo contents

| File | Purpose |
|---|---|
| `index.html` | The entire app — markup, styles, data and logic |
| `postal-to-latlong.json` | OneMap geocode cache, keyed by postal code |
| `mrt-stations.json` | 184 operating MRT/LRT stations with coordinates |
| `og-image.png` | 1200×630 link-preview card |
| `sitemap.xml` | Submitted to Google Search Console |
| `tools/` | The data pipeline (see below) |

### Pipeline

Run in this order when refreshing the data. Each step caches, so reruns are cheap.

```bash
node tools/geocode.js tools/postals.json   # postal codes -> lat/long (OneMap, ~11 min cold)
node tools/geocode-fallback.js             # retry the failures by address, verified match
node tools/geocode-stations.js             # station names -> coordinates
node tools/station-lines.js                # rail line membership + official line colours
node tools/assign-areas.js                 # point-in-polygon -> planning areas
node tools/build-geo-data.js               # inject STATIONS/AREAS/POSTAL into index.html
```

`tools/geocode.js` records unresolvable postal codes in `tools/geocode-failures.json`
rather than dropping them, rejects fuzzy postal matches, and rejects coordinates outside
Singapore. `tools/geocode-fallback.js` then retries those by address, accepting a result
only when the block number *and* road name both match — OneMap answers a fuzzy address
query with something nearby rather than nothing, and an unverified match would put
merchants on the wrong street. It rescued 22 of 48; results merge into
`postal-to-latlong.json`, and the rest are explained in `tools/postal-unresolved.json`. `tools/assign-areas.js` needs the planning-area GeoJSON, which is gitignored
because of its size — re-download it from
[data.gov.sg](https://data.gov.sg/datasets/d_4765db0e87b9c86336792efe8a1f7a66/view)
to `tools/planning-areas.geojson`.

## Working on it

No build step for the page. Edit `index.html`, then serve it locally (some browsers
restrict `file://` for pages like this):

```bash
python3 -m http.server 8000
```

To deploy, commit and push to `main` — GitHub Pages redeploys automatically within a
minute or two:

```bash
git add index.html && git commit -m "Your change" && git push origin main
```

Pages caches for 10 minutes, so add a cache-buster (`?v=2`) when checking a change that
seems slow to appear.

## SEO and security notes

The page carries a meta description, canonical URL, Open Graph and Twitter card tags,
`theme-color` for light and dark, and JSON-LD (`WebSite` with a working `SearchAction`).

Three schema types are deliberately absent. `FAQPage` and `HowTo` need visible on-page
content backing them, which this page has none of. `Dataset` was removed in Sep 2026: it
feeds Google Dataset Search — a vertical for research and government data repositories,
not somewhere anyone looks for a hawker stall — so it earned nothing while Search Console
repeatedly flagged its missing `license` field. Supplying that field was the wrong fix,
since the underlying data is DBS's and declaring a licence would assert rights we don't
hold. Don't re-add it.

The Google Search Console verification `<meta>` tag near the top of `<head>` **must stay
there permanently**; Search Console re-checks periodically and un-verifies the property
if it disappears.

A **Content-Security-Policy** locks every resource type to `'self'` plus a short
allowlist, one origin per feature:

| Origin | Needed for |
|---|---|
| `cdnjs.cloudflare.com` | Leaflet script and stylesheet |
| `*.tile.openstreetmap.org` | Map tiles |
| `www.onemap.gov.sg` | Postal lookup for the Near Me fallback |
| `*.googletagmanager.com` | Google Analytics loader |
| `*.google-analytics.com`, `*.analytics.google.com` | GA4 measurement calls |

**If you add any third-party script, add its origin to the CSP or it will fail
silently** — blocked, with no visible error on the page. Equally, if you remove a
feature, drop its origin so the allowlist stays minimal. `frame-ancestors` is absent on
purpose: it only works as an HTTP header, which GitHub Pages does not let you set.

No `robots.txt`: on `*.github.io` it's only served from the domain root, which belongs
to a user-site repo that doesn't exist here. A 404 there means allow-all, which is what
we want anyway.

One structural caveat: only the first 100 rows are in the DOM at load, so crawlers see a
fraction of the dataset. That's a deliberate trade — rendering all 15,153 rows would hurt
the experience for people who search rather than scroll.

## Analytics and privacy

Google Analytics 4 (property `G-ZK37J9VYWP`) is installed near the bottom of
`index.html`. It is configured with `page_location` set to the path only, so a `?q=`
query — which can hold a typed postal code — never reaches Google. GA4 sets cookies and
collects visitor data, and there is currently **no consent banner**.

Location handling: a device fix from "Near me" is used only in the browser. Two things do
leave the device, and the page says so at the point they happen: a postal code that is not
in the embedded data is looked up via OneMap, and the map fetches tiles from OpenStreetMap,
whose servers see the map area being viewed. Fixes outside Singapore are refused with a
message rather than ranked against a list 10,000 km away. That is generally acceptable under Singapore's PDPA for basic
analytics, but GDPR expects consent before analytics cookies for EU visitors — worth
addressing with Google Consent Mode or a cookieless alternative if that audience matters.

## Credits

Built by [Madeleine Koh](https://www.linkedin.com/in/madeleine-cckoh). Data belongs to
DBS/POSB; this is an unofficial convenience tool, not affiliated with or endorsed by DBS.
Planning area boundaries © URA via data.gov.sg. Map data © OpenStreetMap contributors.
Spot an issue or have a suggestion? Reach out on LinkedIn.
