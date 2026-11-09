import { createHash } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { asService, asUser, asUserCommit, createTestDb, createUser, isDenied, type TestUser } from "../support/pglite";

/** Matrice des permissions (tableau 2.2 du rapport) et règles portées par la base. */

let db: PGlite;
let owner: TestUser;
let admin: TestUser;
let editor: TestUser;
let validator: TestUser;
let viewer: TestUser;
let brandId: string;
let org: string;

async function addMember(user: TestUser, role: string) {
  await db.query("insert into public.memberships (organization_id, user_id, role) values ($1, $2, $3)", [org, user.id, role]);
}

beforeAll(async () => {
  db = await createTestDb();
  owner = await createUser(db, "owner@example.com");
  admin = await createUser(db, "admin@example.com");
  editor = await createUser(db, "editor@example.com");
  validator = await createUser(db, "validator@example.com");
  viewer = await createUser(db, "viewer@example.com");
  org = owner.orgId;
  await db.query("update public.organizations set plan = 'agency' where id = $1", [org]);
  await addMember(admin, "admin");
  await addMember(editor, "editor");
  await addMember(validator, "validator");
  await addMember(viewer, "viewer");
  const { rows } = await db.query<{ id: string }>("insert into public.brands (organization_id, name) values ($1, 'B') returning id", [org]);
  brandId = rows[0]!.id;
}, 120_000);

const insertBrand = "insert into public.brands (organization_id, name) values ($1, 'Nouvelle') returning id";
const insertPost = "insert into public.posts (organization_id, brand_id) values ($1, $2) returning id";

describe("création à l'inscription (BF-10)", () => {
  it("crée profil, espace et rôle propriétaire", async () => {
    const u = await createUser(db, "fresh@example.com");
    const { rows } = await db.query<{ role: string; plan: string }>(
      "select m.role, o.plan from public.memberships m join public.organizations o on o.id = m.organization_id where m.user_id = $1",
      [u.id],
    );
    expect(rows).toEqual([{ role: "owner", plan: "trial" }]);
  });
});

describe("matrice des permissions", () => {
  it("gérer les marques : propriétaire et administrateur uniquement", async () => {
    for (const user of [owner, admin]) {
      await asUser(db, user.id, async (tx) => {
        expect((await tx.query(insertBrand, [org])).rows).toHaveLength(1);
      });
    }
    for (const user of [editor, validator, viewer]) {
      await asUser(db, user.id, async (tx) => {
        expect(await isDenied(() => tx.query(insertBrand, [org]))).toBe(true);
      });
    }
  });

  it("supprimer une marque : propriétaire uniquement", async () => {
    await asUser(db, admin.id, async (tx) => {
      expect((await tx.query("delete from public.brands where id = $1", [brandId])).affectedRows).toBe(0);
    });
    await asUser(db, owner.id, async (tx) => {
      expect((await tx.query("delete from public.brands where id = $1", [brandId])).affectedRows).toBe(1);
    });
  });

  it("créer un contenu : propriétaire, administrateur, éditeur", async () => {
    for (const user of [owner, admin, editor]) {
      await asUser(db, user.id, async (tx) => {
        expect((await tx.query(insertPost, [org, brandId])).rows).toHaveLength(1);
      });
    }
    for (const user of [validator, viewer]) {
      await asUser(db, user.id, async (tx) => {
        expect(await isDenied(() => tx.query(insertPost, [org, brandId]))).toBe(true);
      });
    }
  });

  it("modifier l'ADN : pas pour le validateur ni le lecteur, mais tous peuvent le lire", async () => {
    const sql = "insert into public.brand_profiles (organization_id, brand_id, tone) values ($1, $2, 'direct') returning version";
    await asUser(db, editor.id, async (tx) => {
      expect((await tx.query(sql, [org, brandId])).rows).toHaveLength(1);
    });
    for (const user of [validator, viewer]) {
      await asUser(db, user.id, async (tx) => {
        expect(await isDenied(() => tx.query(sql, [org, brandId]))).toBe(true);
        expect((await tx.query("select 1 from public.brands where id = $1", [brandId])).rows).toHaveLength(1);
      });
    }
  });

  it("les versions de l'ADN sont immuables et s'incrémentent", async () => {
    await db.query("insert into public.brand_profiles (organization_id, brand_id, tone) values ($1, $2, 'v1')", [org, brandId]);
    await db.query("insert into public.brand_profiles (organization_id, brand_id, tone) values ($1, $2, 'v2')", [org, brandId]);
    const { rows } = await db.query<{ version: number }>("select version from public.brand_profiles where brand_id = $1 order by version", [brandId]);
    expect(rows.map((r) => r.version)).toEqual([1, 2]);
    await asUser(db, owner.id, async (tx) => {
      expect((await tx.query("update public.brand_profiles set tone = 'x' where brand_id = $1", [brandId])).affectedRows).toBe(0);
      expect((await tx.query("delete from public.brand_profiles where brand_id = $1", [brandId])).affectedRows).toBe(0);
    });
  });
});

