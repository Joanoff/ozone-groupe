// Statistiques publiques (sans connexion) : serveurs et membres par bot, plus des compteurs d'usage agrégés.
// Les tokens restent côté serveur ; seuls des chiffres sont renvoyés. Un bot dont le token n'est pas défini est simplement omis.
const discord = require("./_lib/discord");
const db = require("./_lib/turso");
const stats = require("./_lib/stats");
const { route, send } = require("./_lib/http");

// Variables d'environnement Vercel : DISCORD_BOT_TOKEN et PROTECT_BOT_TOKEN existent déjà ;
// PLAYER2_BOT_TOKEN et DEVCENTER_BOT_TOKEN sont facultatives (à ajouter pour afficher ces deux bots).
const BOTS = {
  player1: "DISCORD_BOT_TOKEN",
  player2: "PLAYER2_BOT_TOKEN",
  devcenter: "DEVCENTER_BOT_TOKEN",
  protect: "PROTECT_BOT_TOKEN",
};

let usage = { at: 0, data: null };
const SERIES_DAYS = 14;
async function usageTotals() {
  if (usage.data && Date.now() - usage.at < 10 * 60 * 1000) return usage.data;
  try {
    await stats.ensure();
    const now = Math.floor(Date.now() / 1000);
    const from = stats.dayKey(now - (SERIES_DAYS - 1) * 86400);
    const [[r], daily] = await Promise.all([
      db.query("SELECT SUM(tracks) AS tracks, SUM(commands) AS commands, SUM(voice_seconds) AS voice FROM stats_daily", []),
      db.query("SELECT day, SUM(tracks) AS tracks, SUM(commands) AS commands FROM stats_daily WHERE day >= ? GROUP BY day ORDER BY day", [from]),
    ]);
    // 14 derniers jours, les jours sans donnée valent 0 (agrégat de tous les serveurs, aucun détail par serveur).
    const byDay = new Map(daily.map((d) => [d.day, d]));
    const series = [];
    for (let i = SERIES_DAYS - 1; i >= 0; i--) {
      const day = stats.dayKey(now - i * 86400);
      const d = byDay.get(day) || {};
      series.push({ day, tracks: d.tracks || 0, commands: d.commands || 0 });
    }
    usage = { at: Date.now(), data: { tracks: r.tracks || 0, commands: r.commands || 0, voice_hours: Math.round((r.voice || 0) / 3600), series } };
  } catch (e) {
    console.error("[API] compteurs d'usage indisponibles :", e.message);
  }
  return usage.data;
}

// Développeurs : profils Discord publics (pseudo + photo). DEVELOPER_IDS = identifiants Discord séparés par des virgules,
// dans l'ordre d'affichage. Nécessite DISCORD_BOT_TOKEN (n'importe quel bot suffit pour lire un profil public).
let team = { at: 0, data: null };
async function teamProfiles() {
  const ids = (process.env.DEVELOPER_IDS || "").split(",").map((x) => x.trim()).filter((x) => /^\d{15,25}$/.test(x)).slice(0, 12);
  const token = (process.env.DISCORD_BOT_TOKEN || "").trim();
  if (!ids.length || !token) return null;
  if (team.data && Date.now() - team.at < 60 * 60 * 1000) return team.data;
  const out = await Promise.all(ids.map(async (id) => {
    try {
      const u = await discord.call(`/users/${id}`, { headers: { Authorization: `Bot ${token}` } });
      const avatar = u.avatar
        ? `https://cdn.discordapp.com/avatars/${id}/${u.avatar}.${u.avatar.startsWith("a_") ? "gif" : "png"}?size=128`
        : `https://cdn.discordapp.com/embed/avatars/${Number((BigInt(id) >> 22n) % 6n)}.png`;
      return { id, name: u.global_name || u.username, username: u.username, avatar };
    } catch (e) {
      console.error("[API] profil développeur indisponible :", e.message);
      return null;
    }
  }));
  const list = out.filter(Boolean);
  if (list.length) team = { at: Date.now(), data: list };
  return list.length ? list : team.data;
}

module.exports = route(["GET"], async (req, res) => {
  const names = Object.keys(BOTS);
  const [results, totals, devs] = await Promise.all([
    Promise.all(names.map((n) => discord.botGuildStats(BOTS[n]))),
    usageTotals(),
    teamProfiles(),
  ]);
  const bots = {};
  names.forEach((n, i) => { if (results[i]) bots[n] = results[i]; });
  const list = Object.values(bots);
  send(res, 200, {
    bots,
    total: list.length ? { servers: list.reduce((a, b) => a + b.servers, 0), members: list.reduce((a, b) => a + b.members, 0) } : null,
    usage: totals,
    team: devs,
  }, { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" });
});
