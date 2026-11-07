const db = require("./_lib/turso");
const session = require("./_lib/session");
const player = require("./_lib/player");
const { route, send } = require("./_lib/http");

module.exports = route(["GET"], async (req, res) => {
  const s = await session.require(req);
  const id = new URL(req.url, "http://x").searchParams.get("id");
  session.guildOf(s, id);
  await player.ensure();

  const [row] = await db.query("SELECT * FROM player_state WHERE guild_id = ?", [db.int(id)]);
  const now = Math.floor(Date.now() / 1000);
  if (!row || now - row.updated_at > player.STALE_AFTER) return send(res, 200, { active: false, now });

  let queue = [];
  try { queue = JSON.parse(row.queue); } catch { /* file illisible : on l'ignore */ }
  send(res, 200, {
    active: true,
    now,
    updated_at: row.updated_at,
    playing: !!row.playing,
    paused: !!row.paused,
    track: row.title ? { title: row.title, url: row.url, duration: row.duration, uploader: row.uploader, thumbnail: row.thumbnail } : null,
    position: row.position,
    volume: row.volume,
    loop: row.loop_mode,
    channel: row.channel,
    queue,
    queue_len: row.queue_len,
  });
});
