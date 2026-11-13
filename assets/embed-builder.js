/* Ozone Groupe ™ — Créateur d'embed / container pour webhook Discord.
   Tout se passe dans le navigateur : le lien du webhook n'est jamais envoyé à nos serveurs. */
(function () {
  "use strict";

  var KEY = "ozone_embed_v1";
  var WEBHOOK_RE = /^https:\/\/(?:(?:canary|ptb)\.)?discord(?:app)?\.com\/api\/(?:v\d+\/)?webhooks\/\d+\/[\w-]+\/?$/;
  var COLORS = [["Vert", 0x1F9D55], ["Bleu", 0x5865F2], ["Rose", 0xFF6B9D], ["Rouge", 0xEF4444], ["Orange", 0xF97316], ["Jaune", 0xFACC15], ["Violet", 0x8B5CF6], ["Gris", 0x4E5058]];
  var LIM = { content: 2000, title: 256, desc: 4096, fname: 256, fvalue: 1024, ftext: 2048, author: 256, text: 4000, name: 80, label: 80 };
  var h, icon, IC, toast, S, form, preview, ctrl;

  /* ---------- Données ---------- */
  function isUrl(u) { return /^https?:\/\/[^\s]+$/i.test(u || ""); }
  function hex(n) { return "#" + (n >>> 0).toString(16).padStart(6, "0"); }
  function newEmbed() {
    return { author: { name: "", url: "", icon: "" }, title: "", url: "", desc: "", color: 0x1F9D55, thumb: "", image: "", fields: [], footer: { text: "", icon: "" }, ts: false };
  }
  function sample() { var e = newEmbed(); e.title = "Titre de ton embed"; e.desc = "Décris ici ton message.\nLa mise en forme Discord fonctionne : **gras**, *italique*, [lien](https://exemple.fr)."; return e; }
  function newState() {
    return { mode: "classic", url: "", remember: false, username: "", avatar: "", content: "", embeds: [sample()], cur: 0,
      ct: { color: 0x1F9D55, spoiler: false, items: [{ t: "text", text: "## Titre\nÉcris ton texte ici, la mise en forme Discord fonctionne." }] } };
  }
  function item(t) {
    return t === "text" ? { t: t, text: "" }
      : t === "section" ? { t: t, text: "", acc: "thumb", url: "", label: "", alt: "" }
      : t === "sep" ? { t: t, divider: true, big: false }
      : t === "gallery" ? { t: t, items: [{ url: "", alt: "" }] }
      : { t: "buttons", btns: [{ label: "", url: "" }] };
  }

  /* ---------- Construction des messages (fonctions pures) ---------- */
  function cleanEmbed(e) {
    var o = {};
    if (e.title.trim()) { o.title = e.title; if (isUrl(e.url)) o.url = e.url; }
    if (e.desc.trim()) o.description = e.desc;
    if (e.author.name.trim()) {
      o.author = { name: e.author.name };
      if (isUrl(e.author.url)) o.author.url = e.author.url;
      if (isUrl(e.author.icon)) o.author.icon_url = e.author.icon;
    }
    var f = e.fields.filter(function (x) { return x.name.trim() && x.value.trim(); })
      .map(function (x) { return { name: x.name, value: x.value, inline: !!x.inline }; });
    if (f.length) o.fields = f;
    if (isUrl(e.thumb)) o.thumbnail = { url: e.thumb };
    if (isUrl(e.image)) o.image = { url: e.image };
    if (e.footer.text.trim()) {
      o.footer = { text: e.footer.text };
      if (isUrl(e.footer.icon)) o.footer.icon_url = e.footer.icon;
    }
    if (!Object.keys(o).length) return null;          // rien d'affichable : on l'ignore
    if (e.color != null) o.color = e.color;
    if (e.ts) o.timestamp = new Date().toISOString();
    return o;
  }
  function embedChars(o) {
    var n = (o.title || "").length + (o.description || "").length + (o.footer ? o.footer.text.length : 0) + (o.author ? o.author.name.length : 0);
    (o.fields || []).forEach(function (x) { n += x.name.length + x.value.length; });
    return n;
  }
  function base(st) {
    var p = {};
    if (st.username.trim()) p.username = st.username.trim();
    if (isUrl(st.avatar)) p.avatar_url = st.avatar;
    return p;
  }
  function classicPayload(st) {
    var p = base(st);
    if (st.content.trim()) p.content = st.content;
    var es = st.embeds.map(cleanEmbed).filter(Boolean);
    if (es.length) p.embeds = es;
    return p;
  }
  function ctComponents(ct) {
    var out = [];
    ct.items.forEach(function (it) {
      if (it.t === "text") { if (it.text.trim()) out.push({ type: 10, content: it.text }); }
      else if (it.t === "section") {
        if (!it.text.trim()) return;
        var acc = null;
        if (it.acc === "thumb" && isUrl(it.url)) acc = { type: 11, media: { url: it.url }, description: it.alt || undefined };
        else if (it.acc === "button" && isUrl(it.url) && it.label.trim()) acc = { type: 2, style: 5, label: it.label, url: it.url };
        out.push(acc ? { type: 9, components: [{ type: 10, content: it.text }], accessory: acc } : { type: 10, content: it.text });
      } else if (it.t === "sep") out.push({ type: 14, divider: !!it.divider, spacing: it.big ? 2 : 1 });
      else if (it.t === "gallery") {
        var g = it.items.filter(function (x) { return isUrl(x.url); }).slice(0, 10).map(function (x) { return { media: { url: x.url }, description: x.alt || undefined }; });
        if (g.length) out.push({ type: 12, items: g });
      } else if (it.t === "buttons") {
        var b = it.btns.filter(function (x) { return x.label.trim() && isUrl(x.url); }).slice(0, 5).map(function (x) { return { type: 2, style: 5, label: x.label, url: x.url }; });
        if (b.length) out.push({ type: 1, components: b });
      }
    });
    return out;
  }
  function containerPayload(st) {
    var p = base(st), inner = ctComponents(st.ct), c = { type: 17, components: inner };
    if (st.ct.color != null) c.accent_color = st.ct.color;
    if (st.ct.spoiler) c.spoiler = true;
    p.flags = 32768;                                   // IS_COMPONENTS_V2
    p.components = [c];
    return p;
  }
  function payload(st) { return st.mode === "container" ? containerPayload(st) : classicPayload(st); }

  // Renvoie un message d'erreur lisible, ou "" si le message peut partir.
  function problem(st, p, needHook) {
    if (needHook && !WEBHOOK_RE.test(st.url.trim())) return "Le lien du webhook est invalide (https://discord.com/api/webhooks/…)";
    if (st.mode === "container") {
      var inner = p.components[0].components, text = 0;
      if (!inner.length) return "Ajoute au moins un composant avec du contenu";
      if (inner.length > 40) return "Un container accepte 40 composants au maximum";
      JSON.stringify(inner).replace(/"content":"((?:[^"\\]|\\.)*)"/g, function (m, c) { text += JSON.parse('"' + c + '"').length; return m; });
      if (text > LIM.text) return "Le texte total dépasse " + LIM.text + " caractères (" + text + ")";
      return "";
    }
    if (!p.content && !p.embeds) return "Le message est vide : écris du texte ou remplis un embed";
    if (p.content && p.content.length > LIM.content) return "Le message dépasse " + LIM.content + " caractères";
    var total = 0;
    for (var i = 0; i < (p.embeds || []).length; i++) {
      var e = p.embeds[i];
      if (e.title && e.title.length > LIM.title) return "Embed " + (i + 1) + " : titre trop long";
      if (e.description && e.description.length > LIM.desc) return "Embed " + (i + 1) + " : description trop longue";
      if (e.fields && e.fields.length > 25) return "Embed " + (i + 1) + " : 25 champs maximum";
      total += embedChars(e);
    }
    return total > 6000 ? "Les embeds dépassent 6000 caractères au total (" + total + ")" : "";
  }

  /* ---------- Markdown Discord (aperçu) ---------- */
  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function inline(s) {                                   // s est déjà échappé
    var keep = [];
    function hold(html) { keep.push(html); return "\u0000" + (keep.length - 1) + "\u0000"; }
    s = s.replace(/`([^`]+)`/g, function (m, c) { return hold("<code>" + c + "</code>"); });
    s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, function (m, t, u) { return hold('<a href="' + u + '" target="_blank" rel="noopener noreferrer">' + t + "</a>"); });
    s = s.replace(/(https?:\/\/[^\s<]+)/g, function (m) { return hold('<a href="' + m + '" target="_blank" rel="noopener noreferrer">' + m + "</a>"); });
    s = s.replace(/&lt;@[!&amp;]*(\d+)&gt;/g, function () { return hold('<span class="eb-men">@membre</span>'); })
      .replace(/&lt;#\d+&gt;/g, function () { return hold('<span class="eb-men">#salon</span>'); })
      .replace(/&lt;a?:(\w+):\d+&gt;/g, function (m, n) { return ":" + n + ":"; });
    s = s.replace(/\*\*\*(.+?)\*\*\*/g, "<b><i>$1</i></b>").replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/__(.+?)__/g, "<u>$1</u>")
      .replace(/\*(.+?)\*/g, "<i>$1</i>").replace(/(^|[^\w])_(.+?)_(?!\w)/g, "$1<i>$2</i>").replace(/~~(.+?)~~/g, "<s>$1</s>")
      .replace(/\|\|(.+?)\|\|/g, '<span class="eb-spoil">$1</span>');
    return s.replace(/\u0000(\d+)\u0000/g, function (m, i) { return keep[+i]; });
  }
  function md(src) {
    var out = [];
    String(src || "").split("```").forEach(function (part, i) {
      if (i % 2) { out.push("<pre>" + esc(part.replace(/^[a-z]*\n/i, "").replace(/\n$/, "")) + "</pre>"); return; }
      var q = [], l = [];
      function flush() {
        if (q.length) out.push("<blockquote>" + q.join("<br>") + "</blockquote>");
        if (l.length) out.push("<ul>" + l.map(function (x) { return "<li>" + x + "</li>"; }).join("") + "</ul>");
        q = []; l = [];
      }
      part.split("\n").forEach(function (line) {
        var m;
        if ((m = /^> ?(.*)$/.exec(line))) { if (l.length) flush(); q.push(inline(esc(m[1]))); return; }
        if ((m = /^[-*] (.+)$/.exec(line))) { if (q.length) flush(); l.push(inline(esc(m[1]))); return; }
        flush();
        if ((m = /^(#{1,3}) (.+)$/.exec(line))) out.push('<div class="eb-h' + m[1].length + '">' + inline(esc(m[2])) + "</div>");
        else if ((m = /^-# (.+)$/.exec(line))) out.push('<div class="eb-sub">' + inline(esc(m[1])) + "</div>");
        else out.push(line.trim() ? "<div>" + inline(esc(line)) + "</div>" : '<div class="eb-gap"></div>');
      });
      flush();
    });
    return out.join("");
  }
  function rich(cls, text) { var el = h("div", { class: cls }); el.innerHTML = md(text); return el; }

  /* ---------- Aperçu ---------- */
  function img(url, cls) { return isUrl(url) ? h("img", { class: cls, src: url, alt: "", referrerpolicy: "no-referrer", loading: "lazy" }) : null; }
  function paintPreview() {
    var p = payload(S), kids = [];
    if (S.mode === "classic") {
      if (S.content.trim()) kids.push(rich("eb-txt", S.content));
      S.embeds.forEach(function (e) {
        var o = cleanEmbed(e); if (!o) return;
        var box = h("div", { class: "eb-embed", style: "border-left-color:" + (o.color != null ? hex(o.color) : "#4e5058") });
        var main = h("div", { class: "eb-em-main" });
        if (o.author) main.appendChild(h("div", { class: "eb-au" }, img(o.author.icon_url, "eb-au-i"), o.author.url ? h("a", { href: o.author.url, target: "_blank", rel: "noopener noreferrer", text: o.author.name }) : h("span", { text: o.author.name })));
        if (o.title) main.appendChild(o.url ? h("a", { class: "eb-ti", href: o.url, target: "_blank", rel: "noopener noreferrer", text: o.title }) : h("div", { class: "eb-ti", text: o.title }));
        if (o.description) main.appendChild(rich("eb-de", o.description));
        if (o.fields) {
          var g = h("div", { class: "eb-fields" });
          o.fields.forEach(function (f) { var d = h("div", { class: "eb-fd" + (f.inline ? " inl" : "") }, h("div", { class: "eb-fn", text: f.name })); d.appendChild(rich("eb-fv", f.value)); g.appendChild(d); });
          main.appendChild(g);
        }
        box.appendChild(h("div", { class: "eb-em-top" }, main, img(o.thumbnail && o.thumbnail.url, "eb-th")));
        if (o.image) box.appendChild(img(o.image.url, "eb-im"));
        if (o.footer || o.timestamp) box.appendChild(h("div", { class: "eb-ft" }, o.footer ? img(o.footer.icon_url, "eb-ft-i") : null,
          h("span", { text: (o.footer ? o.footer.text : "") + (o.footer && o.timestamp ? " • " : "") + (o.timestamp ? "Aujourd'hui à " + new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "") })));
        kids.push(box);
      });
    } else {
      var c = p.components[0];
      var cv = h("div", { class: "eb-cv" + (c.spoiler ? " spoil" : ""), style: "border-left-color:" + (c.accent_color != null ? hex(c.accent_color) : "#3f4147") });
      c.components.forEach(function (x) {
        if (x.type === 10) cv.appendChild(rich("eb-txt", x.content));
        else if (x.type === 9) {
          var a = x.accessory, right = a.type === 11 ? img(a.media.url, "eb-th") : h("span", { class: "eb-btn", text: a.label });
          cv.appendChild(h("div", { class: "eb-sec" }, rich("eb-txt", x.components[0].content), right));
        } else if (x.type === 14) cv.appendChild(h("div", { class: "eb-sep" + (x.spacing === 2 ? " big" : "") + (x.divider ? " line" : "") }));
        else if (x.type === 12) { var gal = h("div", { class: "eb-gal n" + Math.min(x.items.length, 4) }); x.items.forEach(function (m) { gal.appendChild(img(m.media.url, "eb-gi")); }); cv.appendChild(gal); }
        else if (x.type === 1) cv.appendChild(h("div", { class: "eb-btns" }, x.components.map(function (b) { return h("span", { class: "eb-btn", text: b.label + " ↗" }); })));
      });
      if (!c.components.length) cv.appendChild(h("div", { class: "eb-hint", text: "Ajoute des composants pour voir l'aperçu." }));
      kids.push(cv);
    }
    var name = S.username.trim() || "Webhook";
    var av = isUrl(S.avatar) ? h("img", { class: "eb-av", src: S.avatar, alt: "", referrerpolicy: "no-referrer" }) : h("span", { class: "eb-av ph", text: name.charAt(0).toUpperCase() });
    preview.replaceChildren(h("div", { class: "eb-bar" }, h("span", { text: "#" }), " aperçu"),
      h("div", { class: "eb-msg" }, av, h("div", { class: "eb-body" },
        h("div", { class: "eb-hd" }, h("b", { text: name }), h("em", { text: "APP" }), h("small", { text: "Aujourd'hui à " + new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) })),
        kids.length ? h("div", {}, kids) : h("div", { class: "eb-hint", text: "Ton message apparaîtra ici." }))));
    var err = problem(S, p, false);
    if (ctrl.status) { ctrl.status.textContent = err || "Prêt à envoyer"; ctrl.status.className = "eb-status" + (err ? " bad" : " ok"); }
  }

  /* ---------- Éléments de formulaire ---------- */
  var timer;
  function changed() {
    paintPreview();
    clearTimeout(timer);
    timer = setTimeout(function () {
      try { localStorage.setItem(KEY, JSON.stringify(Object.assign({}, S, { url: S.remember ? S.url : "" }))); } catch (e) { /* stockage indisponible */ }
    }, 400);
  }
  function L(label, el, extra, cls) { return h("label", { class: "eb-f " + (cls || "") }, h("span", { class: "eb-l", text: label }), el, extra || null); }
  function T(obj, key, o) {
    var el = o.area ? h("textarea", { rows: o.rows || 4, maxlength: o.max, placeholder: o.ph || "" })
      : h("input", { type: "text", maxlength: o.max, placeholder: o.ph || "", inputmode: o.url ? "url" : null, spellcheck: o.url ? "false" : null });
    var cnt = o.max && o.area ? h("span", { class: "eb-c" }) : null;
    function sync() { if (cnt) cnt.textContent = el.value.length + " / " + o.max; if (o.url) el.classList.toggle("bad", !!el.value && !isUrl(el.value)); }
    el.value = obj[key] || ""; sync();
    el.addEventListener("input", function () { obj[key] = el.value; sync(); changed(); });
    return L(o.label, el, cnt, o.cls);
  }
  function chk(obj, key, label) {
    var el = h("input", { type: "checkbox" }); el.checked = !!obj[key];
    el.addEventListener("change", function () { obj[key] = el.checked; changed(); });
    return h("label", { class: "eb-chk" }, el, h("span", { text: label }));
  }
  function btn(label, fn, cls, ic) {
    return h("button", { class: "eb-b " + (cls || ""), type: "button", onclick: function (ev) { fn(ev.currentTarget); } }, ic ? icon(IC[ic], "ic") : null, label);
  }
  function sm(name, title, fn, disabled) {
    return h("button", { class: "eb-sm", type: "button", title: title, "aria-label": title, disabled: disabled, onclick: fn }, icon(IC[name], "ic"));
  }
  function colorPick(get, set, none) {
    var wrap = h("div", { class: "eb-colors" }), pick = h("input", { type: "color", "aria-label": "Couleur personnalisée" });
    function paint() {
      var c = get();
      [].forEach.call(wrap.querySelectorAll("[data-c]"), function (b) { b.setAttribute("aria-pressed", String(String(c) === b.dataset.c)); });
      pick.value = hex(c == null ? 0x1F9D55 : c);
    }
    COLORS.forEach(function (c) {
      var b = h("button", { class: "eb-sw", type: "button", title: c[0], "aria-label": c[0], "data-c": c[1], onclick: function () { set(c[1]); paint(); changed(); } });
      b.style.background = hex(c[1]); wrap.appendChild(b);
    });
    pick.addEventListener("input", function () { set(parseInt(pick.value.slice(1), 16)); paint(); changed(); });
    wrap.appendChild(pick);
    if (none) wrap.appendChild(h("button", { class: "eb-none", type: "button", onclick: function () { set(null); paint(); changed(); } }, "Aucune"));
    paint(); return wrap;
  }
  function group(title, open, kids) {
    var d = h("details", { class: "eb-g" }, h("summary", { text: title }), h("div", { class: "eb-gb" }, kids));
    if (open) d.setAttribute("open", ""); return d;
  }
  function move(arr, i, d) { var j = i + d, x = arr[i]; arr[i] = arr[j]; arr[j] = x; }

  /* ---------- Éditeur : embeds classiques ---------- */
  function classicEditor() {
    var e = S.embeds[S.cur], kids = [];
    kids.push(h("div", { class: "eb-card" }, h("h3", { text: "Message" }),
      h("div", { class: "eb-2" }, T(S, "username", { label: "Nom affiché", max: LIM.name, ph: "Webhook" }), T(S, "avatar", { label: "Avatar (lien)", ph: "https://…", url: true })),
      T(S, "content", { label: "Texte du message", max: LIM.content, area: true, rows: 3, ph: "Facultatif, au-dessus des embeds" })));
    var tabs = h("div", { class: "eb-tabs", role: "tablist" });
    S.embeds.forEach(function (x, i) {
      tabs.appendChild(h("button", { class: "eb-tab", type: "button", role: "tab", "aria-selected": String(i === S.cur), onclick: function () { S.cur = i; rebuild(); } }, "Embed " + (i + 1)));
    });
    if (S.embeds.length < 10) tabs.appendChild(h("button", { class: "eb-tab add", type: "button", title: "Ajouter un embed", "aria-label": "Ajouter un embed", onclick: function () { S.embeds.push(newEmbed()); S.cur = S.embeds.length - 1; rebuild(); changed(); } }, icon(IC.plus, "ic")));
    var head = h("div", { class: "eb-card" }, h("div", { class: "eb-row" }, h("h3", { class: "grow", text: "Embeds" }),
      S.embeds.length > 1 ? sm("trash", "Supprimer cet embed", function () { S.embeds.splice(S.cur, 1); S.cur = Math.max(0, S.cur - 1); rebuild(); changed(); }) : null), tabs);
    head.appendChild(group("Auteur", false, [T(e.author, "name", { label: "Nom", max: LIM.author }), h("div", { class: "eb-2" }, T(e.author, "url", { label: "Lien", ph: "https://…", url: true }), T(e.author, "icon", { label: "Icône (lien)", ph: "https://…", url: true }))]));
    head.appendChild(group("Contenu", true, [T(e, "title", { label: "Titre", max: LIM.title }), T(e, "url", { label: "Lien du titre", ph: "https://…", url: true }), T(e, "desc", { label: "Description", max: LIM.desc, area: true, rows: 6, ph: "**gras**, *italique*, [lien](https://…), > citation…" })]));
    head.appendChild(group("Couleur", true, [colorPick(function () { return e.color; }, function (c) { e.color = c; }, true)]));
    var fl = h("div", { class: "eb-list" });
    e.fields.forEach(function (f, i) {
      fl.appendChild(h("div", { class: "eb-item" }, h("div", { class: "eb-row" }, h("strong", { class: "grow", text: "Champ " + (i + 1) }), chk(f, "inline", "En ligne"),
        sm("up", "Monter", function () { move(e.fields, i, -1); rebuild(); changed(); }, i === 0), sm("down", "Descendre", function () { move(e.fields, i, 1); rebuild(); changed(); }, i === e.fields.length - 1),
        sm("close", "Retirer", function () { e.fields.splice(i, 1); rebuild(); changed(); })),
        T(f, "name", { label: "Titre", max: LIM.fname }), T(f, "value", { label: "Valeur", max: LIM.fvalue, area: true, rows: 3 })));
    });
    fl.appendChild(btn("Ajouter un champ", function () { e.fields.push({ name: "", value: "", inline: false }); rebuild(); changed(); }, "ghost", "plus"));
    if (e.fields.length >= 25) fl.lastChild.disabled = true;
    head.appendChild(group("Champs (" + e.fields.length + " / 25)", e.fields.length > 0, [fl]));
    head.appendChild(group("Images", false, [h("div", { class: "eb-2" }, T(e, "thumb", { label: "Miniature (lien)", ph: "https://…", url: true }), T(e, "image", { label: "Grande image (lien)", ph: "https://…", url: true }))]));
    head.appendChild(group("Pied de page", false, [h("div", { class: "eb-2" }, T(e.footer, "text", { label: "Texte", max: LIM.ftext }), T(e.footer, "icon", { label: "Icône (lien)", ph: "https://…", url: true })), chk(e, "ts", "Afficher l'heure d'envoi")]));
    kids.push(head);
    return kids;
  }

  /* ---------- Éditeur : container ---------- */
  var TYPES = { text: "Texte", section: "Section", sep: "Séparateur", gallery: "Galerie", buttons: "Boutons" };
  function containerEditor() {
    var ct = S.ct, kids = [];
    kids.push(h("div", { class: "eb-card" }, h("h3", { text: "Message" }),
      h("div", { class: "eb-2" }, T(S, "username", { label: "Nom affiché", max: LIM.name, ph: "Webhook" }), T(S, "avatar", { label: "Avatar (lien)", ph: "https://…", url: true }))));
    var card = h("div", { class: "eb-card" }, h("h3", { text: "Container" }),
      h("div", { class: "eb-l", text: "Couleur de la barre" }), colorPick(function () { return ct.color; }, function (c) { ct.color = c; }, true), chk(ct, "spoiler", "Masquer en spoiler"));
    var list = h("div", { class: "eb-list" });
    ct.items.forEach(function (it, i) {
      var body = [];
      if (it.t === "text") body.push(T(it, "text", { label: "Texte (Markdown)", max: LIM.text, area: true, rows: 5, ph: "# Titre\n**gras**, -# petit texte, > citation" }));
      if (it.t === "section") {
        body.push(T(it, "text", { label: "Texte", max: LIM.text, area: true, rows: 4 }));
        var sel = h("select", { "aria-label": "Élément à droite" }, h("option", { value: "thumb", text: "Miniature" }), h("option", { value: "button", text: "Bouton lien" }));
        sel.value = it.acc; sel.addEventListener("change", function () { it.acc = sel.value; rebuild(); changed(); });
        body.push(L("À droite du texte", sel), T(it, "url", { label: it.acc === "thumb" ? "Lien de l'image" : "Lien du bouton", ph: "https://…", url: true }));
        body.push(it.acc === "thumb" ? T(it, "alt", { label: "Description de l'image", max: 1024 }) : T(it, "label", { label: "Texte du bouton", max: LIM.label }));
      }
      if (it.t === "sep") body.push(h("div", { class: "eb-row" }, chk(it, "divider", "Ligne visible"), chk(it, "big", "Grand espacement")));
      if (it.t === "gallery") {
        it.items.forEach(function (m, k) {
          body.push(h("div", { class: "eb-row top" }, h("div", { class: "grow eb-2" }, T(m, "url", { label: "Image " + (k + 1), ph: "https://…", url: true }), T(m, "alt", { label: "Description", max: 1024 })),
            sm("close", "Retirer l'image", function () { it.items.splice(k, 1); if (!it.items.length) it.items.push({ url: "", alt: "" }); rebuild(); changed(); })));
        });
        if (it.items.length < 10) body.push(btn("Ajouter une image", function () { it.items.push({ url: "", alt: "" }); rebuild(); }, "ghost", "plus"));
      }
      if (it.t === "buttons") {
        it.btns.forEach(function (b, k) {
          body.push(h("div", { class: "eb-row top" }, h("div", { class: "grow eb-2" }, T(b, "label", { label: "Texte", max: LIM.label }), T(b, "url", { label: "Lien", ph: "https://…", url: true })),
            sm("close", "Retirer le bouton", function () { it.btns.splice(k, 1); if (!it.btns.length) it.btns.push({ label: "", url: "" }); rebuild(); changed(); })));
        });
        if (it.btns.length < 5) body.push(btn("Ajouter un bouton", function () { it.btns.push({ label: "", url: "" }); rebuild(); }, "ghost", "plus"));
      }
      list.appendChild(h("div", { class: "eb-item" }, h("div", { class: "eb-row" }, h("strong", { class: "grow", text: TYPES[it.t] }),
        sm("up", "Monter", function () { move(ct.items, i, -1); rebuild(); changed(); }, i === 0), sm("down", "Descendre", function () { move(ct.items, i, 1); rebuild(); changed(); }, i === ct.items.length - 1),
        sm("close", "Retirer", function () { ct.items.splice(i, 1); rebuild(); changed(); })), body));
    });
    var add = h("div", { class: "eb-add" }, h("span", { class: "eb-l", text: "Ajouter un composant" }));
    Object.keys(TYPES).forEach(function (t) { var b = btn(TYPES[t], function () { ct.items.push(item(t)); rebuild(); changed(); }, "ghost", "plus"); if (ct.items.length >= 40) b.disabled = true; add.appendChild(b); });
    card.appendChild(list); card.appendChild(add); kids.push(card);
    kids.push(h("p", { class: "eb-note" }, "Les webhooks classiques n'acceptent que les composants sans interaction : texte, sections, séparateurs, galeries et boutons-liens."));
    return kids;
  }

  /* ---------- Modèles, import, envoi ---------- */
  var TEMPLATES = {
    classic: [
      ["Annonce", function () { var e = newEmbed(); e.title = "📢 Annonce"; e.desc = "Écris ici le contenu de ton annonce.\n\n**Date :** à définir\n**Lieu :** sur le serveur"; e.color = 0x5865F2; e.footer.text = "L'équipe"; e.ts = true; return { content: "", embeds: [e] }; }],
      ["Règlement", function () { var e = newEmbed(); e.title = "📜 Règlement du serveur"; e.desc = "**1.** Respecte tous les membres.\n**2.** Pas de spam ni de publicité.\n**3.** Reste dans le sujet de chaque salon.\n**4.** Écoute le staff."; e.color = 0xEF4444; e.footer.text = "En restant ici, tu acceptes ces règles"; return { content: "", embeds: [e] }; }],
      ["Bienvenue", function () { var e = newEmbed(); e.author.name = "Bienvenue !"; e.title = "Bienvenue sur le serveur"; e.desc = "Content de te voir ici. Voici de quoi bien démarrer :"; e.color = 0x1F9D55; e.fields = [{ name: "📌 Commence ici", value: "Lis le règlement.", inline: true }, { name: "💬 Discute", value: "Présente-toi dans le salon général.", inline: true }, { name: "🎵 Musique", value: "Utilise `/play` avec Player 1.", inline: true }]; return { content: "", embeds: [e] }; }]
    ],
    container: [
      ["Annonce", function () { return { color: 0x5865F2, spoiler: false, items: [{ t: "text", text: "# 📢 Annonce\nÉcris ici le contenu de ton annonce." }, { t: "sep", divider: true, big: false }, { t: "text", text: "**Quand ?** à définir\n**Où ?** sur le serveur" }, { t: "buttons", btns: [{ label: "En savoir plus", url: "https://" }] }] }; }],
      ["Règlement", function () { return { color: 0xEF4444, spoiler: false, items: [{ t: "text", text: "# 📜 Règlement" }, { t: "sep", divider: true, big: false }, { t: "text", text: "**1.** Respecte tous les membres.\n**2.** Pas de spam ni de publicité.\n**3.** Reste dans le sujet de chaque salon." }, { t: "text", text: "-# Dernière mise à jour : aujourd'hui" }] }; }],
      ["Profil", function () { return { color: 0x8B5CF6, spoiler: false, items: [{ t: "section", text: "## Pseudo\nPetite description du membre.\n-# Membre depuis 2026", acc: "thumb", url: "", label: "", alt: "Avatar" }, { t: "sep", divider: true, big: false }, { t: "buttons", btns: [{ label: "Profil", url: "https://" }] }] }; }]
    ]
  };
  function importJson(txt) {
    var o; try { o = JSON.parse(txt); } catch (e) { return "JSON invalide"; }
    if (!o || typeof o !== "object") return "JSON invalide";
    S.username = o.username || ""; S.avatar = o.avatar_url || "";
    var top = (o.components || []).filter(function (c) { return c.type === 17; })[0];
    if (top || (o.components && o.components.length)) {
      var src = top ? top.components : o.components, items = [];
      src.forEach(function (c) {
        if (c.type === 10) items.push({ t: "text", text: c.content || "" });
        else if (c.type === 9) { var a = c.accessory || {}; items.push({ t: "section", text: (c.components || []).map(function (x) { return x.content; }).join("\n"), acc: a.type === 2 ? "button" : "thumb", url: a.type === 2 ? a.url || "" : (a.media || {}).url || "", label: a.label || "", alt: a.description || "" }); }
        else if (c.type === 14) items.push({ t: "sep", divider: c.divider !== false, big: c.spacing === 2 });
        else if (c.type === 12) items.push({ t: "gallery", items: (c.items || []).map(function (m) { return { url: (m.media || {}).url || "", alt: m.description || "" }; }) });
        else if (c.type === 1) items.push({ t: "buttons", btns: (c.components || []).filter(function (b) { return b.url; }).map(function (b) { return { label: b.label || "", url: b.url }; }) });
      });
      S.mode = "container"; S.ct = { color: top && top.accent_color != null ? top.accent_color : null, spoiler: !!(top && top.spoiler), items: items.length ? items : [item("text")] };
    } else {
      S.mode = "classic"; S.content = o.content || "";
      S.embeds = (o.embeds || []).slice(0, 10).map(function (x) {
        var e = newEmbed(); e.title = x.title || ""; e.url = x.url || ""; e.desc = x.description || ""; e.color = x.color != null ? x.color : null;
        e.thumb = (x.thumbnail || {}).url || ""; e.image = (x.image || {}).url || ""; e.ts = !!x.timestamp;
        e.author = { name: (x.author || {}).name || "", url: (x.author || {}).url || "", icon: (x.author || {}).icon_url || "" };
        e.footer = { text: (x.footer || {}).text || "", icon: (x.footer || {}).icon_url || "" };
        e.fields = (x.fields || []).slice(0, 25).map(function (f) { return { name: f.name || "", value: f.value || "", inline: !!f.inline }; });
        return e;
      });
      if (!S.embeds.length) S.embeds = [newEmbed()]; S.cur = 0;
    }
    return "";
  }
  function copy(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
    return new Promise(function (ok, ko) {
      var t = h("textarea", { style: "position:fixed;opacity:0" }); t.value = text; document.body.appendChild(t); t.select();
      try { document.execCommand("copy") ? ok() : ko(); } catch (e) { ko(e); } t.remove();
    });
  }
  function send(b) {
    var p = payload(S), err = problem(S, p, true);
    if (err) return toast(err, true);
    b.disabled = true;
    fetch(S.url.trim().replace(/\/$/, "") + "?wait=true" + (S.mode === "container" ? "&with_components=true" : ""), {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(p)
    }).then(function (r) {
      if (r.ok) return toast("Message envoyé sur Discord");
      return r.json().catch(function () { return {}; }).then(function (j) {
        throw new Error(r.status === 429 ? "Trop d'envois : réessaie dans " + Math.ceil(j.retry_after || 1) + " s" : r.status === 404 ? "Webhook introuvable (supprimé ?)" : (j.message || "Discord a refusé le message (" + r.status + ")"));
      });
    }).catch(function (e) { toast(e.message === "Failed to fetch" ? "Connexion à Discord impossible" : e.message, true); })
      .then(function () { b.disabled = false; });
  }

  /* ---------- Page ---------- */
  function rebuild() {
    var tpl = h("select", { "aria-label": "Modèle" }, h("option", { value: "", text: "Modèle…" }));
    TEMPLATES[S.mode].forEach(function (t, i) { tpl.appendChild(h("option", { value: i, text: t[0] })); });
    tpl.addEventListener("change", function () {
      if (tpl.value === "") return;
      if (!window.confirm("Remplacer le contenu actuel par ce modèle ?")) { tpl.value = ""; return; }
      var t = TEMPLATES[S.mode][+tpl.value][1]();
      if (S.mode === "classic") { S.content = t.content; S.embeds = t.embeds; S.cur = 0; } else S.ct = t;
      rebuild(); changed();
    });
    var seg = h("div", { class: "eb-seg", role: "group", "aria-label": "Type de message" });
    [["classic", "Embed classique"], ["container", "Container"]].forEach(function (m) {
      seg.appendChild(h("button", { type: "button", "aria-pressed": String(S.mode === m[0]), onclick: function () { if (S.mode !== m[0]) { S.mode = m[0]; rebuild(); changed(); } } }, m[1]));
    });
    var url = h("input", { type: "password", placeholder: "https://discord.com/api/webhooks/…", autocomplete: "off", spellcheck: "false", "aria-label": "Lien du webhook" });
    url.value = S.url;
    function vurl() { url.classList.toggle("bad", !!url.value && !WEBHOOK_RE.test(url.value.trim())); }
    vurl();
    url.addEventListener("input", function () { S.url = url.value; vurl(); changed(); });
    var eye = sm("eye", "Afficher ou masquer le lien", function () { url.type = url.type === "password" ? "text" : "password"; });
    ctrl.status = h("span", { class: "eb-status" });
    var json = h("textarea", { rows: 6, placeholder: "Colle ici un JSON de webhook pour le modifier", "aria-label": "JSON" });
    var top = h("div", { class: "eb-card eb-top" },
      h("div", { class: "eb-row top eb-hookrow" }, h("div", { class: "grow" }, h("div", { class: "eb-f" }, h("span", { class: "eb-l", text: "Webhook Discord" }), h("div", { class: "eb-row" }, url, eye)),
        h("p", { class: "eb-hint", text: "Salon > Modifier > Intégrations > Webhooks. Le lien reste dans ton navigateur." })), seg),
      h("div", { class: "eb-row wrap" }, chk(S, "remember", "Mémoriser le lien sur cet appareil"), h("span", { class: "grow" }), tpl,
        btn("Copier le JSON", function () { copy(JSON.stringify(payload(S), null, 2)).then(function () { toast("JSON copié"); }, function () { toast("Copie impossible", true); }); }, "ghost"),
        btn("Réinitialiser", function () { if (window.confirm("Tout effacer ?")) { var u = S.url, r = S.remember; S = newState(); S.url = u; S.remember = r; rebuild(); changed(); } }, "ghost"),
        btn("Envoyer", send, "primary", "play")),
      ctrl.status,
      h("details", { class: "eb-g" }, h("summary", { text: "Importer un JSON" }), h("div", { class: "eb-gb" }, json,
        btn("Importer", function () { var e = importJson(json.value); if (e) return toast(e, true); json.value = ""; rebuild(); changed(); toast("JSON importé"); }, "ghost"))));
    form.replaceChildren.apply(form, [top].concat(S.mode === "classic" ? classicEditor() : containerEditor()));
    paintPreview();
  }

  function view(deps) {
    h = deps.h; icon = deps.icon; IC = deps.IC; toast = deps.toast; ctrl = {};
    S = newState();
    try {
      var saved = JSON.parse(localStorage.getItem(KEY) || "null");
      if (saved && saved.embeds && saved.ct) S = Object.assign(S, saved);
    } catch (e) { /* brouillon illisible : on repart de zéro */ }
    form = h("div", { class: "eb-form" });
    preview = h("div", { class: "eb-preview dc-like", "aria-label": "Aperçu du message" });
    rebuild();
    return h("div", { class: "eb" }, form, h("div", { class: "eb-side" }, preview));
  }

  window.OzoneEmbed = { view: view, _t: { classicPayload: classicPayload, containerPayload: containerPayload, problem: problem, md: md, newState: newState, importJson: function (s, t) { S = s; return importJson(t); }, isUrl: isUrl } };
})();
