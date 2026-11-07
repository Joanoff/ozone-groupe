const session = require("./_lib/session");
const discord = require("./_lib/discord");
const { route, send } = require("./_lib/http");

module.exports = route(["GET"], async (req, res) => {
  const s = await session.require(req);
  const present = await discord.botGuildIds();
  send(res, 200, {
    user: { id: s.userId, username: s.username, avatar: s.avatar },
    // Un membre simple ne voit que les serveurs où Player 1 est présent ; un gestionnaire voit aussi les autres (pour l'ajouter).
    guilds: s.guilds.map((g) => ({ ...g, bot: present ? present.has(g.id) : null })).filter((g) => g.manage || g.bot !== false),
  });
});
