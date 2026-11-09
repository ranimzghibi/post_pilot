import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { asUser, createTestDb, createUser, isDenied, type TestUser } from "../support/pglite";

/**
 * BNF-20 : pour chaque table portant organization_id, un utilisateur d'un autre
 * espace ne lit et n'écrit rien. La liste des tables vient du catalogue : une
 * table ajoutée sans jeu d'essai fait échouer le test.
 */

let db: PGlite;
let alice: TestUser;
let mallory: TestUser;
let tables: string[];

const brandId = "11111111-1111-4111-8111-111111111111";
const docId = "22222222-2222-4222-8222-222222222222";
const accountId = "33333333-3333-4333-8333-333333333333";
const strategyId = "44444444-4444-4444-8444-444444444444";
const ideaId = "55555555-5555-4555-8555-555555555555";
const postId = "66666666-6666-4666-8666-666666666666";
const variantId = "77777777-7777-4777-8777-777777777777";
const mediaId = "88888888-8888-4888-8888-888888888888";
const projectId = "99999999-9999-4999-8999-999999999999";

async function seedTenant(org: string, userId: string) {
  await db.exec(`
    insert into public.brands (id, organization_id, name) values ('${brandId}', '${org}', 'Café Test');
    insert into public.brand_onboarding (brand_id, organization_id) values ('${brandId}', '${org}');
    insert into public.brand_profiles (organization_id, brand_id, tone) values ('${org}', '${brandId}', 'chaleureux');
    insert into public.brand_news (organization_id, brand_id, title) values ('${org}', '${brandId}', 'Nouveau menu');
    insert into public.knowledge_documents (id, organization_id, brand_id, source_type, title)
      values ('${docId}', '${org}', '${brandId}', 'text', 'Menu');
    insert into public.knowledge_chunks (organization_id, brand_id, document_id, chunk_index, content)
      values ('${org}', '${brandId}', '${docId}', 0, 'Café 3 TND');
    insert into public.social_accounts (id, organization_id, brand_id, network, external_id, display_name)
      values ('${accountId}', '${org}', '${brandId}', 'facebook', 'p1', 'Page');
    insert into public.social_account_secrets (account_id, organization_id, kind, secret_id)
      values ('${accountId}', '${org}', 'access', gen_random_uuid());
    insert into public.social_oauth_sessions (organization_id, brand_id, user_id, provider)
      values ('${org}', '${brandId}', '${userId}', 'meta');
    insert into public.strategies (id, organization_id, brand_id, period) values ('${strategyId}', '${org}', '${brandId}', '2026-11-01');
    insert into public.calendar_ideas (id, organization_id, brand_id, strategy_id, planned_on, pillar, title)
      values ('${ideaId}', '${org}', '${brandId}', '${strategyId}', '2026-11-10', 'Produits', 'Idée');
    insert into public.posts (id, organization_id, brand_id) values ('${postId}', '${org}', '${brandId}');
    insert into public.post_variants (id, organization_id, brand_id, post_id, network) values ('${variantId}', '${org}', '${brandId}', '${postId}', 'facebook');
    insert into public.media_assets (id, organization_id, brand_id, source, storage_path, mime_type)
      values ('${mediaId}', '${org}', '${brandId}', 'upload', '${org}/${brandId}/a.jpg', 'image/jpeg');
    insert into public.visual_projects (id, organization_id, brand_id, template_id) values ('${projectId}', '${org}', '${brandId}', 'headline');
    insert into public.post_media (post_id, media_asset_id, organization_id) values ('${postId}', '${mediaId}', '${org}');
    insert into public.publication_jobs (organization_id, brand_id, idempotency_key) values ('${org}', '${brandId}', 'k1');
    insert into public.ai_generations (organization_id, feature, provider, model, prompt_version) values ('${org}', 'post', 'demo', 'demo', 'v1');
    insert into public.usage_counters (organization_id, period) values ('${org}', '2026-11-01');
    insert into public.invitations (organization_id, email, role, token_hash) values ('${org}', 'x@example.com', 'viewer', 'h1');
  `);
}

async function insertableColumns(table: string): Promise<string[]> {
  const { rows } = await db.query<{ column_name: string }>(
    `select column_name from information_schema.columns
      where table_schema = 'public' and table_name = $1 and is_generated = 'NEVER'
      order by ordinal_position`,
    [table],
  );
  return rows.map((r) => r.column_name);
}

beforeAll(async () => {
  db = await createTestDb();
  alice = await createUser(db, "alice@example.com");
  mallory = await createUser(db, "mallory@example.com");
  await seedTenant(alice.orgId, alice.id);

  const { rows } = await db.query<{ table_name: string }>(
    `select c.table_name from information_schema.columns c
       join information_schema.tables t using (table_schema, table_name)
      where c.table_schema = 'public' and c.column_name = 'organization_id' and t.table_type = 'BASE TABLE'
      order by 1`,
  );
  tables = rows.map((r) => r.table_name);
}, 120_000);

