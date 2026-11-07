// Protect (bot de modération) : métadonnées des modules + contrôle d'accès.
// Même règle que le bot (cogs/protect.py) : propriétaire du serveur ou membre de la whitelist.
const db = require("./turso");
const session = require("./session");
const { HttpError } = require("./http");

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

// Vérifie la session, le serveur et le droit de configurer Protect. Renvoie { s, gid }.
async function authorize(req, id) {
  const s = await session.require(req);
  const g = session.guildOf(s, id);
  const gid = db.int(id);
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

module.exports = { SANCTIONS, MODULES, authorize };
