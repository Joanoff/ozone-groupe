// Sessions du dashboard : stockées dans Turso (table dash_sessions), cookie = identifiant aléatoire.
const crypto = require("crypto");
const db = require("./turso");
const { HttpError, parseCookies } = require("./http");

const COOKIE = "ozone_session";
const TTL = 7 * 24 * 3600;
let ready = null;

function ensureSchema() {
  if (!ready) {
    ready = db.transaction([
      [`CREATE TABLE IF NOT EXISTS dash_sessions (
          id TEXT PRIMARY KEY, user_id TEXT NOT NULL, username TEXT NOT NULL, avatar TEXT,
          guilds TEXT NOT NULL, expires_at INTEGER NOT NULL)`, []],
    ]).catch((e) => { ready = null; throw e; });
  }
  return ready;
}

async function create(user, guilds) {
  await ensureSchema();
  const id = crypto.randomBytes(32).toString("hex");
  const now = Math.floor(Date.now() / 1000);
  await db.transaction([
    ["DELETE FROM dash_sessions WHERE expires_at < ?", [now]],
    ["INSERT INTO dash_sessions (id, user_id, username, avatar, guilds, expires_at) VALUES (?, ?, ?, ?, ?, ?)",
      [id, user.id, user.username, user.avatar || null, JSON.stringify(guilds), now + TTL]],
  ]);
  return id;
}

async function get(req) {
  const id = parseCookies(req)[COOKIE];
  if (!id || !/^[0-9a-f]{64}$/.test(id)) return null;
  await ensureSchema();
  const rows = await db.query("SELECT * FROM dash_sessions WHERE id = ? AND expires_at > ?",
    [id, Math.floor(Date.now() / 1000)]);
  if (!rows.length) return null;
  const r = rows[0];
  // Anciennes sessions : elles ne contenaient que des serveurs gérables.
  const guilds = JSON.parse(r.guilds).map((g) => ({ ...g, manage: g.manage !== false }));
  return { id, userId: r.user_id, username: r.username, avatar: r.avatar, guilds };
}

async function destroy(id) {
  await ensureSchema();
  await db.execute("DELETE FROM dash_sessions WHERE id = ?", [id]);
}

async function require_(req) {
  const s = await get(req);
  if (!s) throw new HttpError(401, "Non connecté");
  return s;
}

// Vérifie que le serveur demandé fait partie de ceux que l'utilisateur peut gérer.
function guildOf(session, guildId) {
  if (!/^\d{15,20}$/.test(String(guildId || ""))) throw new HttpError(400, "Serveur invalide");
  const g = session.guilds.find((x) => x.id === String(guildId));
  if (!g) throw new HttpError(403, "Tu n'es pas membre de ce serveur");
  return g;
}

// Réglages et statistiques : réservés à « Gérer le serveur » / Administrateur.
function manageOf(session, guildId) {
  const g = guildOf(session, guildId);
  if (!g.manage) throw new HttpError(403, "Réservé aux gestionnaires du serveur");
  return g;
}

module.exports = { COOKIE, TTL, create, get, destroy, require: require_, guildOf, manageOf };
