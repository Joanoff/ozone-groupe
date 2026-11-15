// Petits utilitaires HTTP communs aux fonctions de l'API.

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function send(res, status, body, headers = {}) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(JSON.stringify(body));
}

function origin(req) {
  const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.host || "");
  const proto = (req.headers["x-forwarded-proto"] || (local ? "http" : "https")).split(",")[0].trim();
  return `${proto}://${req.headers.host}`;
}

function parseCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function cookie(req, name, value, maxAge) {
  const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.host || "");
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${local ? "" : "; Secure"}`;
}

// Protection CSRF des requêtes qui modifient des données : JSON obligatoire + même origine.
function assertSameOrigin(req) {
  const o = req.headers.origin;
  if (!o || o !== origin(req)) throw new HttpError(403, "Origine refusée");
  if (!/^application\/json/i.test(req.headers["content-type"] || "")) throw new HttpError(415, "JSON attendu");
}

function body(req) {
  let b = req.body;
  if (typeof b === "string") { try { b = JSON.parse(b); } catch { b = null; } }
  if (!b || typeof b !== "object") throw new HttpError(400, "Corps JSON invalide");
  return b;
}

// Enveloppe : gère les méthodes autorisées et transforme les erreurs en réponses JSON.
function route(methods, fn) {
  return async (req, res) => {
    try {
      if (!methods.includes(req.method)) {
        res.setHeader("Allow", methods.join(", "));
        throw new HttpError(405, "Méthode non autorisée");
      }
      if (req.method !== "GET") assertSameOrigin(req);
      await fn(req, res);
    } catch (e) {
      if (e instanceof HttpError) return send(res, e.status, { error: e.message });
      console.error("[API]", e && e.stack || e);
      send(res, 500, { error: "Erreur serveur" });
    }
  };
}

module.exports = { HttpError, send, origin, parseCookies, cookie, body, route };
