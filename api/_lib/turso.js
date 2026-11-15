// Client Turso minimal (protocole « Hrana over HTTP », même principe que utils/database.py du bot).
// Aucune dépendance : uniquement fetch (Node 18+).

class DBError extends Error {}
class DBIntegrityError extends DBError {}

function endpoint() {
  let url = (process.env.TURSO_DATABASE_URL || "").trim().replace(/\/+$/, "");
  const token = (process.env.TURSO_AUTH_TOKEN || "").trim();
  if (!url || !token) throw new DBError("TURSO_DATABASE_URL / TURSO_AUTH_TOKEN manquants");
  url = url.replace(/^(libsql|wss|ws):\/\//, "https://");
  if (!/^https?:\/\//.test(url)) url = "https://" + url;
  return { url: url + "/v2/pipeline", token };
}

// Valeur JS -> valeur du protocole. Les ids Discord dépassent 2^53 : on les passe en chaîne
// de chiffres via { big: "123..." } ou directement en string (voir int()).
function enc(v) {
  if (v === null || v === undefined) return { type: "null" };
  if (typeof v === "object" && v.big !== undefined) return { type: "integer", value: String(v.big) };
  if (typeof v === "boolean") return { type: "integer", value: v ? "1" : "0" };
  if (typeof v === "number") return Number.isInteger(v) ? { type: "integer", value: String(v) } : { type: "float", value: v };
  return { type: "text", value: String(v) };
}

// Entier 64 bits (id Discord) passé sans perte.
const int = (s) => ({ big: String(s) });

function dec(v) {
  switch (v.type) {
    case "null": return null;
    case "integer": {
      const n = Number(v.value);
      return Number.isSafeInteger(n) ? n : String(v.value);
    }
    case "float": return Number(v.value);
    case "blob": return v.base64;
    default: return v.value;
  }
}

const stmt = (sql, args = []) => ({ sql, args: args.map(enc) });

function raise(message) {
  if (/constraint/i.test(message)) throw new DBIntegrityError(message);
  throw new DBError(message);
}

async function post(requests) {
  const { url, token } = endpoint();
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ requests: [...requests, { type: "close" }] }),
      signal: AbortSignal.timeout(15000),
    });
  } catch (e) {
    throw new DBError("Turso injoignable : " + e.message);
  }
  if (!res.ok) throw new DBError(`Turso HTTP ${res.status} : ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const out = [];
  for (const r of data.results || []) {
    if (r.type === "error") raise(r.error?.message || "erreur Turso inconnue");
    out.push(r.response || {});
  }
  return out;
}

async function query(sql, args = []) {
  const [resp] = await post([{ type: "execute", stmt: stmt(sql, args) }]);
  const cols = resp.result.cols.map((c) => c.name);
  return resp.result.rows.map((row) => Object.fromEntries(row.map((v, i) => [cols[i], dec(v)])));
}

// BEGIN … COMMIT en un seul aller-retour ; ROLLBACK si une étape échoue.
async function transaction(stmts) {
  const n = stmts.length;
  const steps = [{ stmt: { sql: "BEGIN" } }];
  stmts.forEach(([sql, args], j) =>
    steps.push({ stmt: stmt(sql, args), condition: { type: "ok", step: j } }));
  steps.push({ stmt: { sql: "COMMIT" }, condition: { type: "ok", step: n } });
  steps.push({ stmt: { sql: "ROLLBACK" }, condition: { type: "not", cond: { type: "ok", step: n + 1 } } });
  const [resp] = await post([{ type: "batch", batch: { steps } }]);
  const result = resp.result;
  for (const err of (result.step_errors || []).slice(0, n + 2)) {
    if (err) raise(err.message || "erreur Turso inconnue");
  }
  return stmts.map((_, j) => {
    const r = (result.step_results || [])[j + 1] || {};
    return { changed: r.affected_row_count || 0, lastId: r.last_insert_rowid != null ? Number(r.last_insert_rowid) : null };
  });
}

const execute = async (sql, args = []) => (await transaction([[sql, args]]))[0];

module.exports = { query, execute, transaction, int, DBError, DBIntegrityError };
