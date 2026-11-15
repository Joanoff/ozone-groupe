// Remplit les compteurs publics et la section « En chiffres » de l'accueil.
// Éléments : data-stat="total.servers" | "usage.tracks" …  Tout reste masqué (hidden) tant que la donnée manque : aucune fausse valeur.
(function () {
  "use strict";
  var nf = new Intl.NumberFormat("fr-FR");
  var still = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var NS = "http://www.w3.org/2000/svg";

  function get(o, path) { return path.split(".").reduce(function (a, k) { return a == null ? a : a[k]; }, o); }
  function svg(tag, attrs) {
    var el = document.createElementNS(NS, tag);
    for (var k in attrs) el.setAttribute(k, attrs[k]);
    return el;
  }

  // Compte jusqu'à la valeur finale (sauf si l'utilisateur préfère moins d'animations).
  function countUp(el, to) {
    if (still || to < 20) { el.textContent = nf.format(to); return; }
    var t0 = null, dur = 1100;
    function step(t) {
      if (t0 === null) t0 = t;
      var p = Math.min((t - t0) / dur, 1), e = 1 - Math.pow(1 - p, 3);
      el.textContent = nf.format(Math.round(to * e));
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function dayLabel(iso) {
    var d = new Date(iso + "T00:00:00Z");
    return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });
  }

  // Colonnes = titres lancés, courbe = commandes, sur 14 jours.
  function drawChart(box, series) {
    var W = 640, H = 230, L = 8, R = 8, T = 14, B = 30, iw = W - L - R, ih = H - T - B, n = series.length;
    var max = 1;
    series.forEach(function (d) { max = Math.max(max, d.tracks, d.commands); });
    var step = iw / n, bw = Math.min(26, step * 0.56);
    var y = function (v) { return T + ih - (v / max) * ih; };
    var s = svg("svg", { viewBox: "0 0 " + W + " " + H, preserveAspectRatio: "xMidYMid meet", "aria-hidden": "true" });

    for (var g = 0; g <= 3; g++) {
      var gy = T + (ih / 3) * g;
      s.appendChild(svg("line", { x1: L, x2: W - R, y1: gy, y2: gy, class: "ch-grid" }));
    }
    var pts = [];
    series.forEach(function (d, i) {
      var cx = L + step * i + step / 2, top = y(d.tracks), h = Math.max(T + ih - top, d.tracks ? 2 : 0);
      var bar = svg("rect", { x: cx - bw / 2, y: T + ih - h, width: bw, height: h, rx: 4, class: "ch-bar" });
      if (!still) { bar.style.transformOrigin = cx + "px " + (T + ih) + "px"; bar.style.animationDelay = i * 35 + "ms"; }
      var tip = svg("title", {});
      tip.textContent = dayLabel(d.day) + " : " + nf.format(d.tracks) + " titres, " + nf.format(d.commands) + " commandes";
      bar.appendChild(tip);
      s.appendChild(bar);
      pts.push([cx, y(d.commands)]);
      if (i === 0 || i === n - 1 || i === Math.floor(n / 2)) {
        var tx = svg("text", { x: cx, y: H - 8, "text-anchor": i === 0 ? "start" : i === n - 1 ? "end" : "middle", class: "ch-label" });
        tx.setAttribute("x", i === 0 ? L : i === n - 1 ? W - R : cx);
        tx.textContent = dayLabel(d.day);
        s.appendChild(tx);
      }
    });
    s.appendChild(svg("polyline", { points: pts.map(function (p) { return p[0].toFixed(1) + "," + p[1].toFixed(1); }).join(" "), class: "ch-line", pathLength: 1 }));
    pts.forEach(function (p) { s.appendChild(svg("circle", { cx: p[0], cy: p[1], r: 3.2, class: "ch-dot" })); });
    box.textContent = "";
    box.appendChild(s);
  }

  fetch("/api/public-stats", { headers: { Accept: "application/json" } })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) {
      if (!d) return;

      // Compteurs génériques (héros + cartes KPI)
      [].forEach.call(document.querySelectorAll("[data-stat]"), function (el) {
        var v = get(d, el.getAttribute("data-stat"));
        if (typeof v !== "number") return;
        var t = el.querySelector("[data-value]") || el;
        countUp(t, v);
        (el.closest("[data-stat-wrap]") || el).hidden = false;
      });

      // Section « En chiffres » : visible seulement si au moins une donnée est disponible
      var section = document.querySelector("[data-stats-section]");
      if (!section) return;
      var shown = section.querySelectorAll(".kpi:not([hidden])").length > 0;

      // Répartition par bot
      var bots = d.bots || {}, maxS = 1, any = false;
      Object.keys(bots).forEach(function (k) { maxS = Math.max(maxS, bots[k].servers); });
      [].forEach.call(section.querySelectorAll("[data-bot]"), function (li) {
        var b = bots[li.getAttribute("data-bot")];
        if (!b) return;
        li.querySelector('[data-f="servers"]').textContent = nf.format(b.servers);
        li.querySelector('[data-f="members"]').textContent = nf.format(b.members);
        var bar = li.querySelector(".bb-track i");
        bar.style.setProperty("--w", Math.max(4, Math.round((b.servers / maxS) * 100)) + "%");
        li.hidden = false; any = true;
      });
      var bp = section.querySelector("[data-bots-panel]");
      if (bp && any) { bp.hidden = false; shown = true; }

      // Activité sur 14 jours (masquée tant qu'il n'y a aucune activité enregistrée)
      var series = d.usage && d.usage.series;
      var ap = section.querySelector("[data-activity]");
      if (ap && series && series.length) {
        var tt = 0, tc = 0, best = series[0];
        series.forEach(function (x) { tt += x.tracks; tc += x.commands; if (x.tracks > best.tracks) best = x; });
        if (tt + tc > 0) {
          drawChart(ap.querySelector("[data-chart]"), series);
          ap.querySelector("[data-activity-foot]").textContent =
            nf.format(tt) + " titres et " + nf.format(tc) + " commandes sur la période" +
            (best.tracks ? " · pic le " + dayLabel(best.day) + " (" + nf.format(best.tracks) + " titres)." : ".");
          ap.hidden = false; shown = true;
        }
      }

      if (!shown) return;
      section.hidden = false;
      // Les blocs ont été créés masqués : on laisse l'animation d'apparition les révéler.
      [].forEach.call(section.querySelectorAll(".reveal"), function (el) {
        if (!el.classList.contains("is-visible")) {
          if ("IntersectionObserver" in window) {
            var io = new IntersectionObserver(function (es) {
              es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("is-visible"); io.unobserve(e.target); } });
            }, { threshold: 0.12 });
            io.observe(el);
          } else el.classList.add("is-visible");
        }
      });
    })
    .catch(function () { /* silencieux : la page reste correcte sans les chiffres */ });
})();
