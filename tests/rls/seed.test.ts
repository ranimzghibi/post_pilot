import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { beforeAll, describe, expect, it } from "vitest";
import { NETWORKS, type ComplianceIssue, type EmojiUsage, type Network } from "@/lib/domain";
import { hashEmbedding } from "@/lib/text";
import { checkCompliance } from "@/server/content/compliance";
import { asUser, createTestDb, createUser, type TestUser } from "../support/pglite";

/**
 * Section 15 de la migration : compte préparé pour ranimzghibi5@gmail.com.
 * Se désactive seule le jour où cette section est retirée, avant la production.
 */

const EMAIL = "ranimzghibi5@gmail.com";
const MARKER = "-- 15. Données prêtes à l'emploi";
const root = path.resolve(__dirname, "..", "..");
const dir = path.join(root, "supabase", "migrations");
const migration = readFileSync(path.join(dir, readdirSync(dir).sort()[0]!), "utf8");
const stubs = readFileSync(path.join(root, "tests", "support", "supabase-stubs.sql"), "utf8");
const cut = migration.indexOf(MARKER);
const beforeSection = cut >= 0 ? migration.slice(0, migration.lastIndexOf("\n", migration.lastIndexOf("-- ---", cut))) : migration;
const section = cut >= 0 ? migration.slice(cut) : "";

const BRANDS = ["Maison Yasmina", "Atelier Nour", "Beldi Box"];
const TENANT_TABLES = ["brand_onboarding", "brand_profiles", "brand_news", "knowledge_documents", "knowledge_chunks", "social_accounts", "strategies", "calendar_ideas", "posts", "post_variants", "publication_jobs", "visual_projects"];

async function emptyDb(): Promise<PGlite> {
  const db = await PGlite.create({ extensions: { vector } });
  await db.exec(stubs);
  return db;
}

const count = async (db: PGlite, sql: string, params: unknown[] = []) => (await db.query<{ n: number }>(`select count(*)::int as n from ${sql}`, params)).rows[0]!.n;

