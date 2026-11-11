// Tables partagées avec les bots (cogs/dashboard_bridge.py) : même schéma des deux côtés.
// Chaque ligne porte le `bot_id` du bot concerné (Player 1, Player 2…).
const db = require("./turso");

const P1 = "1565321668660953139", P2 = "1565374947805892608";

// Bots musique pilotables depuis le dashboard. `env` = variable Vercel contenant le token du bot (facultative :
// elle ne sert qu'à savoir si le bot est présent sur un serveur ; sans elle, on laisse faire).
const BOTS = {
  [P1]: { id: P1, name: "Player 1", env: "DISCORD_BOT_TOKEN" },
  [P2]: { id: P2, name: "Player 2", env: "PLAYER2_BOT_TOKEN" },
};

const DDL = [
  `CREATE TABLE IF NOT EXISTS player_state (
    guild_id INTEGER NOT NULL, bot_id INTEGER NOT NULL, updated_at INTEGER NOT NULL, playing INTEGER NOT NULL, paused INTEGER NOT NULL,
    title TEXT, url TEXT, duration INTEGER, uploader TEXT, thumbnail TEXT, position REAL NOT NULL DEFAULT 0,
    volume INTEGER NOT NULL, loop_mode TEXT NOT NULL DEFAULT 'off', channel TEXT, queue TEXT NOT NULL DEFAULT '[]',
    queue_len INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (guild_id, bot_id))`,
  `CREATE TABLE IF NOT EXISTS player_commands (
    id INTEGER PRIMARY KEY AUTOINCREMENT, guild_id INTEGER NOT NULL, bot_id INTEGER NOT NULL DEFAULT 0, user_id INTEGER NOT NULL,
    action TEXT NOT NULL, arg TEXT, created_at INTEGER NOT NULL, done_at INTEGER, result TEXT)`,
  "CREATE INDEX IF NOT EXISTS idx_cmd_pending ON player_commands (done_at, id)",
];

// Ancien schéma (un seul bot) -> schéma avec bot_id. Idempotent ; le bot fait la même chose au démarrage.
async function migrate() {
  const cols = async (t) => (await db.query(`PRAGMA table_info(${t})`)).map((r) => r.name);
  const state = await cols("player_state");
  if (state.length && !state.includes("bot_id")) await db.execute("DROP TABLE player_state");   // état éphémère
  const cmds = await cols("player_commands");
  if (cmds.length && !cmds.includes("bot_id")) {
    try { await db.execute("ALTER TABLE player_commands ADD COLUMN bot_id INTEGER NOT NULL DEFAULT 0"); }
    catch (e) { if (!/duplicate column/i.test(e.message)) throw e; }
  }
}

let ready = null;
function ensure() {
  if (!ready) ready = migrate().then(() => db.transaction(DDL.map((s) => [s, []]))).catch((e) => { ready = null; throw e; });
  return ready;
}

module.exports = { ensure, BOTS, DEFAULT_BOT: P1, STALE_AFTER: 45 }; // un état plus vieux que 45 s = bot hors ligne / lecteur arrêté
