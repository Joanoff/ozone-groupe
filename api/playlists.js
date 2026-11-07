const db = require("./_lib/turso");
const session = require("./_lib/session");
const limits = require("./_lib/limits");
const { route, send, body, HttpError } = require("./_lib/http");

function cleanName(v) {
  const name = String(v ?? "").replace(/\s+/g, " ").trim();
  if (!name) throw new HttpError(400, "Le nom est vide");
  if (name.length > limits.NAME_MAX) throw new HttpError(400, `Nom trop long (${limits.NAME_MAX} caractères max)`);
  return name;
}

module.exports = route(["POST"], async (req, res) => {
  const s = await session.require(req);
  const b = body(req);
  session.guildOf(s, b.guild);
  const gid = db.int(b.guild);

  if (b.action === "create") {
    const name = cleanName(b.name);
    const [{ n }] = await db.query("SELECT COUNT(*) AS n FROM playlists WHERE guild_id = ?", [gid]);
    if (n >= limits.MAX_PLAYLISTS) throw new HttpError(409, `Limite atteinte (${limits.MAX_PLAYLISTS} playlists)`);
    try {
      const r = await db.execute(
        "INSERT INTO playlists (guild_id, name, created_by, created_at) VALUES (?, ?, ?, ?)",
        [gid, name, db.int(s.userId), Math.floor(Date.now() / 1000)]);
      return send(res, 200, { ok: true, id: r.lastId });
    } catch (e) {
      if (e instanceof db.DBIntegrityError) throw new HttpError(409, "Une playlist porte déjà ce nom");
      throw e;
    }
  }

  // Les autres actions visent une playlist précise, qui doit appartenir à ce serveur.
  const pid = Number(b.id);
  if (!Number.isInteger(pid) || pid <= 0) throw new HttpError(400, "Playlist invalide");
  const [pl] = await db.query("SELECT id FROM playlists WHERE id = ? AND guild_id = ?", [pid, gid]);
  if (!pl) throw new HttpError(404, "Playlist introuvable");

  if (b.action === "rename") {
    const name = cleanName(b.name);
    try {
      await db.execute("UPDATE playlists SET name = ? WHERE id = ? AND guild_id = ?", [name, pid, gid]);
    } catch (e) {
      if (e instanceof db.DBIntegrityError) throw new HttpError(409, "Une playlist porte déjà ce nom");
      throw e;
    }
    return send(res, 200, { ok: true });
  }
  if (b.action === "delete") {
    await db.transaction([
      ["DELETE FROM playlist_tracks WHERE playlist_id = ?", [pid]],
      ["DELETE FROM playlists WHERE id = ? AND guild_id = ?", [pid, gid]],
    ]);
    return send(res, 200, { ok: true });
  }
  if (b.action === "clear") {
    await db.execute("DELETE FROM playlist_tracks WHERE playlist_id = ?", [pid]);
    return send(res, 200, { ok: true });
  }
  throw new HttpError(400, "Action inconnue");
});