describe.skipIf(cut < 0)("compte préparé (section 15)", () => {
  let db: PGlite;
  let owner: TestUser;
  let other: TestUser;
  let brands: { id: string; name: string }[];

  beforeAll(async () => {
    db = await createTestDb();
    owner = await createUser(db, EMAIL);
    other = await createUser(db, "quelquun@example.com");
    brands = (await db.query<{ id: string; name: string }>("select id, name from public.brands where organization_id = $1 order by created_at", [owner.orgId])).rows;
  });

  it("crée les trois marques dans l'ordre, sur le forfait Agence", async () => {
    expect(brands.map((b) => b.name)).toEqual(BRANDS);
    const { rows } = await db.query<{ plan: string; trial_ends_at: string | null }>("select plan, trial_ends_at from public.organizations where id = $1", [owner.orgId]);
    expect(rows[0]).toEqual({ plan: "agency", trial_ends_at: null });
  });

  it("remplit chaque table métier pour chaque marque", async () => {
    for (const brand of brands) {
      for (const table of TENANT_TABLES) {
        expect(await count(db, `public.${table} where brand_id = $1`, [brand.id]), `${brand.name} : ${table}`).toBeGreaterThan(0);
      }
    }
    expect(await count(db, "public.invitations where organization_id = $1", [owner.orgId])).toBe(2);
    expect(await count(db, "public.usage_counters where organization_id = $1 and posts_generated > 0", [owner.orgId])).toBe(1);
  });

  it("ne touche à aucun autre compte", async () => {
    expect(await count(db, "public.brands where organization_id = $1", [other.orgId])).toBe(0);
    const { rows } = await db.query<{ plan: string }>("select plan from public.organizations where id = $1", [other.orgId]);
    expect(rows[0]!.plan).toBe("trial");
  });

  it("respecte le cloisonnement : tout est lisible par le titulaire, rien par un autre", async () => {
    await asUser(db, owner.id, async (tx) => {
      expect((await tx.query("select id from public.brands")).rows).toHaveLength(3);
      expect((await tx.query("select id from public.post_variants")).rows.length).toBeGreaterThan(40);
    });
    await asUser(db, other.id, async (tx) => {
      expect((await tx.query("select id from public.brands")).rows).toHaveLength(0);
      expect((await tx.query("select id from public.knowledge_chunks")).rows).toHaveLength(0);
    });
  });

  it("garde des données cohérentes avec ce qu'attend l'application", async () => {
    for (const brand of brands) {
      const { rows: strategies } = await db.query<{ period: string; pillars: { name: string; share: number }[]; frequency: Record<string, number> }>("select period, pillars, frequency from public.strategies where brand_id = $1", [brand.id]);
      expect(strategies).toHaveLength(3);
      const pillars = strategies[0]!.pillars;
      expect(pillars.length).toBeGreaterThanOrEqual(3);
      expect(pillars.length).toBeLessThanOrEqual(5);
      expect(pillars.reduce((sum, p) => sum + p.share, 0)).toBe(100);
      expect(Object.keys(strategies[0]!.frequency).every((n) => n in NETWORKS)).toBe(true);

      const names = pillars.map((p) => p.name);
      const { rows: ideas } = await db.query<{ pillar: string }>("select pillar from public.calendar_ideas where brand_id = $1", [brand.id]);
      expect(ideas.every((i) => names.includes(i.pillar))).toBe(true);

      const orphans = await count(db, `public.calendar_ideas i join public.strategies s on s.id = i.strategy_id
        where i.brand_id = $1 and date_trunc('month', i.planned_on::timestamp)::date <> s.period`, [brand.id]);
      expect(orphans).toBe(0);

      const { rows: versions } = await db.query<{ version: number }>("select version from public.brand_profiles where brand_id = $1 order by version", [brand.id]);
      expect(versions.map((v) => v.version)).toEqual(versions.map((_, i) => i + 1));

      // Chaque publication a exactement une variante choisie par réseau.
      const { rows: posts } = await db.query<{ networks: number; selected: number }>(
        `select count(distinct network)::int as networks, count(*) filter (where is_selected)::int as selected
           from public.post_variants where brand_id = $1 group by post_id`,
        [brand.id],
      );
      expect(posts.every((p) => p.selected === p.networks)).toBe(true);

      const invalidDocs = await count(db, "public.knowledge_documents d where d.brand_id = $1 and (d.status <> 'ready' or d.chunk_count <> (select count(*) from public.knowledge_chunks c where c.document_id = d.id))", [brand.id]);
      expect(invalidDocs).toBe(0);

      // Sans image, Instagram est impossible : seuls des envois Facebook figurent à l'historique.
      const instagramJobs = await count(db, "public.publication_jobs j join public.social_accounts a on a.id = j.social_account_id where j.brand_id = $1 and a.network = 'instagram'", [brand.id]);
      expect(instagramJobs).toBe(0);
      const realAccounts = await count(db, "public.social_accounts where brand_id = $1 and not (is_sandbox and is_test)", [brand.id]);
      expect(realAccounts).toBe(0);
    }
  });

  it("annonce les scores que le vrai contrôle de conformité calcule", async () => {
    for (const brand of brands) {
      const { rows: profile } = await db.query<{ avoid: string[]; emoji_usage: EmojiUsage }>("select avoid, emoji_usage from public.brand_profiles where brand_id = $1 order by version desc limit 1", [brand.id]);
      const { rows: extra } = await db.query<{ text: string }>(
        `select description as text from public.brands where id = $1
         union all select content from public.knowledge_chunks where brand_id = $1
         union all select title || ' ' || details from public.brand_news
           where brand_id = $1 and is_active and (ends_on is null or ends_on >= current_date)`,
        [brand.id],
      );
      const { rows: variants } = await db.query<{ caption: string; hashtags: string[]; network: Network; compliance_score: number; compliance_issues: ComplianceIssue[]; idea: string; brief: string; sensitive_topics: string[] }>(
        `select v.caption, v.hashtags, v.network, v.compliance_score, v.compliance_issues, p.idea, p.brief, p.sensitive_topics
           from public.post_variants v join public.posts p on p.id = v.post_id where v.brand_id = $1`,
        [brand.id],
      );
      expect(variants.length).toBeGreaterThan(10);

      for (const v of variants) {
        const result = checkCompliance({
          caption: v.caption,
          hashtags: v.hashtags,
          network: v.network,
          avoid: profile[0]!.avoid,
          emojiUsage: profile[0]!.emoji_usage,
          reference: [`${v.idea} ${v.brief}`, ...extra.map((e) => e.text)].join("\n"),
        });
        expect({ caption: v.caption, score: v.compliance_score, issues: v.compliance_issues }).toEqual({ caption: v.caption, score: result.score, issues: result.issues });
        expect(v.sensitive_topics.filter((topic) => result.sensitiveTopics.includes(topic))).toEqual(v.sensitive_topics);
        expect(v.hashtags.length).toBeLessThanOrEqual(NETWORKS[v.network].hashtagLimit);
      }
    }
  });

  it("trouve les passages dans la base de connaissances, en français comme en arabe", async () => {
    const search = async (brand: string, query: string) =>
      asUser(db, owner.id, async (tx) => (await tx.query<{ content: string }>("select content from public.match_knowledge($1, $2::extensions.vector, $3, 5)", [brands.find((b) => b.name === brand)!.id, `[${hashEmbedding(query, 1024).join(",")}]`, query])).rows);
    expect((await search("Maison Yasmina", "couscous mérou"))[0]!.content).toContain("42 DT");
    expect((await search("Beldi Box", "هريسة"))[0]!.content).toContain("9 د.ت");
  });

  it("peut être relancée sans doublon, et conserve ce que l'utilisateur a modifié", async () => {
    const posts = await count(db, "public.posts where organization_id = $1", [owner.orgId]);
    await db.query("update public.brands set description = 'Modifiée' where id = $1", [brands[0]!.id]);
    await db.exec(section);
    expect(await count(db, "public.brands where organization_id = $1", [owner.orgId])).toBe(3);
    expect(await count(db, "public.posts where organization_id = $1", [owner.orgId])).toBe(posts);
    expect(await count(db, "public.invitations where organization_id = $1", [owner.orgId])).toBe(2);
    const { rows } = await db.query<{ description: string }>("select description from public.brands where id = $1", [brands[0]!.id]);
    expect(rows[0]!.description).toBe("Modifiée");
  });

  it("s'exécute seule après coup, pour un compte qui a déjà sa propre marque", async () => {
    const fresh = await emptyDb();
    await fresh.exec(beforeSection);
    const user = await createUser(fresh, EMAIL);
    await fresh.query("insert into public.brands (organization_id, name) values ($1, 'Ma marque')", [user.orgId]);
    expect(await count(fresh, "public.posts where organization_id = $1", [user.orgId])).toBe(0);

    await fresh.exec(section);
    expect(await count(fresh, "public.brands where organization_id = $1", [user.orgId])).toBe(4);
    expect(await count(fresh, "public.posts where organization_id = $1", [user.orgId])).toBeGreaterThan(15);
    await fresh.close();
  });

  it("prépare aussi un compte créé avant la migration", async () => {
    const fresh = await emptyDb();
    await fresh.query("insert into auth.users (email, email_confirmed_at) values ($1, now())", [EMAIL]);
    await fresh.exec(migration);
    const { rows } = await fresh.query<{ user_id: string; organization_id: string; full_name: string }>(
      "select m.user_id, m.organization_id, p.full_name from public.memberships m join public.profiles p on p.id = m.user_id where m.role = 'owner'",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.full_name).toBe("Ranim Zghibi");
    expect(await count(fresh, "public.brands where organization_id = $1", [rows[0]!.organization_id])).toBe(3);
    await fresh.close();
  });

  it("se déclenche à l'inscription sous le rôle restreint du service d'authentification", async () => {
    const fresh = await emptyDb();
    await fresh.exec(migration);
    await fresh.exec("create role auth_admin_test nologin; grant usage on schema auth to auth_admin_test; grant select, insert on auth.users to auth_admin_test;");
    await fresh.exec("set role auth_admin_test");
    await fresh.query("insert into auth.users (email, email_confirmed_at) values ($1, now())", [EMAIL.toUpperCase()]);
    await fresh.exec("reset role");
    expect(await count(fresh, "public.brands")).toBe(3);
    await fresh.close();
  });

  it("n'expose rien aux clients de l'API", async () => {
    const fresh = await emptyDb();
    await fresh.exec(migration);
    await fresh.exec("set role authenticated");
    await expect(fresh.query("select private.seed_data()")).rejects.toThrow(/permission denied/);
    await fresh.exec("reset role");
    await fresh.close();
  });
});
