// Renders the whole site as one static HTML document.
// Everything is present in the markup without JS; catalog.js only adds the
// drawer collapse/expand and the pull-a-card interaction.

import { LANG_WORD } from "./catalog.mjs";

const esc = (s) =>
  String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function monthWord(yyyyMm) {
  const [y, m] = (yyyyMm || "").split("-").map(Number);
  if (!y || !m) return null;
  return `${MONTHS[m - 1]} ${y}`;
}

const STAMP_SVG = `<svg viewBox="0 0 120 120" width="116" height="116" role="img" aria-label="Biblioteca de Nicholas stamp">
  <circle cx="60" cy="60" r="57" fill="none" stroke="#3A4E9C" stroke-width="2.5"/>
  <circle cx="60" cy="60" r="42" fill="none" stroke="#3A4E9C" stroke-width="1.2"/>
  <defs>
    <path id="arcTop" d="M 11,60 A 49,49 0 0 1 109,60"/>
    <path id="arcBot" d="M 8,60 A 52,52 0 0 0 112,60"/>
  </defs>
  <text style="font-family:'Special Elite',monospace;font-size:10px;letter-spacing:2px;fill:#3A4E9C;"><textPath href="#arcTop" startOffset="50%" text-anchor="middle">BIBLIOTECA DE NICHOLAS</textPath></text>
  <text style="font-family:'Special Elite',monospace;font-size:9px;letter-spacing:2.5px;fill:#3A4E9C;"><textPath href="#arcBot" startOffset="50%" text-anchor="middle">SANTIAGO DE CHILE</textPath></text>
  <text x="60" y="55" text-anchor="middle" style="font-family:'Special Elite',monospace;font-size:9px;fill:#3A4E9C;">&#10022; EST &#10022;</text>
  <text x="60" y="71" text-anchor="middle" style="font-family:'Special Elite',monospace;font-size:13px;fill:#3A4E9C;">2022</text>
</svg>`;

function leadEntryHtml(lead) {
  // With a known imprint the entry reads like a real catalog line:
  //   Title. — City : Publisher, year. — genre.
  // Otherwise just the title. The title portion links out when a link exists.
  const line = lead.imprint || `${lead.title}.`;
  const dotDash = line.indexOf(". — ");
  const titlePart = dotDash === -1 ? line.replace(/\.$/, "") : line.slice(0, dotDash);
  const rest = dotDash === -1 ? "." : line.slice(dotDash);
  const titleHtml = lead.link
    ? `<a href="${esc(lead.link)}" target="_blank" rel="noopener">${esc(titlePart)}</a>`
    : esc(titlePart);
  return titleHtml + esc(rest);
}

function leadCardHtml(lead) {
  const coverImg = lead.coverPath
    ? `<img class="cover-img" src="${esc(lead.coverPath)}" alt="Cover of ${esc(lead.title)}"
        onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
      <div class="cover" style="display:none;">
        <div class="ct">${esc(lead.title)}</div>
        <div class="ca">${esc(lead.surname)}</div>
      </div>`
    : `<div class="cover">
        <div class="ct">${esc(lead.title)}</div>
        <div class="ca">${esc(lead.surname)}</div>
      </div>`;
  const started = monthWord(lead.started);
  return `<div class="section-label">NOW READING</div>
  <div class="lead-wrap">
    <div class="catalog-card">
      <div class="lead-flex">
        ${coverImg}
        <div style="flex:1;">
          <div class="card-head">
            <span class="stamp-pill" style="color: var(--stamp-red);">NOW READING</span>
            <span class="acc-no">&#8470; ${esc(lead.acc)}</span>
          </div>
          <div class="red-rule"></div>
          <div style="font-size:15px;">${esc(lead.author)}</div>
          <div class="entry">${leadEntryHtml(lead)}</div>
          <div class="meta">language: ${esc(lead.lang)}${started ? ` · started: ${esc(started)}` : ""}</div>
        </div>
      </div>
      <div class="round-stamp">${STAMP_SVG}</div>
      <div class="hole"></div>
    </div>
  </div>`;
}

function nextUpHtml(next) {
  if (!next.length) return "";
  const cards = next
    .map(
      (b) => `<div class="hold-card">
      <span class="hold-slip">ON HOLD</span>
      <div class="who">${esc(b.author)}</div>
      <div class="what">${
        b.link
          ? `<a href="${esc(b.link)}" target="_blank" rel="noopener">${esc(b.title)}</a>`
          : esc(b.title)
      }</div>
    </div>`
    )
    .join("\n    ");
  return `<div class="section-label">NEXT UP</div>
  <div class="hold-grid">
    ${cards}
  </div>`;
}

function historyHtml(years) {
  const blocks = years
    .map(({ year, books }) => {
      const edges = books
        .map(
          (b) => `<div class="edge" data-author="${esc(b.author)}" data-title="${esc(
            b.title
          )}" data-lang="${esc(b.lang)}" data-acc="${esc(b.acc)}" data-year="${year}"${
            b.link ? ` data-link="${esc(b.link)}"` : ""
          }>
        <span class="who">${esc(b.author)}</span>
        <span class="what">&mdash; ${esc(b.title)}</span>
        <span class="lang">${esc(b.lang)}</span>
      </div>`
        )
        .join("\n      ");
      return `<div class="year-block" data-year="${year}">
      <div class="year-tab-row">
        <div class="year-tab"><span class="year-caret">&#9662;</span>${year} &mdash; ${
        books.length
      } BOOK${books.length === 1 ? "" : "S"}</div>
        <div class="year-bar"></div>
      </div>
      <div class="year-list">
      ${edges}
      </div>
    </div>`;
    })
    .join("\n    ");
  return `<div class="section-label">READING HISTORY</div>
  <div id="drawer">
    ${blocks}
  </div>`;
}

export function renderSite({ config, stats, lead, next, years, buildYear }) {
  const title = "La Biblioteca de Nicholas";
  const description =
    "What I read, have read and will read — a card catalog of my reading since 2022.";
  const inventory = `${stats.total} CARDS FILED &middot; EN ${stats.EN} / ES ${stats.ES} / PT ${stats.PT} &middot; SINCE ${stats.since}`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(config.siteUrl)}/">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(config.siteUrl)}/">
<meta property="og:image" content="${esc(config.siteUrl)}/og-card.png">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" type="image/svg+xml" href="favicon.svg">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Special+Elite&family=Courier+Prime:ital,wght@0,400;0,700;1,400&display=swap" rel="stylesheet">
<link rel="stylesheet" href="styles.css">
${
  config.umami?.websiteId
    ? `<script defer src="${esc(config.umami.src)}" data-website-id="${esc(
        config.umami.websiteId
      )}"></script>\n`
    : ""
}</head>
<body>
<div class="col">

  <header class="masthead">
    <h1>${esc(title)}</h1>
    <p class="tagline">What I read, have read and will read.</p>
    <hr class="masthead-rule">
    <p class="inventory">${inventory}</p>
  </header>

  ${lead ? leadCardHtml(lead) : ""}

  ${nextUpHtml(next)}

  ${historyHtml(years)}

  <footer>
    <hr class="foot-rule">
    <p>v1 of this site was built with Replit and ChatGPT in 2024.<br>
    v2 was rebuilt with Claude in 2026.<br>
    I love snooping through people's bookshelves &mdash; now you can snoop through mine.</p>
    <p>&copy; ${buildYear} La Biblioteca de Nicholas &middot; <a href="https://nicholasoconnor.com">nicholasoconnor.com</a></p>
  </footer>

</div>
<script src="catalog.js" defer></script>
</body>
</html>
`;
}

export { LANG_WORD };
