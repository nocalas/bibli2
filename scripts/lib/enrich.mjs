// Metadata enrichment: Open Library first, Google Books as fallback.
// Results are cached in data/enrichment-cache.json (committed) so builds are
// deterministic and only new books ever hit the APIs. Covers are downloaded
// into assets/covers/ (committed) — never hotlinked.

import fs from "node:fs/promises";
import path from "node:path";
import { normKey, slugify, similarity } from "./catalog.mjs";

const UA = "bibli.nicholasoconnor.com build script (personal reading tracker)";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.json();
}

// Search with the corrected author when the Sheet has a typo (searchAuthor is
// derived from the catalog-form override, e.g. "Sazalay" → "David SZALAY").
const authorOf = (book) => book.searchAuthor || book.author;

function scoreMatch(book, candTitle, candAuthors) {
  const titleSim = similarity(book.title, candTitle || "");
  const authorSim = Math.max(
    0,
    ...(candAuthors || []).map((a) =>
      Math.max(similarity(book.author, a), similarity(authorOf(book), a))
    )
  );
  return { titleSim, authorSim, score: titleSim * 0.7 + authorSim * 0.3 };
}

async function searchOpenLibrary(book) {
  const fields =
    "key,title,author_name,first_publish_year,number_of_pages_median,cover_i,language";
  // Fielded search first; it's precise but strict, so fall back to a general
  // query when it finds nothing (e.g. "The Mad Ship" vs OL's "Mad Ship").
  let data = await getJson(
    `https://openlibrary.org/search.json?` +
      new URLSearchParams({ title: book.title, author: authorOf(book), limit: "5", fields })
  );
  if (!(data.docs || []).length) {
    await sleep(400);
    data = await getJson(
      `https://openlibrary.org/search.json?` +
        new URLSearchParams({ q: `${book.title} ${authorOf(book)}`, limit: "5", fields })
    );
  }
  if (!(data.docs || []).length) {
    // Last resort: title alone (author romanization often differs).
    await sleep(400);
    data = await getJson(
      `https://openlibrary.org/search.json?` +
        new URLSearchParams({ title: book.title, limit: "5", fields })
    );
  }
  let best = null;
  for (const doc of data.docs || []) {
    const s = scoreMatch(book, doc.title, doc.author_name);
    if (!best || s.score > best.s.score) best = { doc, s };
  }
  if (!best) return null;
  const { doc, s } = best;
  return {
    source: "openlibrary",
    canonicalTitle: doc.title,
    canonicalAuthor: (doc.author_name || [])[0] || null,
    firstPublishYear: doc.first_publish_year || null,
    pages: doc.number_of_pages_median || null,
    link: doc.key ? `https://openlibrary.org${doc.key}` : null,
    coverUrl: doc.cover_i
      ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`
      : null,
    originalLanguages: doc.language || null,
    titleSim: +s.titleSim.toFixed(3),
    authorSim: +s.authorSim.toFixed(3),
    confident: s.titleSim >= 0.8 && s.authorSim >= 0.5,
  };
}

async function searchGoogleBooks(book) {
  const q = new URLSearchParams({
    q: `intitle:${book.title} inauthor:${authorOf(book)}`,
    maxResults: "5",
    country: "US",
  });
  const data = await getJson(`https://www.googleapis.com/books/v1/volumes?${q}`);
  let best = null;
  for (const item of data.items || []) {
    const v = item.volumeInfo || {};
    const s = scoreMatch(book, v.title, v.authors);
    if (!best || s.score > best.s.score) best = { v, s };
  }
  if (!best) return null;
  const { v, s } = best;
  return {
    source: "googlebooks",
    canonicalTitle: v.title || null,
    canonicalAuthor: (v.authors || [])[0] || null,
    firstPublishYear: v.publishedDate ? +v.publishedDate.slice(0, 4) : null,
    pages: v.pageCount || null,
    link: v.infoLink || null,
    coverUrl: v.imageLinks
      ? (v.imageLinks.thumbnail || v.imageLinks.smallThumbnail || null)?.replace(
          /^http:/,
          "https:"
        )
      : null,
    originalLanguages: v.language ? [v.language] : null,
    titleSim: +s.titleSim.toFixed(3),
    authorSim: +s.authorSim.toFixed(3),
    confident: s.titleSim >= 0.8 && s.authorSim >= 0.5,
  };
}

async function downloadCover(url, destPath) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) return false;
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 2000) return false; // Open Library serves a tiny blank for missing covers
  await fs.writeFile(destPath, buf);
  return true;
}

// Enrich every book not already cached. Mutates and returns the cache object.
export async function enrichBooks(books, cache, { coversDir, log = console.log }) {
  await fs.mkdir(coversDir, { recursive: true });
  let fetched = 0;
  for (const book of books) {
    const key = normKey(book.title, book.author);
    let entry = cache[key];
    if (!entry) {
      log(`  enriching: ${book.title} — ${book.author}`);
      let meta = null;
      try {
        meta = await searchOpenLibrary(book);
      } catch (e) {
        log(`    open library failed (${e.message})`);
      }
      if (!meta || !meta.confident) {
        await sleep(400);
        try {
          const gb = await searchGoogleBooks(book);
          if (gb && (!meta || gb.titleSim > meta.titleSim)) meta = gb;
        } catch (e) {
          log(`    google books failed (${e.message})`);
        }
      }
      entry = meta
        ? { ...meta, fetchedAt: new Date().toISOString().slice(0, 10) }
        : { source: null, confident: false, fetchedAt: new Date().toISOString().slice(0, 10) };
      cache[key] = entry;
      fetched++;
      await sleep(600); // stay polite with the APIs
    }
    // Cover download is retried even for cached entries until a file exists.
    if (entry.coverUrl && !entry.coverFile) {
      const file = `${slugify(book.title)}.jpg`;
      const dest = path.join(coversDir, file);
      try {
        await fs.access(dest);
        entry.coverFile = file;
      } catch {
        try {
          if (await downloadCover(entry.coverUrl, dest)) {
            entry.coverFile = file;
            log(`  cover saved: ${file}`);
          }
        } catch (e) {
          log(`    cover download failed for ${book.title} (${e.message})`);
        }
        await sleep(400);
      }
    }
    if (!entry.confident) {
      log(
        `  ⚠ low-confidence match: "${book.title}" — ${book.author}` +
          (entry.canonicalTitle ? ` → matched "${entry.canonicalTitle}"` : " → no match")
      );
    }
  }
  if (fetched) log(`  ${fetched} new book(s) enriched.`);
  return cache;
}
