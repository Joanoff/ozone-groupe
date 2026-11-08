const db = require("./_lib/turso");
const session = require("./_lib/session");
const limits = require("./_lib/limits");
const player = require("./_lib/player");
const discord = require("./_lib/discord");
const { route, send, body, HttpError } = require("./_lib/http");

const PLAYER_ACTIONS = new Set(["pause", "resume", "skip", "stop", "shuffle", "volume", "loop", "remove", "move", "clear"]);
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

async function ownPlaylist(gid, id, userId) {
  const pid = Number(id);
  if (!Number.isInteger(pid) || pid <= 0) throw new HttpError(400, "Playlist invalide");
  const [pl] = await db.query("SELECT id FROM playlists WHERE id = ? AND guild_id = ? AND created_by = ?", [pid, gid, db.int(userId)]);
  if (!pl) throw new HttpError(404, "Playlist introuvable");
  return pid;
}

module.exports = route(["POST"], async (req, res) => {
  const s = await session.require(req);
  const b = body(req);
  session.guildOf(s, b.guild);
  // Quel bot piloter ? (Player 1 par défaut, comme avant l'arrivée de Player 2)
  const botId = b.bot == null ? player.DEFAULT_BOT : String(b.bot);
  const bot = player.BOTS[botId];
  if (!bot) throw new HttpError(400, "Bot inconnu");
  const isPlayer = PLAYER_ACTIONS.has(b.action);
  if (!isPlayer && !LAUNCH_ACTIONS.has(b.action)) throw new HttpError(400, "Action inconnue");

  // Bot absent du serveur : inutile d'empiler des ordres que personne ne lira (null = on ne sait pas : on laisse faire).
  if ((await discord.botIn(b.guild, bot.env)) === false) throw new HttpError(409, `${bot.name} n'est pas sur ce serveur`);
  await player.ensure();
  const gid = db.int(b.guild), bid = db.int(botId);
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
    case "move": {
      // Déplace un titre de la file : arg = { from, to }, positions de 1 à 1000 (comme « remove »)
      const f = b.arg && b.arg.from, t = b.arg && b.arg.to;
      if (![f, t].every((x) => Number.isInteger(x) && x >= 1 && x <= 1000) || f === t) throw new HttpError(400, "Positions invalides");
      arg = JSON.stringify({ from: f, to: t }); break;
    }
    case "play":
      arg = cleanQuery(b.arg); break;
    case "playlist_play":
      arg = JSON.stringify({ id: await ownPlaylist(gid, b.playlist, s.userId), shuffle: b.shuffle === true }); break;
    case "pl_add": {
      const pid = await ownPlaylist(gid, b.playlist, s.userId);
      const [{ n }] = await db.query("SELECT COUNT(*) AS n FROM playlist_tracks WHERE playlist_id = ?", [pid]);
      if (n >= limits.MAX_TRACKS) throw new HttpError(409, `Playlist pleine (${limits.MAX_TRACKS} titres max)`);
      arg = JSON.stringify({ id: pid, query: cleanQuery(b.query) }); break;
    }
  }

  // Piloter le lecteur n'a de sens que s'il est actif ; lancer une musique, si.
  if (isPlayer) {
    const [st] = await db.query("SELECT updated_at FROM player_state WHERE guild_id = ? AND bot_id = ?", [gid, bid]);
    if (!st || now - st.updated_at > player.STALE_AFTER) throw new HttpError(409, `${bot.name} ne joue rien sur ce serveur`);
  }

  // Anti-spam : pas plus de 5 ordres en attente par serveur et par bot.
  const [{ n }] = await db.query(
    "SELECT COUNT(*) AS n FROM player_commands WHERE guild_id = ? AND bot_id = ? AND (done_at IS NULL OR result = 'running') AND created_at > ?",
    [gid, bid, now - 60]);
  if (n >= 5) throw new HttpError(429, "Trop d'ordres en attente, patiente un instant");

  const r = await db.execute(
    "INSERT INTO player_commands (guild_id, bot_id, user_id, action, arg, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    [gid, bid, db.int(s.userId), b.action, arg, now]);

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