describe("colonnes réservées au serveur", () => {
  it("le propriétaire ne peut pas changer son forfait lui-même", async () => {
    await asUser(db, owner.id, async (tx) => {
      expect(await isDenied(() => tx.query("update public.organizations set plan = 'agency' where id = $1", [org]))).toBe(true);
      expect((await tx.query("update public.organizations set name = 'Renommé' where id = $1", [org])).affectedRows).toBe(1);
    });
  });

  it("une publication ne change pas de statut par un appel direct, et naît brouillon", async () => {
    const { rows } = await db.query<{ id: string }>(insertPost, [org, brandId]);
    await asUser(db, owner.id, async (tx) => {
      expect(await isDenied(() => tx.query("update public.posts set status = 'approved' where id = $1", [rows[0]!.id]))).toBe(true);
      expect(await isDenied(() => tx.query("insert into public.posts (organization_id, brand_id, status) values ($1, $2, 'published')", [org, brandId]))).toBe(true);
    });
  });

  it("un utilisateur ne peut pas modifier l'e-mail de son profil", async () => {
    await asUser(db, owner.id, async (tx) => {
      expect(await isDenied(() => tx.query("update public.profiles set email = 'x@y.z' where id = $1", [owner.id]))).toBe(true);
      expect((await tx.query("update public.profiles set full_name = 'Nouveau' where id = $1", [owner.id])).affectedRows).toBe(1);
    });
  });
});

describe("gestion de l'équipe (BF-12, BF-13)", () => {
  it("un administrateur ne touche pas à un propriétaire et n'en crée pas", async () => {
    await asUser(db, admin.id, async (tx) => {
      expect(await isDenied(() => tx.query("update public.memberships set role = 'viewer' where user_id = $1 and organization_id = $2", [owner.id, org]))).toBe(true);
      expect(await isDenied(() => tx.query("delete from public.memberships where user_id = $1 and organization_id = $2", [owner.id, org]))).toBe(true);
      expect(await isDenied(() => tx.query("update public.memberships set role = 'owner' where user_id = $1 and organization_id = $2", [admin.id, org]))).toBe(true);
    });
  });

  it("un administrateur change le rôle d'un éditeur, un éditeur ne change rien", async () => {
    await asUser(db, admin.id, async (tx) => {
      expect((await tx.query("update public.memberships set role = 'viewer' where user_id = $1 and organization_id = $2", [editor.id, org])).affectedRows).toBe(1);
    });
    await asUser(db, editor.id, async (tx) => {
      expect((await tx.query("update public.memberships set role = 'owner' where user_id = $1 and organization_id = $2", [editor.id, org])).affectedRows).toBe(0);
    });
  });

  it("le dernier propriétaire ne peut être ni retiré ni rétrogradé", async () => {
    await asUser(db, owner.id, async (tx) => {
      expect(await isDenied(() => tx.query("delete from public.memberships where user_id = $1 and organization_id = $2", [owner.id, org]))).toBe(true);
      expect(await isDenied(() => tx.query("update public.memberships set role = 'admin' where user_id = $1 and organization_id = $2", [owner.id, org]))).toBe(true);
    });
  });

  it("supprimer un compte supprime aussi l'espace dont il est seul propriétaire sans blocage", async () => {
    const u = await createUser(db, "leaving@example.com");
    await db.query("delete from public.organizations where id = $1", [u.orgId]);
    await db.query("delete from auth.users where id = $1", [u.id]);
    expect((await db.query("select 1 from public.profiles where id = $1", [u.id])).rows).toHaveLength(0);
  });

  it("une invitation s'accepte une fois, avec le bon e-mail, et jamais comme propriétaire", async () => {
    const guest = await createUser(db, "guest@example.com");
    const token = "jeton-de-test";
    const hash = createHash("sha256").update(token).digest("hex");

    await asUser(db, editor.id, async (tx) => {
      expect(await isDenied(() => tx.query("insert into public.invitations (organization_id, email, role, token_hash, invited_by) values ($1, 'a@b.c', 'viewer', 'h', $2)", [org, editor.id]))).toBe(true);
    });
    await asUser(db, owner.id, async (tx) => {
      expect(await isDenied(() => tx.query("insert into public.invitations (organization_id, email, role, token_hash, invited_by) values ($1, 'a@b.c', 'owner', 'h', $2)", [org, owner.id]))).toBe(true);
    });
    await asUserCommit(db, owner.id, (tx) =>
      tx.query("insert into public.invitations (organization_id, email, role, token_hash, invited_by) values ($1, 'guest@example.com', 'editor', $2, $3)", [org, hash, owner.id]),
    );

    await asUser(db, viewer.id, async (tx) => {
      expect(await isDenied(() => tx.query("select public.accept_invitation($1)", [token]))).toBe(true);
    });

    await asUserCommit(db, guest.id, (tx) => tx.query("select public.accept_invitation($1)", [token]));
    const { rows } = await db.query<{ role: string }>("select role from public.memberships where organization_id = $1 and user_id = $2", [org, guest.id]);
    expect(rows).toEqual([{ role: "editor" }]);

    await asUser(db, guest.id, async (tx) => {
      expect(await isDenied(() => tx.query("select public.accept_invitation($1)", [token]))).toBe(true);
    });
  });
});

