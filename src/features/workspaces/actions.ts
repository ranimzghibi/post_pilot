"use server";

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { getLocale, getTranslations } from "next-intl/server";
import { z } from "zod";
import { routing } from "@/i18n/routing";
import { publicEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { createAction } from "@/server/action";
import { BRAND_COOKIE, ORG_COOKIE } from "@/server/context";
import { sendInvitationEmail } from "@/server/email";
import { AppError, unwrap } from "@/server/errors";
import { brandSchema, inviteSchema, profileSchema, uuid, workspaceSchema } from "./schemas";

const cookieOptions = { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 } as const;

export async function setActiveBrand(brandId: string) {
  (await cookies()).set(BRAND_COOKIE, brandId, cookieOptions);
}

export const switchOrganization = createAction({ schema: z.object({ organizationId: uuid }) }, async ({ organizationId }, ctx) => {
  if (!ctx.memberships.some((m) => m.organization.id === organizationId)) throw new AppError("forbidden");
  const store = await cookies();
  store.set(ORG_COOKIE, organizationId, cookieOptions);
  store.delete(BRAND_COOKIE);
  revalidatePath("/", "layout");
  return null;
});

export const switchBrand = createAction({ schema: z.object({ brandId: uuid }) }, async ({ brandId }, ctx) => {
  if (!ctx.brands.some((b) => b.id === brandId)) throw new AppError("forbidden");
  await setActiveBrand(brandId);
  revalidatePath("/", "layout");
  return null;
});

export const updateProfile = createAction({ schema: profileSchema }, async (input, ctx) => {
  unwrap(await ctx.supabase.from("profiles").update({ full_name: input.fullName, locale: input.locale, timezone: input.timezone }).eq("id", ctx.userId));
  (await cookies()).set("NEXT_LOCALE", input.locale, { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  revalidatePath("/", "layout");
  return { locale: input.locale };
});

export const updateWorkspace = createAction({ schema: workspaceSchema, permission: "manageWorkspace" }, async (input, ctx) => {
  unwrap(await ctx.supabase.from("organizations").update({ name: input.name }).eq("id", ctx.organization.id));
  revalidatePath("/", "layout");
  return null;
});

export const createBrand = createAction({ schema: brandSchema, permission: "manageBrands" }, async (input, ctx) => {
  const brand = unwrap(
    await ctx.supabase
      .from("brands")
      .insert({
        organization_id: ctx.organization.id,
        name: input.name,
        timezone: input.timezone,
        website_url: input.websiteUrl || null,
        created_by: ctx.userId,
      })
      .select("id")
      .single(),
  );
  unwrap(await ctx.supabase.from("brand_onboarding").insert({ brand_id: brand.id, organization_id: ctx.organization.id }));
  await setActiveBrand(brand.id);
  revalidatePath("/", "layout");
  return { id: brand.id };
});

export const updateBrand = createAction({ schema: brandSchema.extend({ id: uuid }), permission: "manageBrands" }, async (input, ctx) => {
  unwrap(
    await ctx.supabase
      .from("brands")
      .update({ name: input.name, timezone: input.timezone, website_url: input.websiteUrl || null })
      .eq("id", input.id)
      .eq("organization_id", ctx.organization.id),
  );
  revalidatePath("/", "layout");
  return null;
});

export const deleteBrand = createAction({ schema: z.object({ id: uuid }), permission: "deleteBrand" }, async ({ id }, ctx) => {
  unwrap(await ctx.supabase.from("brands").delete().eq("id", id).eq("organization_id", ctx.organization.id));
  (await cookies()).delete(BRAND_COOKIE);
  revalidatePath("/", "layout");
  return null;
});

function invitationLink(token: string, locale: string): string {
  const prefix = locale === routing.defaultLocale ? "" : `/${locale}`;
  return `${publicEnv.appUrl}${prefix}/invite/${token}`;
}

export const inviteMember = createAction(
  { schema: inviteSchema, permission: "manageMembers", rateLimit: { name: "invite", limit: 20, windowSeconds: 3600 } },
  async ({ email, role }, ctx) => {
    if (email === ctx.email.toLowerCase()) throw new AppError("invite_self");

    const token = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(token).digest("hex");

    const { error } = await ctx.supabase.from("invitations").insert({
      organization_id: ctx.organization.id,
      email,
      role,
      token_hash: tokenHash,
      invited_by: ctx.userId,
    });

    if (error?.code === "23505") {
      // Invitation déjà en attente : on la renouvelle avec un nouveau lien.
      unwrap(
        await ctx.supabase
          .from("invitations")
          .update({ token_hash: tokenHash, role, expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString() })
          .eq("organization_id", ctx.organization.id)
          .eq("email", email)
          .is("accepted_at", null)
          .is("revoked_at", null),
      );
    } else if (error) {
      throw error;
    }

    const locale = await getLocale();
    const t = await getTranslations("settings.team");
    const link = invitationLink(token, locale);
    const inviter = ctx.profile.full_name ?? ctx.email;
    const sent = await sendInvitationEmail({
      to: email,
      organization: ctx.organization.name,
      inviter,
      link,
      subject: t("email_subject", { organization: ctx.organization.name }),
      body: t("email_body", { inviter, organization: ctx.organization.name }),
      cta: t("email_cta"),
    });

    revalidatePath("/app/settings/team");
    return { sent, link };
  },
);

export const revokeInvitation = createAction({ schema: z.object({ id: uuid }), permission: "manageMembers" }, async ({ id }, ctx) => {
  unwrap(await ctx.supabase.from("invitations").update({ revoked_at: new Date().toISOString() }).eq("id", id).eq("organization_id", ctx.organization.id));
  revalidatePath("/app/settings/team");
  return null;
});

export const changeMemberRole = createAction(
  { schema: z.object({ membershipId: uuid, role: z.enum(["owner", "admin", "editor", "validator", "viewer"]) }), permission: "manageMembers" },
  async ({ membershipId, role }, ctx) => {
    unwrap(await ctx.supabase.from("memberships").update({ role }).eq("id", membershipId).eq("organization_id", ctx.organization.id));
    revalidatePath("/app/settings/team");
    return null;
  },
);

export const removeMember = createAction({ schema: z.object({ membershipId: uuid }), permission: "manageMembers" }, async ({ membershipId }, ctx) => {
  unwrap(await ctx.supabase.from("memberships").delete().eq("id", membershipId).eq("organization_id", ctx.organization.id));
  revalidatePath("/app/settings/team");
  return null;
});

export async function acceptInvitation(token: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("accept_invitation", { p_token: token });
  if (error) {
    const known = ["invitation_invalid", "invitation_expired", "invitation_email_mismatch", "plan_limit_members", "not_authenticated"].find((code) => error.message.includes(code));
    return { ok: false, error: known ?? "unexpected" };
  }
  const store = await cookies();
  store.set(ORG_COOKIE, data, cookieOptions);
  store.delete(BRAND_COOKIE);
  revalidatePath("/", "layout");
  return { ok: true };
}
