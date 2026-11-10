const db = require("./_lib/turso");
const session = require("./_lib/session");
const player = require("./_lib/player");
const { route, send, HttpError } = require("./_lib/http");

// Suivi d'un ordre envoyé au bot (recherches lentes) : GET /api/command?guild=…&id=…
module.exports = route(["GET"], async (req, res) => {
  const s = await session.require(req);
  const q = new URL(req.url, "http://x").searchParams;
  session.guildOf(s, q.get("guild"));
  const id = Number(q.get("id"));
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, "Ordre invalide");
  await player.ensure();

  const [c] = await db.query("SELECT result, created_at FROM player_commands WHERE id = ? AND guild_id = ?",
    [id, db.int(q.get("guild"))]);
  if (!c) throw new HttpError(404, "Ordre introuvable");
  const now = Math.floor(Date.now() / 1000);
  if (!c.result || c.result === "running") {
    if (now - c.created_at > 90) return send(res, 200, { done: true, ok: false, message: "Le bot n'a pas répondu à temps" });
    return send(res, 200, { done: false });
  }
  const ok = c.result === "ok" || c.result.startsWith("ok:");
  send(res, 200, { done: true, ok, message: ok ? c.result.slice(3) : c.result });
});
