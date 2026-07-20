// Progressive enhancement for the card catalog.
// Without JS every year list is open and every book is readable; this script
// only adds the drawer collapse/expand and the edge → pulled-card swap.
(function () {
  "use strict";

  var LANG_WORD = { EN: "English", ES: "Spanish", PT: "Portuguese" };
  var openCard = null;

  // Year drawers: default open = current year + previous year (first two blocks).
  var blocks = document.querySelectorAll(".year-block");
  Array.prototype.forEach.call(blocks, function (block, yi) {
    var tabRow = block.querySelector(".year-tab-row");
    var caret = block.querySelector(".year-caret");
    var list = block.querySelector(".year-list");
    if (!tabRow || !list) return;
    tabRow.setAttribute("role", "button");
    tabRow.setAttribute("tabindex", "0");

    function setOpen(open) {
      list.classList.toggle("closed", !open);
      caret.textContent = open ? "▾" : "▸";
      tabRow.setAttribute("aria-expanded", String(open));
    }
    setOpen(yi < 2);

    tabRow.addEventListener("click", function () {
      setOpen(list.classList.contains("closed"));
    });
    tabRow.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        setOpen(list.classList.contains("closed"));
      }
    });
  });

  // Filed edges: click pulls the full card forward; clicking the card refiles it.
  function buildCard(edge) {
    var d = edge.dataset;
    var card = document.createElement("div");
    card.className = "pulled";
    card.setAttribute("role", "button");
    card.setAttribute("tabindex", "0");
    card.setAttribute("aria-expanded", "true");

    var head = document.createElement("div");
    head.className = "card-head";
    var who = document.createElement("span");
    who.style.fontSize = "15px";
    who.textContent = d.author;
    var acc = document.createElement("span");
    acc.className = "acc-no";
    acc.textContent = "№ " + d.acc;
    head.appendChild(who);
    head.appendChild(acc);

    var rule = document.createElement("div");
    rule.className = "red-rule";

    var entry = document.createElement("div");
    entry.className = "entry";
    if (d.link) {
      var a = document.createElement("a");
      a.href = d.link;
      a.target = "_blank";
      a.rel = "noopener";
      a.textContent = d.title;
      entry.appendChild(a);
      entry.appendChild(document.createTextNode("."));
    } else {
      entry.textContent = d.title + ".";
    }

    var meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent =
      "language: " + (LANG_WORD[d.lang] || d.lang) + " · filed: " + d.year;

    var stamp = document.createElement("div");
    stamp.className = "stamp-pill read-stamp";
    stamp.textContent = "READ ✓";

    var hole = document.createElement("div");
    hole.className = "hole";

    card.appendChild(head);
    card.appendChild(rule);
    card.appendChild(entry);
    card.appendChild(meta);
    card.appendChild(stamp);
    card.appendChild(hole);
    return card;
  }

  function refile(card) {
    card.replaceWith(card._edge);
    if (openCard === card) openCard = null;
  }

  function toggle(edge) {
    if (openCard && openCard._edge === edge) { refile(openCard); return; }
    if (openCard) refile(openCard);
    var card = buildCard(edge);
    card._edge = edge;
    card.addEventListener("click", function (e) {
      if (e.target.closest("a")) return; // let the title link work
      refile(card);
      edge.focus();
    });
    card.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " " || e.key === "Escape") {
        if (e.target.closest("a")) return;
        e.preventDefault();
        refile(card);
        edge.focus();
      }
    });
    edge.replaceWith(card);
    openCard = card;
    card.focus();
  }

  var edges = document.querySelectorAll(".edge");
  Array.prototype.forEach.call(edges, function (edge) {
    edge.setAttribute("role", "button");
    edge.setAttribute("tabindex", "0");
    edge.setAttribute("aria-expanded", "false");
    edge.addEventListener("click", function () { toggle(edge); });
    edge.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggle(edge);
      }
    });
  });
})();
