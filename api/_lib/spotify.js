// Liens Spotify → liste de recherches « Artiste - Titre » que le bot sait déjà lancer (il cherche l'audio lui-même).
// Spotify ne fournit pas l'audio : on ne récupère que les noms des titres.
//  • Sans clé : un titre seul (lecture des métadonnées publiques de la page).
//  • Avec SPOTIFY_CLIENT_ID + SPOTIFY_CLIENT_SECRET (Vercel > Settings > Environment Variables) : titres, albums et playlists.
const { HttpError } = require("./http");

const MAX_TRACKS = 25;
const ID = "[A-Za-z0-9]{22}";

function parse(url) {
  let u;
  try { u = new URL(String(url).trim()); } catch { return null; }
  if (!/^(open\.)?spotify\.com$/i.test(u.hostname)) return null;
  const m = u.pathname.match(new RegExp("/(?:intl-[a-z]+/)?(track|album|playlist)/(" + ID + ")"));
  return m ? { kind: m[1], id: m[2] } : null;
}

const clean = (v) => String(v || "").replace(/\s+/g, " ").trim();
const item = (title, artist) => ({ title: clean(title), artist: clean(artist), query: clean(`${artist} - ${title}`).replace(/^- /, "") });

let token = null;   // { value, exp }
async function accessToken() {
  const id = process.env.SPOTIFY_CLIENT_ID, secret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!id || !secret) return null;
  if (token && token.exp > Date.now() + 30000) return token.value;
  const r = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { Authorization: "Basic " + Buffer.from(id + ":" + secret).toString("base64"), "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials", signal: AbortSignal.timeout(6000),
  });
  if (!r.ok) throw new HttpError(502, "Spotify a refusé les clés API");
  const j = await r.json();
  token = { value: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
  return token.value;
}

async function api(path, tok) {
  const r = await fetch("https://api.spotify.com/v1" + path, { headers: { Authorization: "Bearer " + tok }, signal: AbortSignal.timeout(8000) });
  if (r.status === 404) throw new HttpError(404, "Lien Spotify introuvable (playlist privée ?)");
  if (!r.ok) throw new HttpError(502, "Spotify ne répond pas, réessaie dans un instant");
  return r.json();
}

// Sans clé : « Titre » et « Artiste » depuis les balises og: de la page publique du titre.
function fromHtml(html) {
  const meta = (p) => { const m = html.match(new RegExp('<meta[^>]+property="' + p + '"[^>]+content="([^"]*)"', "i")) || html.match(new RegExp('<meta[^>]+content="([^"]*)"[^>]+property="' + p + '"', "i")); return m ? m[1].replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"') : ""; };
  const title = meta("og:title");
  const parts = meta("og:description").split(" · ").map(clean);   // « Artiste · Titre · Song · 2024 »
  const artist = parts.length >= 2 ? parts[0] : "";
  return title ? item(title, artist) : null;
}

async function resolve(url) {
  const p = parse(url);
  if (!p) throw new HttpError(400, "Lien Spotify invalide");
  const tok = await accessToken();

  if (!tok) {
    if (p.kind !== "track") throw new HttpError(501, "Les albums et playlists Spotify demandent des clés API (voir la documentation du dashboard)");
    const r = await fetch("https://open.spotify.com/track/" + p.id, { headers: { "User-Agent": "Mozilla/5.0 (compatible; OzoneBot)", "Accept-Language": "en" }, signal: AbortSignal.timeout(6000) }).catch(() => null);
    if (!r || !r.ok) throw new HttpError(502, "Impossible de lire ce titre Spotify");
    const t = fromHtml(await r.text());
    if (!t) throw new HttpError(404, "Titre Spotify introuvable");
    return { kind: "track", name: t.title, tracks: [t] };
  }

  if (p.kind === "track") {
    const t = await api("/tracks/" + p.id, tok);
    return { kind: "track", name: t.name, tracks: [item(t.name, (t.artists || []).map((a) => a.name)[0])] };
  }
  if (p.kind === "album") {
    const a = await api("/albums/" + p.id, tok);
    const list = ((a.tracks && a.tracks.items) || []).slice(0, MAX_TRACKS).map((t) => item(t.name, (t.artists || [])[0] && t.artists[0].name));
    return { kind: "album", name: a.name, total: (a.tracks && a.tracks.total) || list.length, tracks: list };
  }
  const pl = await api("/playlists/" + p.id + "?fields=name,tracks(total,items(track(name,artists(name))))", tok);
  const items = ((pl.tracks && pl.tracks.items) || []).map((x) => x.track).filter(Boolean).slice(0, MAX_TRACKS)
    .map((t) => item(t.name, (t.artists || [])[0] && t.artists[0].name));
  return { kind: "playlist", name: pl.name, total: (pl.tracks && pl.tracks.total) || items.length, tracks: items };
}

module.exports = { parse, resolve, fromHtml, MAX_TRACKS };
