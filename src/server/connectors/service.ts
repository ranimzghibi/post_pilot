import "server-only";

import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import { can } from "@/lib/rbac";
import { isTenantPath, toErrorMessage } from "@/lib/utils";
import type { BrandContext } from "../context";
import { AppError } from "../errors";
import { facebookConnector, instagramConnector, metaConfigured, metaInspectToken, metaRefreshTokens } from "./meta";
import { SocialApiError, type SocialConnector } from "./types";

export type SocialAccount = Database["public"]["Tables"]["social_accounts"]["Row"];
export type TokenKind = "access" | "user_access";

const CONNECTORS: Record<string, SocialConnector> = {
  facebook: facebookConnector,
  instagram: instagramConnector,
};

/** Connecteur simulé : parcours complet sans compte Meta, jamais d'appel externe. */
const sandboxConnector: SocialConnector = {
  network: "sandbox",
  async publish() {
    const id = `sandbox_${randomUUID()}`;
    return { externalPostId: id, url: null };
  },
  async recentPosts() {
    return [];
  },
};

export function connectorFor(account: Pick<SocialAccount, "network" | "is_sandbox">): SocialConnector {
  if (account.is_sandbox) return sandboxConnector;
  const connector = CONNECTORS[account.network];
  if (!connector) throw new AppError("network_unsupported");
  return connector;
}

export const isSandboxMode = () => !metaConfigured();

export async function storeToken(accountId: string, organizationId: string, kind: TokenKind, token: string): Promise<void> {
  const admin = createAdminClient();
  const { data: existing } = await admin.from("social_account_secrets").select("secret_id").eq("account_id", accountId).eq("kind", kind).maybeSingle();

  if (existing) {
    const { error } = await admin.rpc("vault_replace", { p_id: existing.secret_id, p_value: token });
    if (error) throw error;
    return;
  }

  const { data: secretId, error } = await admin.rpc("vault_put", { p_name: `social:${accountId}:${kind}`, p_value: token });
  if (error || !secretId) throw error ?? new Error("vault_put");
  const { error: linkError } = await admin.from("social_account_secrets").insert({ account_id: accountId, organization_id: organizationId, kind, secret_id: secretId });
  if (linkError) throw linkError;
}

export async function readToken(accountId: string, kind: TokenKind): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin.from("social_account_secrets").select("secret_id").eq("account_id", accountId).eq("kind", kind).maybeSingle();
  if (!data) return null;
  const { data: token } = await admin.rpc("vault_read", { p_id: data.secret_id });
  return token ?? null;
}

const EXPIRING_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export function statusFromExpiry(expiresAt: string | null): SocialAccount["status"] {
  if (!expiresAt) return "active";
  const remaining = new Date(expiresAt).getTime() - Date.now();
  if (remaining <= 0) return "expired";
  return remaining <= EXPIRING_WINDOW_MS ? "expiring" : "active";
}

/** Vérifie l'état d'une connexion et renouvelle ses jetons (BF-35, BF-36). */
export async function refreshConnection(account: SocialAccount): Promise<SocialAccount["status"]> {
  const admin = createAdminClient();
  const now = new Date().toISOString();

  if (account.is_sandbox) {
    await admin.from("social_accounts").update({ status: "active", last_checked_at: now, last_error: null }).eq("id", account.id);
    return "active";
  }

  try {
    const userToken = await readToken(account.id, "user_access");
    if (!userToken) throw new SocialApiError("missing_token", true);
    const refreshed = await metaRefreshTokens(userToken, account.network, account.external_id);
    await storeToken(account.id, account.organization_id, "user_access", refreshed.userToken);
    await storeToken(account.id, account.organization_id, "access", refreshed.accessToken);
    const health = await metaInspectToken(refreshed.accessToken);
    const expiresAt = health.expiresAt ?? refreshed.userTokenExpiresAt;
    const status = health.valid ? statusFromExpiry(expiresAt) : "expired";
    await admin.from("social_accounts").update({ status, token_expires_at: expiresAt, scopes: health.scopes, last_checked_at: now, last_error: null }).eq("id", account.id);
    return status;
  } catch (error) {
    const status = error instanceof SocialApiError && error.tokenInvalid ? "expired" : "error";
    await admin.from("social_accounts").update({ status, last_checked_at: now, last_error: toErrorMessage(error).slice(0, 300) }).eq("id", account.id);
    return status;
  }
}

