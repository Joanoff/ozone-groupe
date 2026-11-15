/* Ozone Groupe ™ — interactions & animations */
(function () {
  "use strict";

  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var header = document.getElementById("header");
  var toggle = document.getElementById("navToggle");
  var yearEl = document.getElementById("year");
  var glow = document.querySelector(".bg-glow");

  /* ---------- Année courante ---------- */
  if (yearEl) {
    yearEl.textContent = String(new Date().getFullYear());
  }

  /* ---------- Effet de scroll : cartes des bots ---------- */
  var botCards = document.querySelectorAll(".bot-card[data-scroll]");
  function updateBotCards() {
    if (!botCards.length || reduce) return;
    var vh = window.innerHeight || 800;
    botCards.forEach(function (card) {
      var r = card.getBoundingClientRect();
      /* 0 quand la carte entre par le bas, 1 quand elle est bien installée */
      var raw = (vh * 0.98 - r.top) / (vh * 0.5);
      var p = Math.max(0, Math.min(1, raw));
      var eased = 1 - Math.pow(1 - p, 3);
      card.style.setProperty("--p", eased.toFixed(3));
    });
  }

  /* ---------- Header compact & parallaxe du fond ---------- */
  var ticking = false;
  function onScrollFrame() {
    var y = window.scrollY || 0;

    if (header) {
      header.classList.toggle("is-scrolled", y > 8);
    }

    updateBotCards();

    ticking = false;
  }
  function requestScrollFrame() {
    if (!ticking) {
      ticking = true;
      window.requestAnimationFrame(onScrollFrame);
    }
  }
  window.addEventListener("scroll", requestScrollFrame, { passive: true });
  window.addEventListener("resize", requestScrollFrame, { passive: true });
  onScrollFrame();

  /* ---------- Menu mobile (panneau latéral) ---------- */
  var drawer = document.getElementById("navDrawer");
  if (toggle && drawer) {
    var mq = window.matchMedia("(max-width: 1020px)");

    function setMenu(open) {
      drawer.classList.toggle("open", open);
      if (header) header.classList.toggle("menu-open", open);
      document.body.classList.toggle("menu-lock", open);
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      toggle.setAttribute("aria-label", open ? "Fermer le menu" : "Ouvrir le menu");
      if (open) {
        drawer.removeAttribute("inert");
        var first = drawer.querySelector(".drawer-link");
        if (first) first.focus({ preventScroll: true });
      } else {
        drawer.setAttribute("inert", "");
      }
    }

    toggle.addEventListener("click", function () {
      setMenu(!drawer.classList.contains("open"));
    });

    /* Ferme au clic sur un lien ou sur le fond */
    drawer.addEventListener("click", function (e) {
      if (e.target.closest("a") || e.target.hasAttribute("data-drawer-close")) {
        setMenu(false);
      }
    });

    /* Échap pour fermer (le focus revient sur le bouton) */
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && drawer.classList.contains("open")) {
        setMenu(false);
        toggle.focus({ preventScroll: true });
      }
    });

    /* Referme automatiquement si on repasse en desktop */
    function onBreakpoint(e) {
      if (!e.matches && drawer.classList.contains("open")) setMenu(false);
    }
    if (mq.addEventListener) mq.addEventListener("change", onBreakpoint);
    else if (mq.addListener) mq.addListener(onBreakpoint);
  }

  /* ---------- Titres découpés en mots ---------- */
  function splitWords(el) {
    if (!el || el.getAttribute("data-split-done")) return;

    function walk(node) {
      Array.prototype.slice.call(node.childNodes).forEach(function (child) {
        if (child.nodeType === Node.TEXT_NODE) {
          var parts = child.textContent.split(/(\s+)/);
          var frag = document.createDocumentFragment();
          parts.forEach(function (part) {
            if (!part) return;
            if (/^\s+$/.test(part)) {
              frag.appendChild(document.createTextNode(part));
            } else {
              var outer = document.createElement("span");
              outer.className = "w";
              var inner = document.createElement("span");
              inner.className = "wi";
              inner.textContent = part;
              outer.appendChild(inner);
              frag.appendChild(outer);
            }
          });
          node.replaceChild(frag, child);
        } else if (child.nodeType === Node.ELEMENT_NODE && child.tagName !== "BR") {
          walk(child);
        }
      });
    }

    walk(el);
    el.setAttribute("data-split-done", "1");

    var words = el.querySelectorAll(".wi");
    Array.prototype.forEach.call(words, function (w, i) {
      w.style.transitionDelay = (i * 0.07).toFixed(2) + "s";
    });

    el.classList.add("split-ready");
    window.requestAnimationFrame(function () {
      window.requestAnimationFrame(function () {
        el.classList.add("split-in");
      });
    });
  }

  document.querySelectorAll("[data-split]").forEach(function (el) {
    try {
      splitWords(el);
    } catch (err) {
      /* En cas d'échec : afficher le titre tel quel */
      el.classList.add("split-ready");
    }
  });

  /* ---------- Apparition au scroll ---------- */
  var reveals = document.querySelectorAll(".reveal");
  if (reveals.length && "IntersectionObserver" in window) {
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );
    reveals.forEach(function (el) {
      io.observe(el);
    });
  } else {
    reveals.forEach(function (el) {
      el.classList.add("is-visible");
    });
  }

  /* ---------- Spot lumineux sur les cartes ---------- */
  if (window.matchMedia("(hover: hover)").matches) {
    document.querySelectorAll(".bot-card").forEach(function (card) {
      card.addEventListener("pointermove", function (e) {
        var r = card.getBoundingClientRect();
        card.style.setProperty("--mx", ((e.clientX - r.left) / r.width) * 100 + "%");
        card.style.setProperty("--my", ((e.clientY - r.top) / r.height) * 100 + "%");
      });
    });
  }

  /* ---------- Sommaire : section active ---------- */
  var tocLinks = document.querySelectorAll('.toc a[href^="#"]');
  if (tocLinks.length && "IntersectionObserver" in window) {
    var sections = document.querySelectorAll(".legal-content section[id]");
    var activeId = null;

    var sio = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            activeId = entry.target.id;
          }
        });
        if (activeId) {
          tocLinks.forEach(function (link) {
            link.classList.toggle("active", link.getAttribute("href") === "#" + activeId);
          });
        }
      },
      { rootMargin: "-15% 0px -70% 0px", threshold: 0 }
    );
    sections.forEach(function (sec) {
      sio.observe(sec);
    });
  }
})();
