# La Biblioteca de Nicholas — Rebuild Spec (v2)

A handoff document for Claude Code. Read this fully before writing any code.

## 1. What this project is

A personal reading tracker at **https://bibli.nicholasoconnor.com** — what I'm reading, what I'll read next, and everything I've read, grouped by year. The site UI is in **English**; book titles always stay in the language I read them in (English, Spanish, or Portuguese). It is a public, read-only site; I am the only editor.

**v1 context:** Built in 2024 with Replit's agent. A small server app (deployed on Render free tier) that fetches a Google Sheet on each request. Problems to fix in v2: slow cold starts from the sleeping free-tier server, generic AI-default design, manual Wikipedia links instead of real book metadata, and only the "Currently Reading" book gets a cover image.

The old repo is available for reference — extract the Sheet structure and any content worth keeping, but treat this as a rewrite, not a refactor.

## 2. Architecture (decided — do not relitigate)

**Static site, rebuilt automatically from Google Sheets.** No running server.

1. **Source of truth:** my existing Google Sheet. I add/edit books there, including from my phone. Do not change my editing workflow.
2. **Build:** a script (Node or Python, your call) that:
   - Pulls the Sheet (Google Sheets API with a service account, or the published-CSV endpoint if the sheet can be published to web — prefer whichever needs the least secret management, and document the choice).
   - Enriches each book with metadata from the **Open Library API**, falling back to **Google Books**: cover image, canonical title, author, original language, page count, first-publication year, and a link (Open Library page; keep my manual link override if the Sheet has one).
   - **Caches enrichment results in a committed JSON file** so builds are fast, deterministic, and don't hammer the APIs. Only fetch metadata for books not already in the cache. Download cover images at build time and serve them locally (no hotlinking to CDNs). Note: enrichment runs for every book (metadata and links are used everywhere), but per the section 5 design only the Now Reading card *displays* a cover — cache the rest anyway for future use.
   - Generates plain static HTML/CSS (a simple templating setup or a lightweight SSG like Eleventy/Astro is fine; no client-side framework — this is a document, not an app).
3. **Automation:** a GitHub Action that runs the build (a) on push, (b) on a schedule (e.g., every 6 hours), and (c) via manual trigger. New row in the Sheet → site updates itself within hours, or instantly if I trigger it.
4. **Hosting:** Cloudflare Pages (or GitHub Pages if simpler), custom domain `bibli.nicholasoconnor.com`. Free, fast, never sleeps. Once live and verified, the Render instance gets retired.

## 3. Data model

Inspect the existing Sheet first and adapt, but the target columns are roughly:

| Column | Notes |
|---|---|
| `title` | As I logged it (may be the Spanish/Portuguese edition title) |
| `author` | |
| `status` | `reading` / `next` / `finished` |
| `year_finished` | For history grouping; blank unless finished |
| `order` | Optional; for ordering within Next Up |
| `language_read` | `en` / `es` / `pt` — the language I read it in |
| `link` | Optional manual override for the outbound link |
| `note` | Optional one-liner (future use; render if present) |

If the current Sheet doesn't match this, propose a migration: generate the new Sheet layout from the old data and give me a checklist of any cells needing manual attention. Fuzzy-match tolerance matters — some entries have typos (e.g., "Sazalay" for "Szalay") — flag low-confidence metadata matches in the build log rather than silently guessing.

## 4. Pages and sections

Single page. The design concept (section 5) is a **library card catalog**: every book is a bibliographic index card, and the reading history is a catalog drawer. Section order:

1. **Masthead** — "La Biblioteca de Nicholas" in the display face, tagline "What I read, have read and will read.", double typed rule, then the inventory line (see Stats).
2. **Stats / inventory line** — one quiet typed line, computed from the data: total cards filed, per-language counts (EN/ES/PT), "since 2022". Example: `89 CARDS FILED · EN 76 / ES 11 / PT 2 · SINCE 2022`.
3. **Now Reading** — the lead catalog card: real cover image at left, card text at right (author in SURNAME, First form; catalog-style entry line; language + started date), a red "NOW READING" stamp pill, accession number, and the circular Biblioteca stamp inked over the top-right corner.
4. **Next Up** — pale-blue "hold slip" cards (different card stock from the archive), each with an "ON HOLD" stamp, author, title.
5. **Reading History** — the drawer. Each year is a tabbed guide card (`2026 — 11 BOOKS`) with its books filed edge-on beneath: one line each (SURNAME, First — Title + small language tag). Clicking an edge pulls the full card forward; clicking a year tab opens/closes that year's drawer.
6. **Footer** — origin story ("v1 built with Replit and ChatGPT in 2024; v2 rebuilt with Claude in 2026"), the bookshelf-snooping line, link to nicholasoconnor.com, © year.

Keep the existing meta tags/OG setup working (title, description, social card image — regenerate the card image in the new design; the circular stamp on manila card stock is the natural motif, and the stamp also becomes the favicon).

## 5. Design brief (decided — build exactly this)

**The reference implementation is `biblioteca-mockup.html` in this repo.** It is a working, clickable mockup with the full dataset. Match it visually and behaviorally; the notes below capture the intent behind it so you don't drift when extending it.

### Concept

A mid-century library card catalog. Manila index cards, typewriter type, red rules, rubber stamps, tabbed drawer dividers, punched holes. Warm, physical, slightly imperfect — cards sit at fractional rotations (±0.3–0.6°), stamps are inked off-angle. Playful but disciplined: the skeuomorphism lives in a small fixed vocabulary (card, rule, stamp, tab, hole) and nothing else. No wood textures, no shadows imitating depth, no gradients.