describe("RLS : couverture", () => {
  it("est activée sur 100 % des tables du schéma public", async () => {
    const { rows } = await db.query<{ relname: string }>(
      `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`,
    );
    expect(rows).toEqual([]);
  });

  it("chaque table d'espace de travail possède une ligne de test", async () => {
    expect(tables.length).toBeGreaterThanOrEqual(19);
    for (const table of tables) {
      const { rows } = await db.query<{ n: number }>(`select count(*)::int as n from public.${table} where organization_id = $1`, [alice.orgId]);
      expect(rows[0]!.n, `aucune ligne de test pour ${table} : ajoutez-la dans seedTenant`).toBeGreaterThan(0);
    }
  });
});

describe("RLS : isolation entre espaces de travail", () => {
  it("le propriétaire de l'espace voit ses données", async () => {
    await asUser(db, alice.id, async (tx) => {
      const { rows } = await tx.query<{ n: number }>("select count(*)::int as n from public.brands where organization_id = $1", [alice.orgId]);
      expect(rows[0]!.n).toBe(1);
    });
  });

  it("un autre utilisateur ne lit aucune ligne, sur aucune table", async () => {
    for (const table of tables) {
      await asUser(db, mallory.id, async (tx) => {
        const { rows } = await tx.query<{ n: number }>(`select count(*)::int as n from public.${table} where organization_id = $1`, [alice.orgId]);
        expect(rows[0]!.n, `fuite en lecture sur ${table}`).toBe(0);
      });
    }
  });

  it("un autre utilisateur ne modifie ni ne supprime rien, sur aucune table", async () => {
    for (const table of tables) {
      await asUser(db, mallory.id, async (tx) => {
        for (const sql of [
          `update public.${table} set organization_id = organization_id where organization_id = $1`,
          `delete from public.${table} where organization_id = $1`,
        ]) {
          try {
            const res = await tx.query(sql, [alice.orgId]);
            expect(res.affectedRows, `écriture permise sur ${table} : ${sql}`).toBe(0);
          } catch (error) {
            expect((error as { code?: string }).code, `erreur inattendue sur ${table}`).toBe("42501");
          }
        }
      });
    }
  });

  it("un autre utilisateur n'insère rien dans l'espace d'autrui, sur aucune table", async () => {
    for (const table of tables) {
      const cols = await insertableColumns(table);
      const { rows } = await db.query<{ row: Record<string, unknown> }>(
        `select to_jsonb(t) as row from public.${table} t where organization_id = $1 limit 1`,
        [alice.orgId],
      );
      const list = cols.map((c) => `"${c}"`).join(", ");
      await asUser(db, mallory.id, async (tx) => {
        const denied = await isDenied(() =>
          tx.query(`insert into public.${table} (${list}) select ${list} from jsonb_populate_record(null::public.${table}, $1::jsonb)`, [
            JSON.stringify(rows[0]!.row),
          ]),
        );
        expect(denied, `insertion permise sur ${table}`).toBe(true);
      });
    }
  });

  it("un visiteur anonyme ne lit aucune table", async () => {
    for (const table of tables) {
      await asUser(db, null, async (tx) => {
        expect(await isDenied(() => tx.query(`select * from public.${table}`)), `accès anonyme à ${table}`).toBe(true);
      });
    }
  });

  it("la recherche sémantique reste cloisonnée", async () => {
    const embedding = `[${new Array(1024).fill(0.1).join(",")}]`;
    await db.exec(`update public.knowledge_chunks set embedding = '${embedding}' where organization_id = '${alice.orgId}'`);
    const sql = "select * from public.match_knowledge($1, $2::extensions.vector, 'café', 5)";
    await asUser(db, alice.id, async (tx) => {
      const { rows } = await tx.query(sql, [brandId, embedding]);
      expect(rows).toHaveLength(1);
    });
    await asUser(db, mallory.id, async (tx) => {
      const { rows } = await tx.query(sql, [brandId, embedding]);
      expect(rows).toHaveLength(0);
    });
  });

  it("les fichiers sont cloisonnés par préfixe d'espace", async () => {
    await db.query("insert into storage.objects (bucket_id, name) values ('media', $1)", [`${alice.orgId}/brand/photo.jpg`]);
    await asUser(db, alice.id, async (tx) => {
      expect((await tx.query("select * from storage.objects where bucket_id = 'media'")).rows).toHaveLength(1);
    });
    await asUser(db, mallory.id, async (tx) => {
      expect((await tx.query("select * from storage.objects where bucket_id = 'media'")).rows).toHaveLength(0);
      expect(await isDenied(() => tx.query("insert into storage.objects (bucket_id, name) values ('media', $1)", [`${alice.orgId}/brand/x.jpg`]))).toBe(true);
      expect((await tx.query("insert into storage.objects (bucket_id, name) values ('media', $1) returning id", [`${mallory.orgId}/b/x.jpg`])).rows).toHaveLength(1);
    });
  });
});
