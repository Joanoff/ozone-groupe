// Protect (bot de modération) : métadonnées des modules + contrôle d'accès.
// Même règle que le bot (cogs/protect.py) : propriétaire du serveur ou membre de la whitelist.
const db = require("./turso");
const session = require("./session");
const discord = require("./discord");
const { HttpError, send } = require("./http");

const isBool = (v) => typeof v === "boolean";

const SANCTIONS = { none: "Aucune", timeout: "Timeout", kick: "Expulsion", ban: "Bannissement" };
const MODULES = {
  antispam:    { label: "Anti-spam", scope: "message", desc: "Détecte l'envoi de trop de messages en peu de temps.", sanction: "timeout" },
  antiinvite:  { label: "Anti-invitations", scope: "message", desc: "Supprime les invitations vers d'autres serveurs.", sanction: "none" },
  antilink:    { label: "Anti-liens", scope: "message", desc: "Supprime les liens, sauf ceux des domaines autorisés.", sanction: "none" },
  antimention: { label: "Anti-mentions", scope: "message", desc: "Bloque les messages contenant trop de mentions.", sanction: "timeout" },
  anticaps:    { label: "Anti-majuscules", scope: "message", desc: "Supprime les messages écrits majoritairement en majuscules.", sanction: "none" },
  badwords:    { label: "Mots interdits", scope: "message", desc: "Supprime les messages contenant un mot de la liste noire.", sanction: "none" },
  antitoken:   { label: "Anti-token", scope: "message", desc: "Supprime les messages contenant un token Discord pour éviter une fuite.", sanction: "none" },
  newaccount:  { label: "Comptes récents", scope: "join", desc: "Sanctionne les arrivants dont le compte est trop récent.", sanction: "kick" },
  antiraid:    { label: "Anti-raid", scope: "join", desc: "Détecte un afflux massif de membres et sanctionne les arrivants.", sanction: "kick" },
  antibot:     { label: "Anti-bots", scope: "join", desc: "Sanctionne les bots ajoutés par quelqu'un d'autre que le propriétaire ou la whitelist.", sanction: "kick" },
};

// Listes blanches modifiables depuis le dashboard : table « bypass » du bot (guild_id, kind, target_id).
// « wl » (les membres autorisés à configurer Protect) n'est volontairement pas modifiable ici.
const BYPASS_KINDS = { role: "role", channel: "channel" };   // valeurs de la colonne « kind » : à adapter si le bot en utilise d'autres
const BYPASS_MAX = { role: 20, channel: 25 };               // par serveur et par type : 20 rôles = limite des exemptions AutoMod de Discord ; 25 salons = menu du bot (/config)

// Vérifie la session, le serveur et le droit de configurer Protect. Renvoie { s, gid }.
async function authorize(req, id) {
  const s = await session.require(req);
  const g = session.guildOf(s, id);
  const gid = db.int(id);
  if ((await discord.botIn(id, "PROTECT_BOT_TOKEN")) === false) throw new HttpError(409, "Protect n'est pas sur ce serveur");
  try {
    if (!g.owner) {
      const [wl] = await db.query("SELECT 1 AS ok FROM bypass WHERE guild_id = ? AND kind = 'wl' AND target_id = ?", [gid, db.int(s.userId)]);
      if (!wl) throw new HttpError(403, "Seuls le propriétaire du serveur et la whitelist de Protect peuvent configurer la protection.");
    }
  } catch (e) {
    if (/no such table/i.test(e.message)) throw new HttpError(503, "Protect n'est pas encore connecté à Turso : lance-le une fois avec TURSO_DATABASE_URL.");
    throw e;
  }
  return { s, gid };
}



// GET /api/settings?scope=protect&id=… : configuration + dernières sanctions.
async function get(req, res) {
  const id = new URL(req.url, "http://x").searchParams.get("id");
  const { gid } = await authorize(req, id);
  const [g] = await db.query("SELECT enabled, bypass_admins FROM guilds WHERE guild_id = ?", [gid]);
  const rows = await db.query("SELECT module, enabled, sanction FROM modules WHERE guild_id = ?", [gid]);
  const saved = new Map(rows.map((r) => [r.module, r]));
  const sanctions = await db.query(
    `SELECT id, user_id, module, action, duration, reason, status, created_at FROM sanctions
     WHERE guild_id = ? ORDER BY id DESC LIMIT 25`, [gid]);
  const [{ n }] = await db.query("SELECT COUNT(*) AS n FROM sanctions WHERE guild_id = ?", [gid]);

  // Rôles et salons exemptés (avec leurs noms quand le bot Protect peut les lire)
  const cat = await discord.guildCatalog(id);
  const byKind = { role: new Map((cat ? cat.roles : []).map((r) => [r.id, r])), channel: new Map((cat ? cat.channels : []).map((c) => [c.id, c])) };
  const bypassRows = await db.query("SELECT kind, target_id FROM bypass WHERE guild_id = ? AND kind IN (?, ?)", [gid, BYPASS_KINDS.role, BYPASS_KINDS.channel]);
  const bypass = { roles: [], channels: [] };
  for (const r of bypassRows) {
    const tid = String(r.target_id), info = byKind[r.kind] && byKind[r.kind].get(tid);
    (r.kind === BYPASS_KINDS.role ? bypass.roles : bypass.channels).push({ id: tid, name: info ? info.name : null, color: info && info.color || 0 });
  }
  for (const list of [bypass.roles, bypass.channels]) list.sort((a, b) => String(a.name || a.id).localeCompare(String(b.name || b.id), "fr"));

  return send(res, 200, {
    bypass,
    catalog: cat,
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

// POST /api/settings { scope: "protect", guild, … } : interrupteurs et sanction d'un module.
async function post(req, res, b) {
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
  if ("bypass" in b) {
    const x = b.bypass;
    if (!x || typeof x !== "object" || !Object.hasOwn(BYPASS_KINDS, x.kind) || !["add", "remove"].includes(x.op)) throw new HttpError(400, "Valeur invalide");
    const tid = String(x.id ?? "");
    if (!/^\d{15,20}$/.test(tid)) throw new HttpError(400, "Identifiant invalide");
    const kind = BYPASS_KINDS[x.kind], target = db.int(tid);
    if (x.op === "remove") {
      stmts.push(["DELETE FROM bypass WHERE guild_id = ? AND kind = ? AND target_id = ?", [gid, kind, target]]);
    } else {
      // Quand le bot Protect peut lire le serveur, on n'accepte que des rôles / salons qui existent vraiment.
      const cat = await discord.guildCatalog(b.guild);
      if (cat && !(x.kind === "role" ? cat.roles : cat.channels).some((o) => o.id === tid))
        throw new HttpError(400, x.kind === "role" ? "Ce rôle n'existe pas sur ce serveur" : "Ce salon n'existe pas sur ce serveur");
      const [{ n }] = await db.query("SELECT COUNT(*) AS n FROM bypass WHERE guild_id = ? AND kind = ?", [gid, kind]);
      if (n >= BYPASS_MAX[x.kind]) throw new HttpError(409, `Limite atteinte (${BYPASS_MAX[x.kind]} par liste)`);
      stmts.push(["INSERT INTO bypass (guild_id, kind, target_id) SELECT ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM bypass WHERE guild_id = ? AND kind = ? AND target_id = ?)",
        [gid, kind, target, gid, kind, target]]);
    }
  }
  if (stmts.length === 1) throw new HttpError(400, "Rien à modifier");

  await db.transaction(stmts);
  send(res, 200, { ok: true });
}

module.exports = { SANCTIONS, MODULES, authorize, get, post };
