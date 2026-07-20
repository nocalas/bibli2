#!/usr/bin/env node
// Build script for La Biblioteca de Nicholas.
//
//   node scripts/build.mjs              fetch sheets → enrich new books → render dist/
//   node scripts/build.mjs --no-fetch   rebuild from the last committed snapshot (offline)
//   node scripts/build.mjs --enrich-only  fetch + enrich, skip rendering
//
// Sources: three published-to-web CSVs from the Google Sheet (see config.json).
// No API keys, no service account — the sheet tabs are already public.

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { csvToObjects } from "./lib/csv.mjs";
import { normKey, slugify, catalogAuthor, languageFor } from "./lib/catalog.mjs";
import { enrichBooks } from "./lib/enrich.mjs";
import { renderSite } from "./lib/render.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.join(ROOT, "data");
const SNAPSHOT = path.join(DATA, "sheets-snapshot");
const COVERS = path.join(ROOT, "assets", "covers");
const DIST = path.join(ROOT, "dist");
const SRC = path.join(ROOT, "src");

const args = new Set(process.argv.slice(2));
const doFetch = !args.has("--no-fetch");
const renderOnly = !args.has("--enrich-only");

const readJson = async (p, fallback) => {
  try {
    return JSON.parse(await fs.readFile(p, "utf8"));
  } catch {
    return fallback;
  }
};

async function fetchCsv(name, url) {
  await fs.mkdir(SNAPSHOT, { recursive: true });
  const snapshotPath = path.join(SNAPSHOT, `${name}.csv`);
  if (doFetch) {
    const res = await fetch(url, { redirect: "follow" });
    if (!res.ok) throw new Error(`Fetching ${name} sheet failed: ${res.status}`);
    const text = await res.text();
    if (!text.includes(",")) throw new Error(`${name} sheet response doesn't look like CSV`);
    await fs.writeFile(snapshotPath, text);
    return text;
  }
  return fs.readFile(snapshotPath, "utf8");
}

const config = await readJson(path.join(ROOT, "config.json"));
const overrides = await readJson(path.join(DATA, "overrides.json"), {});
const cache = await readJson(path.join(DATA, "enrichment-cache.json"), {});
const readingState = await readJson(path.join(DATA, "reading-state.json"), {});

console.log("Fetching sheets…");
const [historyCsv, readingCsv, nextCsv] = await Promise.all([
  fetchCsv("history", config.sheets.history),
  fetchCsv("reading", config.sheets.reading),
  fetchCsv("next", config.sheets.next),
]);

// ---- Normalize rows -------------------------------------------------------
const fix = (map, v) => map?.[v] ?? v;

function toBook(row, status) {
  const title = fix(overrides.titles, row["Title"]);
  const author = row["Author"];
  if (!title || !author) return null;
  const link = row["Wikipedia Link"] || row["Link"] || "";
  const authorCatalog = catalogAuthor(author, overrides.authors);
  // "SZALAY, David." → "David SZALAY" — used for API searches so Sheet typos
  // (fixed via the authors override) don't break metadata lookups.
  const [sur, given] = authorCatalog.replace(/\.$/, "").split(", ");
  return {
    title,
    author,
    authorCatalog,
    searchAuthor: given ? `${given} ${sur}` : author,
    year: row["Year"] ? Number(row["Year"]) : null,
    link: link || null,
    imageUrl: row["Image URL"] || null,
    lang: languageFor(title, link, overrides.languages),
    status,
    key: normKey(title, author),
  };
}

const history = csvToObjects(historyCsv).map((r) => toBook(r, "finished")).filter(Boolean);
const reading = csvToObjects(readingCsv).map((r) => toBook(r, "reading")).filter(Boolean);
const next = csvToObjects(nextCsv).map((r) => toBook(r, "next")).filter(Boolean);

const badYear = history.filter((b) => !b.year);
if (badYear.length)
  console.warn(`  ⚠ ${badYear.length} history row(s) missing a Year:`, badYear.map((b) => b.title));

console.log(
  `  ${history.length} finished · ${reading.length} reading · ${next.length} next up`
);

// ---- Enrichment (cache-aware; only new books hit the APIs) ---------------
console.log("Enriching metadata (Open Library → Google Books)…");
const allBooks = [...reading, ...next, ...history];
await enrichBooks(allBooks, cache, { coversDir: COVERS });
await fs.writeFile(
  path.join(DATA, "enrichment-cache.json"),
  JSON.stringify(cache, null, 2) + "\n"
);

