const session = require("./_lib/session");
const discord = require("./_lib/discord");
const { route, send } = require("./_lib/http");

module.exports = route(["GET"], async (req, res) => {
  // ?soft=1 : visiteur non connecté → 200 {guest:true} (évite une erreur 401 dans la console du navigateur)
  if (/(^|[?&])soft=1(&|$)/.test(req.url || "") && !(await session.get(req))) return send(res, 200, { guest: true });
  const s = await session.require(req);
  const [present, prot, p2] = await Promise.all([discord.botGuildIds(), discord.botGuildIds("PROTECT_BOT_TOKEN"), discord.botGuildIds("PLAYER2_BOT_TOKEN")]);
  send(res, 200, {
    user: { id: s.userId, username: s.username, avatar: s.avatar },
    // Un membre simple ne voit que les serveurs où Player 1 (ou Player 2) est présent ; un gestionnaire voit aussi les autres (pour l'ajouter).
    guilds: s.guilds.map((g) => ({ ...g, bot: present ? present.has(g.id) : null, protect: prot ? prot.has(g.id) : null, p2: p2 ? p2.has(g.id) : null }))
      .filter((g) => g.manage || g.bot !== false || g.protect === true || g.p2 === true),
  });
});
