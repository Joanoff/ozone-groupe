const db = require("./_lib/turso");
const session = require("./_lib/session");
const limits = require("./_lib/limits");
const trending = require("./_lib/trending");
const { route, send } = require("./_lib/http");

module.exports = route(["GET"], async (req, res) => {
  const s = await session.require(req);
  const id = new URL(req.url, "http://x").searchParams.get("id");
  session.guildOf(s, id);

  const [settings] = await db.query("SELECT volume, bar_color, bar_color2 FROM guild_settings WHERE guild_id = ?", [db.int(id)]);
  const playlists = await db.query(
    "SELECT id, name, created_by, created_at FROM playlists WHERE guild_id = ? ORDER BY name COLLATE NOCASE", [db.int(id)]);

  const byId = new Map(playlists.map((p) => [p.id, { ...p, tracks: [] }]));
  if (byId.size) {
    const ids = [...byId.keys()];
    const tracks = await db.query(
      `SELECT id, playlist_id, position, title, url, duration, uploader FROM playlist_tracks
       WHERE playlist_id IN (${ids.map(() => "?").join(",")}) ORDER BY playlist_id, position`, ids);
    for (const t of tracks) byId.get(t.playlist_id)?.tracks.push(t);
  }

  // Si la table « Du moment » est indisponible, le reste du dashboard continue de fonctionner.
  let moment = [];
  try { moment = await trending.list(db.int(id)); } catch (e) { console.error("[API] « Du moment » indisponible :", e.message); }

  send(res, 200, {
    settings: {
      volume: settings ? settings.volume : limits.DEFAULT_VOLUME,
      bar_color: settings ? settings.bar_color : null,
      bar_color2: settings ? settings.bar_color2 : null,
    },
    playlists: [...byId.values()],
    trending: moment,
    limits,
  });
});
