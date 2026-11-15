// Page /teams : l'équipe du serveur Discord officiel, lue via /api/public-stats?view=crew (alimentée par le cog cogs/teams.py).
// Tout le texte vient de Discord : on n'utilise jamais innerHTML, uniquement textContent.
(function () {
  "use strict";
  var root = document.getElementById("tmCrew");
  if (!root) return;

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  var fr = new Intl.NumberFormat("fr-FR");
  var num = function (v) { return v == null ? "—" : fr.format(v); };
  var STATUS = { online: "En ligne", idle: "Absent", dnd: "Ne pas déranger", offline: "Hors ligne" };

  var NS = "http://www.w3.org/2000/svg";
  var maskId = 0;
  // Pastilles de statut aux formes exactes de Discord : plein (en ligne), croissant (absent), barre (ne pas déranger), anneau (hors ligne).
  function statusIcon(status) {
    var svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 10 10");
    svg.setAttribute("aria-hidden", "true");
    function shape(tag, attrs, parent) {
      var n = document.createElementNS(NS, tag);
      for (var k in attrs) n.setAttribute(k, attrs[k]);
      (parent || svg).appendChild(n);
      return n;
    }
    if (status === "online") {
      shape("circle", { cx: 5, cy: 5, r: 5, fill: "currentColor" });
    } else if (status === "idle") {
      var id = "tm-moon-" + (++maskId);
      var defs = shape("defs", {});
      var mask = shape("mask", { id: id, maskUnits: "userSpaceOnUse", x: 0, y: 0, width: 10, height: 10 }, defs);
      shape("rect", { width: 10, height: 10, fill: "#fff" }, mask);
      shape("circle", { cx: 2, cy: 2, r: 3, fill: "#000" }, mask);
      shape("circle", { cx: 5, cy: 5, r: 5, fill: "currentColor", mask: "url(#" + id + ")" });
    } else if (status === "dnd") {
      shape("path", { fill: "currentColor", "fill-rule": "evenodd",
        d: "M5 0a5 5 0 1 0 0 10A5 5 0 0 0 5 0zM2.6 3.9h4.8a1.1 1.1 0 0 1 0 2.2H2.6a1.1 1.1 0 0 1 0-2.2z" });
    } else {
      shape("path", { fill: "currentColor", "fill-rule": "evenodd",
        d: "M5 0a5 5 0 1 0 0 10A5 5 0 0 0 5 0zm0 2.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z" });
    }
    return svg;
  }
  function dotEl(status) {
    var dot = el("i", "tm-dot is-" + status);
    dot.setAttribute("aria-hidden", "true");
    dot.appendChild(statusIcon(status));
    return dot;
  }

  function avatar(m) {
    var wrap = el("span", "tm-av");
    var initial = el("span", "tm-ini", (m.name || "?").trim().charAt(0).toUpperCase());
    wrap.appendChild(initial);
    if (m.avatar) {
      var img = document.createElement("img");
      img.alt = ""; img.width = 56; img.height = 56; img.loading = "lazy"; img.decoding = "async"; img.referrerPolicy = "no-referrer";
      img.addEventListener("load", function () { wrap.classList.add("has-img"); });
      img.addEventListener("error", function () { img.remove(); });
      img.src = m.avatar;
      wrap.appendChild(img);
    }
    if (m.status && STATUS[m.status]) {
      wrap.appendChild(dotEl(m.status));
    }
    return wrap;
  }

  function card(m, i) {
    var li = el("li", "tm-card");
    li.style.setProperty("--i", i);
    li.appendChild(avatar(m));
    var info = el("span", "tm-info");
    info.appendChild(el("b", "", m.name));
    info.appendChild(el("small", "", "@" + m.username));
    if (m.status && STATUS[m.status]) info.appendChild(el("span", "sr-only", STATUS[m.status]));
    li.appendChild(info);
    return li;
  }

  function stats(d) {
    var g = d.guild;
    var items = [];
    if (g) {
      items.push([num(g.members), "Membres sur le serveur"]);
      if (g.online != null) items.push([num(g.online), "En ligne maintenant"]);
      items.push([num(g.boosts), "Boosts du serveur"]);
    }
    items.push([num(d.count), d.count > 1 ? "Personnes dans l'équipe" : "Personne dans l'équipe"]);
    var sec = el("section", "tm-top");
    var box = el("div", "zn-stats");
    items.forEach(function (it) {
      var s = el("div", "zn-stat");
      s.appendChild(el("b", "", it[0]));
      s.appendChild(el("span", "", it[1]));
      box.appendChild(s);
    });
    box.style.setProperty("--cols", items.length);
    sec.appendChild(box);
    return sec;
  }

  function group(r, offset) {
    var sec = el("section", "tm-group");
    var h = el("h2");
    if (r.color) { var c = el("i", "tm-role"); c.style.background = r.color; c.setAttribute("aria-hidden", "true"); h.appendChild(c); }
    h.appendChild(document.createTextNode(r.name));
    sec.appendChild(h);
    sec.appendChild(el("p", "", r.members.length + (r.members.length > 1 ? " membres" : " membre")));
    var ul = el("ul", "tm-grid");
    r.members.forEach(function (m, i) { ul.appendChild(card(m, offset + i)); });
    sec.appendChild(ul);
    return sec;
  }

  function note(d) {
    var hasStatus = d.roles.some(function (r) { return r.members.some(function (m) { return m.status; }); });
    var sec = el("section", "tm-note");
    if (hasStatus) {
      var lg = el("ul", "tm-legend");
      ["online", "idle", "dnd", "offline"].forEach(function (k) {
        var li = el("li");
        li.appendChild(dotEl(k)); li.appendChild(document.createTextNode(STATUS[k]));
        lg.appendChild(li);
      });
      sec.appendChild(lg);
    }
    var when = "";
    if (d.updated_at) {
      var min = Math.max(0, Math.round((Date.now() / 1000 - d.updated_at) / 60));
      when = min < 1 ? " · mis à jour à l'instant" : min < 60 ? " · mis à jour il y a " + min + " min" : "";
    }
    sec.appendChild(el("p", "", "Données publiques du serveur Discord (pseudo, photo, rôle)" + when + "."));
    return sec;
  }

  function empty() {
    var sec = el("section", "tm-empty");
    sec.appendChild(el("h2", "", "L'équipe arrive bientôt"));
    var p = el("p", "", "La liste n'est pas encore disponible. En attendant, tu peux nous retrouver directement sur le ");
    var a = el("a", "", "serveur Discord");
    a.href = "https://discord.gg/yZ7w5r4Csm"; a.target = "_blank"; a.rel = "noopener";
    p.appendChild(a); p.appendChild(document.createTextNode("."));
    sec.appendChild(p);
    return sec;
  }

  function show(nodes) {
    root.textContent = "";
    nodes.forEach(function (n) { root.appendChild(n); });
    root.setAttribute("aria-busy", "false");
    root.classList.add("is-ready");
  }

  fetch("/api/public-stats?view=crew", { headers: { Accept: "application/json" } })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (j) {
      var d = j && j.crew;
      if (!d || !d.roles || !d.roles.length) return show([empty()]);
      var out = [stats(d)], offset = 0;
      d.roles.forEach(function (r) { out.push(group(r, offset)); offset += r.members.length; });
      out.push(note(d));
      show(out);
    })
    .catch(function () { show([empty()]); });
})();
