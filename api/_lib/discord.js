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
  if (cache.ids && Date.now() - cache.at < 5 * 60 * 1000) return cache.ids;
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

// Rôles et salons d'un serveur (facultatif : nécessite le token du bot Protect). null = inconnu.
// Sert à proposer une liste de choix dans le dashboard ; sans token, on saisit l'identifiant à la main.
const catalogs = new Map();
async function guildCatalog(guildId, envName = "PROTECT_BOT_TOKEN") {
  const token = (process.env[envName] || "").trim();
  if (!token || !/^\d{15,20}$/.test(String(guildId))) return null;
  const key = envName + ":" + guildId, hit = catalogs.get(key);
  if (hit && Date.now() - hit.at < 60 * 1000) return hit.data;
  try {
    const opts = { headers: { Authorization: `Bot ${token}` } };
    const [roles, channels] = await Promise.all([call(`/guilds/${guildId}/roles`, opts), call(`/guilds/${guildId}/channels`, opts)]);
    const data = {
      // @everyone (même identifiant que le serveur) n'a pas de sens ici
      roles: roles.filter((r) => r.id !== String(guildId)).sort((a, b) => b.position - a.position)
        .map((r) => ({ id: r.id, name: r.name, color: r.color || 0 })),
      // texte, vocal, catégorie, annonces, conférence, forum
      channels: channels.filter((c) => [0, 2, 4, 5, 13, 15].includes(c.type)).sort((a, b) => a.position - b.position)
        .map((c) => ({ id: c.id, name: c.name, type: c.type })),
    };
    catalogs.set(key, { at: Date.now(), data });
    return data;
  } catch (e) {
    console.error("[API] rôles et salons indisponibles :", e.message);
    return null;
  }
}

module.exports = { API, call, bearer, canManage, botGuildIds, guildCatalog };
