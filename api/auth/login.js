const crypto = require("crypto");
const { origin, cookie } = require("../_lib/http");

module.exports = (req, res) => {
  const clientId = (process.env.DISCORD_CLIENT_ID || "").trim();
  if (!clientId) { res.statusCode = 500; return res.end("DISCORD_CLIENT_ID manquant"); }
  const state = crypto.randomBytes(16).toString("hex");
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: origin(req) + "/api/auth/callback",
    response_type: "code",
    scope: "identify guilds",
    state,
    prompt: "none",
  });
  res.statusCode = 302;
  res.setHeader("Set-Cookie", cookie(req, "ozone_state", state, 600));
  res.setHeader("Location", "https://discord.com/oauth2/authorize?" + params);
  res.setHeader("Cache-Control", "no-store");
  res.end();
};
