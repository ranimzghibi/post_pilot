"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createBrandAction } from "@/server/action";
import { publishNow, refreshConnection, statusFromExpiry, storeToken, type SocialAccount } from "@/server/connectors/service";
import type { ConnectCandidate } from "@/server/connectors/types";
import type { MetaTokenBundle } from "@/server/connectors/meta";
import { AppError, unwrap } from "@/server/errors";

const SANDBOX_ACCOUNTS: Record<string, { name: string; username: string | null }> = {
  facebook: { name: "Page de démonstration", username: null },
  instagram: { name: "compte.demo", username: "compte.demo" },
};

export const connectSandbox = createBrandAction({ schema: z.object({ network: z.enum(["facebook", "instagram"]) }), permission: "connectSocial" }, async ({ network }, ctx) => {
  const admin = createAdminClient();
  const sample = SANDBOX_ACCOUNTS[network]!;
  const { data: account, error } = await admin
    .from("social_accounts")
    .insert({
      organization_id: ctx.organization.id,
      brand_id: ctx.brand.id,
      network,
      external_id: `sandbox-${randomUUID()}`,
      display_name: sample.name,
      username: sample.username,
      is_sandbox: true,
      is_test: true,
      connected_by: ctx.userId,
    })
    .select("id")
    .single();
  if (error) throw error;
  await storeToken(account.id, ctx.organization.id, "access", "sandbox");
  revalidatePath("/app/connections");
  return null;
});

export const connectSelected = createBrandAction(
  { schema: z.object({ sessionId: z.uuid(), keys: z.array(z.string().max(120)).min(1).max(30), isTest: z.boolean() }), permission: "connectSocial" },
  async ({ sessionId, keys, isTest }, ctx) => {
    const admin = createAdminClient();
    const { data: session } = await admin.from("social_oauth_sessions").select("*").eq("id", sessionId).eq("user_id", ctx.userId).eq("brand_id", ctx.brand.id).gt("expires_at", new Date().toISOString()).maybeSingle();
    if (!session?.secret_id) throw new AppError("oauth_expired");

    const { data: secret } = await admin.rpc("vault_read", { p_id: session.secret_id });
    if (!secret) throw new AppError("oauth_expired");
    const tokens = JSON.parse(secret) as MetaTokenBundle;
    const candidates = session.candidates as unknown as ConnectCandidate[];

    for (const key of keys) {
      const candidate = candidates.find((c) => c.key === key);
      const pageToken = tokens.pageTokens[key];
      if (!candidate || !pageToken) throw new AppError("not_found");

      const { data: account, error } = await admin
        .from("social_accounts")
        .upsert(
          {
            organization_id: ctx.organization.id,
            brand_id: ctx.brand.id,
            network: candidate.network,
            external_id: candidate.externalId,
            provider_user_id: tokens.providerUserId,
            display_name: candidate.displayName,
            username: candidate.username,
            avatar_url: candidate.avatarUrl,
            status: statusFromExpiry(tokens.userTokenExpiresAt),
            token_expires_at: tokens.userTokenExpiresAt,
            is_test: isTest,
            connected_by: ctx.userId,
            last_checked_at: new Date().toISOString(),
            last_error: null,
          },
          { onConflict: "brand_id,network,external_id" },
        )
        .select("id")
        .single();
      if (error) throw error;
      await storeToken(account.id, ctx.organization.id, "access", pageToken);
      await storeToken(account.id, ctx.organization.id, "user_access", tokens.userToken);
    }

    await admin.from("social_oauth_sessions").delete().eq("id", session.id);
    revalidatePath("/app/connections");
    return null;
  },
);

export const cancelOAuthSession = createBrandAction({ schema: z.object({ sessionId: z.uuid() }), permission: "connectSocial" }, async ({ sessionId }, ctx) => {
  await createAdminClient().from("social_oauth_sessions").delete().eq("id", sessionId).eq("user_id", ctx.userId);
  return null;
});

export const disconnectAccount = createBrandAction({ schema: z.object({ id: z.uuid() }), permission: "connectSocial" }, async ({ id }, ctx) => {
  // Le déclencheur de la base supprime les jetons du Vault dans la même transaction.
  unwrap(await ctx.supabase.from("social_accounts").delete().eq("id", id).eq("brand_id", ctx.brand.id));
  revalidatePath("/app/connections");
  return null;
});

export const refreshAccount = createBrandAction({ schema: z.object({ id: z.uuid() }), permission: "connectSocial", rateLimit: { name: "social-refresh", limit: 20, windowSeconds: 3600 } }, async ({ id }, ctx) => {
  const account = unwrap(await ctx.supabase.from("social_accounts").select("*").eq("id", id).eq("brand_id", ctx.brand.id).single()) as SocialAccount;
  const status = await refreshConnection(account);
  revalidatePath("/app/connections");
  return { status };
});

export const setAccountTestFlag = createBrandAction({ schema: z.object({ id: z.uuid(), is_test: z.boolean() }), permission: "connectSocial" }, async ({ id, is_test }, ctx) => {
  unwrap(await ctx.supabase.from("social_accounts").update({ is_test }).eq("id", id).eq("brand_id", ctx.brand.id).eq("is_sandbox", false));
  revalidatePath("/app/connections");
  return null;
});

export const publishTest = createBrandAction(
  {
    schema: z.object({
      accountId: z.uuid(),
      caption: z.string().trim().max(2200),
      assetIds: z.array(z.uuid()).max(10),
      idempotencyKey: z.uuid(),
      variantId: z.uuid().nullish(),
    }),
    permission: "publishTest",
    rateLimit: { name: "publish", limit: 30, windowSeconds: 3600 },
  },
  async (input, ctx) => {
    const job = await publishNow(ctx, input);
    revalidatePath("/app/connections");
    return { status: job.status, externalPostId: job.external_post_id, url: job.external_url };
  },
);
