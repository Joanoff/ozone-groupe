// Tables partagées avec le bot (cogs/dashboard_bridge.py) : même schéma des deux côtés.
const db = require("./turso");

const DDL = [
  `CREATE TABLE IF NOT EXISTS player_state (
    guild_id INTEGER PRIMARY KEY, updated_at INTEGER NOT NULL, playing INTEGER NOT NULL, paused INTEGER NOT NULL,
    title TEXT, url TEXT, duration INTEGER, uploader TEXT, thumbnail TEXT, position REAL NOT NULL DEFAULT 0,
    volume INTEGER NOT NULL, loop_mode TEXT NOT NULL DEFAULT 'off', channel TEXT, queue TEXT NOT NULL DEFAULT '[]',
    queue_len INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS player_commands (
    id INTEGER PRIMARY KEY AUTOINCREMENT, guild_id INTEGER NOT NULL, user_id INTEGER NOT NULL, action TEXT NOT NULL,
    arg TEXT, created_at INTEGER NOT NULL, done_at INTEGER, result TEXT)`,
  "CREATE INDEX IF NOT EXISTS idx_cmd_pending ON player_commands (done_at, id)",
];

let ready = null;
function ensure() {
  if (!ready) ready = db.transaction(DDL.map((s) => [s, []])).catch((e) => { ready = null; throw e; });
  return ready;
}

module.exports = { ensure, STALE_AFTER: 45 }; // un état plus vieux que 45 s = bot hors ligne / lecteur arrêté
