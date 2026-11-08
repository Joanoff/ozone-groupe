/* Ozone Groupe ™ — thème clair / sombre des pages publiques (accueil, ajouter, légal).
   Même clé que le dashboard (ozone-theme) : le choix est partagé partout.
   Chargé dans <head> (sans defer) pour appliquer le thème avant l'affichage, sans flash. */
(function () {
  "use strict";
  var KEY = "ozone-theme", root = document.documentElement;

  function saved() { try { return localStorage.getItem(KEY) === "dark" ? "dark" : "light"; } catch (e) { return "light"; } }
  function current() { return root.getAttribute("data-theme") === "dark" ? "dark" : "light"; }
  function paint(b) {
    var dark = current() === "dark", label = dark ? "Passer en mode clair" : "Passer en mode sombre";
    b.innerHTML = dark
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>';
    b.setAttribute("title", label); b.setAttribute("aria-label", label); b.setAttribute("aria-pressed", String(dark));
  }
  function apply(t, persist) {
    if (t === "dark") root.setAttribute("data-theme", "dark"); else root.removeAttribute("data-theme");
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute("content", t === "dark" ? "#0f1411" : "#ffffff");
    if (persist) { try { localStorage.setItem(KEY, t); } catch (e) { /* stockage bloqué : valable pour cette visite */ } }
    [].forEach.call(document.querySelectorAll(".theme-btn"), paint);
  }

  apply(saved(), false);

  document.addEventListener("DOMContentLoaded", function () {
    function make() {
      var b = document.createElement("button");
      b.type = "button"; b.className = "theme-btn";
      b.addEventListener("click", function () { apply(current() === "dark" ? "light" : "dark", true); });
      paint(b);
      return b;
    }
    var cta = document.querySelector(".nav-cta"), toggle = document.getElementById("navToggle");
    if (cta) cta.insertBefore(make(), toggle || null);
    // Le thème peut aussi être changé depuis un autre onglet
    window.addEventListener("storage", function (e) { if (e.key === KEY) apply(e.newValue === "dark" ? "dark" : "light", false); });
  });
})();
