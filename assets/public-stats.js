// Remplit les compteurs publics. Éléments : data-stat="total.servers" | "bots.player1.servers" | "usage.tracks" …
// Tout reste masqué (hidden) tant que la donnée n'est pas disponible : aucune fausse valeur affichée.
(function () {
  "use strict";
  var nf = new Intl.NumberFormat("fr-FR");
  function get(o, path) { return path.split(".").reduce(function (a, k) { return a == null ? a : a[k]; }, o); }
  fetch("/api/public-stats", { headers: { Accept: "application/json" } })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) {
      if (!d) return;
      [].forEach.call(document.querySelectorAll("[data-stat]"), function (el) {
        var v = get(d, el.getAttribute("data-stat"));
        if (typeof v !== "number") return;
        var t = el.querySelector("[data-value]") || el;
        t.textContent = nf.format(v);
        var wrap = el.closest("[data-stat-wrap]") || el;
        wrap.hidden = false;
      });
    })
    .catch(function () { /* silencieux : la page reste correcte sans les chiffres */ });
})();
