const session = require("../_lib/session");
const { route, send, cookie } = require("../_lib/http");

module.exports = route(["POST"], async (req, res) => {
  const s = await session.get(req);
  if (s) await session.destroy(s.id);
  send(res, 200, { ok: true }, { "Set-Cookie": cookie(req, session.COOKIE, "", 0) });
});
