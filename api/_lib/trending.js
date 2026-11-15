// « Du moment » : liste de musiques mise en avant par les administrateurs d'un serveur.
// Tout membre peut la voir, lancer un titre et l'envoyer vers une playlist ; seuls les gestionnaires
// (Administrateur / Gérer le serveur) peuvent ajouter des titres à la liste ou en retirer.
const db = require("./turso");
const session = require("./session");
const limits = require("./limits");
const { send, HttpError } = require("./http");

const DDL = [
  `CREATE TABLE IF NOT EXISTS trending_tracks (
    id INTEGER PRIMARY KEY AUTOINCREMENT, guild_id INTEGER NOT NULL, title TEXT NOT NULL, url TEXT NOT NULL,
    duration INTEGER, uploader TEXT, thumbnail TEXT, added_by INTEGER NOT NULL, added_at INTEGER NOT NULL)`,
  "CREATE INDEX IF NOT EXISTS idx_trending_guild ON trending_tracks (guild_id, id)",
];

let ready = null;
function ensure() {
  if (!ready) ready = db.transaction(DDL.map((s) => [s, []])).catch((e) => { ready = null; throw e; });
  return ready;
}

async function list(gid) {
  await ensure();
  return db.query(
    "SELECT id, title, url, duration, uploader, thumbnail, added_at FROM trending_tracks WHERE guild_id = ? ORDER BY id DESC",
    [gid]);
}

// Titre / chaîne / miniature d'un lien YouTube (oEmbed, sans clé d'API). null si introuvable.
const YT_HOST = /^(www\.|m\.|music\.)?(youtube\.com|youtu\.be)$/i;
async function lookup(url) {
  try {
    if (!YT_HOST.test(new URL(url).hostname)) return null;
    const r = await fetch("https://www.youtube.com/oembed?format=json&url=" + encodeURIComponent(url), { signal: AbortSignal.timeout(5000) });
    if (!r.ok) return null;
    const j = await r.json();
    return {
      title: String(j.title || "").replace(/\s+/g, " ").trim(),
      uploader: String(j.author_name || "").trim().slice(0, 100) || null,
      thumbnail: /^https:\/\//i.test(j.thumbnail_url || "") ? String(j.thumbnail_url).slice(0, limits.URL_MAX) : null,
    };
  } catch { return null; }
}

function cleanUrl(v) {
  const url = String(v ?? "").trim();
  let parsed;
  try { parsed = new URL(url); } catch { throw new HttpError(400, "Lien invalide"); }
  if (!/^https?:$/.test(parsed.protocol) || url.length > limits.URL_MAX) throw new HttpError(400, "Lien invalide");
  return url;
}

function id(v, msg) {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, msg);
  return n;
}

async function handle(s, b, gid, res) {
  await ensure();
  const now = Math.floor(Date.now() / 1000);

  if (b.action === "trend_add") {
    session.manageOf(s, b.guild);   // 403 pour un simple membre
    const url = cleanUrl(b.url);
    const [{ n }] = await db.query("SELECT COUNT(*) AS n FROM trending_tracks WHERE guild_id = ?", [gid]);
    if (n >= limits.MAX_TRENDING) throw new HttpError(409, `Liste pleine (${limits.MAX_TRENDING} titres max)`);
    const [dup] = await db.query("SELECT id FROM trending_tracks WHERE guild_id = ? AND url = ?", [gid, url]);
    if (dup) throw new HttpError(409, "Ce titre est déjà dans la liste");

    let title = String(b.title ?? "").replace(/\s+/g, " ").trim();
    let uploader = null, thumbnail = null;
    const meta = await lookup(url);
    if (meta) { if (!title) title = meta.title; uploader = meta.uploader; thumbnail = meta.thumbnail; }
    if (!title) throw new HttpError(400, "Ajoute un titre (il n'a pas pu être retrouvé automatiquement)");
    if (title.length > limits.TITLE_MAX) throw new HttpError(400, `Titre trop long (${limits.TITLE_MAX} max)`);

    await db.execute(
      "INSERT INTO trending_tracks (guild_id, title, url, duration, uploader, thumbnail, added_by, added_at) VALUES (?, ?, ?, NULL, ?, ?, ?, ?)",
      [gid, title, url, uploader, thumbnail, db.int(s.userId), now]);
    return send(res, 200, { ok: true });
  }

  if (b.action === "trend_remove") {
    session.manageOf(s, b.guild);
    const tid = id(b.track, "Titre invalide");
    await db.execute("DELETE FROM trending_tracks WHERE id = ? AND guild_id = ?", [tid, gid]);
    return send(res, 200, { ok: true });
  }

  if (b.action === "trend_to_playlist") {
    const tid = id(b.track, "Titre invalide");
    const pid = id(b.playlist, "Playlist invalide");
    const [t] = await db.query("SELECT title, url, duration, uploader, thumbnail FROM trending_tracks WHERE id = ? AND guild_id = ?", [tid, gid]);
    if (!t) throw new HttpError(404, "Titre introuvable");
    const [pl] = await db.query("SELECT id, name FROM playlists WHERE id = ? AND guild_id = ? AND created_by = ?", [pid, gid, db.int(s.userId)]);
    if (!pl) throw new HttpError(404, "Playlist introuvable");
    const [{ n }] = await db.query("SELECT COUNT(*) AS n FROM playlist_tracks WHERE playlist_id = ?", [pid]);
    if (n >= limits.MAX_TRACKS) throw new HttpError(409, `Playlist pleine (${limits.MAX_TRACKS} titres max)`);
    const [dup] = await db.query("SELECT id FROM playlist_tracks WHERE playlist_id = ? AND url = ?", [pid, t.url]);
    if (dup) throw new HttpError(409, `Déjà dans « ${pl.name} »`);
    // Même requête que /api/tracks : la position est calculée en base, de façon atomique.
    await db.execute(
      "INSERT INTO playlist_tracks (playlist_id, position, title, url, duration, uploader, thumbnail, added_by, added_at) " +
      "SELECT ?, COALESCE(MAX(position), 0) + 1, ?, ?, ?, ?, ?, ?, ? FROM playlist_tracks WHERE playlist_id = ?",
      [pid, t.title, t.url, t.duration, t.uploader, t.thumbnail, db.int(s.userId), now, pid]);
    return send(res, 200, { ok: true, playlist: pl.name });
  }

  throw new HttpError(400, "Action inconnue");
}

module.exports = { ensure, list, handle };
