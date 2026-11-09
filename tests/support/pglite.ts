import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";

const root = path.resolve(__dirname, "..", "..");
const migrationsDir = path.join(root, "supabase", "migrations");

/** Démarre un Postgres en mémoire avec les prérequis Supabase et toutes les migrations. */
export async function createTestDb(): Promise<PGlite> {
  const db = await PGlite.create({ extensions: { vector } });
  await db.exec(readFileSync(path.join(__dirname, "supabase-stubs.sql"), "utf8"));
  for (const file of readdirSync(migrationsDir).sort()) {
    await db.exec(readFileSync(path.join(migrationsDir, file), "utf8"));
  }
  return db;
}

export type TestUser = { id: string; email: string; orgId: string };

export async function createUser(db: PGlite, email: string): Promise<TestUser> {
  const { rows } = await db.query<{ id: string }>(
    `insert into auth.users (email, email_confirmed_at, raw_user_meta_data)
     values ($1, now(), '{"full_name":"Test"}') returning id`,
    [email],
  );
  const id = rows[0]!.id;
  const org = await db.query<{ organization_id: string }>(
    "select organization_id from public.memberships where user_id = $1",
    [id],
  );
  return { id, email, orgId: org.rows[0]!.organization_id };
}

/**
 * Exécute `fn` sous l'identité d'un utilisateur, comme PostgREST : rôle
 * `authenticated` et claims JWT. Tout est annulé à la fin : pas de fuite d'état.
 */
export async function asUser<T>(db: PGlite, userId: string | null, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return run(db, userId ? "authenticated" : "anon", userId, fn, false);
}

/** Même chose, mais les écritures réussies sont conservées. */
export async function asUserCommit<T>(db: PGlite, userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return run(db, "authenticated", userId, fn, true);
}

export async function asService<T>(db: PGlite, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return run(db, "service_role", null, fn, false);
}

export type Tx = {
  query: <R = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<{ rows: R[]; affectedRows?: number }>;
};

async function run<T>(db: PGlite, role: string, userId: string | null, fn: (tx: Tx) => Promise<T>, commit: boolean): Promise<T> {
  await db.exec("begin");
  try {
    await db.exec(`set local role ${role}`);
    await db.query("select set_config('request.jwt.claims', $1, true)", [
      userId ? JSON.stringify({ sub: userId, role }) : JSON.stringify({ role }),
    ]);
    const result = await fn({
      query: async <R,>(sql: string, params: unknown[] = []) => {
        await db.exec("savepoint s");
        try {
          const res = await db.query<R>(sql, params);
          await db.exec("release savepoint s");
          return { rows: res.rows, affectedRows: res.affectedRows };
        } catch (error) {
          await db.exec("rollback to savepoint s");
          throw error;
        }
      },
    });
    await db.exec(commit ? "commit" : "rollback");
    return result;
  } catch (error) {
    await db.exec("rollback");
    throw error;
  }
}

/** Vrai si l'opération est refusée par la base (droit, RLS ou règle métier). */
export async function isDenied(op: () => Promise<unknown>): Promise<boolean> {
  try {
    await op();
    return false;
  } catch {
    return true;
  }
}
