# DBS PayLah! Saturdays — Merchant Search

A fast, searchable version of the DBS/POSB PayLah! Saturdays participating-merchant
list. The official list is a PDF you have to Ctrl+F through; this is the same data,
searchable by name, postal code, address, area, neighbourhood or nearest MRT.

**Live:** https://forkymadspoon.github.io/paylah-saturdays/

The campaign runs every Saturday from **29 August to 19 December 2026** — 100% cashback
capped at S$3, for the first 160,000 redemptions each week from 6am. See the
[official DBS promotion page](https://www.dbs.com.sg/personal/promotion/paylah-saturdays)
for the full terms.

## The data

15,153 entries parsed from the official DBS/POSB merchant PDF, across 26 area groupings:

| Category | Entries |
|---|---:|
| Heartland Merchant | 8,823 |
| Hawker Centres | 3,132 |
| Coffeeshops | 2,073 |
| Wet Market | 881 |
| Industrial Canteens | 244 |
| **Total** | **15,153** |

### Caveats worth knowing

- **Heartland shop rows** carry a real per-merchant postal code. **Hawker centre, wet
  market, coffeeshop and industrial canteen rows** carry the postal code of the
  *building*, not the stall.
- **Stall unit numbers are best-effort.** A small number are misparsed because of how
  text wraps in the source PDF. Around 120 rows have a unit number sitting in the name
  field instead of a merchant name — these sort to the bottom of the list.
- **Some stalls appear twice**, listed under two categories (typically both Hawker
  Centres and Wet Market). That mirrors the source data.
- **MRT/LRT tags are not in the source PDF.** They're an approximation mapped from the
  DBS area groupings to nearby stations — area-level, not per-merchant, so treat them as
  a rough proximity guide rather than a walking-distance guarantee. Large groupings like
  "Jurong" span many stations.

When it matters, cross-check against the
[original DBS PDF](https://www.dbs.com.sg/iwov-resources/media/pdf/deposits/promotions/paylah/saturdays/dbs-paylah-saturdays-participating-merchants.pdf)
or the in-app list.

## How it works

One self-contained `index.html` — no build step, no dependencies, no framework. The
merchant data is a JavaScript array inlined in the page, so the whole thing is a single
1.6MB file that compresses to ~250KB over the wire and loads in about 200ms.

Each row is a fixed six-element array:

```js
// [name, address, unit, postal, area, category]
["BARISTART COFFEE SINGAPORE", "65 TRAS STREET", "", "079004", "Anson, Tanjong Pagar", "Heartland Merchant"]
```

### Sorting

`DATA` is sorted once at load, not per keystroke. Every filter preserves array order, so
sorting once fixes the order everywhere — search results, category views and pagination
alike.

The comparator is a **total order**: merchant name (A–Z, case- and accent-insensitive),
then postal code, address, unit and category, with a final raw-value tiebreak. That last
step matters because two rows differing only in capitalisation would otherwise tie and
fall back to input order. Because it's total, the output never depends on the order rows
arrived in.

Names not starting with a letter or digit rank last, which keeps the ~120 misparsed
unit-number rows out of the default view.

### Search

Results render 100 at a time behind a "Show more" button. Search matches across name,
address, unit, postal code, area, category and the mapped MRT names.

`?q=<term>` pre-fills the search, so a filtered view can be shared as a link:

```
https://forkymadspoon.github.io/paylah-saturdays/?q=tampines
```

## Repo contents

| File | Purpose |
|---|---|
| `index.html` | The entire app — markup, styles, data and logic |
| `og-image.png` | 1200×630 link-preview card referenced by the Open Graph tags |
| `sitemap.xml` | Submitted to Google Search Console |
| `.gitignore` | Keeps `.DS_Store` out of the repo |

## Working on it

There's no build step. Edit `index.html`, then open it through a local server (some
browsers restrict `file://` for pages like this):

```bash
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

To deploy, commit and push to `main` — GitHub Pages redeploys automatically within a
minute or two:

```bash
git add index.html && git commit -m "Your change" && git push origin main
```

Pages caches for 10 minutes, so add a cache-buster (`?v=2`) if you're checking a change
that seems slow to appear.

## Adding a view counter

Find the `ANALYTICS SLOT` comment block near the bottom of `index.html`, just before
`</body>`. It has ready-to-go snippets for **GoatCounter** (free, privacy-friendly) and
**Google Analytics 4**. Pick one, follow the 2–3 steps in the comment, uncomment that
`<script>` tag and delete the other option. Then commit and push.

## SEO notes

The page carries a meta description, canonical URL, Open Graph and Twitter card tags,
`theme-color` for light and dark, and JSON-LD (`WebSite` with a working `SearchAction`,
plus `Dataset`). There's deliberately no `FAQPage` or `HowTo` markup — Google requires
visible on-page content backing those, and this page has none.

The Google Search Console verification `<meta>` tag near the top of `<head>` **must stay
there permanently**; Search Console re-checks periodically and un-verifies the property
if it disappears.

No `robots.txt`: on `*.github.io`, it's only served from the domain root, which belongs
to a `forkymadspoon.github.io` user-site repo that doesn't exist. A 404 there means
allow-all, which is what we want anyway.

One structural caveat: only the first 100 rows are in the DOM at load, so crawlers see a
fraction of the dataset. That's a deliberate trade — rendering all 15,153 rows would hurt
the experience for people who search rather than scroll.

## Credits

Built by [Madeleine Koh](https://www.linkedin.com/in/madeleine-cckoh). Data belongs to
DBS/POSB; this is an unofficial convenience tool, not affiliated with or endorsed by DBS.
Spot an issue or have a suggestion? Reach out on LinkedIn.
