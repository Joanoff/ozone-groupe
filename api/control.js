const db = require("./_lib/turso");
const session = require("./_lib/session");
const limits = require("./_lib/limits");
const player = require("./_lib/player");
const { route, send, body, HttpError } = require("./_lib/http");

const PLAYER_ACTIONS = new Set(["pause", "resume", "skip", "stop", "shuffle", "volume", "loop", "remove", "clear"]);
const LAUNCH_ACTIONS = new Set(["play", "playlist_play", "pl_add"]);
const LOOPS = new Set(["off", "track", "queue"]);
const WAIT_MS = 5000;   // au-delà, on répond « en cours » et le navigateur suit l'ordre via /api/command

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function cleanQuery(v) {
  const q = String(v ?? "").replace(/\s+/g, " ").trim();
  if (!q) throw new HttpError(400, "Saisis un lien ou une recherche");
  if (q.length > limits.QUERY_MAX) throw new HttpError(400, `Recherche trop longue (${limits.QUERY_MAX} caractères max)`);
  return q;
}

async function ownPlaylist(gid, id) {
  const pid = Number(id);
  if (!Number.isInteger(pid) || pid <= 0) throw new HttpError(400, "Playlist invalide");
  const [pl] = await db.query("SELECT id FROM playlists WHERE id = ? AND guild_id = ?", [pid, gid]);
  if (!pl) throw new HttpError(404, "Playlist introuvable");
  return pid;
}

module.exports = route(["POST"], async (req, res) => {
  const s = await session.require(req);
  const b = body(req);
  session.guildOf(s, b.guild);
  const isPlayer = PLAYER_ACTIONS.has(b.action);
  if (!isPlayer && !LAUNCH_ACTIONS.has(b.action)) throw new HttpError(400, "Action inconnue");

  await player.ensure();
  const gid = db.int(b.guild);
  const now = Math.floor(Date.now() / 1000);

  // Validation de l'argument selon l'action
  let arg = null;
  switch (b.action) {
    case "volume":
      if (!Number.isInteger(b.arg) || b.arg < 0 || b.arg > limits.MAX_VOLUME)
        throw new HttpError(400, `Volume entre 0 et ${limits.MAX_VOLUME}`);
      arg = String(b.arg); break;
    case "loop":
      if (!LOOPS.has(b.arg)) throw new HttpError(400, "Mode de répétition invalide");
      arg = b.arg; break;
    case "remove":
      if (!Number.isInteger(b.arg) || b.arg < 1 || b.arg > 1000) throw new HttpError(400, "Position invalide");
      arg = String(b.arg); break;
    case "play":
      arg = cleanQuery(b.arg); break;
    case "playlist_play":
      arg = JSON.stringify({ id: await ownPlaylist(gid, b.playlist), shuffle: b.shuffle === true }); break;
    case "pl_add": {
      const pid = await ownPlaylist(gid, b.playlist);
      const [{ n }] = await db.query("SELECT COUNT(*) AS n FROM playlist_tracks WHERE playlist_id = ?", [pid]);
      if (n >= limits.MAX_TRACKS) throw new HttpError(409, `Playlist pleine (${limits.MAX_TRACKS} titres max)`);
      arg = JSON.stringify({ id: pid, query: cleanQuery(b.query) }); break;
    }
  }

  // Piloter le lecteur n'a de sens que s'il est actif ; lancer une musique, si.
  if (isPlayer) {
    const [st] = await db.query("SELECT updated_at FROM player_state WHERE guild_id = ?", [gid]);
    if (!st || now - st.updated_at > player.STALE_AFTER) throw new HttpError(409, "Player 1 ne joue rien sur ce serveur");
  }

  // Anti-spam : pas plus de 5 ordres en attente par serveur.
  const [{ n }] = await db.query(
    "SELECT COUNT(*) AS n FROM player_commands WHERE guild_id = ? AND (done_at IS NULL OR result = 'running') AND created_at > ?",
    [gid, now - 60]);
  if (n >= 5) throw new HttpError(429, "Trop d'ordres en attente, patiente un instant");

  const r = await db.execute(
    "INSERT INTO player_commands (guild_id, user_id, action, arg, created_at) VALUES (?, ?, ?, ?, ?)",
    [gid, db.int(s.userId), b.action, arg, now]);

  // On attend un court instant le résultat ; sinon le navigateur le suit via /api/command.
  const deadline = Date.now() + WAIT_MS;
  while (Date.now() < deadline) {
    await sleep(500);
    const [c] = await db.query("SELECT result FROM player_commands WHERE id = ?", [r.lastId]);
    if (c && c.result && c.result !== "running") return finish(res, c.result);
  }
  send(res, 202, { pending: true, id: r.lastId });
});

// Résultat du bot : « ok », « ok:message » ou la raison du refus.
function finish(res, result) {
  if (result === "ok" || result.startsWith("ok:")) return send(res, 200, { ok: true, message: result.slice(3) });
  throw new HttpError(409, result);
}
