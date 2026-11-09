// Émulation de Supabase pour les tests de bout en bout, sans Docker ni compte Cloud.
// La migration réelle tourne sur PGlite et chaque requête s'exécute sous le rôle et
// l'identité de l'appelant : les politiques RLS s'appliquent comme en production.
// Couvre ce que l'application utilise de PostgREST, GoTrue et Storage. Jamais en production.
import { createHmac, randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";

const root = path.resolve(import.meta.dirname, "..", "..");
const PORT = Number(process.env.FAKE_SUPABASE_PORT ?? 54399);
const SERVICE_KEY = "fake-service-key";
const JWT_SECRET = "fake-jwt-secret";

// Comme PostgREST, les colonnes `date` restent au format AAAA-MM-JJ.
const db = await PGlite.create({ extensions: { vector }, parsers: { 1082: (value) => value } });
await db.exec(readFileSync(path.join(root, "tests/support/supabase-stubs.sql"), "utf8"));
const migrations = path.join(root, "supabase/migrations");
for (const file of readdirSync(migrations).sort()) {
  await db.exec(readFileSync(path.join(migrations, file), "utf8"));
}

const fileStore = new Map();

const b64 = (value) => Buffer.from(value).toString("base64url");
function signJwt(payload) {
  const head = `${b64(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${b64(JSON.stringify(payload))}`;
  return `${head}.${createHmac("sha256", JWT_SECRET).update(head).digest("base64url")}`;
}
function verifyJwt(token) {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const expected = createHmac("sha256", JWT_SECRET).update(`${parts[0]}.${parts[1]}`).digest("base64url");
  if (expected !== parts[2]) return null;
  const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
  return payload.exp * 1000 > Date.now() ? payload : null;
}

function identify(req) {
  const token = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
  if (token === SERVICE_KEY || req.headers.apikey === SERVICE_KEY) return { role: "service_role", sub: null };
  const claims = verifyJwt(token);
  return claims ? { role: "authenticated", sub: claims.sub } : { role: "anon", sub: null };
}

function withIdentity(identity, fn) {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${identity.role}`);
    await tx.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: identity.sub, role: identity.role })]);
    return fn(tx);
  });
}

const quote = (id) => `"${id.replace(/"/g, '""')}"`;

const foreignKeys = (
  await db.query(`
    select cl.relname as tbl, ref.relname as ref_tbl,
      (select array_agg(a.attname order by k.ord) from unnest(con.conkey) with ordinality k(attnum, ord) join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.attnum) as cols,
      (select array_agg(a.attname order by k.ord) from unnest(con.confkey) with ordinality k(attnum, ord) join pg_attribute a on a.attrelid = con.confrelid and a.attnum = k.attnum) as ref_cols
    from pg_constraint con
    join pg_class cl on cl.oid = con.conrelid
    join pg_namespace n on n.oid = cl.relnamespace and n.nspname = 'public'
    join pg_class ref on ref.oid = con.confrelid
    join pg_namespace rn on rn.oid = ref.relnamespace and rn.nspname = 'public'
    where con.contype = 'f'`)
).rows;

