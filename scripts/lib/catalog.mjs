// Bibliographic helpers: normalized keys, catalog author form, language detection.

const APOSTROPHES = /[‘’ʼ]/g;

export function normKey(title, author) {
  const norm = (s) =>
    s.normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(APOSTROPHES, "'")
      .toLowerCase().replace(/[^a-z0-9' ]+/g, " ")
      .replace(/\s+/g, " ").trim();
  return `${norm(title)}|${norm(author)}`;
}

export function slugify(s) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

// Uppercase a surname the card-catalog way: MURAKAMI, but McCARTHY and O'TOOLE.
function stampCase(surname) {
  const s = surname.replace(APOSTROPHES, "'");
  if (/^Mc./.test(s)) return "Mc" + s.slice(2).toUpperCase();
  if (/^Mac[A-Z]/.test(s)) return "Mac" + s.slice(3).toUpperCase();
  if (/^O'./.test(s)) return "O'" + s.slice(2).toUpperCase();
  return s.toUpperCase();
}

// "Haruki Murakami" → "MURAKAMI, Haruki." — overrides handle non-Western order,
// particles (Le Guin), initials, and typos.
export function catalogAuthor(author, overrides = {}) {
  const raw = author.trim().replace(/\s+/g, " ");
  const o = overrides[raw] ?? overrides[author.trim()];
  if (o) return o.endsWith(".") ? o : o + ".";
  const parts = raw.split(" ");
  if (parts.length === 1) return stampCase(raw) + ".";
  const surname = parts[parts.length - 1];
  const given = parts.slice(0, -1).join(" ");
  const formed = `${stampCase(surname)}, ${given}`;
  return formed.endsWith(".") ? formed : formed + ".";
}

// Language read: manual override first, else the Wikipedia link domain, else EN.
export function languageFor(title, link, overrides = {}) {
  if (overrides[title]) return overrides[title];
  const m = /https?:\/\/([a-z]{2})\.wikipedia\.org\//.exec(link || "");
  if (m && m[1] === "es") return "ES";
  if (m && m[1] === "pt") return "PT";
  return "EN";
}

export const LANG_WORD = { EN: "English", ES: "Spanish", PT: "Portuguese" };

// Bigram Dice similarity on normalized strings — used to score metadata matches.
export function similarity(a, b) {
  const norm = (s) =>
    s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const bigrams = (s) => {
    const t = norm(s); const out = new Map();
    for (let i = 0; i < t.length - 1; i++) {
      const bg = t.slice(i, i + 2);
      out.set(bg, (out.get(bg) || 0) + 1);
    }
    return out;
  };
  const A = bigrams(a); const B = bigrams(b);
  let inter = 0; let sizeA = 0; let sizeB = 0;
  for (const v of A.values()) sizeA += v;
  for (const v of B.values()) sizeB += v;
  if (!sizeA || !sizeB) return 0;
  for (const [bg, v] of A) inter += Math.min(v, B.get(bg) || 0);
  return (2 * inter) / (sizeA + sizeB);
}
