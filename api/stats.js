const db = require("./_lib/turso");
const session = require("./_lib/session");
const stats = require("./_lib/stats");
const { route, send } = require("./_lib/http");

const RANGES = new Set([7, 30, 90]);
const FRESH = 20 * 60; // le bot écrit au moins toutes les 10 min : au-delà de 20 min, on le considère hors ligne

const sum = (rows, k) => rows.reduce((a, r) => a + (r[k] || 0), 0);

module.exports = route(["GET"], async (req, res) => {
  const s = await session.require(req);
  const q = new URL(req.url, "http://x").searchParams;
  const id = q.get("id");
  session.manageOf(s, id);

  const range = RANGES.has(Number(q.get("range"))) ? Number(q.get("range")) : 30;
  let tz = Number.parseInt(q.get("tz"), 10); // décalage du navigateur (minutes), pour l'heure locale
  if (!Number.isFinite(tz) || Math.abs(tz) > 840) tz = 0;

  await stats.ensure();
  const gid = db.int(id);
  const now = Math.floor(Date.now() / 1000);
  const nowH = Math.floor(now / 3600);
  const from = stats.dayKey(now - (range * 2 - 1) * 86400);

  // Quatre petites requêtes en parallèle ; les lignes lues sont bornées (≤ 180 jours, ≤ 168 heures).
  const [daily, hourly, meta, live] = await Promise.all([
    db.query("SELECT day, messages, joins, leaves, voice_seconds, tracks, commands, members FROM stats_daily WHERE guild_id = ? AND day >= ? ORDER BY day", [gid, from]),
    db.query("SELECT hour, messages, voice, latency FROM stats_hourly WHERE guild_id = ? AND hour > ? ORDER BY hour", [gid, nowH - 168]),
    db.query("SELECT (SELECT MIN(day) FROM stats_daily WHERE guild_id = ?) AS since, (SELECT MAX(updated_at) FROM stats_hourly WHERE guild_id = ?) AS seen", [gid, gid]),
    stats.live(String(id)),
  ]);

  // Jours de la période (les jours sans donnée valent 0 ; les membres reprennent la dernière valeur connue).
  const byDay = new Map(daily.map((r) => [r.day, r]));
  const keys = [];
  for (let i = range * 2 - 1; i >= 0; i--) keys.push(stats.dayKey(now - i * 86400));
  let lastMembers = null;
  const rows = keys.map((day) => {
    const r = byDay.get(day) || {};
    if (r.members != null) lastMembers = r.members;
    return { day, messages: r.messages || 0, joins: r.joins || 0, leaves: r.leaves || 0, voice_seconds: r.voice_seconds || 0,
      tracks: r.tracks || 0, commands: r.commands || 0, members: lastMembers };
  });
  const cur = rows.slice(range), prev = rows.slice(0, range);
  const totals = {};
  for (const k of ["messages", "joins", "leaves", "voice_seconds", "tracks", "commands"]) totals[k] = { cur: sum(cur, k), prev: sum(prev, k) };

  // 24 dernières heures
  const byHour = new Map(hourly.map((r) => [r.hour, r]));
  const last24 = [];
  for (let h = nowH - 23; h <= nowH; h++) {
    const r = byHour.get(h);
    last24.push({ hour: h * 3600, messages: r ? r.messages : 0, voice: r ? r.voice : null, latency: r ? r.latency : null });
  }

  // Profil « par heure de la journée » sur 7 jours, en heure locale du navigateur
  const profile = new Array(24).fill(0);
  for (const r of hourly) {
    const local = Math.floor((r.hour * 60 - tz) / 60);
    profile[((local % 24) + 24) % 24] += r.messages || 0;
  }

  const m = meta[0] || {};
  const members = live && live.members != null ? live.members : rows[rows.length - 1].members;
  send(res, 200, {
    now, range,
    since: m.since || null,
    bot: { seen: m.seen || null, online: !!m.seen && now - m.seen < FRESH },
    live: { members, online: live ? live.online : null, boosts: live ? live.boosts : null, tier: live ? live.tier : null, source: live ? "discord" : "base" },
    days: cur,
    totals,
    members_start: cur.find((r) => r.members != null)?.members ?? null,
    hours: last24,
    profile,
  });
});
