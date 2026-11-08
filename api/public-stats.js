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
async function usageTotals() {
  if (usage.data && Date.now() - usage.at < 10 * 60 * 1000) return usage.data;
  try {
    await stats.ensure();
    const [r] = await db.query("SELECT SUM(tracks) AS tracks, SUM(commands) AS commands, SUM(voice_seconds) AS voice FROM stats_daily", []);
    usage = { at: Date.now(), data: { tracks: r.tracks || 0, commands: r.commands || 0, voice_hours: Math.round((r.voice || 0) / 3600) } };
  } catch (e) {
    console.error("[API] compteurs d'usage indisponibles :", e.message);
  }
  return usage.data;
}

module.exports = route(["GET"], async (req, res) => {
  const names = Object.keys(BOTS);
  const [results, totals] = await Promise.all([
    Promise.all(names.map((n) => discord.botGuildStats(BOTS[n]))),
    usageTotals(),
  ]);
  const bots = {};
  names.forEach((n, i) => { if (results[i]) bots[n] = results[i]; });
  const list = Object.values(bots);
  send(res, 200, {
    bots,
    total: list.length ? { servers: list.reduce((a, b) => a + b.servers, 0), members: list.reduce((a, b) => a + b.members, 0) } : null,
    usage: totals,
  }, { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" });
});
