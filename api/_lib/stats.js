// Tables de statistiques alimentées par le bot (cogs/stats.py) : même schéma des deux côtés.
// Ici on ne fait que LIRE des compteurs agrégés (aucun contenu de message n'est stocké).
const db = require("./turso");
const discord = require("./discord");

const DDL = [
  `CREATE TABLE IF NOT EXISTS stats_daily (
    guild_id INTEGER NOT NULL, day TEXT NOT NULL, messages INTEGER NOT NULL DEFAULT 0, joins INTEGER NOT NULL DEFAULT 0,
    leaves INTEGER NOT NULL DEFAULT 0, voice_seconds INTEGER NOT NULL DEFAULT 0, tracks INTEGER NOT NULL DEFAULT 0,
    commands INTEGER NOT NULL DEFAULT 0, members INTEGER, PRIMARY KEY (guild_id, day))`,
  `CREATE TABLE IF NOT EXISTS stats_hourly (
    guild_id INTEGER NOT NULL, hour INTEGER NOT NULL, messages INTEGER NOT NULL DEFAULT 0, voice INTEGER,
    latency INTEGER, updated_at INTEGER NOT NULL, PRIMARY KEY (guild_id, hour))`,
];

let ready = null;
function ensure() {
  if (!ready) ready = db.transaction(DDL.map((s) => [s, []])).catch((e) => { ready = null; throw e; });
  return ready;
}

const dayKey = (ts) => new Date(ts * 1000).toISOString().slice(0, 10);

// Compteurs « en direct » (membres, en ligne) lus chez Discord. Cache court et borné : pas de fuite mémoire.
const LIVE_TTL = 60 * 1000;
const LIVE_MAX = 50;
const liveCache = new Map();

async function live(guildId) {
  const token = (process.env.DISCORD_BOT_TOKEN || "").trim();
  if (!token) return null;
  const hit = liveCache.get(guildId);
  if (hit && Date.now() - hit.at < LIVE_TTL) return hit.data;
  try {
    const g = await discord.call(`/guilds/${guildId}?with_counts=true`, { headers: { Authorization: `Bot ${token}` } });
    const data = {
      members: g.approximate_member_count ?? null,
      online: g.approximate_presence_count ?? null,
      boosts: g.premium_subscription_count ?? 0,
      tier: g.premium_tier ?? 0,
    };
    if (liveCache.size >= LIVE_MAX) liveCache.delete(liveCache.keys().next().value);
    liveCache.set(guildId, { at: Date.now(), data });
    return data;
  } catch (e) {
    console.error("[API] compteurs en direct indisponibles :", e.message);
    return null;
  }
}

module.exports = { ensure, dayKey, live };
