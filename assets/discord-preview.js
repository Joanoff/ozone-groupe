(function () {
  "use strict";
  var root = document.querySelector("[data-dp]"); if (!root) return;
  var reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  var T = [["Neon Skyline", "Atlas Wave", 228, 320], ["Late Night Drive", "Velvet Echo", 252, 210], ["Slow Motion Summer", "Kora", 185, 35],
           ["Paper Planes", "Mellow Tide", 177, 150], ["City Lights at 2AM", "Atlas Wave", 213, 270]];
  var LOOP = ["Désactivée", "Titre", "File"];
  var S = { order: [0, 1, 2, 3, 4], i: 0, pos: 84, paused: false, vol: 60, loop: 0 }, visible = false;
  var $ = function (r) { return root.querySelector('[data-r="' + r + '"]'); };
  var fmt = function (s) { return Math.floor(s / 60) + ":" + ("0" + (s % 60)).slice(-2); };
  var esc = function (s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;"); };
  var img = function (n) { return "/assets/discord/" + n + ".png"; };

  function render() {
    var c = T[S.order[S.i]], q = S.order.slice(S.i + 1), tot = 0;
    $("si").src = img(S.paused ? "pause" : "play"); $("st").textContent = S.paused ? "En pause" : "En lecture";
    $("t").textContent = c[0]; $("u").textContent = c[1]; $("th").style.setProperty("--h", c[3]);
    $("bar").style.width = (S.pos / c[2] * 100) + "%"; $("pos").textContent = fmt(S.pos); $("dur").textContent = fmt(c[2]);
    $("vi").src = img(S.vol <= 0 ? "volume-x" : S.vol < 50 ? "volume-1" : "volume-2"); $("vol").textContent = S.vol + "%";
    $("lp").textContent = LOOP[S.loop]; $("qn").textContent = q.length;
    $("nx").textContent = q.length ? "Prochain : " + T[q[0]][0] : "Aucun titre ensuite.";
    root.querySelector('[data-a="pause"]').disabled = S.paused; root.querySelector('[data-a="resume"]').disabled = !S.paused;
    root.querySelector('[data-a="shuffle"]').disabled = q.length < 2;
    root.querySelector('[data-a="vdown"]').disabled = S.vol <= 0; root.querySelector('[data-a="vup"]').disabled = S.vol >= 200;
    $("qc").textContent = c[0] + " " + fmt(c[2]);
    $("ql").innerHTML = q.map(function (k, n) { tot += T[k][2]; return '<div class="cv-ql"><code>' + (n + 1) + ".</code> " + esc(T[k][0]) + " <code>" + fmt(T[k][2]) + "</code></div>"; }).join("") || "La file d'attente est vide.";
    $("qf").textContent = q.length + " titre(s) · " + fmt(tot) + " au total";
  }
  function next() { S.i = (S.i + 1) % S.order.length; S.pos = 0; }
  function tab(name) {
    root.querySelectorAll(".dp-tab").forEach(function (b) { b.setAttribute("aria-selected", b.dataset.t === name); });
    root.querySelectorAll(".dc-panel").forEach(function (p) { p.classList.toggle("is-active", p.dataset.p === name); });
  }
  var act = {
    pause: function () { S.paused = true; }, resume: function () { S.paused = false; }, skip: next,
    stop: function () { S.paused = true; S.pos = 0; }, loop: function () { S.loop = (S.loop + 1) % 3; },
    vdown: function () { S.vol = Math.max(0, S.vol - 10); }, vup: function () { S.vol = Math.min(200, S.vol + 10); },
    queue: function () { tab("queue"); },
    shuffle: function () { var q = S.order.slice(S.i + 1); for (var k = q.length - 1; k > 0; k--) { var j = Math.floor(Math.random() * (k + 1)), x = q[k]; q[k] = q[j]; q[j] = x; } S.order = S.order.slice(0, S.i + 1).concat(q); }
  };
  root.addEventListener("click", function (e) {
    var t = e.target.closest(".dp-tab"); if (t) return tab(t.dataset.t);
    var b = e.target.closest("[data-a]"); if (b) { act[b.dataset.a](); render(); }
  });
  setInterval(function () {
    if (!visible || S.paused || reduce || document.hidden) return;
    S.pos++; if (S.pos >= T[S.order[S.i]][2]) { if (S.loop === 1) S.pos = 0; else next(); } render();
  }, 1000);
  if ("IntersectionObserver" in window) new IntersectionObserver(function (en) { visible = en[0].isIntersecting; }).observe(root); else visible = true;
  render();
})();
