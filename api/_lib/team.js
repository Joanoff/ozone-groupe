// Équipe du serveur Discord officiel (page /teams). Tables alimentées par le bot (cogs/teams.py) : même schéma des deux côtés.
// Ici on ne fait que LIRE. Rien de privé : pseudo, photo, rôle d'équipe et statut, ce que Discord affiche déjà publiquement.
const db = require("./turso");

const DDL = [
  `CREATE TABLE IF NOT EXISTS team_members (
    user_id INTEGER PRIMARY KEY, name TEXT NOT NULL, username TEXT NOT NULL, avatar TEXT,
    role_id INTEGER NOT NULL, role_name TEXT NOT NULL, role_color INTEGER NOT NULL DEFAULT 0,
    sort INTEGER NOT NULL DEFAULT 0, status TEXT, updated_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS team_meta (
    id INTEGER PRIMARY KEY CHECK (id = 1), guild_id INTEGER NOT NULL, name TEXT NOT NULL, icon TEXT,
    members INTEGER, online INTEGER, boosts INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL)`,
];

let ready = null;
function ensure() {
  if (!ready) ready = db.transaction(DDL.map((s) => [s, []])).catch((e) => { ready = null; throw e; });
  return ready;
}

// Au-delà de ce délai sans mise à jour du bot, les statuts « en direct » ne sont plus fiables : on ne les montre plus.
const STALE_AFTER = 20 * 60;
const STATUSES = new Set(["online", "idle", "dnd", "offline"]);
const hex = (n) => (n ? "#" + Number(n).toString(16).padStart(6, "0") : null);
const cdn = (u) => (typeof u === "string" && u.startsWith("https://cdn.discordapp.com/") ? u : null);

// { guild, roles: [{ id, name, color, members: [...] }], count, stale, updated_at } — ou null s'il n'y a rien à montrer.
async function crew() {
  await ensure();
  const [rows, [meta]] = await Promise.all([
    db.query("SELECT user_id, name, username, avatar, role_id, role_name, role_color, sort, status FROM team_members ORDER BY sort, name COLLATE NOCASE", []),
    db.query("SELECT guild_id, name, icon, members, online, boosts, updated_at FROM team_meta WHERE id = 1", []),
  ]);
  if (!rows.length) return null;
  const now = Math.floor(Date.now() / 1000);
  const stale = !meta || now - meta.updated_at > STALE_AFTER;
  const roles = [];
  const byRole = new Map();
  for (const r of rows) {
    let g = byRole.get(r.role_id);
    if (!g) { g = { id: String(r.role_id), name: r.role_name, color: hex(r.role_color), members: [] }; byRole.set(r.role_id, g); roles.push(g); }
    g.members.push({
      id: String(r.user_id), name: r.name, username: r.username, avatar: cdn(r.avatar),
      status: !stale && STATUSES.has(r.status) ? r.status : null,
    });
  }
  return {
    guild: meta ? { name: meta.name, icon: cdn(meta.icon), members: meta.members, online: stale ? null : meta.online, boosts: meta.boosts } : null,
    roles, count: rows.length, stale, updated_at: meta ? meta.updated_at : null,
  };
}

module.exports = { crew };
