# La Biblioteca de Nicholas (v2)

A personal reading tracker at **https://bibli.nicholasoconnor.com** — what I'm reading,
what I'll read next, and everything I've read since 2022, presented as a mid-century
library card catalog.

## How it works (the short version)

**You edit the Google Sheet. The site rebuilds itself. That's it.**

```
Google Sheet  ──▶  build script  ──▶  static HTML  ──▶  GitHub Pages
(3 tabs,          (GitHub Action,     (dist/)          (bibli.nicholasoconnor.com)
 your phone)       every 6 hours)
```

There is **no server**. The site is plain HTML/CSS files, so it loads instantly and
costs nothing. A robot (GitHub Actions) wakes up every 6 hours, reads the Sheet,
rebuilds the pages, and publishes them. Add a book on your phone → the site updates
by itself within 6 hours.

**Want it updated right now?** Go to the repo's **Actions** tab → **Build & deploy**
→ **Run workflow**. Done in about a minute.

## Your workflow (unchanged from v1)

The same Google Sheet, the same three tabs, published to the web as CSV:

| Tab | Columns | What it feeds |
|---|---|---|
| History | `Title, Author, Year, Wikipedia Link` | The Reading History drawers |
| Now Reading | `Title, Author, Wikipedia Link, Image URL` | The lead card (Image URL = the cover) |
| Next Up | `Title, Author, Wikipedia Link` | The blue hold slips |

Notes:
- **Language tags** (EN/ES/PT) are worked out automatically from the Wikipedia link:
  a link to `es.wikipedia.org` → ES, `pt.wikipedia.org` → PT, anything else → EN.
  If a book breaks that rule (e.g. you read it in Spanish but linked the English
  Wikipedia page), add one line to `data/overrides.json` under `"languages"`.
- **Author names** are converted to catalog form (`MURAKAMI, Haruki.`) automatically.
  Odd cases (surname-first names, particles, initials) live in `data/overrides.json`
  under `"authors"`.
- The `Wikipedia Link` column is still your manual link override; if it's empty the
  build uses the Open Library page found during enrichment.

## What the build script does

`node scripts/build.mjs` (this is what the Action runs):

1. **Fetches** the three published CSVs. No API keys or secrets — the tabs are
   already published to the web, which is why this approach was chosen over the
   Google Sheets API.
2. **Enriches** any *new* book via the Open Library API (Google Books as fallback):
   canonical title, first-publication year, page count, a link, and a cover image.
   Results are saved to `data/enrichment-cache.json` and covers to `assets/covers/`
   — both committed to the repo, so a book is only ever looked up once and builds
   are fast and deterministic. Doubtful matches are flagged with ⚠ in the build log,
   never silently guessed.
3. **Renders** the single-page site into `dist/` from the design reference
   (`files/biblioteca-mockup.html`). Only the Now Reading card displays a cover
   (a deliberate design decision); the rest are cached for future use.

Useful variants:
- `node scripts/build.mjs --no-fetch` — rebuild offline from the last snapshot.
- `node scripts/build.mjs --enrich-only` — update the cache without rendering.

## Repo map

```
config.json                 Sheet CSV URLs + site URL
scripts/build.mjs           The build (fetch → enrich → render)
scripts/lib/                CSV parsing, catalog rules, enrichment, HTML template
src/                        styles.css, catalog.js, favicon.svg, og-card.png
data/overrides.json         Manual corrections (authors, languages, titles, imprint)
data/enrichment-cache.json  Cached book metadata (committed)
data/reading-state.json     When each "Now Reading" book was first seen (→ "started: Jul 2026")
assets/covers/              Downloaded cover images (committed, served locally)
files/                      The v2 spec and the design-reference mockup
.github/workflows/          The Action: build + deploy on push / every 6 h / manual
dist/                       Build output (never edited by hand, not committed)
```

## Deploying (one-time setup)

1. Push this repo to GitHub.
2. Repo **Settings → Pages** → Source: **GitHub Actions**.
3. Run the **Build & deploy** workflow once (Actions tab).
4. Custom domain: in **Settings → Pages** set `bibli.nicholasoconnor.com`, and at
   your DNS provider add a `CNAME` record pointing `bibli` → `<username>.github.io`.
5. Once the new site is verified at the domain, retire the old Render instance.

No secrets are required anywhere.

## Sheet cells worth fixing at the source (one-time checklist)

The build corrects these for display, but the Sheet still has the typos:

- [ ] "David **Sazalay**" → David **Szalay** (2 rows, 2025)
- [ ] "The Mercy of **the** Gods" → "The Mercy of Gods" (2024)
- [ ] "I **am** Legend" → "I **Am** Legend" (2024)
- [ ] "On the Calculation of Volume Book 3" → "…Volume (Book 3)" for consistency (2026)
- [ ] Several titles/authors have trailing spaces (harmless — the build trims them)

If you fix a title in the Sheet, also delete the matching line from `"titles"` in
`data/overrides.json` (or just leave everything as is — the overrides are idempotent).

## History

- **v1** (2024): built with Replit and ChatGPT — a small server on Render that read
  the Sheet on every visit. Worked, but cold starts were slow and only one book had
  a cover.
- **v2** (2026): rebuilt with Claude as a static site with the card-catalog design.
