// Affiche les développeurs avec leur photo et leur pseudo Discord (données de /api/public-stats).
// Sans données (DEVELOPER_IDS absent, Discord injoignable), la liste statique du HTML reste affichée.
(function () {
  "use strict";
  var lists = document.querySelectorAll("[data-team]");
  if (!lists.length) return;
  fetch("/api/public-stats", { headers: { Accept: "application/json" } })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) {
      var team = d && d.team;
      if (!team || !team.length) return;
      [].forEach.call(lists, function (ul) {
        ul.textContent = "";
        ul.className = "dev-grid";
        team.forEach(function (m) {
          var li = document.createElement("li"); li.className = "dev-card";
          var img = document.createElement("img");
          img.src = m.avatar; img.alt = ""; img.width = 52; img.height = 52; img.loading = "lazy"; img.decoding = "async"; img.referrerPolicy = "no-referrer";
          var info = document.createElement("span"); info.className = "dev-info";
          var b = document.createElement("b"); b.textContent = m.name;
          var u = document.createElement("small"); u.textContent = "@" + m.username;
          info.appendChild(b); info.appendChild(u);
          li.appendChild(img); li.appendChild(info);
          ul.appendChild(li);
        });
      });
    })
    .catch(function () { /* silencieux */ });
})();