describe("limites de forfait", () => {
  it("refuse une marque au-delà du forfait", async () => {
    const u = await createUser(db, "starter@example.com");
    await db.query("update public.organizations set plan = 'starter' where id = $1", [u.orgId]);
    await asUserCommit(db, u.id, (tx) => tx.query(insertBrand, [u.orgId]));
    await asUser(db, u.id, async (tx) => {
      await expect(tx.query(insertBrand, [u.orgId])).rejects.toThrow("plan_limit_brands");
    });
  });

  it("consomme un quota sans jamais le dépasser, et rend une unité", async () => {
    const u = await createUser(db, "quota@example.com");
    await db.query("update public.organizations set plan = 'starter' where id = $1", [u.orgId]);
    const consume = (n: number) => db.query<{ used: number; quota: number }>("select * from public.consume_quota($1, 'posts', $2)", [u.orgId, n]);
    expect((await consume(29)).rows[0]).toEqual({ used: 29, quota: 30 });
    await expect(consume(2)).rejects.toThrow("quota_exceeded");
    expect((await consume(1)).rows[0]!.used).toBe(30);
    await db.query("select public.refund_quota($1, 'posts', 1)", [u.orgId]);
    expect((await consume(1)).rows[0]!.used).toBe(30);
  });
});

describe("secrets et fonctions réservées au serveur", () => {
  it("un utilisateur connecté n'accède ni au Vault ni aux fonctions de service", async () => {
    await asUser(db, owner.id, async (tx) => {
      expect(await isDenied(() => tx.query("select public.vault_put('n', 'v')"))).toBe(true);
      expect(await isDenied(() => tx.query("select public.vault_read(gen_random_uuid())"))).toBe(true);
      expect(await isDenied(() => tx.query("select * from public.consume_quota($1, 'posts', 1)", [org]))).toBe(true);
      expect(await isDenied(() => tx.query("select public.check_rate_limit('k', 1, 60)"))).toBe(true);
      expect(await isDenied(() => tx.query("select * from public.social_account_secrets"))).toBe(false);
      expect((await tx.query("select * from public.social_account_secrets")).rows).toHaveLength(0);
    });
  });

  it("le service écrit et relit un secret", async () => {
    await asService(db, async (tx) => {
      const put = await tx.query<{ vault_put: string }>("select public.vault_put('secret-test', 'valeur')");
      const read = await tx.query<{ vault_read: string }>("select public.vault_read($1)", [put.rows[0]!.vault_put]);
      expect(read.rows[0]!.vault_read).toBe("valeur");
    });
  });

  it("déconnecter un compte supprime immédiatement ses jetons (BF-37)", async () => {
    const { rows: accounts } = await db.query<{ id: string }>(
      "insert into public.social_accounts (organization_id, brand_id, network, external_id, display_name) values ($1, $2, 'facebook', 'purge', 'P') returning id",
      [org, brandId],
    );
    const { rows: secrets } = await db.query<{ id: string }>("select vault.create_secret('token-en-clair', 'purge-test') as id");
    await db.query("insert into public.social_account_secrets (account_id, organization_id, kind, secret_id) values ($1, $2, 'access', $3)", [accounts[0]!.id, org, secrets[0]!.id]);

    await asUserCommit(db, admin.id, (tx) => tx.query("delete from public.social_accounts where id = $1", [accounts[0]!.id]));

    expect((await db.query("select 1 from vault.secrets where id = $1", [secrets[0]!.id])).rows).toHaveLength(0);
    expect((await db.query("select 1 from public.social_account_secrets where account_id = $1", [accounts[0]!.id])).rows).toHaveLength(0);
  });

  it("un éditeur ne peut pas déconnecter un compte social", async () => {
    const { rows } = await db.query<{ id: string }>(
      "insert into public.social_accounts (organization_id, brand_id, network, external_id, display_name) values ($1, $2, 'instagram', 'keep', 'P') returning id",
      [org, brandId],
    );
    await asUser(db, validator.id, async (tx) => {
      expect((await tx.query("delete from public.social_accounts where id = $1", [rows[0]!.id])).affectedRows).toBe(0);
      expect(await isDenied(() => tx.query("update public.social_accounts set status = 'active' where id = $1", [rows[0]!.id]))).toBe(true);
    });
  });
});

