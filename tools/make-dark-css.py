#!/usr/bin/env python3
"""Génère assets/dashboard-dark.css (mode sombre du dashboard).

Principe : on relit les feuilles « claires » (site-light.css, dashboard-light.css, embed-builder.css),
et pour chaque règle qui contient une couleur claire codée en dur, on écrit la même règle préfixée par
html[data-theme="dark"] avec l'équivalent sombre. Les règles qui utilisent déjà les variables (--card, --line…)
n'ont rien à refaire : on redéfinit simplement les variables.

Usage (depuis la racine du projet) :  python3 tools/make-dark-css.py
À relancer après toute modification des couleurs d'une de ces trois feuilles.
"""
import re, sys, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
SOURCES = ["assets/site-light.css", "assets/dashboard-light.css", "assets/embed-builder.css"]
OUT = ROOT / "assets/dashboard-dark.css"
PREFIX = 'html[data-theme="dark"]'

# Fonds, bordures, anneaux : clair -> sombre
SURFACE = {
    "#fff": "#171f1a", "#ffffff": "#171f1a",
    "#f5f7f5": "#0f1411", "#f8faf8": "#131a16", "#f4f7f5": "#141b17", "#f6f9f7": "#151d18",
    "#fafcfb": "#1a231e", "#fafcfa": "#1a231e", "#f3f6f4": "#1c2620", "#f1f5f2": "#202a24",
    "#eef2ef": "#222d26", "#e9eeea": "#27332c",
    "#e4e9e5": "#26322a", "#d3dad5": "#33423a",
    "#e8f6ee": "#143222", "#bfe3cd": "#245a3c",
    "#fff5f4": "#2c1a18", "#fff7f6": "#2c1a18", "#fdeae8": "#3a1f1c", "#f1c4c0": "#6e312c", "#e8a8a2": "#8c3f38",
    "#fffbea": "#2d2810",
}
# Textes (color, fill, stroke) : clair -> sombre ; #fff reste blanc (texte sur bouton coloré)
TEXT = {
    "#18211c": "#e6ece8", "#0e2a1c": "#e6ece8", "#3d4a43": "#c3cec7",
    "#66756c": "#93a399", "#93a099": "#6b7a71",
    "#168043": "#4cc38a", "#1f9d55": "#2fb86a", "#c0392b": "#ff7b6e", "#7a5b00": "#e8d27a",
}
DARK_INK = ("16, 40, 28", "14, 42, 28")      # rgba « encre verte » du thème clair

BG_PROPS = re.compile(r"^(background(-color|-image)?|--(bg|card|surface|line|g-soft|g-line)[\w-]*)$")
LINE_PROPS = re.compile(r"^(border[\w-]*|outline[\w-]*|column-rule[\w-]*)$")
TEXT_PROPS = re.compile(r"^(color|fill|stroke|caret-color|accent-color)$")
SHADOW_PROPS = re.compile(r"^(box-shadow|text-shadow|filter)$")

def strip_comments(css):
    return re.sub(r"/\*.*?\*/", "", css, flags=re.S)

def split_top(s, sep):
    """Découpe sur `sep` hors parenthèses / guillemets."""
    out, buf, depth, q = [], "", 0, None
    for ch in s:
        if q:
            buf += ch
            if ch == q: q = None
        elif ch in "\"'":
            q = ch; buf += ch
        elif ch == "(":
            depth += 1; buf += ch
        elif ch == ")":
            depth -= 1; buf += ch
        elif ch == sep and depth == 0:
            out.append(buf); buf = ""
        else:
            buf += ch
    if buf.strip(): out.append(buf)
    return out

def parse(css):
    """Liste de ('rule', sélecteur, déclarations) ou ('at', prélude, enfants)."""
    items, i, n = [], 0, len(css)
    while i < n:
        j = css.find("{", i)
        if j < 0: break
        prelude = css[i:j].strip()
        depth, k = 1, j + 1
        while k < n and depth:
            depth += {"{": 1, "}": -1}.get(css[k], 0); k += 1
        inner = css[j + 1:k - 1]
        if prelude.startswith("@"):
            items.append(("at", prelude, parse(inner) if prelude.startswith(("@media", "@supports")) else None))
        else:
            items.append(("rule", prelude, inner))
        i = k
    return items

def norm_hex(h):
    h = h.lower()
    return "#" + "".join(c * 2 for c in h[1:]) if len(h) == 4 else h

def convert(prop, value):
    """Valeur sombre, ou None si rien ne change."""
    new = value
    prop = prop.strip().lower()
    if prop in ("--white", "--ink", "--g", "--g-dark", "--bad"):
        return None                                  # gérés à la main (voir BASE plus bas)
    table = SURFACE if (BG_PROPS.match(prop) or LINE_PROPS.match(prop)) else TEXT if TEXT_PROPS.match(prop) else None
    if table is None and prop.startswith("--"):
        table = {**TEXT, **SURFACE}
    if table is None and SHADOW_PROPS.match(prop):
        table = {}
    if table is None:
        return None

    def hexsub(m):
        return table.get(norm_hex(m.group(0)), m.group(0))
    new = re.sub(r"#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?\b", hexsub, new)

    def rgbasub(m):
        r, g, b, a = m.group(1), m.group(2), m.group(3), float(m.group(4))
        key = f"{int(r)}, {int(g)}, {int(b)}"
        if key not in DARK_INK: return m.group(0)
        if SHADOW_PROPS.match(prop): return f"rgba(0, 0, 0, {min(.85, a * 2.5):.2f})"
        if TEXT_PROPS.match(prop): return f"rgba(255, 255, 255, {a})"
        return f"rgba(255, 255, 255, {a})"
    new = re.sub(r"rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)", rgbasub, new)
    return new if new != value else None

