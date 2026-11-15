const discord = require("./discord");
const session = require("./session");
const { origin, parseCookies, cookie } = require("./http");

function back(req, res, query, extra = []) {
  res.statusCode = 302;
  res.setHeader("Set-Cookie", [cookie(req, "ozone_state", "", 0), ...extra]);
  res.setHeader("Location", "/dashboard" + query);
  res.setHeader("Cache-Control", "no-store");
  res.end();
}

module.exports = async (req, res) => {
  try {
    const url = new URL(req.url, origin(req));
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    if (url.searchParams.get("error")) return back(req, res, "?erreur=refuse");
    if (!code || !state || state !== parseCookies(req).ozone_state) return back(req, res, "?erreur=etat");

    const token = await discord.call("/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID,
        client_secret: process.env.DISCORD_CLIENT_SECRET,
        grant_type: "authorization_code",
        code,
        redirect_uri: origin(req) + "/api/auth/callback",
      }),
    });
    const auth = discord.bearer(token.access_token);
    const [user, guilds] = await Promise.all([
      discord.call("/users/@me", auth),
      discord.call("/users/@me/guilds", auth),
    ]);

    // On ne garde que ce qui sert : id, nom, icône et le droit « gérer le serveur » (réglages et statistiques).
    // Tout membre peut piloter la musique ; seuls les gestionnaires voient les réglages et statistiques.
    const mine = guilds.map((g) => ({ id: g.id, name: g.name, icon: g.icon || null, manage: discord.canManage(g), owner: !!g.owner }));
    const sid = await session.create(user, mine);

    // Le jeton Discord n'est plus utile : on le révoque (sans bloquer en cas d'échec).
    fetch(discord.API + "/oauth2/token/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID,
        client_secret: process.env.DISCORD_CLIENT_SECRET,
        token: token.access_token,
      }),
    }).catch(() => {});

    back(req, res, "", [cookie(req, session.COOKIE, sid, session.TTL)]);
  } catch (e) {
    console.error("[API] callback :", e.message);
    back(req, res, "?erreur=connexion");
  }
};