### Palette

| Token | Hex | Use |
|---|---|---|
| `--paper` | `#E9DFC9` | Page background |
| `--card` | `#F6EFDE` | Filed cards / card stock |
| `--card-open` | `#FAF4E4` | Pulled-forward (expanded) card |
| `--card-border` | `#C6B893` | Card borders |
| `--tab` / `--tab-border` | `#DCCFA8` / `#B3A275` | Year guide tabs and drawer bars |
| `--ink` | `#2A2519` | Primary text |
| `--ink-soft` | `#6B6151` | Secondary text, metadata |
| `--rule-red` | `#A83A28` | The horizontal red rule on every full card |
| `--stamp-red` | `#8A3B2A` | NOW READING stamp |
| `--stamp-blue` | `#3A4E9C` | Circular Biblioteca stamp, ON HOLD slips, links |
| `--stamp-green` | `#35502F` | READ ✓ stamp |
| `--hold` / `--hold-border` | `#DEE6EA` / `#A8B8C2` | Next Up card stock |

Three card stocks, three stamp inks: manila/red-green for the archive, cream/red-blue for the lead card, blue-grey/blue for holds. Don't add colors beyond this system.

### Typography

- **Special Elite** (Google Fonts) — masthead, section labels, year tabs, stamp text. The stamped-typewriter face is the personality of the site; use it for "official" library apparatus only.
- **Courier Prime** (Google Fonts) — everything else: card text, metadata, footer. Body 15px, line-height 1.5.
- Section labels: letterspaced caps flanked by red em-dashes (`— NOW READING —`). ALL caps is correct here — it's stamped/typed apparatus, not UI text.
- Authors always in catalog form: `SURNAME, First.` Titles in the language read, never translated.

### The stamp (site mark)

Circular rubber stamp, inline SVG, ~116px: outer ring 2.5px + inner ring 1.2px in `--stamp-blue`; "BIBLIOTECA DE NICHOLAS" on the top arc, "SANTIAGO DE CHILE" on the bottom arc, "✦ EST ✦ / 2022" centered; rotated −11°, opacity 0.82, overlapping the lead card's content. The exact SVG is in the mockup — reuse it. It doubles as favicon and as the motif on the OG/social card.

### Card anatomy (full card)

Header row (author + right-aligned accession number `№ YYYY-NN`), 2px red rule, indented entry line (title, and for the lead card a catalog-style imprint: `Title. — City : Publisher, year. — genre.` — only where metadata is confident; otherwise just the title), metadata line (`language: English · filed: 2026`), stamps as bordered pill spans at ~2° rotations, and a punched hole: a 16px circle filled with `--paper` centered at the card's bottom edge.

### Interaction

- **Year drawers:** tab row toggles its list; caret ▾/▸ in `--rule-red` shows state. **Default open: current year and previous year only**; all older years start closed. Tabs are keyboard-operable (`role="button"`, Enter/Space) with `aria-expanded`.
- **Filed cards:** hover nudges the card 6px right (the pull-out affordance); click/Enter swaps the edge for the full card; clicking the open card refiles it. Only one card pulled out at a time.
- All of this is small vanilla JS (or `<details>` where it fits) — no framework. Content must be present in the HTML without JS; JS only collapses/expands. Respect `prefers-reduced-motion` (drop the hover nudge and any transitions).

### Covers

- **Lead card:** real cover image (~108×158, `object-fit: cover`, card border), served locally per section 2. On load failure, swap to the typographic fallback cover (colored block, italic title, letterspaced author) — the fallback pattern is in the mockup.
- **Filed/expanded cards: no cover imagery.** Text-only is the period-correct choice and was an explicit decision — don't add thumbnails back.
- Next Up cards: text-only hold slips.

### Copy rules

UI entirely in English. The only Spanish is the site name, the stamp text ("Santiago de Chile"), and book titles as logged. Stamps read NOW READING / ON HOLD / READ ✓.

## 6. Build order

1. **Salvage & audit** — read old repo + Sheet; confirm data model; set up new repo structure; drop `biblioteca-mockup.html` into the repo as the design reference.
2. **Build script + enrichment cache** — get real data flowing into JSON, covers downloaded, low-confidence matches flagged.
3. **Site build** — implement the section 5 design from the mockup: templates, styles, drawer interaction, stats, favicon + OG card from the stamp.
4. **Automation** — GitHub Action (push + schedule + manual), secrets documented.
5. **Deploy** — Cloudflare Pages, DNS cutover for `bibli.nicholasoconnor.com`, verify OG cards, retire Render.

## 7. Acceptance criteria

- Site loads instantly (static; Lighthouse performance 95+ on mobile).
- Adding a row to the Sheet updates the live site with no action from me beyond (at most) clicking one manual-trigger button.
- Side-by-side with `biblioteca-mockup.html`, the live site reads as the same design (palette, type, card anatomy, stamp) — differences should be refinements, not drift.
- Current year + previous year drawers open by default; older years closed; everything works keyboard-only and with JS disabled (content visible, just not collapsible).
- The lead card shows a real, locally served cover; a failed cover falls back to the typographic cover, never a broken image.
- Zero monthly cost: free hosting tier, APIs within free limits, no server.
- All v1 content is preserved (every book, every year, correct counts), with the "Sazalay" → "Szalay" typo fixed at the source (Sheet).
- I can understand the README well enough to explain how the site works — write it for a non-developer.

## 8. Later (do not build now, but don't preclude)

- Per-book notes/ratings rendered from the `note` column.
- RSS feed of finished books.
- A "recommend me something" filter or search.
- An archive page per year if the single page ever gets unwieldy.
