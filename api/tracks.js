const db = require("./_lib/turso");
const session = require("./_lib/session");
const limits = require("./_lib/limits");
const { route, send, body, HttpError } = require("./_lib/http");

module.exports = route(["POST"], async (req, res) => {
  const s = await session.require(req);
  const b = body(req);
  session.guildOf(s, b.guild);

  const pid = Number(b.playlist);
  if (!Number.isInteger(pid) || pid <= 0) throw new HttpError(400, "Playlist invalide");
  const [pl] = await db.query("SELECT id FROM playlists WHERE id = ? AND guild_id = ? AND created_by = ?", [pid, db.int(b.guild), db.int(s.userId)]);
  if (!pl) throw new HttpError(404, "Playlist introuvable");

  if (b.action === "add") {
    const title = String(b.title ?? "").replace(/\s+/g, " ").trim();
    const url = String(b.url ?? "").trim();
    if (!title) throw new HttpError(400, "Le titre est vide");
    if (title.length > limits.TITLE_MAX) throw new HttpError(400, `Titre trop long (${limits.TITLE_MAX} max)`);
    let parsed;
    try { parsed = new URL(url); } catch { throw new HttpError(400, "Lien invalide"); }
    if (!/^https?:$/.test(parsed.protocol) || url.length > limits.URL_MAX) throw new HttpError(400, "Lien invalide");
    let duration = null;
    if (b.duration !== undefined && b.duration !== null && b.duration !== "") {
      duration = Number(b.duration);
      if (!Number.isInteger(duration) || duration < 0 || duration > 86400) throw new HttpError(400, "Durée invalide");
    }
    const [{ n }] = await db.query("SELECT COUNT(*) AS n FROM playlist_tracks WHERE playlist_id = ?", [pid]);
    if (n >= limits.MAX_TRACKS) throw new HttpError(409, `Playlist pleine (${limits.MAX_TRACKS} titres max)`);
    // Même requête que le bot : la position est calculée en base, de façon atomique.
    await db.execute(
      "INSERT INTO playlist_tracks (playlist_id, position, title, url, duration, uploader, thumbnail, added_by, added_at) " +
      "SELECT ?, COALESCE(MAX(position), 0) + 1, ?, ?, ?, NULL, NULL, ?, ? FROM playlist_tracks WHERE playlist_id = ?",
      [pid, title, url, duration, db.int(s.userId), Math.floor(Date.now() / 1000), pid]);
    return send(res, 200, { ok: true });
  }

  if (b.action === "remove") {
    const tid = Number(b.track);
    if (!Number.isInteger(tid) || tid <= 0) throw new HttpError(400, "Titre invalide");
    await db.transaction([
      ["DELETE FROM playlist_tracks WHERE id = ? AND playlist_id = ?", [tid, pid]],
      ["UPDATE playlist_tracks SET position = (SELECT COUNT(*) FROM playlist_tracks t2 " +
       "WHERE t2.playlist_id = playlist_tracks.playlist_id AND t2.position <= playlist_tracks.position) " +
       "WHERE playlist_id = ?", [pid]],
    ]);
    return send(res, 200, { ok: true });
  }
  if (b.action === "move") {
    const tid = Number(b.track);
    if (!Number.isInteger(tid) || tid <= 0) throw new HttpError(400, "Titre invalide");
    if (b.direction !== "up" && b.direction !== "down") throw new HttpError(400, "Direction invalide");
    const [cur] = await db.query("SELECT id, position FROM playlist_tracks WHERE id = ? AND playlist_id = ?", [tid, pid]);
    if (!cur) throw new HttpError(404, "Titre introuvable");
    const up = b.direction === "up";
    const [nb] = await db.query(
      `SELECT id, position FROM playlist_tracks WHERE playlist_id = ? AND position ${up ? "<" : ">"} ?
       ORDER BY position ${up ? "DESC" : "ASC"} LIMIT 1`, [pid, cur.position]);
    if (!nb) return send(res, 200, { ok: true });   // déjà en première / dernière position
    // Échange des deux positions en une seule transaction.
    await db.transaction([
      ["UPDATE playlist_tracks SET position = ? WHERE id = ? AND playlist_id = ?", [nb.position, cur.id, pid]],
      ["UPDATE playlist_tracks SET position = ? WHERE id = ? AND playlist_id = ?", [cur.position, nb.id, pid]],
    ]);
    return send(res, 200, { ok: true });
  }
  throw new HttpError(400, "Action inconnue");
});
