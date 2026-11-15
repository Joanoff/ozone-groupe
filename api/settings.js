const db = require("./_lib/turso");
const session = require("./_lib/session");
const limits = require("./_lib/limits");
const protect = require("./_lib/protect");
const { route, send, body, HttpError } = require("./_lib/http");

const isColor = (c) => Number.isInteger(c) && c >= 0 && c <= 0xFFFFFF;

module.exports = route(["GET", "POST"], async (req, res) => {
  // Protect (modération) partage cette fonction : la formule Hobby de Vercel est limitée à 12 fonctions.
  if (req.method === "GET") return protect.get(req, res);
  const b = body(req);
  if (b.scope === "protect" || "module" in b || "enabled" in b || "bypass_admins" in b) return protect.post(req, res, b);
  const s = await session.require(req);
  session.manageOf(s, b.guild);
  const gid = db.int(b.guild);
  const stmts = [];

  if ("volume" in b) {
    if (!Number.isInteger(b.volume) || b.volume < 0 || b.volume > limits.MAX_VOLUME)
      throw new HttpError(400, `Volume entre 0 et ${limits.MAX_VOLUME}`);
    stmts.push(["INSERT INTO guild_settings (guild_id, volume) VALUES (?, ?) " +
      "ON CONFLICT(guild_id) DO UPDATE SET volume = excluded.volume", [gid, b.volume]]);
  }
  if ("bar_color" in b) {
    const c1 = b.bar_color;
    const c2 = c1 === null ? null : (b.bar_color2 ?? null);
    if (c1 !== null && !isColor(c1)) throw new HttpError(400, "Couleur invalide");
    if (c2 !== null && !isColor(c2)) throw new HttpError(400, "Seconde couleur invalide");
    // Si la ligne n'existe pas encore, on fixe le volume par défaut du bot (et pas 50 du schéma).
    stmts.push(["INSERT INTO guild_settings (guild_id, volume, bar_color, bar_color2) VALUES (?, ?, ?, ?) " +
      "ON CONFLICT(guild_id) DO UPDATE SET bar_color = excluded.bar_color, bar_color2 = excluded.bar_color2",
      [gid, limits.DEFAULT_VOLUME, c1, c2]]);
  }
  if (!stmts.length) throw new HttpError(400, "Rien à modifier");

  await db.transaction(stmts);
  send(res, 200, { ok: true });
});
