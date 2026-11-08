const session = require("./session");
const { route, send, cookie } = require("./http");

module.exports = route(["POST"], async (req, res) => {
  const s = await session.get(req);
  if (s) await session.destroy(s.id);
  send(res, 200, { ok: true }, { "Set-Cookie": cookie(req, session.COOKIE, "", 0) });
});