// The lead card prefers the cover I picked in the Sheet (Image URL column);
// it is downloaded once into assets/covers/ like everything else.
for (const book of reading) {
  if (!book.imageUrl) continue;
  const file = `${slugify(book.title)}.jpg`;
  const dest = path.join(COVERS, file);
  try {
    await fs.access(dest);
  } catch {
    console.log(`  downloading lead cover from Sheet: ${file}`);
    const res = await fetch(book.imageUrl);
    if (res.ok) await fs.writeFile(dest, Buffer.from(await res.arrayBuffer()));
  }
  try {
    await fs.access(dest);
    book.coverFile = file;
  } catch {}
}

if (!renderOnly) {
  console.log("Enrich-only run complete.");
  process.exit(0);
}

// ---- Reading state (records when a book first appeared as "reading") -----
let stateChanged = false;
for (const book of reading) {
  if (!readingState[book.key]) {
    readingState[book.key] = { started: new Date().toISOString().slice(0, 7) };
    stateChanged = true;
  }
}
if (stateChanged)
  await fs.writeFile(
    path.join(DATA, "reading-state.json"),
    JSON.stringify(readingState, null, 2) + "\n"
  );

// ---- Assemble page data ---------------------------------------------------
const byYear = new Map();
for (const b of history) {
  if (!b.year) continue;
  if (!byYear.has(b.year)) byYear.set(b.year, []);
  byYear.get(b.year).push(b);
}
const years = [...byYear.keys()]
  .sort((a, b) => b - a)
  .map((year) => ({
    year,
    books: byYear.get(year).map((b, i) => ({
      author: b.authorCatalog,
      title: b.title,
      lang: b.lang,
      acc: `${year}-${String(i + 1).padStart(2, "0")}`,
      link: b.link || cache[b.key]?.link || null,
    })),
  }));

const stats = {
  total: history.length,
  EN: history.filter((b) => b.lang === "EN").length,
  ES: history.filter((b) => b.lang === "ES").length,
  PT: history.filter((b) => b.lang === "PT").length,
  since: config.firstYear ?? Math.min(...byYear.keys()),
};

const now = new Date();
const currentYear = now.getFullYear();
let lead = null;
if (reading.length) {
  const b = reading[0];
  const finishedThisYear = byYear.get(currentYear)?.length ?? 0;
  const entry = cache[b.key] || {};
  lead = {
    author: b.authorCatalog,
    surname: b.authorCatalog.split(",")[0],
    title: b.title,
    imprint: overrides.imprints?.[b.title] || null,
    lang: b.lang,
    started: readingState[b.key]?.started || null,
    acc: `${currentYear}-${String(finishedThisYear + 1).padStart(2, "0")}`,
    coverPath: b.coverFile || entry.coverFile ? `covers/${b.coverFile || entry.coverFile}` : null,
    coverFile: b.coverFile || entry.coverFile || null,
    link: b.link || entry.link || null,
  };
  if (reading.length > 1)
    console.warn("  ⚠ more than one book in the Now Reading sheet; using the first row.");
}

const nextCards = next.map((b) => ({
  author: b.authorCatalog,
  title: b.title,
  link: b.link || cache[b.key]?.link || null,
}));

// ---- Write dist/ ----------------------------------------------------------
console.log("Rendering site…");
await fs.rm(DIST, { recursive: true, force: true });
await fs.mkdir(path.join(DIST, "covers"), { recursive: true });

await fs.writeFile(
  path.join(DIST, "index.html"),
  renderSite({ config, stats, lead, next: nextCards, years, buildYear: currentYear })
);
await fs.copyFile(path.join(SRC, "styles.css"), path.join(DIST, "styles.css"));
await fs.copyFile(path.join(SRC, "catalog.js"), path.join(DIST, "catalog.js"));
await fs.copyFile(path.join(SRC, "favicon.svg"), path.join(DIST, "favicon.svg"));
try {
  await fs.copyFile(path.join(SRC, "og-card.png"), path.join(DIST, "og-card.png"));
} catch {
  console.warn("  ⚠ src/og-card.png missing — social card image not deployed.");
}
if (lead?.coverFile) {
  await fs.copyFile(
    path.join(COVERS, lead.coverFile),
    path.join(DIST, "covers", lead.coverFile)
  );
}

console.log(
  `Done. ${stats.total} cards filed · EN ${stats.EN} / ES ${stats.ES} / PT ${stats.PT} → dist/index.html`
);
