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

module.exports = { API, call, bearer, canManage, botGuildIds };
