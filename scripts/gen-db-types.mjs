// Génère src/lib/supabase/database.types.ts depuis la migration, sans Docker :
// la migration est jouée sur PGlite puis le catalogue Postgres est introspecté.
// Équivalent hors ligne de `supabase gen types typescript`.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";

const root = path.resolve(import.meta.dirname, "..");
const db = await PGlite.create({ extensions: { vector } });
await db.exec(readFileSync(path.join(root, "tests/support/supabase-stubs.sql"), "utf8"));
const dir = path.join(root, "supabase/migrations");
for (const file of readdirSync(dir).sort()) {
  await db.exec(readFileSync(path.join(dir, file), "utf8"));
}

const enums = (
  await db.query(`
    select t.typname as name, array_agg(e.enumlabel order by e.enumsortorder) as labels
      from pg_type t
      join pg_enum e on e.enumtypid = t.oid
      join pg_namespace n on n.oid = t.typnamespace
     where n.nspname = 'public'
     group by t.typname order by t.typname`)
).rows;
const enumNames = new Set(enums.map((e) => e.name));

function tsType(pgType) {
  const isArray = pgType.endsWith("[]");
  const base = pgType.replace(/\[\]$/, "").replace(/^public\./, "").replace(/\(.*\)$/, "").replace(/^extensions\./, "");
  let out;
  if (enumNames.has(base)) out = `Database["public"]["Enums"]["${base}"]`;
  else if (["integer", "smallint", "bigint", "numeric", "double precision", "real"].includes(base)) out = "number";
  else if (base === "boolean") out = "boolean";
  else if (["json", "jsonb"].includes(base)) out = "Json";
  else if (base === "tsvector") out = "unknown";
  else out = "string";
  return isArray ? `${out}[]` : out;
}

const columns = (
  await db.query(`
    select c.table_name, a.attname as column_name,
           format_type(a.atttypid, a.atttypmod) as type,
           not a.attnotnull as nullable,
           (a.atthasdef and a.attgenerated = '') as has_default,
           a.attgenerated <> '' as generated
      from information_schema.tables c
      join pg_class cl on cl.relname = c.table_name
      join pg_namespace n on n.oid = cl.relnamespace and n.nspname = 'public'
      join pg_attribute a on a.attrelid = cl.oid and a.attnum > 0 and not a.attisdropped
     where c.table_schema = 'public' and c.table_type = 'BASE TABLE'
     order by c.table_name, a.attnum`)
).rows;

const fks = (
  await db.query(`
    select con.conname, cl.relname as table_name, ref.relname as ref_table,
           (select array_agg(a.attname order by k.ord)
              from unnest(con.conkey) with ordinality k(attnum, ord)
              join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.attnum) as cols,
           (select array_agg(a.attname order by k.ord)
              from unnest(con.confkey) with ordinality k(attnum, ord)
              join pg_attribute a on a.attrelid = con.confrelid and a.attnum = k.attnum) as ref_cols
      from pg_constraint con
      join pg_class cl on cl.oid = con.conrelid
      join pg_namespace n on n.oid = cl.relnamespace and n.nspname = 'public'
      join pg_class ref on ref.oid = con.confrelid
      join pg_namespace rn on rn.oid = ref.relnamespace and rn.nspname = 'public'
     where con.contype = 'f'
     order by cl.relname, con.conname`)
).rows;

const functions = (
  await db.query(`
    select p.proname as name, p.pronargdefaults as defaults, p.proretset as is_set,
           coalesce(p.proallargtypes, p.proargtypes::oid[]) as types,
           coalesce(p.proargmodes, array_fill('i'::"char", array[p.pronargs::int])) as modes,
           p.proargnames as names,
           format_type(p.prorettype, null) as return_type,
           (select array_agg(format_type(t, null)) from unnest(coalesce(p.proallargtypes, p.proargtypes::oid[])) t) as type_names
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and format_type(p.prorettype, null) <> 'trigger'
       and p.prosrc is not null and p.prolang <> (select oid from pg_language where lanname = 'c')
     order by p.proname`)
).rows;

const tables = new Map();
for (const c of columns) {
  if (!tables.has(c.table_name)) tables.set(c.table_name, []);
  tables.get(c.table_name).push(c);
}
let out = `// Fichier généré par scripts/gen-db-types.mjs : ne pas modifier à la main.
// Relancer \`npm run db:types\` après chaque changement de migration.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
`;

for (const [table, cols] of tables) {
  const field = (c, optional) => `          ${c.column_name}${optional ? "?" : ""}: ${tsType(c.type)}${c.nullable ? " | null" : ""};\n`;
  out += `      ${table}: {\n        Row: {\n`;
  for (const c of cols) out += field(c, false);
  out += "        };\n        Insert: {\n";
  for (const c of cols.filter((x) => !x.generated)) out += field(c, c.nullable || c.has_default);
  out += "        };\n        Update: {\n";
  for (const c of cols.filter((x) => !x.generated)) out += field(c, true);
  out += "        };\n        Relationships: [\n";
  for (const fk of fks.filter((f) => f.table_name === table)) {
    out += `          { foreignKeyName: "${fk.conname}"; columns: ${JSON.stringify(fk.cols)}; isOneToOne: false; referencedRelation: "${fk.ref_table}"; referencedColumns: ${JSON.stringify(fk.ref_cols)} },\n`;
  }
  out += "        ];\n      };\n";
}

out += "    };\n    Views: { [_ in never]: never };\n    Functions: {\n";

for (const fn of functions) {
  const inputs = [];
  const outputs = [];
  (fn.names ?? []).forEach((name, i) => {
    (fn.modes[i] === "t" ? outputs : inputs).push({ name, type: fn.type_names[i] });
  });
  const firstOptional = inputs.length - fn.defaults;
  const args = inputs.map((a, i) => `${a.name}${i >= firstOptional ? "?" : ""}: ${tsType(a.type)}`).join("; ");
  let returns;
  if (outputs.length) returns = `{ ${outputs.map((o) => `${o.name}: ${tsType(o.type)}`).join("; ")} }[]`;
  else returns = `${tsType(fn.return_type === "void" ? "text" : fn.return_type)}${fn.is_set ? "[]" : ""}`;
  if (fn.return_type === "void") returns = "undefined";
  out += `      ${fn.name}: { Args: ${args ? `{ ${args} }` : "Record<PropertyKey, never>"}; Returns: ${returns} };\n`;
}

out += "    };\n    Enums: {\n";
for (const e of enums) out += `      ${e.name}: ${e.labels.map((l) => `"${l}"`).join(" | ")};\n`;
out += "    };\n    CompositeTypes: { [_ in never]: never };\n  };\n};\n";

writeFileSync(path.join(root, "src/lib/supabase/database.types.ts"), out);
console.log(`${tables.size} tables, ${functions.length} fonctions, ${enums.length} types énumérés.`);
await db.close();
