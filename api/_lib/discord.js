// Appels à l'API Discord.
const API = "https://discord.com/api/v10";

async function call(path, opts = {}) {
  const res = await fetch(API + path, { signal: AbortSignal.timeout(10000), ...opts });
  if (!res.ok) throw new Error(`Discord ${res.status} sur ${path}`);
  return res.json();
}

const bearer = (token) => ({ headers: { Authorization: `Bearer ${token}` } });

// Droits « Administrateur » (0x8) ou « Gérer le serveur » (0x20) : même règle que _is_staff du bot.
function canManage(g) {
  if (g.owner) return true;
  try { return (BigInt(g.permissions) & 0x28n) !== 0n; } catch { return false; }
}

// Serveurs où le bot est présent (facultatif : nécessite DISCORD_BOT_TOKEN). null = inconnu.
// envName : variable contenant le token du bot (DISCORD_BOT_TOKEN = Player 1, PROTECT_BOT_TOKEN = Protect).
const caches = {};
async function botGuildIds(envName = "DISCORD_BOT_TOKEN") {
  const token = (process.env[envName] || "").trim();
  if (!token) return null;
  const cache = caches[envName] || (caches[envName] = { at: 0, ids: null });
  if (cache.ids && Date.now() - cache.at < 60 * 1000) return cache.ids;   // 1 min : un bot qu'on vient d'ajouter est vite reconnu
  try {
    const ids = new Set();
    let after = "0";
    for (let i = 0; i < 10; i++) {
      const page = await call(`/users/@me/guilds?limit=200&after=${after}`, { headers: { Authorization: `Bot ${token}` } });
      page.forEach((g) => ids.add(g.id));
      if (page.length < 200) break;
      after = page[page.length - 1].id;
    }
    cache.at = Date.now(); cache.ids = ids;
    return ids;
  } catch (e) {
    console.error("[API] liste des serveurs du bot indisponible :", e.message);
    return null;
  }
}

// Le bot est-il sur ce serveur ? true / false, ou null si on ne peut pas le savoir (token absent ou Discord injoignable).
async function botIn(guildId, envName = "DISCORD_BOT_TOKEN") {
  const ids = await botGuildIds(envName);
  return ids ? ids.has(String(guildId)) : null;
}

// Rôles et salons d'un serveur, pour proposer une liste de choix dans le dashboard (au lieu de coller des identifiants).
// 1) Si le token du bot Protect est défini : lecture directe chez Discord (temps réel).
// 2) Sinon : liste publiée par le bot lui-même dans Turso (table « catalog », cogs/protect.py). Aucun token à ajouter côté site.
// null = inconnu (le dashboard retombe alors sur la saisie d'un identifiant).
const db = require("./turso");
const catalogs = new Map();

// Ordre d'affichage de Discord : salons sans catégorie, puis chaque catégorie suivie de ses salons.
function orderChannels(channels) {
  const kept = channels.filter((c) => [0, 2, 4, 5, 13, 15].includes(c.type));
  const cats = kept.filter((c) => c.type === 4).sort((a, b) => a.position - b.position);
  const name = new Map(cats.map((c) => [c.id, c.name]));
  const byPos = (a, b) => a.position - b.position;
  const out = kept.filter((c) => c.type !== 4 && !c.parent_id).sort(byPos).map((c) => ({ id: c.id, name: c.name, type: c.type, parent: null }));
  for (const cat of cats) {
    out.push({ id: cat.id, name: cat.name, type: 4, parent: null });
    kept.filter((c) => c.type !== 4 && c.parent_id === cat.id).sort(byPos)
      .forEach((c) => out.push({ id: c.id, name: c.name, type: c.type, parent: name.get(cat.id) }));
  }
  return out;
}

async function liveCatalog(guildId, envName) {
  const token = (process.env[envName] || "").trim();
  if (!token) return null;
  try {
    const opts = { headers: { Authorization: `Bot ${token}` } };
    const [roles, channels] = await Promise.all([call(`/guilds/${guildId}/roles`, opts), call(`/guilds/${guildId}/channels`, opts)]);
    return {
      // @everyone (même identifiant que le serveur) n'a pas de sens ici
      roles: roles.filter((r) => r.id !== String(guildId)).sort((a, b) => b.position - a.position)
        .map((r) => ({ id: r.id, name: r.name, color: r.color || 0 })),
      channels: orderChannels(channels),
    };
  } catch (e) {
    console.error("[API] rôles et salons indisponibles (Discord) :", e.message);
    return null;
  }
}

async function publishedCatalog(guildId) {
  try {
    const [row] = await db.query("SELECT data FROM catalog WHERE guild_id = ?", [db.int(guildId)]);
    if (!row) return null;
    const d = JSON.parse(row.data);
    return { roles: Array.isArray(d.roles) ? d.roles : [], channels: Array.isArray(d.channels) ? d.channels : [] };
  } catch (e) {
    if (!/no such table/i.test(e.message)) console.error("[API] rôles et salons indisponibles (Turso) :", e.message);
    return null;
  }
}

async function guildCatalog(guildId, envName = "PROTECT_BOT_TOKEN") {
  if (!/^\d{15,20}$/.test(String(guildId))) return null;
  const key = envName + ":" + guildId, hit = catalogs.get(key);
  if (hit && Date.now() - hit.at < 30 * 1000) return hit.data;
  const data = (await liveCatalog(guildId, envName)) || (await publishedCatalog(guildId));
  if (data) catalogs.set(key, { at: Date.now(), data });
  return data;
}

module.exports = { API, call, bearer, canManage, botGuildIds, botIn, guildCatalog };
