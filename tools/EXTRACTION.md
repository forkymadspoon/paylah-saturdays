# How the merchant data was produced — and the gap in it

This file records the provenance of the `DATA` array embedded in `index.html`, so the
pipeline can be re-run if DBS republishes the list. It is honest about what is *not*
recorded.

## Source

- **Document:** DBS/POSB "PayLah! Saturdays participating merchants" PDF
  https://www.dbs.com.sg/iwov-resources/media/pdf/deposits/promotions/paylah/saturdays/dbs-paylah-saturdays-participating-merchants.pdf
- **Server `Last-Modified` when this file was written (18 Sep 2026):** Fri, 11 Sep 2026
  06:40:06 GMT, 9,011,641 bytes. This is the *server's* date for the current copy, **not**
  the date of the copy that was parsed — see the gap below.
- **Promotion page (terms):** https://www.dbs.com.sg/personal/promotion/paylah-saturdays

## What the parse produced

15,153 rows, each a six-element array of strings:

```
[name, address, unit, postal, area, category]
```

- `area` is the PDF's own grouping (26 marketing-style areas such as "Tampines, Pasir
  Ris"). It is kept only as a search alias and a fallback label; the page displays URA
  planning areas resolved downstream.
- `category` is one of: Heartland Merchant (8,823), Hawker Centres (3,132), Coffeeshops
  (2,073), Wet Market (881), Industrial Canteens (244).
- Hawker/wet-market/coffeeshop/canteen rows carry the *building's* postal code; heartland
  shop rows carry a per-merchant one.

Known parse artefacts, left in deliberately so the data mirrors the PDF:

- ~138 rows have a unit number (e.g. `#01-107`) in the name field.
- 48 postal codes do not exist (transpositions, a `500000` placeholder). 22 were recovered
  from the address by `geocode-fallback.js`; 26 remain — `postal-unresolved.json`.
- Some stalls appear under two categories.

## The gap

**The PDF → `DATA` step itself is undocumented.** No parsing script exists in this repo or
anywhere alongside it, and the PDF version that was parsed is not known. `DATA` was
produced before this repository's history begins and cannot currently be regenerated from
source.

Consequences:

- If DBS republishes the PDF, the merchant rows cannot be refreshed without redoing the
  extraction from scratch.
- Whether the embedded list matches the copy DBS serves *today* (11 Sep 2026) cannot be
  verified; the page therefore links to the live PDF and does not claim a date.

## What *is* reproducible

Everything downstream of `DATA`, in order:

```bash
node tools/geocode.js tools/postals.json   # postal codes -> lat/long (OneMap)
node tools/geocode-fallback.js             # retry failures by address, verified match
node tools/geocode-stations.js             # MRT/LRT station coordinates
node tools/station-lines.js                # line membership + official colours
node tools/assign-areas.js                 # point-in-polygon -> URA planning areas
node tools/build-geo-data.js               # inject STATIONS/AREAS/POSTAL into index.html
```

`tools/postals.json` is the list of distinct postal codes extracted from `DATA`; if
`DATA` is ever regenerated, rebuild it first (`node -e` over the array) and re-run the
chain — every step caches, so unchanged codes are not re-queried.

## Closing the gap (not done; a decision for a repeat run)

A reproducible parser would download the PDF, extract the tables (the layout is
multi-column with per-area headings and wrapped cells), emit the six-field rows, and be
verified by regenerating the current 15,153 rows to within the known artefacts. It is a
multi-day item and only worth it if the tool returns for another campaign.