function splitTopLevel(input, separator = ",") {
  const parts = [];
  let depth = 0;
  let current = "";
  for (const char of input) {
    if (char === "(") depth++;
    if (char === ")") depth--;
    if (char === separator && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  if (current.trim()) parts.push(current);
  return parts.map((p) => p.trim());
}

let aliasCounter = 0;

function selectList(table, select, alias) {
  return splitTopLevel(select || "*").map((item) => {
    const embed = item.match(/^(?:([\w]+):)?([\w]+)\((.*)\)$/s);
    if (!embed) {
      if (item === "*") return `${alias}.*`;
      const renamed = item.match(/^([\w]+):([\w]+)$/);
      return renamed ? `${alias}.${quote(renamed[2])} as ${quote(renamed[1])}` : `${alias}.${quote(item)}`;
    }
    const [, label, target, inner] = embed;
    const child = `t${++aliasCounter}`;
    const list = selectList(target, inner, child).join(", ");
    const manyToOne = foreignKeys.find((fk) => fk.tbl === table && fk.ref_tbl === target);
    if (manyToOne) {
      const on = manyToOne.cols.map((col, i) => `${child}.${quote(manyToOne.ref_cols[i])} = ${alias}.${quote(col)}`).join(" and ");
      return `(select row_to_json(x) from (select ${list} from public.${quote(target)} ${child} where ${on} limit 1) x) as ${quote(label ?? target)}`;
    }
    const oneToMany = foreignKeys.find((fk) => fk.tbl === target && fk.ref_tbl === table);
    if (!oneToMany) throw Object.assign(new Error(`no relationship ${table} -> ${target}`), { code: "PGRST200" });
    const on = oneToMany.cols.map((col, i) => `${child}.${quote(col)} = ${alias}.${quote(oneToMany.ref_cols[i])}`).join(" and ");
    return `coalesce((select json_agg(row_to_json(x)) from (select ${list} from public.${quote(target)} ${child} where ${on}) x), '[]'::json) as ${quote(label ?? target)}`;
  });
}

function condition(column, expression, alias, params) {
  const ref = `${alias}.${quote(column)}`;
  let expr = expression;
  let negate = false;
  if (expr.startsWith("not.")) {
    negate = true;
    expr = expr.slice(4);
  }
  const dot = expr.indexOf(".");
  const op = expr.slice(0, dot);
  const value = expr.slice(dot + 1);
  let sql;
  if (op === "is") sql = `${ref} is ${value === "null" ? "null" : value}`;
  else if (op === "in") {
    const values = value.replace(/^\(|\)$/g, "").split(",").filter(Boolean).map((v) => v.replace(/^"|"$/g, ""));
    if (!values.length) sql = "false";
    else {
      const placeholders = values.map((v) => {
        params.push(v);
        return `$${params.length}`;
      });
      sql = `${ref}::text in (${placeholders.join(", ")})`;
    }
  } else {
    const ops = { eq: "=", neq: "<>", gt: ">", gte: ">=", lt: "<", lte: "<=" };
    params.push(value);
    const numeric = /^-?\d+(\.\d+)?$/.test(value);
    sql = numeric ? `${ref}::text ${ops[op]} $${params.length}` : `${ref}::text ${ops[op]} $${params.length}`;
    if (["gt", "gte", "lt", "lte"].includes(op)) sql = `${ref} ${ops[op]} $${params.length}::${/^\d{4}-\d{2}-\d{2}T/.test(value) ? "timestamptz" : /^\d{4}-\d{2}-\d{2}$/.test(value) ? "date" : "numeric"}`;
  }
  return negate ? `not (${sql})` : sql;
}

const RESERVED = new Set(["select", "order", "limit", "offset", "on_conflict", "columns"]);

function whereClause(query, alias, params) {
  const clauses = [];
  for (const [key, value] of query.entries()) {
    if (RESERVED.has(key)) continue;
    if (key === "or") {
      const parts = splitTopLevel(value.replace(/^\(|\)$/g, "")).map((part) => {
        const dot = part.indexOf(".");
        return condition(part.slice(0, dot), part.slice(dot + 1), alias, params);
      });
      clauses.push(`(${parts.join(" or ")})`);
    } else {
      clauses.push(condition(key, value, alias, params));
    }
  }
  return clauses.length ? ` where ${clauses.join(" and ")}` : "";
}

function orderClause(query, alias) {
  const order = query.get("order");
  if (!order) return "";
  const parts = order.split(",").map((item) => {
    const [col, dir, nulls] = item.split(".");
    return `${alias}.${quote(col)} ${dir === "desc" ? "desc" : "asc"}${nulls ? ` ${nulls === "nullsfirst" ? "nulls first" : "nulls last"}` : ""}`;
  });
  return ` order by ${parts.join(", ")}`;
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, { "Content-Type": "application/json", ...headers });
  res.end(body === undefined ? "" : JSON.stringify(body));
}

function sendPgError(res, error) {
  const code = error.code ?? "XX000";
  const status = code === "42501" ? 403 : code === "23505" ? 409 : code.startsWith("PGRST") ? 400 : 400;
  send(res, status, { code, message: error.message, details: error.detail ?? null, hint: null });
}

function respondRows(req, res, rows, extra = {}) {
  const wantsObject = (req.headers.accept ?? "").includes("vnd.pgrst.object");
  if (wantsObject) {
    if (rows.length !== 1) return send(res, 406, { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned", details: `The result contains ${rows.length} rows`, hint: null });
    return send(res, extra.status ?? 200, rows[0], extra.headers);
  }
  send(res, extra.status ?? 200, rows, extra.headers);
}

async function handleRest(req, res, table, query, body, identity) {
  const prefer = req.headers.prefer ?? "";
  const alias = "t0";

  if (req.method === "GET" || req.method === "HEAD") {
    const params = [];
    const where = whereClause(query, alias, params);
    const limit = query.get("limit") ? ` limit ${Number(query.get("limit"))}` : "";
    const offset = query.get("offset") ? ` offset ${Number(query.get("offset"))}` : "";
    const list = selectList(table, query.get("select"), alias).join(", ");
    const { rows, total } = await withIdentity(identity, async (tx) => {
      const data = req.method === "HEAD" ? { rows: [] } : await tx.query(`select ${list} from public.${quote(table)} ${alias}${where}${orderClause(query, alias)}${limit}${offset}`, params);
      const count = prefer.includes("count=") ? (await tx.query(`select count(*)::int as n from public.${quote(table)} ${alias}${where}`, params)).rows[0].n : null;
      return { rows: data.rows, total: count };
    });
    const headers = total === null ? {} : { "Content-Range": `0-${Math.max(rows.length - 1, 0)}/${total}` };
    if (req.method === "HEAD") {
      res.writeHead(200, headers);
      return res.end();
    }
    return respondRows(req, res, rows, { headers });
  }

  const wantsRows = prefer.includes("return=representation");
  const list = selectList(table, query.get("select"), alias).join(", ");

  if (req.method === "POST") {
    const records = Array.isArray(body) ? body : [body];
    const columns = Array.from(new Set(records.flatMap((r) => Object.keys(r))));
    const collist = columns.map(quote).join(", ");
    const merge = prefer.includes("resolution=merge-duplicates");
    const ignore = prefer.includes("resolution=ignore-duplicates");
    let conflict = "";
    if (merge || ignore) {
      const target = query.get("on_conflict")?.split(",") ?? (await primaryKey(table));
      const updates = columns.filter((c) => !target.includes(c)).map((c) => `${quote(c)} = excluded.${quote(c)}`);
      conflict = ` on conflict (${target.map(quote).join(", ")}) ${ignore || !updates.length ? "do nothing" : `do update set ${updates.join(", ")}`}`;
    }
    const sql = `with created as (insert into public.${quote(table)} (${collist}) select ${collist} from json_populate_recordset(null::public.${quote(table)}, $1::json)${conflict} returning *) select ${list} from created ${alias}`;
    const { rows } = await withIdentity(identity, (tx) => tx.query(sql, [JSON.stringify(records)]));
    return wantsRows ? respondRows(req, res, rows, { status: 201 }) : send(res, 201, undefined);
  }

  if (req.method === "PATCH") {
    const params = [JSON.stringify(body)];
    const where = whereClause(query, alias, params);
    const sets = Object.keys(body).map((c) => `${quote(c)} = r.${quote(c)}`).join(", ");
    const sql = `update public.${quote(table)} ${alias} set ${sets} from json_populate_record(null::public.${quote(table)}, $1::json) r${where} returning ${alias}.*`;
    const { rows } = await withIdentity(identity, (tx) => tx.query(sql, params));
    return wantsRows ? respondRows(req, res, rows) : send(res, 204, undefined);
  }

  if (req.method === "DELETE") {
    const params = [];
    const where = whereClause(query, alias, params);
    const { rows } = await withIdentity(identity, (tx) => tx.query(`delete from public.${quote(table)} ${alias}${where} returning ${alias}.*`, params));
    return wantsRows ? respondRows(req, res, rows) : send(res, 204, undefined);
  }

  send(res, 405, { message: "method not allowed" });
}

async function primaryKey(table) {
  const { rows } = await db.query(
    `select a.attname from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
      where i.indrelid = ('public.' || $1)::regclass and i.indisprimary`,
    [table],
  );
  return rows.map((r) => r.attname);
}

async function handleRpc(res, fn, body, identity) {
  const { rows: meta } = await db.query(
    `select p.proargnames as names, p.proargmodes as modes, p.proretset as is_set,
            format_type(p.prorettype, null) as ret,
            (select array_agg(format_type(t, null)) from unnest(coalesce(p.proallargtypes, p.proargtypes::oid[])) t) as types
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = $1`,
    [fn],
  );
  if (!meta.length) return send(res, 404, { code: "PGRST202", message: "function not found" });
  const { names, modes, is_set, ret, types } = meta[0];
  const params = [];
  const args = Object.entries(body ?? {}).map(([name, value]) => {
    const index = names.indexOf(name);
    params.push(typeof value === "object" && value !== null ? JSON.stringify(value) : value);
    const type = types[index] === "vector" ? "extensions.vector" : types[index];
    return `${name} => $${params.length}::${type}`;
  });
  const isTable = modes?.includes("t");
  const sql = isTable || is_set ? `select * from public.${quote(fn)}(${args.join(", ")})` : `select public.${quote(fn)}(${args.join(", ")}) as result`;
  const { rows } = await withIdentity(identity, (tx) => tx.query(sql, params));
  if (isTable) return send(res, 200, rows);
  if (is_set) return send(res, 200, rows.map((r) => Object.values(r)[0]));
  if (ret === "void") return send(res, 204, undefined);
  send(res, 200, rows[0].result);
}

function publicUser(row) {
  return {
    id: row.id,
    aud: "authenticated",
    role: "authenticated",
    email: row.email,
    email_confirmed_at: row.email_confirmed_at,
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: row.raw_user_meta_data ?? {},
    identities: [],
    created_at: row.created_at,
    updated_at: row.created_at,
  };
}

function session(row) {
  const expires = Math.floor(Date.now() / 1000) + 3600;
  return {
    access_token: signJwt({ sub: row.id, role: "authenticated", aud: "authenticated", email: row.email, exp: expires }),
    refresh_token: signJwt({ sub: row.id, kind: "refresh", exp: expires + 86400 }),
    expires_in: 3600,
    expires_at: expires,
    token_type: "bearer",
    user: publicUser(row),
  };
}

async function handleAuth(req, res, route, query, body) {
  if (route === "/signup" && req.method === "POST") {
    const existing = await db.query("select 1 from auth.users where email = $1", [body.email]);
    if (existing.rows.length) return send(res, 422, { code: "user_already_exists", error_code: "user_already_exists", msg: "User already registered" });
    const { rows } = await db.query("insert into auth.users (email, email_confirmed_at, encrypted_password, raw_user_meta_data) values ($1, now(), $2, $3::jsonb) returning *", [body.email, body.password, JSON.stringify(body.data ?? {})]);
    return send(res, 200, session(rows[0]));
  }
  if (route === "/token" && req.method === "POST") {
    if (query.get("grant_type") === "password") {
      const { rows } = await db.query("select * from auth.users where email = $1 and encrypted_password = $2", [body.email, body.password]);
      if (!rows.length) return send(res, 400, { code: 400, error_code: "invalid_credentials", msg: "Invalid login credentials" });
      return send(res, 200, session(rows[0]));
    }
    const claims = verifyJwt(body.refresh_token ?? "");
    if (!claims) return send(res, 400, { error_code: "refresh_token_not_found", msg: "Invalid Refresh Token" });
    const { rows } = await db.query("select * from auth.users where id = $1", [claims.sub]);
    return send(res, 200, session(rows[0]));
  }
  if (route === "/user") {
    const claims = verifyJwt((req.headers.authorization ?? "").replace(/^Bearer\s+/i, ""));
    if (!claims) return send(res, 401, { code: 401, error_code: "bad_jwt", msg: "invalid JWT" });
    if (req.method === "PUT" && body.password) await db.query("update auth.users set encrypted_password = $1 where id = $2", [body.password, claims.sub]);
    const { rows } = await db.query("select * from auth.users where id = $1", [claims.sub]);
    return rows.length ? send(res, 200, publicUser(rows[0])) : send(res, 401, { msg: "not found" });
  }
  if (route === "/logout") return send(res, 204, undefined);
  if (route === "/recover") return send(res, 200, {});
  send(res, 404, { msg: `unsupported auth route ${route}` });
}

async function readUpload(req, raw) {
  const type = req.headers["content-type"] ?? "application/octet-stream";
  if (!type.includes("multipart/form-data")) return { buffer: raw, contentType: type };
  const form = await new Response(raw, { headers: { "content-type": type } }).formData();
  const file = Array.from(form.values()).find((v) => v instanceof Blob);
  return { buffer: Buffer.from(await file.arrayBuffer()), contentType: file.type };
}

async function handleStorage(req, res, parts, query, raw, identity) {
  const signedToken = query.get("token");
  if (parts[0] === "object" && parts[1] === "sign") {
    const bucket = parts[2];
    const name = parts.slice(3).join("/");
    if (req.method === "GET") {
      const file = fileStore.get(`${bucket}/${name}`);
      if (!file || !verifyJwt(signedToken ?? "")) return send(res, 400, { message: "invalid signature" });
      res.writeHead(200, { "Content-Type": file.contentType });
      return res.end(file.buffer);
    }
    const body = JSON.parse(raw.toString() || "{}");
    const sign = async (target) => {
      const { rows } = await withIdentity(identity, (tx) => tx.query("select 1 from storage.objects where bucket_id = $1 and name = $2", [bucket, target]));
      if (!rows.length) return null;
      const token = signJwt({ path: target, exp: Math.floor(Date.now() / 1000) + (body.expiresIn ?? 3600) });
      return `/object/sign/${bucket}/${target}?token=${token}`;
    };
    if (body.paths) {
      const signed = await Promise.all(body.paths.map(async (target) => {
        const url = await sign(target);
        return { path: target, signedURL: url, error: url ? null : "not found" };
      }));
      return send(res, 200, signed);
    }
    const url = await sign(name);
    return url ? send(res, 200, { signedURL: url }) : send(res, 404, { statusCode: "404", error: "not_found", message: "Object not found" });
  }

  if (parts[0] === "object") {
    // storage-js télécharge via /object/authenticated/<bucket>/<chemin>.
    const offset = parts[1] === "authenticated" ? 2 : 1;
    const bucket = parts[offset];
    const name = parts.slice(offset + 1).join("/");

    if (req.method === "DELETE") {
      const { prefixes } = JSON.parse(raw.toString());
      const { rows } = await withIdentity(identity, (tx) => tx.query("delete from storage.objects where bucket_id = $1 and name = any($2::text[]) returning name", [bucket, prefixes]));
      rows.forEach((r) => fileStore.delete(`${bucket}/${r.name}`));
      return send(res, 200, rows);
    }
    if (req.method === "POST" || req.method === "PUT") {
      const { buffer, contentType } = await readUpload(req, raw);
      const upsert = req.headers["x-upsert"] === "true";
      await withIdentity(identity, (tx) =>
        tx.query(`insert into storage.objects (bucket_id, name, owner, mime_type) values ($1, $2, $3, $4)${upsert ? " on conflict (bucket_id, name) do update set mime_type = excluded.mime_type" : ""}`, [bucket, name, identity.sub, contentType]),
      );
      fileStore.set(`${bucket}/${name}`, { buffer, contentType });
      return send(res, 200, { Key: `${bucket}/${name}`, Id: randomUUID() });
    }
    if (req.method === "GET") {
      const { rows } = await withIdentity(identity, (tx) => tx.query("select 1 from storage.objects where bucket_id = $1 and name = $2", [bucket, name]));
      const file = fileStore.get(`${bucket}/${name}`);
      if (!rows.length || !file) return send(res, 404, { statusCode: "404", error: "not_found", message: "Object not found" });
      res.writeHead(200, { "Content-Type": file.contentType });
      return res.end(file.buffer);
    }
  }
  send(res, 404, { message: "unsupported storage route" });
}

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin ?? "*");
  res.setHeader("Access-Control-Allow-Headers", req.headers["access-control-request-headers"] ?? "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,HEAD,OPTIONS");
  res.setHeader("Access-Control-Expose-Headers", "Content-Range");
  if (req.method === "OPTIONS") return res.writeHead(204).end();

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks);
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const identity = identify(req);

  try {
    if (url.pathname === "/health") return send(res, 200, { ok: true });
    if (url.pathname.startsWith("/rest/v1/rpc/")) {
      return await handleRpc(res, url.pathname.slice("/rest/v1/rpc/".length), raw.length ? JSON.parse(raw.toString()) : {}, identity);
    }
    if (url.pathname.startsWith("/rest/v1/")) {
      return await handleRest(req, res, url.pathname.slice("/rest/v1/".length), url.searchParams, raw.length ? JSON.parse(raw.toString()) : null, identity);
    }
    if (url.pathname.startsWith("/auth/v1")) {
      return await handleAuth(req, res, url.pathname.slice("/auth/v1".length), url.searchParams, raw.length ? JSON.parse(raw.toString()) : {});
    }
    if (url.pathname.startsWith("/storage/v1/")) {
      return await handleStorage(req, res, decodeURI(url.pathname.slice("/storage/v1/".length)).split("/"), url.searchParams, raw, identity);
    }
    send(res, 404, { message: "not found" });
  } catch (error) {
    if (!error.code) console.error("[fake-supabase]", req.method, req.url, error);
    sendPgError(res, error);
  }
});

server.listen(PORT, "127.0.0.1", () => console.log(`fake-supabase prêt sur le port ${PORT}`));
