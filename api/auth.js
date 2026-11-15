// Point d'entrée unique pour l'authentification (limite de 12 fonctions du plan Hobby Vercel).
// vercel.json réécrit /api/auth/login|logout|callback vers /api/auth?action=...
const handlers = {
  login: require("./_lib/auth-login"),
  logout: require("./_lib/auth-logout"),
  callback: require("./_lib/auth-callback"),
};

module.exports = (req, res) => {
  let action = "";
  try { action = new URL(req.url, "http://x").searchParams.get("action") || ""; } catch (e) {}
  const h = handlers[action];
  if (!h) { res.statusCode = 404; return res.end("Not found"); }
  return h(req, res);
};