export type PublishInput = {
  accountId: string;
  caption: string;
  assetIds: string[];
  variantId?: string | null;
  idempotencyKey: string;
};

const SIGNED_URL_TTL = 60 * 60;

/**
 * Publication immédiate (BF-93). La clé d'idempotence garantit qu'un double clic
 * ou une relance ne crée jamais deux publications.
 */
export async function publishNow(ctx: BrandContext, input: PublishInput) {
  const admin = createAdminClient();

  const { data: account } = await ctx.supabase.from("social_accounts").select("*").eq("id", input.accountId).eq("brand_id", ctx.brand.id).maybeSingle();
  if (!account) throw new AppError("not_found");

  // Rien ne part sans approbation : tant que la validation (release 2) n'existe pas,
  // l'envoi immédiat reste limité aux comptes déclarés de test.
  if (!can(ctx.role, "publishTest")) throw new AppError("forbidden");
  if (!account.is_test) throw new AppError("test_account_required");
  if (account.status === "expired") throw new AppError("account_expired");

  const { data: assets } = input.assetIds.length
    ? await ctx.supabase.from("media_assets").select("id, storage_path").in("id", input.assetIds).eq("brand_id", ctx.brand.id)
    : { data: [] };
  const ordered = input.assetIds.map((id) => assets?.find((a) => a.id === id)).filter((a): a is NonNullable<typeof a> => !!a);
  if (ordered.length !== input.assetIds.length) throw new AppError("not_found");
  if (ordered.some((a) => !isTenantPath(a.storage_path, ctx.organization.id, ctx.brand.id))) throw new AppError("forbidden");
  if (account.network === "instagram" && !ordered.length) throw new AppError("instagram_requires_media");

  const key = `${account.id}:${input.idempotencyKey}`;
  const { data: inserted, error: insertError } = await admin
    .from("publication_jobs")
    .insert({
      organization_id: ctx.organization.id,
      brand_id: ctx.brand.id,
      social_account_id: account.id,
      post_variant_id: input.variantId ?? null,
      idempotency_key: key,
      caption: input.caption,
      media_paths: ordered.map((a) => a.storage_path),
      created_by: ctx.userId,
    })
    .select("*")
    .maybeSingle();

  if (insertError && insertError.code !== "23505") throw insertError;
  if (!inserted) {
    const { data: existing } = await admin.from("publication_jobs").select("*").eq("idempotency_key", key).single();
    return existing!;
  }

  await admin.from("publication_jobs").update({ status: "running", attempts: 1 }).eq("id", inserted.id);

  try {
    const token = account.is_sandbox ? "sandbox" : await readToken(account.id, "access");
    if (!token) throw new SocialApiError("missing_token", true);

    const imageUrls = await Promise.all(
      ordered.map(async (asset) => {
        const { data, error } = await admin.storage.from("media").createSignedUrl(asset.storage_path, SIGNED_URL_TTL);
        if (error || !data) throw error ?? new Error("signed_url");
        return data.signedUrl;
      }),
    );

    const result = await connectorFor(account).publish({ externalId: account.external_id, accessToken: token, caption: input.caption, imageUrls });
    const { data: done } = await admin
      .from("publication_jobs")
      .update({ status: "succeeded", external_post_id: result.externalPostId, external_url: result.url, last_error: null })
      .eq("id", inserted.id)
      .select("*")
      .single();
    return done!;
  } catch (error) {
    await admin.from("publication_jobs").update({ status: "failed", last_error: toErrorMessage(error).slice(0, 500) }).eq("id", inserted.id);
    if (error instanceof SocialApiError && error.tokenInvalid) {
      await admin.from("social_accounts").update({ status: "expired", last_error: error.message.slice(0, 300) }).eq("id", account.id);
    }
    throw new AppError("publish_failed");
  }
}
