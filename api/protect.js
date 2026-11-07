const db = require("./_lib/turso");
const { SANCTIONS, MODULES, authorize } = require("./_lib/protect");
const { route, send, body, HttpError } = require("./_lib/http");

const isBool = (v) => typeof v === "boolean";

module.exports = route(["GET", "POST"], async (req, res) => {
  // ----- Lecture -----
  if (req.method === "GET") {
    const id = new URL(req.url, "http://x").searchParams.get("id");
    const { gid } = await authorize(req, id);
    const [g] = await db.query("SELECT enabled, bypass_admins FROM guilds WHERE guild_id = ?", [gid]);
    const rows = await db.query("SELECT module, enabled, sanction FROM modules WHERE guild_id = ?", [gid]);
    const saved = new Map(rows.map((r) => [r.module, r]));
    const sanctions = await db.query(
      `SELECT id, user_id, module, action, duration, reason, status, created_at FROM sanctions
       WHERE guild_id = ? ORDER BY id DESC LIMIT 25`, [gid]);
    const [{ n }] = await db.query("SELECT COUNT(*) AS n FROM sanctions WHERE guild_id = ?", [gid]);
    return send(res, 200, {
      settings: { configured: !!g, enabled: g ? !!g.enabled : true, bypass_admins: g ? !!g.bypass_admins : true },
      modules: Object.entries(MODULES).map(([key, m]) => {
        const r = saved.get(key);
        return { key, label: m.label, scope: m.scope, desc: m.desc, enabled: r ? !!r.enabled : false, sanction: r ? r.sanction : m.sanction };
      }),
      sanctions: sanctions.map((x) => ({ ...x, id: Number(x.id), user_id: String(x.user_id) })),
      total: n,
      sanction_types: SANCTIONS,
    });
  }

  // ----- Écriture -----
  const b = body(req);
  const { gid } = await authorize(req, b.guild);
  // La ligne du serveur doit exister : Protect ne charge que les serveurs présents dans « guilds ».
  const stmts = [["INSERT OR IGNORE INTO guilds (guild_id) VALUES (?)", [gid]]];

  if ("enabled" in b) {
    if (!isBool(b.enabled)) throw new HttpError(400, "Valeur invalide");
    stmts.push(["UPDATE guilds SET enabled = ? WHERE guild_id = ?", [b.enabled ? 1 : 0, gid]]);
  }
  if ("bypass_admins" in b) {
    if (!isBool(b.bypass_admins)) throw new HttpError(400, "Valeur invalide");
    stmts.push(["UPDATE guilds SET bypass_admins = ? WHERE guild_id = ?", [b.bypass_admins ? 1 : 0, gid]]);
  }
  if ("module" in b) {
    const m = MODULES[b.module];
    if (!m) throw new HttpError(400, "Module inconnu");
    stmts.push(["INSERT OR IGNORE INTO modules (guild_id, module, enabled, sanction, params) VALUES (?, ?, 0, ?, '{}')", [gid, b.module, m.sanction]]);
    if ("module_enabled" in b) {
      if (!isBool(b.module_enabled)) throw new HttpError(400, "Valeur invalide");
      stmts.push(["UPDATE modules SET enabled = ? WHERE guild_id = ? AND module = ?", [b.module_enabled ? 1 : 0, gid, b.module]]);
    }
    if ("module_sanction" in b) {
      if (!Object.hasOwn(SANCTIONS, b.module_sanction)) throw new HttpError(400, "Sanction invalide");
      stmts.push(["UPDATE modules SET sanction = ? WHERE guild_id = ? AND module = ?", [b.module_sanction, gid, b.module]]);
    }
  }
  if (stmts.length === 1) throw new HttpError(400, "Rien à modifier");

  await db.transaction(stmts);
  send(res, 200, { ok: true });
});