describe("correctifs de la relecture de sécurité", () => {
  const traversal = "../../../../rest/v1/social_account_secrets?select=*";

  it("un chemin de fichier ne peut pas sortir du dossier de la marque, même pour un propriétaire", async () => {
    const insertDoc = "insert into public.knowledge_documents (organization_id, brand_id, source_type, title, storage_path) values ($1, $2, 'file', 't', $3)";
    const insertAsset = "insert into public.media_assets (organization_id, brand_id, source, storage_path, mime_type) values ($1, $2, 'upload', $3, 'image/jpeg')";
    await asUser(db, owner.id, async (tx) => {
      for (const sql of [insertDoc, insertAsset]) {
        for (const bad of [traversal, `${org}/${brandId}/../../x.jpg`, `${org}/autre-marque/x.jpg`, `${org}/${brandId}/x?y=1`]) {
          expect(await isDenied(() => tx.query(sql, [org, brandId, bad])), bad).toBe(true);
        }
        expect(await isDenied(() => tx.query(sql, [org, brandId, `${org}/${brandId}/${Math.random()}-ok.jpg`]))).toBe(false);
      }
    });
  });

  it("une marque ne peut pas changer d'espace de travail", async () => {
    const second = await createUser(db, "double@example.com");
    await addMember(second, "owner");
    const { rows } = await db.query<{ id: string }>("insert into public.brands (organization_id, name) values ($1, 'Mobile') returning id", [second.orgId]);
    await asUser(db, second.id, async (tx) => {
      expect(await isDenied(() => tx.query("update public.brands set organization_id = $1 where id = $2", [org, rows[0]!.id]))).toBe(true);
      expect((await tx.query("update public.brands set name = 'Renommée' where id = $1", [rows[0]!.id])).affectedRows).toBe(1);
    });
  });

  it("après le brouillon, le texte est figé et la publication ne se supprime plus", async () => {
    const { rows: posts } = await db.query<{ id: string }>("insert into public.posts (organization_id, brand_id, status) values ($1, $2, 'approved') returning id", [org, brandId]);
    await db.query("insert into public.post_variants (organization_id, brand_id, post_id, network, caption) values ($1, $2, $3, 'facebook', 'validé')", [org, brandId, posts[0]!.id]);
    await asUser(db, owner.id, async (tx) => {
      expect((await tx.query("update public.post_variants set caption = 'modifié' where post_id = $1", [posts[0]!.id])).affectedRows).toBe(0);
      expect((await tx.query("delete from public.post_variants where post_id = $1", [posts[0]!.id])).affectedRows).toBe(0);
      expect((await tx.query("delete from public.posts where id = $1", [posts[0]!.id])).affectedRows).toBe(0);
    });
  });
});
