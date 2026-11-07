/* Ozone Groupe ™ — Dashboard Player 1 */
(function () {
  "use strict";

  var PLAYER_ID = "1565321668660953139"; // application Discord de Player 1
  var INVITE = "https://discord.com/oauth2/authorize?client_id=" + PLAYER_ID;
  // Mêmes couleurs que BAR_PRESETS dans cogs/musique.py
  var PRESETS = [
    ["Rose", 0xFF6B9D], ["Rouge", 0xEF4444], ["Orange", 0xF97316], ["Jaune", 0xFACC15], ["Vert", 0x22C55E],
    ["Cyan", 0x06B6D4], ["Bleu", 0x3B82F6], ["Violet", 0x8B5CF6], ["Blanc", 0xF1F5F9]
  ];
  var DEF1 = 0xFF6B9D, DEF2 = 0x8B5CF6; // dégradé par défaut (rose → violet)

  var view = document.getElementById("view");
  var sub = document.getElementById("dashSub");
  var state = { me: null, guild: null, data: null, tab: "overview", pid: null, range: 30 };
  var toastTimer;
  var live = { poll: null, tick: null, st: null, at: 0 };

  function stopLive() {
    clearInterval(live.poll); clearInterval(live.tick);
    live.poll = live.tick = null; live.st = null;
  }


  /* ---------- Écran de chargement ---------- */
  // Barre ≈ 4,5 s + 0,7 s de fondu ≈ 5 s au total (modifiable ici). Si le chargement est plus long, il attend ; jamais moins.
  var LOADER_MS = 4500;
  var boot = (function () {
    var el = document.getElementById("boot");
    if (!el) return { done: function () {} };
    var fill = el.querySelector(".boot-fill"), pct = el.querySelector(".boot-pct"), msg = el.querySelector(".boot-msg");
    var STEPS = [[0, "Connexion à Discord…"], [0.25, "Chargement de tes serveurs…"], [0.5, "Synchronisation de Player 1…"],
      [0.75, "Préparation de ton dashboard…"], [0.93, "C'est presque prêt…"]];
    var t0 = performance.now(), ready = false, closed = false, step = -1;
    function close() {
      closed = true;
      fill.style.width = "100%"; pct.textContent = "100 %";
      el.classList.add("out");
      setTimeout(function () { el.remove(); document.documentElement.classList.remove("booting"); }, 700);
    }
    function frame(now) {
      if (closed) return;
      var p = Math.min((now - t0) / LOADER_MS, 1);
      var shown = ready ? p : Math.min(p, 0.97);
      fill.style.width = (shown * 100).toFixed(1) + "%";
      pct.textContent = Math.floor(shown * 100) + " %";
      var i = 0;
      STEPS.forEach(function (st, k) { if (shown >= st[0]) i = k; });
      if (p >= 1 && !ready && step !== 99) { step = 99; msg.textContent = "Encore un instant…"; }
      else if (step !== 99 && i !== step) { step = i; msg.textContent = STEPS[i][1]; }
      if (p >= 1 && ready) return close();
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    return { done: function () { ready = true; } };
  })();

  function skeleton() {
    var wrap = h("div", { class: "sk-wrap", "aria-hidden": "true" });
    wrap.appendChild(h("div", { class: "sk sk-title" }));
    wrap.appendChild(h("div", { class: "sk sk-line" }));
    wrap.appendChild(h("div", { class: "sk sk-card" }));
    wrap.appendChild(h("div", { class: "sk sk-card sk-short" }));
    return wrap;
  }

  /* ---------- Utilitaires ---------- */

  // Construit un élément sans jamais passer par innerHTML (les noms/titres viennent des utilisateurs).
  function h(tag, attrs) {
    var el = document.createElement(tag);
    for (var k in (attrs || {})) {
      var v = attrs[k];
      if (v === false || v == null) continue;
      if (k === "class") el.className = v;
      else if (k.slice(0, 2) === "on") el.addEventListener(k.slice(2), v);
      else if (k === "text") el.textContent = v;
      else el.setAttribute(k, v === true ? "" : v);
    }
    (function add(list) {
      for (var i = 0; i < list.length; i++) {
        var c = list[i];
        if (c == null || c === false) continue;
        if (Array.isArray(c)) { add(c); continue; }
        if (typeof c === "string" || typeof c === "number") c = document.createTextNode(String(c));
        if (c && c.nodeType) el.appendChild(c);
      }
    })(Array.prototype.slice.call(arguments, 2));
    return el;
  }

  function toast(msg, isErr) {
    var t = document.getElementById("dashToast");
    if (!t) { t = h("div", { id: "dashToast", class: "dash-toast", role: "status" }); document.body.appendChild(t); }
    t.textContent = msg;
    t.className = "dash-toast show" + (isErr ? " err" : "");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = "dash-toast" + (isErr ? " err" : ""); }, 3200);
  }

  function api(path, body) {
    var opts = body === undefined ? {} : {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
    };
    return fetch(path, opts).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) { var e = new Error(j.error || "Erreur " + r.status); e.status = r.status; throw e; }
        return j;
      });
    });
  }

  // Même dégradé que le bot : une seule couleur = version éclaircie de 30 % → couleur.
  function mixWhite(c) {
    var ch = [(c >> 16) & 255, (c >> 8) & 255, c & 255].map(function (v) { return Math.round(v + (255 - v) * 0.3); });
    return (ch[0] << 16) | (ch[1] << 8) | ch[2];
  }
  function hex(n) { return "#" + (n >>> 0).toString(16).padStart(6, "0").toUpperCase(); }
  function parseHex(s) { var m = /^#?([0-9a-f]{6})$/i.exec((s || "").trim()); return m ? parseInt(m[1], 16) : null; }

  function fmt(sec) {
    if (sec == null) return "";
    var hh = Math.floor(sec / 3600), mm = Math.floor((sec % 3600) / 60), ss = sec % 60;
    var p = function (x) { return String(x).padStart(2, "0"); };
    return hh ? hh + ":" + p(mm) + ":" + p(ss) : mm + ":" + p(ss);
  }
  function parseDuration(s) {
    s = (s || "").trim();
    if (!s) return null;
    var parts = s.split(":");
    if (parts.length > 3 || parts.some(function (x) { return !/^\d+$/.test(x); })) return NaN;
    return parts.reduce(function (acc, x) { return acc * 60 + Number(x); }, 0);
  }

  function avatar(kind, id, hash, label, square) {
    var cls = "dash-avatar" + (square ? " sq" : "");
    if (hash) {
      return h("img", {
        class: cls, alt: "", width: 40, height: 40, referrerpolicy: "no-referrer",
        src: "https://cdn.discordapp.com/" + kind + "/" + id + "/" + hash + ".png?size=64"
      });
    }
    return h("span", { class: cls, "aria-hidden": "true", text: (label || "?").charAt(0).toUpperCase() });
  }

  function busy(btn, fn) {
    btn.disabled = true;
    return Promise.resolve().then(fn).then(function (r) { btn.disabled = false; return r; },
      function (e) { btn.disabled = false; throw e; });
  }


  // Envoie un ordre au bot. Si la réponse tarde (recherche en cours), on suit l'ordre jusqu'au résultat.
  function order(payload) {
    var gid = state.guild.id;
    payload.guild = gid;
    var slow = payload.action === "play" || payload.action === "pl_add" || payload.action === "playlist_play";
    var hint = slow ? setTimeout(function () { toast("Player 1 s'en occupe…"); }, 1200) : null;
    function follow(id, tries) {
      return new Promise(function (resolve, reject) {
        setTimeout(function () {
          api("/api/command?guild=" + gid + "&id=" + id).then(function (c) {
            if (!c.done) return tries > 60 ? reject(new Error("Le bot n'a pas répondu à temps")) : follow(id, tries + 1).then(resolve, reject);
            c.ok ? resolve({ ok: true, message: c.message }) : reject(new Error(c.message));
          }, reject);
        }, 1000);
      });
    }
    return api("/api/control", payload).then(function (j) { return j.pending ? follow(j.id, 0) : j; })
      .then(function (r) { clearTimeout(hint); return r; }, function (e) { clearTimeout(hint); throw e; });
  }

  function fail(e) {
    if (e.status === 401) { state.me = null; return renderLogin(); }
    toast(e.message || "Erreur", true);
  }

  /* ---------- Écran de connexion ---------- */

  function renderLogin(errCode) {
    stopLive();
    setHero(true);
    state.me = null;
    sub.textContent = "Connecte-toi avec Discord pour gérer ta musique avec Player 1.";
    var messages = {
      refuse: "Connexion annulée.",
      etat: "La connexion a expiré, réessaie.",
      connexion: "Impossible de te connecter pour le moment, réessaie dans un instant."
    };
    document.getElementById("app").classList.add("in-login");
    var art = h("div", { class: "login-art", "aria-hidden": "true" });
    art.innerHTML = LOGIN_ART;
    var btn = h("a", { class: "btn btn-primary login-btn", href: "/api/auth/login" }, icon(IC.login, "ic"), "Se connecter via Discord");
    view.replaceChildren(h("div", { class: "login" },
      h("div", { class: "login-col" },
        h("a", { class: "login-logo", href: "/", "aria-label": "Ozone Groupe" }, h("img", { src: "/assets/logo.svg", alt: "", width: "26", height: "26" })),
        h("div", { class: "dash-card dash-login" },
          errCode && messages[errCode] ? h("div", { class: "dash-error", role: "alert", text: messages[errCode] }) : null,
          h("h2", { text: "Connexion" }),
          h("p", { text: "Nous lisons uniquement ton identité et la liste de tes serveurs. Rien n'est publié sur ton compte." }),
          btn),
        h("p", { class: "login-note" }, "Player 1 n'est pas encore sur ton serveur ? ", h("a", { href: "/ajouter" }, "Ajouter le bot"))),
      art));
  }

  /* ---------- Liste des serveurs ---------- */

  function userBar() {
    var u = state.me.user;
    return h("div", { class: "dash-bar" },
      h("div", { class: "who" }, avatar("avatars", u.id, u.avatar, u.username), h("strong", { text: u.username })),
      h("button", {
        class: "btn btn-ghost btn-sm", type: "button", onclick: function (ev) {
          busy(ev.currentTarget, function () { return api("/api/auth/logout", {}); }).then(function () { renderLogin(); }, fail);
        }
      }, "Se déconnecter")
    );
  }

  function renderGuilds() {
    stopLive();
    setHero(true);
    state.guild = null; state.data = null;
    sub.textContent = "Choisis un serveur.";
    history.replaceState(null, "", "/dashboard");
    var gs = state.me.guilds;
    var grid = h("div", { class: "dash-guilds" });
    gs.forEach(function (g) {
      var onlyProtect = g.bot === false && g.protect === true, absent = g.bot === false && !onlyProtect;
      grid.appendChild(h("button", {
        class: "dash-guild", type: "button", disabled: absent,
        onclick: function () { openGuild(g, state.want); }
      },
        avatar("icons", g.id, g.icon, g.name, true),
        h("span", { class: "txt" },
          h("span", { class: "name", text: g.name }),
          absent
            ? (g.manage
              ? h("span", { class: "meta" }, "Player 1 absent · ", h("a", { href: INVITE, target: "_blank", rel: "noopener", onclick: function (e) { e.stopPropagation(); } }, "l'ajouter"))
              : h("span", { class: "meta", text: "Player 1 absent" }))
            : h("span", { class: "meta", text: onlyProtect ? "Protect uniquement" : g.manage ? "Gérer" : "Ma musique" }))
      ));
    });
    view.replaceChildren(userBar(), gs.length ? grid
      : h("div", { class: "dash-card" }, h("h2", { text: "Aucun serveur" }),
        h("p", { class: "hint", text: "Aucun de tes serveurs n'utilise Player 1 pour le moment." })));
  }

  /* ---------- Serveur sélectionné ---------- */

  // Adresses : /dashboard/<onglet>/<id du serveur>  (l'ancien format /dashboard/<onglet>#<id> reste lu)
  var SLUG = { overview: "vue-ensemble", live: "direct", trending: "du-moment", playlists: "playlists", settings: "reglages", protect: "protection", embed: "createur-embed" };
  var TAB_OF = {};
  Object.keys(SLUG).forEach(function (k) { TAB_OF[SLUG[k]] = k; });
  function allowed(g, tab) { return tab && SLUG[tab] && (g.manage || (tab !== "overview" && tab !== "settings" && tab !== "protect")); }
  function pathFor(g, tab) { return "/dashboard/" + SLUG[tab] + "/" + g.id; }

  function openGuild(g, tab, replace) {
    state.guild = g; state.pid = null;
    state.tab = allowed(g, tab) ? tab : g.bot === false && g.protect === true && allowed(g, "protect") ? "protect" : allowed(g, state.want) ? state.want : g.manage ? "overview" : "live";
    state.want = null;
    history[replace ? "replaceState" : "pushState"](null, "", pathFor(g, state.tab));
    setHero(false);
    view.replaceChildren(skeleton());
    api("/api/guild?id=" + g.id).then(function (d) { state.data = d; renderGuild(); }, function (e) {
      fail(e); if (state.me) renderGuilds();
    });
  }

  // Le grand titre n'apparaît que sur les écrans de connexion / choix du serveur.
  function setHero(on) {
    var hero = document.querySelector(".dash-hero");
    if (hero) hero.hidden = !on;
    document.getElementById("app").classList.toggle("in-guild", !on);
    document.getElementById("app").classList.remove("in-login");
  }

  /* ---------- Barre latérale (à gauche) ---------- */

  function svg(d) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>'; }
  function icon(d, cls) { var s = h("span", { class: cls || "ic", "aria-hidden": "true" }); s.innerHTML = svg(d); return s; }
  var IC = {
    overview: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
    settings: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
    playlists: '<path d="M4 6h11M4 11h11M4 16h6"/><path d="M19 7v9"/><circle cx="17" cy="16" r="2"/>',
    live: '<path d="M4 10v4M8 6v12M12 3v18M16 7v10M20 10v4"/>',
    swap: '<path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h16"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
    chevron: '<path d="m6 9 6 6 6-6"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    panel: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/>',
    updown: '<path d="m7 15 5 5 5-5"/><path d="m7 9 5-5 5 5"/>',
    back: '<path d="m15 18-6-6 6-6"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    protect: '<path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6z"/><path d="m9 12 2 2 4-4"/>',
    embed: '<rect width="18" height="7" x="3" y="3" rx="1"/><rect width="9" height="7" x="3" y="14" rx="1"/><rect width="5" height="7" x="16" y="14" rx="1"/>',
    eye: '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>'
  };
  // Tout membre pilote la musique ; les statistiques et les réglages sont réservés aux gestionnaires.
  function navFor(manage) {
    return manage
      ? [["Statistiques", [["overview", "Vue d'ensemble"]]], ["Player 1", [["live", "En direct"], ["trending", "Du moment"], ["playlists", "Playlists"], ["settings", "Réglages"]]], ["Protect", [["protect", "Protection"]]], ["Outils", [["embed", "Créateur d'embed"]]]]
      : [["Player 1", [["live", "En direct"], ["trending", "Du moment"], ["playlists", "Playlists"]]], ["Outils", [["embed", "Créateur d'embed"]]]];
  }
  var TITLES = { overview: "Vue d'ensemble", live: "En direct", trending: "Du moment", playlists: "Playlists", settings: "Réglages", protect: "Protection", embed: "Créateur d'embed" };
  var mobileQ = window.matchMedia("(max-width: 960px)");
  var collapsed = false;
  try { collapsed = localStorage.getItem("ozone_side") === "1"; } catch (e) { /* stockage indisponible */ }

  // Menu mobile (tiroir) : ouvre / ferme, synchronise la classe sur le conteneur, la barre et le bouton hamburger.
  function setNav(open) {
    var sh = document.querySelector(".dash-shell");
    if (!sh) return;
    open = !!open && mobileQ.matches;
    sh.classList.toggle("nav-open", open);
    var sd = sh.querySelector(".dash-side"); if (sd) sd.classList.toggle("open", open);
    var b = document.getElementById("dashBurger"); if (b) b.setAttribute("aria-expanded", String(open));
    if (open && sd) { var f = sd.querySelector(".dash-navbtn[aria-current='page']") || sd.querySelector(".dash-navbtn"); if (f) { f.focus({ preventScroll: true }); f.scrollIntoView({ block: "nearest" }); } }
    else if (!open && b && document.activeElement && sd && sd.contains(document.activeElement)) b.focus({ preventScroll: true });
  }
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") setNav(false); });
  (mobileQ.addEventListener ? mobileQ.addEventListener.bind(mobileQ, "change") : mobileQ.addListener.bind(mobileQ))(function () {
    var sh = document.querySelector(".dash-shell");
    if (!sh) return;
    setNav(false);
    sh.classList.toggle("collapsed", collapsed && !mobileQ.matches);
  });

  function sidebar() {
    var g = state.guild, u = state.me.user;
    var items = [];   // [élément <li>, libellé] pour la recherche

    var search = h("input", { type: "search", id: "dashSearch", placeholder: "Rechercher…", autocomplete: "off", "aria-label": "Rechercher dans le menu" });
    var searchBox = h("label", { class: "dash-search", for: "dashSearch" }, icon(IC.search), search, h("kbd", { text: "Ctrl K" }));
    search.addEventListener("input", function () {
      var q = search.value.trim().toLowerCase();
      items.forEach(function (it) { it[0].hidden = !!q && it[1].toLowerCase().indexOf(q) === -1; });
      [].forEach.call(nav.querySelectorAll(".dash-group"), function (grp) {
        grp.hidden = !grp.querySelector("li:not([hidden])");
        if (q) { grp.querySelector(".dash-ghead").setAttribute("aria-expanded", "true"); grp.querySelector("ul").hidden = false; }
      });
    });
    search.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { var first = nav.querySelector("li:not([hidden]) .dash-navbtn"); if (first) first.click(); }
      if (e.key === "Escape") { search.value = ""; search.dispatchEvent(new Event("input")); search.blur(); }
    });

    function group(title, entries, open) {
      var list = h("ul", {});
      var head = h("button", { class: "dash-ghead", type: "button", "aria-expanded": String(open !== false) }, h("span", { text: title }), icon(IC.chevron, "chev"));
      head.addEventListener("click", function () {
        var ex = head.getAttribute("aria-expanded") === "true";
        head.setAttribute("aria-expanded", String(!ex)); list.hidden = ex;
      });
      list.hidden = open === false;
      entries.forEach(function (e) {
        var li = h("li", {}, e[2]);
        list.appendChild(li); items.push([li, e[1]]);
      });
      return h("div", { class: "dash-group" }, head, list);
    }
    function tabBtn(key, label) {
      return h("button", {
        class: "dash-navbtn", type: "button", "aria-current": state.tab === key ? "page" : "false",
        onclick: function () {
          if (state.tab === key) return;
          state.tab = key; history.pushState(null, "", pathFor(state.guild, key));
          setNav(false);
          renderGuild();
        }
      }, icon(IC[key]), h("span", { class: "lbl", text: label }));
    }
    function actionBtn(key, label, fn, danger) {
      return h("button", { class: "dash-navbtn" + (danger ? " danger" : ""), type: "button", onclick: fn }, icon(IC[key]), h("span", { class: "lbl", text: label }));
    }

    var nav = h("nav", { class: "dash-nav", "aria-label": "Sections" });
    navFor(g.manage).forEach(function (grp) {
      nav.appendChild(group(grp[0], grp[1].map(function (e) { return [e[0], e[1], tabBtn(e[0], e[1])]; })));
    });
    // Compte : épinglé en bas du menu (hors de la zone qui défile) pour rester toujours visible
    var account = h("div", { class: "dash-account" },
      actionBtn("swap", "Changer de serveur", renderGuilds),
      actionBtn("logout", "Se déconnecter", function (ev) {
        busy(ev.currentTarget, function () { return api("/api/auth/logout", {}); }).then(function () { renderLogin(); }, fail);
      }, true));

    var toggle = h("button", {
      class: "dash-toggle", type: "button", "aria-label": "Réduire ou ouvrir le menu", title: "Réduire le menu",
      onclick: function () {
        if (mobileQ.matches) { setNav(false); return; }
        collapsed = !collapsed;
        shell().classList.toggle("collapsed", collapsed);
        try { localStorage.setItem("ozone_side", collapsed ? "1" : "0"); } catch (e) { /* ignoré */ }
      }
    }, icon(IC.panel));

    var pill = h("div", { class: "dash-online unknown", id: "dashOnline" }, h("span", { class: "dot" }), h("span", { class: "t", text: "Player 1" }));
    var closeBtn = h("button", { class: "dash-close", type: "button", "aria-label": "Fermer le menu", onclick: function () { setNav(false); } }, icon(IC.x));
    var side = h("aside", { class: "dash-side", id: "dashSide" },
      h("div", { class: "dash-brandrow" },
        h("a", { class: "dash-brand", href: "/", "aria-label": "Ozone Groupe" },
          h("span", { class: "mk" }, h("img", { src: "/assets/logo.svg", alt: "", width: "22", height: "22" })),
          h("span", { class: "tx" }, h("span", { class: "nm", text: "Ozone Groupe" }), h("span", { class: "sub", text: "Dashboard" }))),
        closeBtn),
      h("a", { class: "dash-sideback", href: "/" }, icon(IC.back), h("span", { class: "lbl", text: "Retour au site" })),
      h("div", { class: "dash-side-head" },
        avatar("icons", g.id, g.icon, g.name, true),
        h("div", { class: "txt" }, h("strong", { text: g.name }), h("span", { class: "role" + (g.manage ? " mgr" : ""), text: g.manage ? "Gestionnaire" : "Membre" })),
        toggle),
      h("div", { class: "dash-side-body" },
        searchBox, nav, account,
        h("div", { class: "dash-side-foot" }, pill,
          h("div", { class: "dash-user" }, avatar("avatars", u.id, u.avatar, u.username),
            h("div", { class: "txt" }, h("strong", { text: u.username }), h("span", { text: g.manage ? "Gestionnaire" : "Membre" })),
            icon(IC.updown, "chev")))));
    return side;
  }

  function shell() { return view.querySelector(".dash-shell"); }

  // « 3 en ligne » / état du bot, mis à jour par l'onglet Vue d'ensemble
  function setOnline(text, ok) {
    var p = document.getElementById("dashOnline");
    if (!p) return;
    p.querySelector(".t").textContent = text;
    p.classList.toggle("off", ok === false);
    p.classList.toggle("unknown", ok == null);
  }

  function renderGuild(keepScroll) {
    var y = window.scrollY;
    stopLive();
    setHero(false);
    var tab = state.tab;
    if (!state.guild.manage && (tab === "overview" || tab === "settings" || tab === "protect")) tab = state.tab = "live";
    var main = h("div", { class: "dash-main" });
    var side = sidebar();
    var u = state.me.user;
    var burger = h("button", { class: "dash-burger", id: "dashBurger", type: "button", "aria-label": "Ouvrir le menu", "aria-controls": "dashSide", "aria-expanded": "false", onclick: function () { setNav(true); } }, icon(IC.menu));
    var top = h("header", { class: "dash-top" },
      burger,
      h("div", { class: "dash-top-t" },
        h("span", { class: "dash-eyebrow", text: tab === "overview" ? "Statistiques" : tab === "protect" ? "Protect" : tab === "embed" ? "Outils" : "Player 1" }),
        h("h2", { class: "dash-top-title", text: TITLES[tab] })),
      h("div", { class: "dash-top-r" }, side.querySelector("#dashOnline"), avatar("avatars", u.id, u.avatar, u.username)));
    var sh = h("div", { class: "dash-shell" + (collapsed && !mobileQ.matches ? " collapsed" : "") }, side, h("div", { class: "dash-scrim", "aria-hidden": "true", onclick: function () { setNav(false); } }), h("div", { class: "dash-col" }, top, main));
    main.appendChild(tab === "overview" ? overviewView() : tab === "settings" ? settingsView() : tab === "protect" ? protectView() : tab === "embed" ? embedView() : tab === "playlists" ? playlistsView() : tab === "trending" ? trendingView() : liveView());
    view.replaceChildren(sh);
    window.scrollTo({ top: keepScroll === true ? y : 0 });
  }

  // Raccourci Ctrl/Cmd + K : place le curseur dans la recherche du menu
  document.addEventListener("keydown", function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
      var s = document.getElementById("dashSearch");
      if (s) { e.preventDefault(); setNav(true); s.focus(); s.select(); }
    }
  });

  /* ---------- Vue d'ensemble ---------- */

  var NS = "http://www.w3.org/2000/svg";
  var COL = { pink: "#e4507f", violet: "#7c5cd6", cyan: "#0891b2", green: "#1f9d55", amber: "#d99a06" };
  var gradId = 0;

  // Élément SVG (même principe que h() : jamais d'innerHTML avec des données).
  function s(tag, attrs) {
    var el = document.createElementNS(NS, tag);
    for (var k in (attrs || {})) if (attrs[k] != null) el.setAttribute(k, attrs[k]);
    for (var i = 2; i < arguments.length; i++) if (arguments[i]) el.appendChild(arguments[i]);
    return el;
  }

  var nf = new Intl.NumberFormat("fr-FR");
  function num(n) { return n == null ? "—" : nf.format(Math.round(n)); }
  function compact(n) {
    if (n == null) return "—";
    var a = Math.abs(n);
    if (a >= 1e6) return (n / 1e6).toFixed(1).replace(".", ",") + " M";
    if (a >= 1e4) return Math.round(n / 1e3) + " k";
    if (a >= 1e3) return (n / 1e3).toFixed(1).replace(".", ",") + " k";
    return String(Math.round(n));
  }
  function hours(sec) {
    var hh = sec / 3600;
    return hh >= 100 ? Math.round(hh) + " h" : hh >= 1 ? hh.toFixed(1).replace(".", ",") + " h" : Math.round(sec / 60) + " min";
  }
  function dayLabel(key) { return new Date(key + "T12:00:00Z").toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" }); }
  function hourLabel(ts) { return new Date(ts * 1000).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }); }
  function niceMax(v) {
    if (v <= 0) return 4;
    var p = Math.pow(10, Math.floor(Math.log10(v))), f = v / p;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 4 ? 4 : f <= 5 ? 5 : 10) * p;
  }

  // Évolution en % (null s'il n'y a rien à comparer)
  function delta(cur, prev, label) {
    if (prev == null || (prev === 0 && cur === 0)) return h("span", { class: "dash-delta", text: label || "—" });
    if (prev === 0) return h("span", { class: "dash-delta up", text: "Nouveau" });
    var p = Math.round(((cur - prev) / prev) * 100);
    return h("span", { class: "dash-delta " + (p > 0 ? "up" : p < 0 ? "down" : ""), text: (p > 0 ? "+" : "") + p + " %" });
  }

  function spark(values, color) {
    var v = values.filter(function (x) { return x != null; });
    var svgEl = s("svg", { viewBox: "0 0 100 28", class: "spark", preserveAspectRatio: "none", "aria-hidden": "true" });
    if (v.length < 2) return svgEl;
    var min = Math.min.apply(null, v), max = Math.max.apply(null, v), span = max - min || 1, n = values.length, d = "", pen = false;
    values.forEach(function (x, i) {
      if (x == null) { pen = false; return; }
      d += (pen ? "L" : "M") + (i / (n - 1) * 100).toFixed(1) + " " + (25 - ((x - min) / span) * 22).toFixed(1);
      pen = true;
    });
    svgEl.appendChild(s("path", { d: d, fill: "none", stroke: color, "stroke-width": 1.8, "stroke-linecap": "round", "stroke-linejoin": "round", "vector-effect": "non-scaling-stroke" }));
    return svgEl;
  }

  // Graphique en courbe (aire) ou en barres. Un seul écouteur de survol par graphique.
  function chart(o) {
    var W = 640, H = 230, L = 44, R = 12, T = 12, B = 28, pw = W - L - R, ph = H - T - B;
    var n = o.labels.length, bars = o.type === "bar";
    var all = [];
    o.series.forEach(function (se) { se.values.forEach(function (x) { if (x != null) all.push(x); }); });
    var max = niceMax(Math.max.apply(null, all.concat([0])));
    var min = o.zero === false && all.length ? Math.min.apply(null, all) : 0;
    if (o.zero === false && all.length) {
      var mx = Math.max.apply(null, all), pad = (mx - min) * 0.15 || 1;
      min = Math.floor(Math.max(0, min - pad)); max = Math.ceil(mx + pad);
      if (max === min) max = min + 1;
    }
    var fmt = o.fmt || compact;
    function X(i) { return bars ? L + (i + 0.5) * (pw / n) : L + (n === 1 ? pw / 2 : (i / (n - 1)) * pw); }
    function Y(v) { return T + ph - ((v - min) / (max - min)) * ph; }

    var svgEl = s("svg", { viewBox: "0 0 " + W + " " + H, class: "chart-svg", role: "img", "aria-label": o.title || "Graphique" });
    var defs = s("defs");
    svgEl.appendChild(defs);
    for (var g = 0; g <= 4; g++) {
      var v = min + ((max - min) * g) / 4, y = Y(v);
      svgEl.appendChild(s("line", { x1: L, x2: W - R, y1: y, y2: y, class: "grid" }));
      var t = s("text", { x: L - 8, y: y + 4, class: "ax", "text-anchor": "end" }); t.textContent = fmt(v);
      svgEl.appendChild(t);
    }
    var ticks = Math.min(n, o.ticks || 6);
    for (var k = 0; k < ticks; k++) {
      var i = ticks === 1 ? 0 : Math.round((k / (ticks - 1)) * (n - 1));
      var tx = s("text", { x: X(i), y: H - 8, class: "ax", "text-anchor": k === 0 ? "start" : k === ticks - 1 ? "end" : "middle" });
      tx.textContent = o.labels[i];
      svgEl.appendChild(tx);
    }

    o.series.forEach(function (se, si) {
      if (bars) {
        var m = o.series.length, slot = pw / n, bw = Math.max(2, Math.min(26, (slot * 0.72) / m));
        se.values.forEach(function (x, i) {
          if (!x) return;
          var bh = Math.max(1.5, T + ph - Y(x));
          svgEl.appendChild(s("rect", {
            x: X(i) - (bw * m) / 2 + si * bw + 0.5, y: T + ph - bh, width: Math.max(1, bw - 1), height: bh, rx: Math.min(3, bw / 2),
            fill: se.color, "data-i": i, class: "bar" + (o.peak != null && o.peak === i ? " peak" : "")
          }));
        });
      } else {
        var d = "", first = null, last = null, pen = false;
        se.values.forEach(function (x, i) {
          if (x == null) { pen = false; return; }
          d += (pen ? "L" : "M") + X(i).toFixed(1) + " " + Y(x).toFixed(1); pen = true;
          if (first == null) first = i; last = i;
        });
        if (first != null && se.area) {
          var id = "g" + (++gradId);
          var lg = s("linearGradient", { id: id, x1: 0, y1: 0, x2: 0, y2: 1 },
            s("stop", { offset: "0%", "stop-color": se.color, "stop-opacity": 0.35 }), s("stop", { offset: "100%", "stop-color": se.color, "stop-opacity": 0 }));
          defs.appendChild(lg);
          svgEl.appendChild(s("path", { d: d + "L" + X(last).toFixed(1) + " " + (T + ph) + "L" + X(first).toFixed(1) + " " + (T + ph) + "Z", fill: "url(#" + id + ")", stroke: "none" }));
        }
        svgEl.appendChild(s("path", { d: d, fill: "none", stroke: se.color, "stroke-width": 2.2, "stroke-linecap": "round", "stroke-linejoin": "round" }));
      }
    });

    var cursor = s("line", { y1: T, y2: T + ph, class: "cursor", visibility: "hidden" });
    svgEl.appendChild(cursor);
    var dots = o.series.map(function (se) { var c = s("circle", { r: 4, fill: se.color, class: "dot", visibility: "hidden" }); svgEl.appendChild(c); return c; });

    var tip = h("div", { class: "chart-tip", hidden: true });
    var wrap = h("div", { class: "chart" }, svgEl, tip);
    var cur = -1;
    function hide() { cur = -1; tip.hidden = true; cursor.setAttribute("visibility", "hidden"); dots.forEach(function (c) { c.setAttribute("visibility", "hidden"); }); }
    svgEl.addEventListener("pointermove", function (e) {
      var r = svgEl.getBoundingClientRect(), px = ((e.clientX - r.left) / r.width) * W;
      var i = bars ? Math.floor((px - L) / (pw / n)) : Math.round(((px - L) / pw) * (n - 1));
      i = Math.max(0, Math.min(n - 1, i));
      if (i === cur) return;
      cur = i;
      cursor.setAttribute("x1", X(i)); cursor.setAttribute("x2", X(i));
      cursor.setAttribute("visibility", bars ? "hidden" : "visible");
      var rows = [h("strong", { text: o.tipLabels ? o.tipLabels[i] : o.labels[i] })];
      o.series.forEach(function (se, si) {
        var val = se.values[i];
        dots[si].setAttribute("visibility", !bars && val != null ? "visible" : "hidden");
        if (val != null) { dots[si].setAttribute("cx", X(i)); dots[si].setAttribute("cy", Y(val)); }
        rows.push(h("div", { class: "row" }, h("i", { style: "background:" + se.color }), h("span", { text: se.name }), h("b", { text: val == null ? "—" : (o.tipFmt || num)(val) })));
      });
      tip.replaceChildren.apply(tip, rows);
      tip.hidden = false;
      var left = (X(i) / W) * r.width;
      tip.style.left = Math.max(8, Math.min(r.width - tip.offsetWidth - 8, left - tip.offsetWidth / 2)) + "px";
    });
    svgEl.addEventListener("pointerleave", hide);
    return wrap;
  }

  function donut(parts, centerBig, centerSmall) {
    var R = 54, C = 2 * Math.PI * R, total = parts.reduce(function (a, p) { return a + p.value; }, 0) || 1, off = 0;
    var svgEl = s("svg", { viewBox: "0 0 140 140", class: "donut-svg", role: "img", "aria-label": centerSmall });
    svgEl.appendChild(s("circle", { cx: 70, cy: 70, r: R, fill: "none", stroke: "rgba(16,40,28,.09)", "stroke-width": 14 }));
    parts.forEach(function (p) {
      var len = (p.value / total) * C;
      if (len <= 0) return;
      svgEl.appendChild(s("circle", {
        cx: 70, cy: 70, r: R, fill: "none", stroke: p.color, "stroke-width": 14, "stroke-linecap": "butt",
        "stroke-dasharray": Math.max(0, len - 2) + " " + (C - Math.max(0, len - 2)), "stroke-dashoffset": -off, transform: "rotate(-90 70 70)"
      }));
      off += len;
    });
    var a = s("text", { x: 70, y: 69, "text-anchor": "middle", class: "donut-big" }); a.textContent = centerBig;
    var b = s("text", { x: 70, y: 88, "text-anchor": "middle", class: "donut-small" }); b.textContent = centerSmall;
    svgEl.appendChild(a); svgEl.appendChild(b);
    return svgEl;
  }

  function panel(title, hint, body, cls) {
    return h("section", { class: "dash-card panel " + (cls || "") },
      h("div", { class: "panel-head" }, h("h3", { text: title }), hint ? h("span", { class: "dash-muted", text: hint }) : null), body);
  }
  function legend(items) {
    var box = h("div", { class: "legend" });
    items.forEach(function (i) { box.appendChild(h("span", {}, h("i", { style: "background:" + i[1] }), i[0])); });
    return box;
  }
  function stat(label, value, sub, trend, color, ic) {
    return h("div", { class: "dash-card stat" },
      h("div", { class: "stat-top" }, h("span", { class: "stat-label", text: label }), icon(IC[ic] || IC.overview, "stat-ic")),
      h("div", { class: "stat-val", text: value }),
      h("div", { class: "stat-foot" }, sub, trend ? spark(trend, color) : null));
  }

  // Les icônes des cartes (tracé simple, même style que le menu)
  IC.users = '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>';
  IC.pulse = '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>';
  IC.msg = '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>';
  IC.userplus = '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/>';
  IC.mic = '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M19 10v1a7 7 0 0 1-14 0v-1M12 18v4"/>';
  IC.music = '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>';
  IC.cmd = '<path d="m4 17 6-6-6-6M12 19h8"/>';
  IC.gauge = '<path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/>';
  IC.refresh = '<path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/>';

  function overviewView() {
    var gid = state.guild.id;
    var range = state.range || 30;
    var wrap = h("div", { class: "ov" });
    var body = h("div", { class: "ov-body" }, h("p", { class: "dash-muted", text: "Chargement des statistiques…" }));
    var stamp = h("span", { class: "dash-muted ov-stamp" });

    var seg = h("div", { class: "dash-tabs", role: "group", "aria-label": "Période" });
    [7, 30, 90].forEach(function (r) {
      seg.appendChild(h("button", {
        class: "dash-tab", type: "button", "aria-pressed": String(r === range), "aria-selected": String(r === range),
        onclick: function () { if (state.range !== r) { state.range = r; renderGuild(); } }
      }, r + " j"));
    });
    var refreshBtn = h("button", { class: "dash-x", type: "button", title: "Actualiser", "aria-label": "Actualiser", onclick: function () { load(true); } });
    refreshBtn.appendChild(icon(IC.refresh, "ic"));

    wrap.appendChild(h("div", { class: "ov-head" },
      h("div", {}, h("h2", { class: "dash-title", text: "Vue d'ensemble" }),
        h("p", { class: "dash-muted ov-sub" }, state.guild.name + " · ", stamp)),
      h("div", { class: "ov-tools" }, seg, refreshBtn)));
    wrap.appendChild(body);

    function paint(d) {
      var days = d.days, labels = days.map(function (x) { return dayLabel(x.day); });
      var T = d.totals, live = d.live;
      var memSeries = days.map(function (x) { return x.members; });
      var membersNow = live.members != null ? live.members : memSeries.filter(function (x) { return x != null; }).pop();
      var net = T.joins.cur - T.leaves.cur, netPrev = T.joins.prev - T.leaves.prev;
      var latVals = d.hours.map(function (x) { return x.latency; }).filter(function (x) { return x != null; });
      var lat = latVals.length ? latVals[latVals.length - 1] : null;
      var latAvg = latVals.length ? Math.round(latVals.reduce(function (a, b) { return a + b; }, 0) / latVals.length) : null;
      var hasData = !!d.since;

      setOnline(live.online != null ? num(live.online) + " en ligne" : d.bot.online ? "Player 1 en ligne" : "Player 1 hors ligne", live.online != null ? true : d.bot.online);
      stamp.textContent = "Mis à jour à " + new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

      var growth = membersNow != null && d.members_start != null ? membersNow - d.members_start : null;
      var cards = h("div", { class: "stats-grid" },
        stat("Membres", num(membersNow),
          h("span", { class: "stat-note" }, growth == null ? h("span", { class: "dash-delta", text: "—" }) : h("span", { class: "dash-delta " + (growth > 0 ? "up" : growth < 0 ? "down" : ""), text: (growth > 0 ? "+" : "") + num(growth) }), " sur " + range + " j"),
          memSeries, COL.pink, "users"),
        stat("En ligne", live.online != null ? num(live.online) : "—",
          h("span", { class: "stat-note", text: live.online != null && membersNow ? Math.round((live.online / membersNow) * 100) + " % des membres" : "Clé du bot requise" }),
          null, COL.green, "pulse"),
        stat("Messages", compact(T.messages.cur),
          h("span", { class: "stat-note" }, delta(T.messages.cur, hasData ? T.messages.prev : null), " vs période préc."),
          days.map(function (x) { return x.messages; }), COL.violet, "msg"),
        stat("Solde d'arrivées", (net > 0 ? "+" : "") + num(net),
          h("span", { class: "stat-note", text: "+" + num(T.joins.cur) + " / −" + num(T.leaves.cur) }),
          days.map(function (x) { return x.joins - x.leaves; }), COL.cyan, "userplus"),
        stat("Temps vocal", hours(T.voice_seconds.cur),
          h("span", { class: "stat-note" }, delta(T.voice_seconds.cur, hasData ? T.voice_seconds.prev : null), " vs période préc."),
          days.map(function (x) { return x.voice_seconds; }), COL.amber, "mic"),
        stat("Titres lus", num(T.tracks.cur),
          h("span", { class: "stat-note" }, delta(T.tracks.cur, hasData ? T.tracks.prev : null), " vs période préc."),
          days.map(function (x) { return x.tracks; }), COL.pink, "music"),
        stat("Commandes", num(T.commands.cur),
          h("span", { class: "stat-note" }, delta(T.commands.cur, hasData ? T.commands.prev : null), " vs période préc."),
          days.map(function (x) { return x.commands; }), COL.violet, "cmd"),
        stat("Latence du bot", lat != null ? lat + " ms" : "—",
          h("span", { class: "stat-note", text: latAvg != null ? "Moyenne 24 h : " + latAvg + " ms" : "Pas encore de mesure" }),
          d.hours.map(function (x) { return x.latency; }), COL.green, "gauge"));

      var banner = hasData ? null : h("div", { class: "dash-banner" },
        h("strong", { text: "Collecte en cours." }),
        " Les statistiques s'accumulent à partir du moment où le bot a été mis à jour : les graphiques se rempliront au fil des heures. Vérifie que le fichier cogs/stats.py est bien présent sur le bot.");

      var memChart = chart({
        type: "line", labels: labels, zero: false, title: "Évolution des membres",
        series: [{ name: "Membres", values: memSeries, color: COL.pink, area: true }]
      });
      var online = live.online != null && membersNow != null ? Math.min(live.online, membersNow) : null;
      var presence = online != null
        ? h("div", { class: "donut" }, donut([{ value: online, color: COL.green }, { value: Math.max(0, membersNow - online), color: "rgba(255,255,255,.16)" }], num(online), "en ligne"),
          h("ul", { class: "donut-legend" },
            h("li", {}, h("i", { style: "background:" + COL.green }), "En ligne", h("b", { text: num(online) })),
            h("li", {}, h("i", { style: "background:rgba(255,255,255,.3)" }), "Hors ligne", h("b", { text: num(membersNow - online) })),
            live.boosts ? h("li", {}, h("i", { style: "background:" + COL.pink }), "Boosts (niv. " + live.tier + ")", h("b", { text: num(live.boosts) })) : null))
        : h("p", { class: "dash-empty", text: "Renseigne DISCORD_BOT_TOKEN côté site pour afficher les membres en ligne." });

      var peak = d.profile.indexOf(Math.max.apply(null, d.profile));
      var hasProfile = d.profile.some(function (x) { return x > 0; });
      var hourLabels = d.profile.map(function (_, i) { return i + " h"; });
      var activity = chart({
        type: "bar", labels: hourLabels, ticks: 7, title: "Activité par heure",
        peak: hasProfile ? peak : null,
        series: [{ name: "Messages (7 j)", values: d.profile, color: COL.violet }]
      });

      var perf = chart({
        type: "line", labels: d.hours.map(function (x) { return hourLabel(x.hour); }), title: "Latence du bot sur 24 h",
        zero: false, series: [{ name: "Latence", values: d.hours.map(function (x) { return x.latency; }), color: COL.green, area: true }],
        tipFmt: function (v) { return v + " ms"; }, fmt: function (v) { return Math.round(v); }
      });

      var grid = h("div", { class: "ov-grid" },
        panel("Évolution des membres", "Sur " + range + " jours", memChart, "span2"),
        panel("Présence", "En direct", presence),
        panel("Messages par jour", "Sur " + range + " jours", chart({ type: "bar", labels: labels, title: "Messages par jour", series: [{ name: "Messages", values: days.map(function (x) { return x.messages; }), color: COL.violet }] }), "span2"),
        panel("Heures d'activité", hasProfile ? "Pic vers " + peak + " h" : "7 derniers jours", activity),
        panel("Arrivées et départs", legend([["Arrivées", COL.green], ["Départs", COL.pink]]),
          chart({ type: "bar", labels: labels, title: "Arrivées et départs", series: [{ name: "Arrivées", values: days.map(function (x) { return x.joins; }), color: COL.green }, { name: "Départs", values: days.map(function (x) { return x.leaves; }), color: COL.pink }] }), "span2"),
        panel("Vocal et musique", legend([["Heures d'écoute", COL.amber], ["Titres lus", COL.cyan]]),
          chart({ type: "bar", labels: labels, title: "Vocal et musique", series: [{ name: "Heures vocal", values: days.map(function (x) { return Math.round((x.voice_seconds / 3600) * 10) / 10; }), color: COL.amber }, { name: "Titres lus", values: days.map(function (x) { return x.tracks; }), color: COL.cyan }] })),
        panel("Performances du bot", d.bot.online ? "En ligne" : "Hors ligne ou en attente", perf, "span2"));

      body.replaceChildren.apply(body, [banner, cards, grid].filter(Boolean));
    }

    var busyLoad = false;
    function load(manual) {
      if (busyLoad || state.tab !== "overview" || state.guild.id !== gid) return;
      busyLoad = true;
      api("/api/stats?id=" + gid + "&range=" + range + "&tz=" + new Date().getTimezoneOffset()).then(function (d) {
        busyLoad = false;
        if (state.tab !== "overview" || state.guild.id !== gid) return;
        paint(d);
        if (manual) toast("Statistiques actualisées");
      }, function (e) {
        busyLoad = false;
        if (e.status === 401) return fail(e);
        body.replaceChildren(h("div", { class: "dash-error", role: "alert", text: "Impossible de charger les statistiques pour le moment. Réessaie dans un instant." }));
      });
    }

    // Actualisation toutes les 60 s, uniquement si l'onglet du navigateur est visible.
    // On ne garde que la dernière réponse : chaque actualisation remplace l'affichage précédent.
    stopLive();
    live.poll = setInterval(function () { if (document.visibilityState === "visible") load(false); }, 60000);
    load(false);
    return wrap;
  }

  /* ---------- Réglages ---------- */

  IC.pencil = '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>';
  IC.eraser = '<path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/>';
  IC.plus = '<path d="M5 12h14M12 5v14"/>';
  IC.trending = '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>';
  IC.up = '<path d="m18 15-6-6-6 6"/>';
  IC.down = '<path d="m6 9 6 6 6-6"/>';
  IC.palette = '<circle cx="13.5" cy="6.5" r="1"/><circle cx="17.5" cy="10.5" r="1"/><circle cx="8.5" cy="7.5" r="1"/><circle cx="6.5" cy="12.5" r="1"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.9 0 1.5-.7 1.5-1.5 0-.4-.2-.8-.4-1-.3-.3-.4-.6-.4-1 0-.8.7-1.5 1.5-1.5H16c3.3 0 6-2.7 6-6 0-4.4-4.5-8-10-8Z"/>';

  // Bouton rond (même style que les commandes de « En direct »)
  function rbtn(name, label, cls, fn, disabled) {
    return h("button", { class: "live-btn " + (cls || ""), type: "button", title: label, "aria-label": label, disabled: disabled, onclick: function (ev) { fn(ev.currentTarget); } },
      icon(IC[name], "ic" + (name === "play" || name === "stop" ? " fill" : "")));
  }

  /* ---------- Outils : créateur d'embed (voir embed-builder.js) ---------- */

  function embedView() {
    return window.OzoneEmbed ? window.OzoneEmbed.view({ h: h, icon: icon, IC: IC, toast: toast })
      : h("div", { class: "dash-card" }, h("p", { class: "hint", text: "Le créateur d'embed n'a pas pu se charger. Recharge la page." }));
  }

  /* ---------- Protect (modération) ---------- */

  function ptRow(title, desc, ctrl) {
    return h("div", { class: "pt-row" }, h("div", { class: "pt-t" }, h("strong", { text: title }), h("span", { text: desc })), h("div", { class: "pt-c" }, ctrl));
  }
  // Interrupteur : enregistre aussitôt, et revient en arrière si le serveur refuse.
  function ptSwitch(on, label, save) {
    var inp = h("input", { type: "checkbox", role: "switch", "aria-label": label });
    inp.checked = !!on;
    inp.addEventListener("change", function () {
      var v = inp.checked; inp.disabled = true;
      save(v).then(function () { toast("Enregistré"); }, function (e) { inp.checked = !v; fail(e); })
        .then(function () { inp.disabled = false; });
    });
    return h("label", { class: "pt-sw" }, inp, h("span", { class: "pt-knob" }));
  }

  function protectView() {
    var gid = state.guild.id, box = h("div", { class: "pt" }, h("p", { class: "dash-muted", text: "Chargement…" }));
    function post(extra) { extra.guild = gid; extra.scope = "protect"; return api("/api/settings", extra); }
    api("/api/settings?id=" + gid).then(function (d) {
      var s = d.settings, label = {};
      var general = h("div", { class: "dash-card" }, h("h2", { text: "Protection du serveur" }),
        h("p", { class: "hint", text: "Protect applique les changements en quelques secondes. Les seuils, durées et listes se règlent avec /protect sur Discord." }),
        ptRow("Protection activée", "Coupe tous les modules d'un coup.", ptSwitch(s.enabled, "Protection activée", function (v) { return post({ enabled: v }); })),
        ptRow("Ignorer les administrateurs", "Les membres administrateurs ne sont jamais sanctionnés.", ptSwitch(s.bypass_admins, "Ignorer les administrateurs", function (v) { return post({ bypass_admins: v }); })));

      var mods = h("div", { class: "dash-card" }, h("h2", { text: "Modules" }));
      d.modules.forEach(function (m) {
        label[m.key] = m.label;
        var sel = h("select", { "aria-label": "Sanction : " + m.label });
        Object.keys(d.sanction_types).forEach(function (k) { sel.appendChild(h("option", { value: k, text: d.sanction_types[k] })); });
        sel.value = m.sanction;
        sel.addEventListener("change", function () {
          var v = sel.value;
          post({ module: m.key, module_sanction: v }).then(function () { m.sanction = v; toast("Enregistré"); }, function (e) { sel.value = m.sanction; fail(e); });
        });
        var ctrl = h("div", { class: "pt-ctrls" }, sel, ptSwitch(m.enabled, m.label, function (v) { return post({ module: m.key, module_enabled: v }); }));
        mods.appendChild(ptRow(m.label, m.desc, ctrl));
      });

      var fmt = function (t) { return new Date(t * 1000).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); };
      var hist = h("div", { class: "dash-card" }, h("h2", { text: "Dernières sanctions" }),
        h("p", { class: "hint", text: d.total ? d.total + " sanction(s) au total, les 25 plus récentes ci-dessous." : "Aucune sanction enregistrée pour le moment." }));
      if (d.sanctions.length) {
        var tbl = h("div", { class: "pt-tbl", role: "table" });
        tbl.appendChild(h("div", { class: "pt-tr pt-th", role: "row" }, h("span", { text: "N°" }), h("span", { text: "Membre" }), h("span", { text: "Module" }), h("span", { text: "Action" }), h("span", { text: "Statut" }), h("span", { text: "Date" })));
        d.sanctions.forEach(function (x) {
          var act = (d.sanction_types[x.action] || x.action) + (x.action === "timeout" && x.duration ? " " + x.duration + " min" : "");
          tbl.appendChild(h("div", { class: "pt-tr", role: "row", title: x.reason },
            h("span", { text: "#" + x.id }), h("span", { class: "pt-id", text: x.user_id }), h("span", { text: label[x.module] || x.module }), h("span", { text: act }),
            h("span", { class: "pt-st " + x.status, text: x.status === "active" ? "Active" : x.status === "revoked" ? "Levée" : x.status }), h("span", { text: fmt(x.created_at) })));
        });
        hist.appendChild(h("div", { class: "pt-scroll" }, tbl));
      }
      box.replaceChildren(general, mods, hist);
    }, function (e) {
      if (e.status === 401) return fail(e);
      box.replaceChildren(h("div", { class: "dash-card" }, h("h2", { text: "Protection" }), h("p", { class: "hint", text: e.message })));
    });
    return box;
  }

  function settingsView() {
    var s = state.data.settings, lim = state.data.limits;
    var vol = s.volume, c1 = s.bar_color, c2 = s.bar_color2;
    var saved = { vol: vol, c1: c1, c2: c2 };

    var chip = h("span", { class: "set-chip" });
    var volBig = h("div", { class: "set-vol-big" });
    var range = h("input", { type: "range", min: 0, max: lim.MAX_VOLUME, step: 1, value: vol, "aria-label": "Volume" });
    var num = h("input", { type: "number", class: "dash-num", min: 0, max: lim.MAX_VOLUME, value: vol, "aria-label": "Volume en pourcentage" });
    function setVol(v) {
      v = Math.max(0, Math.min(lim.MAX_VOLUME, Math.round(Number(v) || 0)));
      vol = v; range.value = v; num.value = v; volBig.textContent = v + " %"; dirty();
    }
    range.addEventListener("input", function () { setVol(range.value); });
    num.addEventListener("change", function () { setVol(num.value); });

    var fill = h("div", { class: "fill" }, h("i", { class: "knob" }));
    fill.style.width = "62%";
    var hero = h("div", { class: "dash-card live-hero set-hero" });
    var swatches = h("div", { class: "dash-swatches" });
    var pick1 = h("input", { type: "color", "aria-label": "Couleur principale" });
    var txt1 = h("input", { type: "text", maxlength: 7, placeholder: "#FF66AA", "aria-label": "Code couleur principale" });
    var pick2 = h("input", { type: "color", "aria-label": "Seconde couleur" });
    var txt2 = h("input", { type: "text", maxlength: 7, placeholder: "#8B5CF6", "aria-label": "Code seconde couleur" });
    var row2 = h("div", { class: "dash-color" }, pick2, txt2);

    function dirty() {
      var changed = vol !== saved.vol || c1 !== saved.c1 || (c1 == null ? null : c2) !== (saved.c1 == null ? null : saved.c2);
      chip.textContent = changed ? "Modifications non enregistrées" : "Tout est enregistré";
      chip.className = "set-chip" + (changed ? " changed" : "");
    }
    function paint() {
      var a = c1 == null ? DEF1 : (c2 == null ? mixWhite(c1) : c1);
      var b = c1 == null ? DEF2 : (c2 == null ? c1 : c2);
      fill.style.background = "linear-gradient(90deg, " + hex(a) + ", " + hex(b) + ")";
      hero.style.setProperty("--g1", hex(a)); hero.style.setProperty("--g2", hex(b));
      pick1.value = hex(c1 == null ? DEF1 : c1).toLowerCase(); txt1.value = c1 == null ? "" : hex(c1);
      pick2.value = hex(c2 == null ? (c1 == null ? DEF2 : c1) : c2).toLowerCase(); txt2.value = c2 == null ? "" : hex(c2);
      row2.hidden = c1 == null;
      [].forEach.call(swatches.children, function (b2) {
        var v = b2.dataset.v;
        b2.setAttribute("aria-pressed", String(v === "default" ? c1 == null : c1 === Number(v)));
      });
      dirty();
    }
    swatches.appendChild(h("button", {
      class: "dash-swatch default", type: "button", title: "Par défaut (rose → violet)", "aria-label": "Par défaut", "data-v": "default",
      onclick: function () { c1 = null; c2 = null; paint(); }
    }));
    PRESETS.forEach(function (p) {
      var b = h("button", {
        class: "dash-swatch", type: "button", title: p[0], "aria-label": p[0], "data-v": p[1],
        onclick: function () { c1 = p[1]; c2 = null; paint(); }
      });
      b.style.background = hex(p[1]);
      swatches.appendChild(b);
    });
    pick1.addEventListener("input", function () { c1 = parseHex(pick1.value); paint(); });
    pick2.addEventListener("input", function () { c2 = parseHex(pick2.value); paint(); });
    txt1.addEventListener("change", function () {
      var v = parseHex(txt1.value);
      if (!txt1.value.trim()) { c1 = null; c2 = null; } else if (v != null) c1 = v; else toast("Code invalide (ex. #FF66AA)", true);
      paint();
    });
    txt2.addEventListener("change", function () {
      var v = parseHex(txt2.value);
      if (!txt2.value.trim()) c2 = null; else if (v != null) c2 = v; else toast("Code invalide (ex. #8B5CF6)", true);
      paint();
    });

    hero.appendChild(h("div", { class: "live-hero-in" },
      h("div", { class: "live-top" }, h("span", { class: "live-chip nm" }, icon(IC.palette), "Barre de progression")),
      h("div", { class: "live-now" },
        h("div", { class: "live-art ph sm", "aria-hidden": "true" }, icon(IC.music)),
        h("div", { class: "live-meta" }, h("span", { class: "ttl", text: "Aperçu de ta barre" }), h("span", { class: "sub", text: "Ainsi apparaîtra la progression dans Discord" }))),
      h("div", { class: "live-prog" }, h("span", { text: "1:24" }), h("div", { class: "live-bar big", "aria-hidden": "true" }, fill), h("span", { text: "3:45" })),
      h("div", { class: "set-block" },
        h("label", { class: "lbl", text: "Couleurs prédéfinies" }), swatches),
      h("div", { class: "set-block" },
        h("label", { class: "lbl", text: "Couleur personnalisée (une ou deux pour un dégradé)" }),
        h("div", { class: "dash-row" }, h("div", { class: "dash-color" }, pick1, txt1), row2))));

    var save = h("button", {
      class: "btn btn-primary", type: "button", onclick: function (ev) {
        busy(ev.currentTarget, function () {
          return api("/api/settings", { guild: state.guild.id, volume: vol, bar_color: c1, bar_color2: c1 == null ? null : c2 });
        }).then(function () {
          state.data.settings = { volume: vol, bar_color: c1, bar_color2: c1 == null ? null : c2 };
          saved = { vol: vol, c1: c1, c2: c1 == null ? null : c2 };
          dirty(); toast("Réglages enregistrés");
        }, fail);
      }
    }, "Enregistrer");
    var undo = h("button", { class: "btn btn-ghost", type: "button", onclick: function () { c1 = saved.c1; c2 = saved.c2; setVol(saved.vol); paint(); } }, "Annuler");

    var volCard = h("div", { class: "dash-card" },
      h("h3", { text: "Volume par défaut" }),
      h("p", { class: "hint", text: "Volume utilisé par Player 1 au lancement d'une musique (0 à " + lim.MAX_VOLUME + " %)." }),
      volBig,
      h("div", { class: "live-vol" }, icon(IC.vol, "ic"), range, num));
    var saveCard = h("div", { class: "dash-card set-save" }, chip, h("div", { class: "dash-actions" }, save, undo));

    setVol(vol); paint();
    return h("div", { class: "live split" }, h("div", { class: "live-left" }, hero), h("div", { class: "live-right" }, volCard, saveCard));
  }

  /* ---------- Playlists ---------- */

  function currentPlaylist() {
    var list = state.data.playlists;
    var p = list.filter(function (x) { return x.id === state.pid; })[0];
    if (!p && list.length) { p = list[0]; state.pid = p.id; }
    return p || null;
  }

  function refresh(keepPid) {
    var pid = keepPid;
    return api("/api/guild?id=" + state.guild.id).then(function (d) {
      state.data = d; if (pid != null) state.pid = pid; renderGuild(true);
    }, fail);
  }

  function playlistsView() {
    var d = state.data, lim = d.limits, cur = currentPlaylist();
    var gid = state.guild.id;

    var list = h("ul", { class: "pl-list" });
    d.playlists.forEach(function (p) {
      list.appendChild(h("li", {}, h("button", {
        type: "button", "aria-current": String(cur && cur.id === p.id),
        onclick: function () { state.pid = p.id; renderGuild(true); }
      }, icon(IC.queue, "ic"), h("span", { class: "t", text: p.name }), h("span", { class: "n", text: String(p.tracks.length) }))));
    });

    var newName = h("input", { type: "text", maxlength: lim.NAME_MAX, placeholder: "Nouvelle playlist", "aria-label": "Nom de la nouvelle playlist" });
    var createBtn = h("button", { class: "btn btn-primary btn-sm", type: "submit" }, "Créer");
    var createForm = h("form", {
      class: "live-search", onsubmit: function (ev) {
        ev.preventDefault();
        busy(createBtn, function () { return api("/api/playlists", { guild: gid, action: "create", name: newName.value }); })
          .then(function (r) { toast("Playlist créée"); return refresh(r.id); }, fail);
      }
    }, icon(IC.plus), newName, createBtn);

    var side = h("div", { class: "live-right pl-side" },
      h("div", { class: "dash-card" },
        h("div", { class: "dash-row" }, h("h3", { class: "grow" }, "Mes playlists ", h("span", { class: "count", text: d.playlists.length + " / " + lim.MAX_PLAYLISTS }))),
        d.playlists.length ? list : h("p", { class: "dash-empty", text: "Aucune playlist pour l'instant." }),
        h("div", { class: "pl-create" }, createForm)));

    var main = cur ? playlistDetail(cur, lim, gid)
      : h("div", { class: "live-left" }, h("div", { class: "dash-card live-idle" },
        h("div", { class: "live-idle-ic" }, icon(IC.queue)),
        h("h2", { text: "Aucune playlist" }),
        h("p", { text: "Crée ta première playlist avec le champ à côté, puis ajoute-y tes titres." })));
    return h("div", { class: "live split" }, main, side);
  }

  function playlistDetail(p, lim, gid) {
    var total = p.tracks.reduce(function (a, t) { return a + (t.duration || 0); }, 0);

    function launch(shuffle) {
      return function (btn) {
        busy(btn, function () { return order({ action: "playlist_play", playlist: p.id, shuffle: shuffle }); })
          .then(function (r) { toast(r.message || "Fait"); }, fail);
      };
    }
    var empty = !p.tracks.length;
    var hero = h("div", { class: "dash-card live-hero" },
      h("div", { class: "live-hero-in" },
        h("div", { class: "live-now" },
          h("div", { class: "live-art ph sm", "aria-hidden": "true" }, icon(IC.queue)),
          h("div", { class: "live-meta" },
            h("span", { class: "ttl", text: p.name }),
            h("span", { class: "sub", text: p.tracks.length + " titre" + (p.tracks.length > 1 ? "s" : "") + (total ? " · " + fmt(total) : "") + " · " + p.tracks.length + " / " + lim.MAX_TRACKS }))),
        h("div", { class: "live-ctl left" },
          rbtn("play", "Lancer la playlist", "main", launch(false), empty),
          rbtn("shuffle", "Lancer en mélangeant", "", launch(true), empty),
          rbtn("pencil", "Renommer", "", function (btn) {
            var n = window.prompt("Nouveau nom de la playlist :", p.name);
            if (n == null || n.trim() === "" || n === p.name) return;
            busy(btn, function () { return api("/api/playlists", { guild: gid, action: "rename", id: p.id, name: n }); })
              .then(function () { toast("Playlist renommée"); return refresh(p.id); }, fail);
          }),
          rbtn("eraser", "Vider la playlist", "", function (btn) {
            if (!p.tracks.length || !window.confirm("Retirer les " + p.tracks.length + " titres de « " + p.name + " » ?")) return;
            busy(btn, function () { return api("/api/playlists", { guild: gid, action: "clear", id: p.id }); })
              .then(function () { toast("Playlist vidée"); return refresh(p.id); }, fail);
          }, empty),
          rbtn("trash", "Supprimer la playlist", "danger", function (btn) {
            if (!window.confirm("Supprimer définitivement la playlist « " + p.name + " » ?")) return;
            busy(btn, function () { return api("/api/playlists", { guild: gid, action: "delete", id: p.id }); })
              .then(function () { toast("Playlist supprimée"); state.pid = null; return refresh(); }, fail);
          }))));

    function mini(name, title, fn, disabled) {
      return h("button", { class: "dash-x", type: "button", title: title, "aria-label": title, disabled: disabled, onclick: function (ev) { fn(ev.currentTarget); } }, icon(IC[name], "ic" + (name === "play" ? " fill" : "")));
    }
    var tracks = h("ul", { class: "dash-tracks" });
    p.tracks.forEach(function (t, i) {
      var safe = /^https?:\/\//i.test(t.url);
      tracks.appendChild(h("li", {},
        h("span", { class: "pos", text: String(i + 1) }),
        h("div", { class: "info" }, safe
          ? h("a", { href: t.url, target: "_blank", rel: "noopener noreferrer", text: t.title })
          : h("span", { text: t.title }),
          t.uploader ? h("span", { class: "dash-muted sub", text: t.uploader }) : null),
        h("span", { class: "dur", text: fmt(t.duration) }),
        h("span", { class: "acts" },
          mini("play", "Lancer ce titre", function (btn) {
            busy(btn, function () { return order({ action: "play", arg: t.url }); })
              .then(function (r) { toast(r.message || "Fait"); }, fail);
          }),
          mini("up", "Monter", function (btn) {
            busy(btn, function () { return api("/api/tracks", { guild: gid, playlist: p.id, action: "move", track: t.id, direction: "up" }); })
              .then(function () { return refresh(p.id); }, fail);
          }, i === 0),
          mini("down", "Descendre", function (btn) {
            busy(btn, function () { return api("/api/tracks", { guild: gid, playlist: p.id, action: "move", track: t.id, direction: "down" }); })
              .then(function () { return refresh(p.id); }, fail);
          }, i === p.tracks.length - 1),
          mini("close", "Retirer ce titre", function (btn) {
            busy(btn, function () { return api("/api/tracks", { guild: gid, playlist: p.id, action: "remove", track: t.id }); })
              .then(function () { return refresh(p.id); }, fail);
          }))));
    });

    // Ajout par lien ou recherche : c'est le bot qui retrouve le titre, la durée et la miniature.
    var query = h("input", { type: "text", maxlength: lim.QUERY_MAX, placeholder: "Lien YouTube ou mots-clés", "aria-label": "Lien ou recherche" });
    var addBtn = h("button", { class: "btn btn-primary btn-sm", type: "submit" }, "Ajouter");
    var addForm = h("form", {
      class: "live-search", onsubmit: function (ev) {
        ev.preventDefault();
        if (!query.value.trim()) return;
        busy(addBtn, function () { return order({ action: "pl_add", playlist: p.id, query: query.value }); })
          .then(function (r) { toast(r.message || "Titre ajouté"); return refresh(p.id); }, fail);
      }
    }, icon(IC.search), query, addBtn);

    // Ajout manuel (sans le bot) : titre + lien.
    var title = h("input", { type: "text", maxlength: lim.TITLE_MAX, placeholder: "Titre", "aria-label": "Titre" });
    var url = h("input", { type: "text", maxlength: lim.URL_MAX, placeholder: "https://…", "aria-label": "Lien", inputmode: "url" });
    var dur = h("input", { type: "text", placeholder: "3:45 (facultatif)", "aria-label": "Durée", maxlength: 8 });
    var manBtn = h("button", { class: "btn btn-ghost btn-sm", type: "submit" }, "Ajouter");
    var manual = h("details", { class: "dash-manual" },
      h("summary", { text: "Ajouter à la main (sans le bot)" }),
      h("form", {
        onsubmit: function (ev) {
          ev.preventDefault();
          var dd = parseDuration(dur.value);
          if (Number.isNaN(dd)) return toast("Durée invalide (ex. 3:45)", true);
          busy(manBtn, function () { return api("/api/tracks", { guild: gid, playlist: p.id, action: "add", title: title.value, url: url.value, duration: dd }); })
            .then(function () { toast("Titre ajouté"); return refresh(p.id); }, fail);
        }
      },
        h("div", { class: "dash-row", style: "margin-top:12px" }, h("div", { class: "grow" }, title), h("div", { class: "grow" }, url)),
        h("div", { class: "dash-row", style: "margin-top:12px" }, h("div", { class: "grow" }, dur), manBtn)));

    var body = h("div", { class: "dash-card" },
      h("h3", { text: "Titres" }),
      h("div", { class: "pl-add" }, addForm,
        h("p", { class: "hint", text: "Le bot retrouve le titre, la durée et la miniature. Il peut aussi t'ajouter des titres depuis Discord, avec /playlist." })),
      empty ? h("div", { class: "live-empty" }, icon(IC.queue), h("span", { text: "Cette playlist est vide." })) : tracks,
      manual);

    return h("div", { class: "live-left" }, hero, body);
  }


  /* ---------- Du moment ---------- */
  // Liste de musiques mises en avant. Tout le monde peut la voir et lancer un titre ;
  // seuls les gestionnaires (g.manage) ajoutent, retirent ou envoient un titre vers une playlist
  // (le serveur refuse de toute façon : voir api/_lib/trending.js).

  function trendingView() {
    var d = state.data, lim = d.limits, gid = state.guild.id, admin = !!state.guild.manage;
    var items = d.trending || [], pls = d.playlists;
    if (!pls.some(function (p) { return p.id === state.trendPid; })) state.trendPid = pls.length ? pls[0].id : null;

    // Playlist cible du bouton « Ajouter à la playlist »
    var sel = null;
    if (pls.length) {
      sel = h("select", { "aria-label": "Playlist de destination", onchange: function () { state.trendPid = Number(sel.value); } });
      pls.forEach(function (p) {
        sel.appendChild(h("option", { value: p.id, text: p.name + " (" + p.tracks.length + ")", selected: p.id === state.trendPid }));
      });
    }

    function mini(name, label, cls, fn) {
      return h("button", { class: "dash-x " + (cls || ""), type: "button", title: label, "aria-label": label, onclick: function (ev) { fn(ev.currentTarget); } },
        icon(IC[name], "ic" + (name === "play" ? " fill" : "")));
    }

    var list = h("ul", { class: "dash-tracks tr" });
    items.forEach(function (t) {
      var safe = /^https?:\/\//i.test(t.url);
      var thumb = t.thumbnail && /^https:\/\//i.test(t.thumbnail)
        ? h("img", { class: "tr-thumb", src: t.thumbnail, alt: "", width: 52, height: 52, loading: "lazy", referrerpolicy: "no-referrer" })
        : h("span", { class: "tr-thumb ph", "aria-hidden": "true" }, icon(IC.music));
      var acts = h("span", { class: "acts tr-acts" },
        mini("play", "Lancer ce titre", "", function (btn) {
          busy(btn, function () { return order({ action: "play", arg: t.url }); })
            .then(function (r) { toast(r.message || "Fait"); }, fail);
        }));
      {
        acts.insertBefore(h("button", {
          class: "btn btn-ghost btn-sm tr-add", type: "button", disabled: !pls.length,
          title: pls.length ? "Ajouter à la playlist choisie" : "Crée d'abord une playlist",
          onclick: function (ev) {
            var pid = state.trendPid;
            if (pid == null) return toast("Crée d'abord une playlist", true);
            busy(ev.currentTarget, function () { return api("/api/playlists", { guild: gid, action: "trend_to_playlist", track: t.id, playlist: pid }); })
              .then(function (r) { toast("Ajouté à « " + r.playlist + " »"); return refresh(); }, fail);
          }
        }, icon(IC.plus, "ic"), h("span", { class: "lbl", text: "Ajouter à la playlist" })), acts.firstChild);
      }
      if (admin) {
        acts.appendChild(mini("close", "Retirer de la liste", "del", function (btn) {
          if (!window.confirm("Retirer « " + t.title + " » de la liste ?")) return;
          busy(btn, function () { return api("/api/playlists", { guild: gid, action: "trend_remove", track: t.id }); })
            .then(function () { toast("Titre retiré"); return refresh(); }, fail);
        }));
      }
      list.appendChild(h("li", {}, thumb,
        h("div", { class: "info" }, safe
          ? h("a", { href: t.url, target: "_blank", rel: "noopener noreferrer", text: t.title })
          : h("span", { text: t.title }),
          t.uploader ? h("span", { class: "dash-muted sub", text: t.uploader }) : null),
        t.duration ? h("span", { class: "dur", text: fmt(t.duration) }) : null,
        acts));
    });

    var head = h("div", { class: "dash-card" },
      h("div", { class: "dash-row" }, h("h3", { class: "grow" }, "Musiques du moment ", h("span", { class: "count", text: items.length + " / " + lim.MAX_TRENDING }))),
      h("p", { class: "hint", text: "Les titres du moment sur ce serveur. Lance-les en un clic ou ajoute-les à l'une de tes playlists." }));
    head.appendChild(sel
      ? h("div", { class: "tr-target" }, h("label", { text: "Ajouter à la playlist :" }), sel)
      : h("p", { class: "hint", text: "Crée d'abord une playlist (onglet Playlists) pour pouvoir y envoyer des titres." }));
    head.appendChild(items.length ? list
      : h("div", { class: "live-empty" }, icon(IC.trending), h("span", { text: admin ? "Aucun titre pour l'instant : ajoute le premier avec le formulaire." : "Aucun titre pour l'instant." })));

    var side = h("div", { class: "live-right" });
    if (admin) {
      var url = h("input", { type: "text", maxlength: lim.URL_MAX, placeholder: "Lien YouTube ou autre (https://…)", "aria-label": "Lien de la musique", inputmode: "url" });
      var title = h("input", { type: "text", maxlength: lim.TITLE_MAX, placeholder: "Titre (facultatif pour YouTube)", "aria-label": "Titre" });
      var go = h("button", { class: "btn btn-primary", type: "submit" }, "Ajouter à la liste");
      side.appendChild(h("div", { class: "dash-card" },
        h("h3", { text: "Ajouter une musique" }),
        h("p", { class: "hint", text: "Colle un lien : pour YouTube, le titre, l'artiste et la miniature sont retrouvés tout seuls." }),
        h("form", {
          onsubmit: function (ev) {
            ev.preventDefault();
            if (!url.value.trim()) return;
            busy(go, function () { return api("/api/playlists", { guild: gid, action: "trend_add", url: url.value, title: title.value }); })
              .then(function () { toast("Titre ajouté à la liste"); return refresh(); }, fail);
          }
        },
          h("label", { class: "lbl", text: "Lien" }), url,
          h("label", { class: "lbl", text: "Titre" }), title,
          h("div", { class: "dash-actions" }, go))));
    } else {
      side.appendChild(h("div", { class: "dash-card" },
        h("h3", { text: "Une idée de titre ?" }),
        h("p", { class: "hint", text: "Seuls les administrateurs peuvent ajouter des musiques à cette liste, mais tu peux envoyer n'importe quel titre vers tes playlists. Propose tes idées sur Discord !" })));
    }
    return h("div", { class: "live split" }, h("div", { class: "live-left" }, head), side);
  }

  /* ---------- En direct ---------- */

  IC.play = '<polygon points="6 3 20 12 6 21 6 3"/>';
  IC.pause = '<rect x="14" y="4" width="4" height="16" rx="1"/><rect x="6" y="4" width="4" height="16" rx="1"/>';
  IC.skip = '<polygon points="5 4 15 12 5 20 5 4"/><line x1="19" x2="19" y1="5" y2="19"/>';
  IC.stop = '<rect x="5" y="5" width="14" height="14" rx="2"/>';
  IC.shuffle = '<path d="m18 14 4 4-4 4"/><path d="m18 2 4 4-4 4"/><path d="M2 18h1.973a4 4 0 0 0 3.3-1.7l5.454-8.6a4 4 0 0 1 3.3-1.7H22"/><path d="M2 6h1.972a4 4 0 0 1 3.6 2.2"/><path d="M22 18h-6.041a4 4 0 0 1-3.3-1.8l-.359-.45"/>';
  IC.vol = '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>';
  IC.volx = '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="22" x2="16" y1="9" y2="15"/><line x1="16" x2="22" y1="9" y2="15"/>';
  IC.trash = '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>';
  IC.close = '<path d="M18 6 6 18M6 6l12 12"/>';
  IC.disc = '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="2.5"/>';
  IC.queue = '<path d="M21 15V6M18.5 18a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z"/><path d="M12 12H3M16 6H3M12 18H3"/>';
  IC.hash = '<path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18"/>';

  /* ---------- Icônes corrigées (jeu Lucide, tracés complets) ---------- */
  IC.trash = '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M10 11v6"/><path d="M14 11v6"/>';
  IC.pencil = '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>';
  IC.eraser = '<path d="M21 21H8a2 2 0 0 1-1.42-.587l-3.994-3.999a2 2 0 0 1 0-2.828l10-10a2 2 0 0 1 2.829 0l5.999 6a2 2 0 0 1 0 2.828L12.834 21"/><path d="m5.082 11.09 8.828 8.828"/>';
  IC.queue = '<path d="M21 15V6"/><circle cx="18.5" cy="18" r="2.5"/><path d="M12 12H3"/><path d="M16 6H3"/><path d="M12 18H3"/>';
  IC.settings = '<path d="M10 5H3"/><path d="M12 19H3"/><path d="M14 3v4"/><path d="M16 17v4"/><path d="M21 12h-9"/><path d="M21 19h-5"/><path d="M21 5h-7"/><path d="M8 10v4"/><path d="M8 12H3"/>';
  IC.playlists = IC.queue;
  IC.refresh = '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>';
  IC.vol = '<path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"/><path d="M16 9a5 5 0 0 1 0 6"/><path d="M19.364 18.364a9 9 0 0 0 0-12.728"/>';
  IC.volx = '<path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"/><path d="m22 9-6 6"/><path d="m16 9 6 6"/>';
  IC.skip = '<polygon points="5 4 15 12 5 20 5 4"/><path d="M19 5v14"/>';
  IC.login = '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><path d="m10 17 5-5-5-5"/><path d="M15 12H3"/>';

  var LOGIN_ART = '<svg viewBox="0 0 420 360" xmlns="http://www.w3.org/2000/svg" role="presentation">' +
    '<path class="la-blob" d="M70 120c10-60 90-92 170-84s120 52 118 118-30 74-48 116-90 62-150 40-100-44-110-104 12-56 20-86Z" fill="#f3f6f4"/>' +
    '<g class="la-screen"><rect x="96" y="92" width="228" height="170" rx="10" fill="#fff" stroke="#232a3d" stroke-width="6"/>' +
    '<path d="M70 280h280l-22-18H92Z" fill="#232a3d"/>' +
    '<rect class="la-bar b1" x="116" y="116" width="120" height="30" rx="5" fill="#dcdfe3"/>' +
    '<rect class="la-bar b2" x="116" y="160" width="86" height="10" rx="5" fill="#abaeb8"/>' +
    '<rect class="la-bar b3" x="116" y="184" width="104" height="10" rx="5" fill="#dcdfe3"/>' +
    '<rect class="la-bar b4" x="116" y="208" width="64" height="10" rx="5" fill="#dcdfe3"/></g>' +
    '<g class="la-lock"><rect x="44" y="44" width="92" height="92" rx="16" fill="#0a9150" stroke="#fff" stroke-width="8"/>' +
    '<g transform="translate(0 -4)"><path class="la-shackle" d="M68 44V34a22 22 0 0 1 44 0v10" fill="none" stroke="#0a9150" stroke-width="9" stroke-linecap="round"/></g>' +
    '<circle cx="90" cy="82" r="11" fill="#fff"/><path d="M84 88h12l4 24H80Z" fill="#fff"/></g>' +
    '<g transform="translate(-40 14)"><g class="la-shield"><path d="M296 150l52-18 52 18v64c0 40-30 64-52 76-22-12-52-36-52-76Z" fill="#dcdfe3" stroke="#abaeb8" stroke-width="12" stroke-linejoin="round"/></g></g>' +
    '<g transform="translate(-46 16)"><path class="la-check" pathLength="1" d="M286 216l22 22 40-46" fill="none" stroke="#0a9150" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/></g>' +
    '<circle class="la-dot d1" cx="352" cy="78" r="6" fill="#0a9150"/><circle class="la-dot d2" cx="378" cy="226" r="4" fill="#abaeb8"/><circle class="la-dot d3" cx="62" cy="248" r="5" fill="#0a9150"/>' +
    '</svg>';

  // Carte « Lancer une musique » (construite une seule fois : elle garde ce que la personne tape)
  function launchCard(onDone) {
    var q = h("input", { type: "text", maxlength: state.data.limits.QUERY_MAX, placeholder: "Lien YouTube ou mots-clés", "aria-label": "Lien ou recherche" });
    var go = h("button", { class: "btn btn-primary btn-sm", type: "submit" }, "Lancer");
    var form = h("form", {
      class: "live-search", onsubmit: function (ev) {
        ev.preventDefault();
        if (!q.value.trim()) return;
        busy(go, function () { return order({ action: "play", arg: q.value }); })
          .then(function (r) { q.value = ""; toast(r.message || "Fait"); onDone(); }, fail);
      }
    }, icon(IC.search), q, go);

    var card = h("div", { class: "dash-card live-launch" },
      h("h3", { text: "Lancer une musique" }),
      h("p", { class: "hint", text: "Colle un lien ou tape des mots-clés. Si Player 1 ne joue rien, rejoins d'abord un salon vocal : il viendra t'y retrouver." }),
      form);

    var lists = state.data.playlists.filter(function (p) { return p.tracks.length; });
    if (lists.length) {
      var sel = h("select", { "aria-label": "Playlist" });
      lists.forEach(function (p) { sel.appendChild(h("option", { value: p.id, text: p.name + " (" + p.tracks.length + ")" })); });
      var run = function (shuffle) {
        return function (ev) {
          busy(ev.currentTarget, function () { return order({ action: "playlist_play", playlist: Number(sel.value), shuffle: shuffle }); })
            .then(function (r) { toast(r.message || "Fait"); onDone(); }, fail);
        };
      };
      card.appendChild(h("div", { class: "live-or" }, h("span", { text: "ou une playlist" })));
      card.appendChild(h("div", { class: "dash-row" }, h("div", { class: "grow" }, sel),
        h("button", { class: "btn btn-ghost btn-sm", type: "button", onclick: run(false) }, "Lancer"),
        h("button", { class: "btn btn-ghost btn-sm", type: "button", title: "Mélanger", "aria-label": "Lancer en mélangeant", onclick: run(true) }, icon(IC.shuffle))));
    }
    return card;
  }

  function liveView() {
    var gid = state.guild.id, lim = state.data.limits;
    var wrap = h("div", { class: "live" });
    var left = h("div", { class: "live-left" });
    var qBox = h("div", {});
    var refs = {};          // éléments mis à jour chaque seconde (barre, temps)

    function position() {
      var st = live.st;
      if (!st || !st.track) return 0;
      var p = st.position;
      if (st.playing && !st.paused) p += (st.now - st.updated_at) + (Date.now() - live.at) / 1000;
      var d = st.track.duration;
      return d ? Math.min(p, d) : p;
    }
    function paintProgress() {
      if (!refs.fill) return;
      var d = live.st.track && live.st.track.duration, p = position();
      refs.fill.style.width = d ? Math.min(100, (p / d) * 100).toFixed(1) + "%" : "100%";
      refs.cur.textContent = fmt(Math.floor(p));
      refs.dur.textContent = d ? fmt(d) : "En direct";
    }

    function send(payload, btn, confirmMsg) {
      if (confirmMsg && !window.confirm(confirmMsg)) return;
      busy(btn, function () { return order(payload); })
        .then(function (r) { toast(r.message || "Fait"); setTimeout(load, 600); }, function (e) { fail(e); setTimeout(load, 600); });
    }
    function round(name, label, cls, action, arg, confirmMsg) {
      return h("button", {
        class: "live-btn " + (cls || ""), type: "button", title: label, "aria-label": label,
        onclick: function (ev) { send({ action: action, arg: arg }, ev.currentTarget, confirmMsg); }
      }, icon(IC[name], "ic" + (/^(play|pause|skip|stop)$/.test(name) ? " fill" : "")));
    }

    function paintIdle() {
      left.replaceChildren(h("div", { class: "dash-card live-idle" },
        h("div", { class: "live-idle-ic" }, icon(IC.disc)),
        h("h2", { text: "Rien en cours" }),
        h("p", { text: "Player 1 ne joue rien sur ce serveur pour le moment. Lance une musique depuis la carte à côté, ou sur Discord avec /play." })));
      qBox.replaceChildren();
    }

    function paintActive(st) {
      var t = st.track;
      var safeUrl = t && /^https?:\/\//i.test(t.url || "");
      var hasImg = t && t.thumbnail && /^https:\/\//i.test(t.thumbnail);
      var art = hasImg
        ? h("img", { class: "live-art", src: t.thumbnail, alt: "", width: 176, height: 176, referrerpolicy: "no-referrer" })
        : h("div", { class: "live-art ph", "aria-hidden": "true" }, icon(IC.music));
      var bg = hasImg ? h("img", { class: "live-bg", src: t.thumbnail, alt: "", "aria-hidden": "true", referrerpolicy: "no-referrer" }) : null;

      refs.fill = h("div", { class: "fill" }, h("i", { class: "knob" }));
      refs.cur = h("span", { text: "0:00" });
      refs.dur = h("span", { text: "" });
      var bar = h("div", { class: "live-bar", role: "progressbar", "aria-label": "Progression" }, refs.fill);

      var range = h("input", { type: "range", min: 0, max: lim.MAX_VOLUME, step: 1, value: st.volume, "aria-label": "Volume" });
      var num = h("input", { type: "number", class: "dash-num", min: 0, max: lim.MAX_VOLUME, value: st.volume, "aria-label": "Volume en pourcentage" });
      range.addEventListener("input", function () { num.value = range.value; });
      range.addEventListener("change", function () { send({ action: "volume", arg: Number(range.value) }, range); });
      num.addEventListener("change", function () {
        var v = Math.max(0, Math.min(lim.MAX_VOLUME, Math.round(Number(num.value) || 0)));
        range.value = v; num.value = v; send({ action: "volume", arg: v }, num);
      });

      var loops = h("div", { class: "dash-tabs", role: "group", "aria-label": "Répétition" });
      [["off", "Désactivée"], ["track", "Titre"], ["queue", "File"]].forEach(function (l) {
        loops.appendChild(h("button", {
          class: "dash-tab", type: "button", "aria-pressed": String(st.loop === l[0]), "aria-selected": String(st.loop === l[0]),
          onclick: function (ev) { if (st.loop !== l[0]) send({ action: "loop", arg: l[0] }, ev.currentTarget); }
        }, l[1]));
      });

      var title = t
        ? (safeUrl ? h("a", { class: "ttl", href: t.url, target: "_blank", rel: "noopener noreferrer", text: t.title }) : h("span", { class: "ttl", text: t.title }))
        : h("span", { class: "ttl dim", text: "Aucun titre pour l'instant" });

      refs.pill = null;
      left.replaceChildren(h("div", { class: "dash-card live-hero" },
        bg,
        h("div", { class: "live-hero-in" },
          h("div", { class: "live-top" },
            h("span", { class: "dash-pill" + (st.paused ? " paused" : ""), text: st.paused ? "En pause" : "En lecture" }),
            h("span", { class: "eq" + (st.paused ? " paused" : ""), "aria-hidden": "true" }, h("i"), h("i"), h("i"), h("i")),
            st.channel ? h("span", { class: "live-chip" }, icon(IC.hash), st.channel) : null),
          h("div", { class: "live-now" },
            art,
            h("div", { class: "live-meta" }, title,
              t && t.uploader ? h("span", { class: "sub", text: t.uploader }) : null)),
          t ? h("div", { class: "live-prog" }, refs.cur, bar, refs.dur) : null,
          h("div", { class: "live-ctl" },
            round("shuffle", "Mélanger la file", "", "shuffle"),
            round(st.paused ? "play" : "pause", st.paused ? "Reprendre" : "Pause", "main", st.paused ? "resume" : "pause"),
            round("skip", "Titre suivant", "", "skip"),
            round("stop", "Arrêter et déconnecter Player 1", "danger", "stop", null, "Arrêter la musique et déconnecter Player 1 ?")),
          h("div", { class: "live-opts" },
            h("div", { class: "live-vol" }, icon(IC[st.volume === 0 ? "volx" : "vol"], "ic"), range, num, h("span", { class: "dash-muted", text: "%" })),
            loops))));
      paintQueue(st);
      if (t) paintProgress();
    }

    function paintQueue(st) {
      var list = h("ul", { class: "dash-tracks live-queue" });
      st.queue.forEach(function (q, i) {
        var ok = /^https?:\/\//i.test(q.url || "");
        list.appendChild(h("li", {},
          h("span", { class: "pos", text: String(i + 1) }),
          h("div", { class: "info" }, ok ? h("a", { href: q.url, target: "_blank", rel: "noopener noreferrer", text: q.title }) : h("span", { text: q.title })),
          h("span", { class: "dur", text: fmt(q.duration) }),
          h("button", {
            class: "dash-x", type: "button", title: "Retirer de la file", "aria-label": "Retirer " + q.title,
            onclick: function (ev) { send({ action: "remove", arg: i + 1 }, ev.currentTarget); }
          }, icon(IC.close, "ic"))));
      });
      var more = st.queue_len - st.queue.length;
      qBox.replaceChildren(h("div", { class: "dash-card live-queue-card" },
        h("div", { class: "dash-row" },
          h("h3", { class: "grow" }, "File d'attente ", h("span", { class: "count", text: String(st.queue_len) })),
          st.queue_len ? h("button", {
            class: "dash-x", type: "button", title: "Vider la file", "aria-label": "Vider la file d'attente",
            onclick: function (ev) { send({ action: "clear" }, ev.currentTarget, "Vider la file d'attente ?"); }
          }, icon(IC.trash, "ic")) : null),
        st.queue.length ? list : h("div", { class: "live-empty" }, icon(IC.queue), h("span", { text: "La file est vide." })),
        more > 0 ? h("p", { class: "hint", text: "… et " + more + " autre" + (more > 1 ? "s" : "") + " titre" + (more > 1 ? "s" : "") + "." }) : null));
    }

    var lastSig = null;
    function signature(st) {
      if (!st || !st.active) return "idle";
      var t = st.track || {};
      return JSON.stringify([st.playing, st.paused, t.url, t.title, st.volume, st.loop, st.channel, st.queue_len,
        st.queue.map(function (q) { return q.url; })]);
    }
    function paint() {
      var st = live.st, sig = signature(st);
      if (sig === lastSig) return paintProgress();   // rien de nouveau : on ne touche pas au DOM
      lastSig = sig;
      refs = {};
      if (!st || !st.active) { setOnline("Au repos", true); return paintIdle(); }
      setOnline(st.paused ? "En pause" : "En lecture", true);
      paintActive(st);
    }

    function load() {
      if (state.tab !== "live" || state.guild.id !== gid) return;
      // On ne reconstruit pas l'affichage pendant que la personne règle le volume.
      var el = document.activeElement;
      var editing = el && left.contains(el) && el.tagName === "INPUT";
      api("/api/player?id=" + gid).then(function (st) {
        live.st = st; live.at = Date.now();
        if (!editing) paint();
      }, fail);
    }

    stopLive();
    live.poll = setInterval(function () { if (document.visibilityState === "visible") load(); }, 4000);
    live.tick = setInterval(function () { if (live.st && live.st.active) paintProgress(); }, 1000);
    left.appendChild(h("p", { class: "dash-muted", text: "Chargement…" }));
    wrap.appendChild(left);
    wrap.appendChild(h("div", { class: "live-right" }, launchCard(function () { setTimeout(load, 800); }), qBox));
    load();
    return wrap;
  }

  /* ---------- Démarrage ---------- */

  var params = new URLSearchParams(location.search);

  // Choisit l'écran d'après l'adresse (au chargement, et avec les boutons précédent / suivant du navigateur)
  function route() {
    if (!state.me) return;
    var parts = location.pathname.replace(/\/+$/, "").split("/");
    var tab = TAB_OF[parts[2]], id = /^\d+$/.test(parts[3] || "") ? parts[3] : location.hash.replace("#", "");
    var g = state.me.guilds.filter(function (x) { return x.id === id && (x.bot !== false || x.protect === true); })[0];
    if (!g) { state.want = tab || null; return renderGuilds(); }
    if (state.guild && state.guild.id === g.id && state.data) {   // même serveur : on change juste d'onglet
      state.tab = allowed(g, tab) ? tab : state.tab;
      return renderGuild();
    }
    openGuild(g, tab, true);
  }

  api("/api/me").then(function (me) {
    state.me = me;
    route();
    window.addEventListener("popstate", route);
    boot.done();
  }, function (e) {
    boot.done();
    if (e.status === 401) renderLogin(params.get("erreur"));
    else { view.replaceChildren(h("div", { class: "dash-error", role: "alert", text: "Le dashboard est momentanément indisponible. Réessaie dans un instant." })); }
  });
})();