def dark_rule(selector, body):
    decls = []
    for d in split_top(body, ";"):
        if ":" not in d: continue
        prop, val = d.split(":", 1)
        imp = "!important" in val
        val = val.replace("!important", "").strip()
        nv = convert(prop, val)
        if nv is not None:
            decls.append(f"{prop.strip()}: {nv}{' !important' if imp else ''};")
    if not decls: return ""
    sels = []
    for s in split_top(selector, ","):
        s = s.strip()
        if s == ":root": s = PREFIX
        elif s.startswith(":root "): s = PREFIX + s[5:]
        else: s = f"{PREFIX} {s}"
        sels.append(s)
    return ",\n".join(sels) + " { " + " ".join(decls) + " }\n"

def emit(items):
    out = ""
    for kind, a, b in items:
        if kind == "rule":
            out += dark_rule(a, b)
        elif b is not None:                          # @media / @supports
            inner = emit(b)
            if inner: out += f"{a} {{\n{inner}}}\n"
    return out

BASE = """/* ==========================================================================
   Dashboard — mode sombre
   Fichier GÉNÉRÉ par tools/make-dark-css.py à partir des feuilles claires, puis complété à la main
   (section « Retouches » en bas). Activé par <html data-theme="dark"> (bouton en haut du dashboard).
   ========================================================================== */

html[data-theme="dark"] { color-scheme: dark; }
html[data-theme="dark"], html[data-theme="dark"] body, html[data-theme="dark"] body.dash-page {
  --bg: #0f1411; --bg-soft: #131a16; --card: #171f1a; --card-hover: #1a231e;
  --line: #26322a; --line-strong: #33423a;
  --text: #e6ece8; --muted: #93a399; --muted-soft: #6b7a71; --white: #f4f7f5;
  --g: #2fb86a; --g-dark: #4cc38a; --g-soft: #143222; --g-line: #245a3c; --ink: #0b1a12; --bad: #ff7b6e;
}
html[data-theme="dark"] body.dash-page { background: var(--bg); color: var(--text); }
html[data-theme="dark"] .dash-page .dash { --surface: #171f1a; --surface-2: #1c2620; }

/* ---------- Règles générées ---------- */
"""

RETOUCHES = """
/* ---------- Retouches (à la main) ---------- */
/* La variable --ink reste un vert très sombre (fond des logos, bulles) : les textes qui l'utilisaient passent en clair. */
html[data-theme="dark"] .dash-page ::selection, html[data-theme="dark"] ::selection { background: var(--g-line); color: var(--text); }
html[data-theme="dark"] .dash-brand .nm, html[data-theme="dark"] .boot-title { color: var(--text); }
html[data-theme="dark"] .dash-brand .mk, html[data-theme="dark"] .brand .mark, html[data-theme="dark"] .login-logo, html[data-theme="dark"] .boot-logo .mk {
  background: #1d3a2b; box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .08);
}
html[data-theme="dark"] .dash-toast { background: #26322a; color: var(--text); border: 1px solid var(--line-strong); }
html[data-theme="dark"] .dash-page .dash-swatch[aria-pressed="true"] { outline-color: var(--text); }
html[data-theme="dark"] .dash-page .dash-avatar, html[data-theme="dark"] .dash-top-r .dash-avatar { color: #fff; }

/* Graphiques et illustrations */
html[data-theme="dark"] .donut-track { stroke: rgba(255, 255, 255, .09); }
html[data-theme="dark"] .la-blob { fill: #1c2620; }
html[data-theme="dark"] .la-screen rect:first-child { fill: #171f1a; }
html[data-theme="dark"] .boot-fill::after { background: linear-gradient(90deg, transparent, rgba(255, 255, 255, .25), transparent); }
html[data-theme="dark"] .drawer-backdrop { background: rgba(0, 0, 0, .6); }
html[data-theme="dark"] .theme-btn:hover { background: var(--bg-soft); }
html[data-theme="dark"] ::-webkit-scrollbar-thumb { background: #33423a; }
html[data-theme="dark"] { scrollbar-color: #33423a transparent; }
"""

def main():
    body = ""
    for src in SOURCES:
        css = strip_comments((ROOT / src).read_text(encoding="utf-8"))
        part = emit(parse(css))
        body += f"/* — {src} — */\n{part}\n"
    OUT.write_text(BASE + body + RETOUCHES, encoding="utf-8")
    print(f"{OUT.relative_to(ROOT)} : {len(body.splitlines())} lignes générées")

if __name__ == "__main__":
    sys.exit(main())
