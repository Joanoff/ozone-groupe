const db = require("./_lib/turso");
const session = require("./_lib/session");
const player = require("./_lib/player");
const { route, send } = require("./_lib/http");

// État d'un lecteur (une ligne de player_state), tel que le dashboard l'affiche.
function parse(bot, row, now) {
  if (!row || now - row.updated_at > player.STALE_AFTER) return { bot, active: false, now };

  let queue = [];
  try { queue = JSON.parse(row.queue); } catch { /* file illisible : on l'ignore */ }
  return {
    bot,
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
  };
}

// État de tous les lecteurs du serveur (Player 1, Player 2…) : une seule requête.
async function snapshot(gid) {
  const rows = await db.query("SELECT * FROM player_state WHERE guild_id = ?", [gid]);
  const now = Math.floor(Date.now() / 1000);
  const byBot = new Map(rows.map((r) => [String(r.bot_id), r]));
  return { now, players: Object.keys(player.BOTS).map((id) => parse(id, byBot.get(id), now)) };
}

// Ce qui compte comme un « vrai » changement. La position et l'horloge bougent en continu :
// le navigateur les recalcule lui-même, on ne les pousse que lors d'une resynchronisation.
function signature(snap) {
  return JSON.stringify(snap.players.map((st) => {
    if (!st.active) return [st.bot, "idle"];
    const t = st.track || {};
    return [st.bot, st.playing, st.paused, t.url, t.title, st.volume, st.loop, st.channel, st.queue_len,
      st.queue.map((q) => [q.url, q.title])];
  }));
}

// Flux d'évènements (SSE) : GET /api/player?id=…&stream=1
// Une fonction Vercel ne vit que quelques dizaines de secondes : on referme proprement avant la limite,
// et le navigateur (EventSource) se reconnecte tout seul au bout d'une seconde.
const STREAM_MS = 50_000;   // durée d'une connexion (maxDuration = 60 s dans vercel.json)
const TICK_MS = 2_000;      // fréquence de lecture en base côté serveur
const RESYNC_MS = 10_000;   // renvoi de l'état même sans changement (recale la barre de progression)
const BEAT_MS = 15_000;     // commentaire de maintien de connexion
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function stream(req, res, gid) {
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  if (typeof res.flushHeaders === "function") res.flushHeaders();
  res.write("retry: 1000\n\n");

  let closed = false;
  req.on("close", () => { closed = true; });

  const stop = Date.now() + STREAM_MS;
  let lastSig = null, lastSent = 0, lastWrite = Date.now();
  try {
    while (!closed && Date.now() < stop) {
      const st = await snapshot(gid);
      const sig = signature(st);
      const t = Date.now();
      if (sig !== lastSig || t - lastSent >= RESYNC_MS) {
        res.write(`data: ${JSON.stringify(st)}\n\n`);
        lastSig = sig; lastSent = lastWrite = t;
      } else if (t - lastWrite >= BEAT_MS) {
        res.write(": ping\n\n");
        lastWrite = t;
      }
      await sleep(TICK_MS);
    }
  } catch (e) {
    console.error("[API] flux du lecteur interrompu :", e.message);
  }
  res.end();
}

module.exports = route(["GET"], async (req, res) => {
  const s = await session.require(req);
  const q = new URL(req.url, "http://x").searchParams;
  const id = q.get("id");
  session.guildOf(s, id);
  await player.ensure();

  if (q.get("stream") === "1") return stream(req, res, db.int(id));
  send(res, 200, await snapshot(db.int(id)));
});
