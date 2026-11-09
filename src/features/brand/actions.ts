"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Json } from "@/lib/supabase/database.types";
import { createBrandAction } from "@/server/action";
import { latestProfile } from "@/server/ai/brand-context";
import { generateBrandDna } from "@/server/brand/dna";
import type { BrandContext } from "@/server/context";
import { AppError, unwrap } from "@/server/errors";
import { brandProfileInput, visualIdentityInput } from "./schemas";

type ProfileFields = Partial<z.infer<typeof brandProfileInput>> & { visual_identity?: Json; source: "manual" | "correction" | "restore" };

/** Toute modification crée une nouvelle version complète de la fiche (BF-25). */
async function addVersion(ctx: BrandContext, fields: ProfileFields) {
  const current = await latestProfile(ctx);
  unwrap(
    await ctx.supabase.from("brand_profiles").insert({
      organization_id: ctx.organization.id,
      brand_id: ctx.brand.id,
      summary: fields.summary ?? current?.summary ?? "",
      audience: fields.audience ?? current?.audience ?? "",
      tone: fields.tone ?? current?.tone ?? "",
      vocabulary: fields.vocabulary ?? current?.vocabulary ?? [],
      avoid: fields.avoid ?? current?.avoid ?? [],
      emoji_usage: fields.emoji_usage ?? current?.emoji_usage ?? "rare",
      examples: (fields.examples ?? current?.examples ?? []) as Json,
      visual_identity: (fields.visual_identity ?? current?.visual_identity ?? {}) as Json,
      source: fields.source,
      change_note: fields.change_note || null,
      created_by: ctx.userId,
    }),
  );
  revalidatePath("/app/brand");
}

export const saveBrandProfile = createBrandAction({ schema: brandProfileInput, permission: "editBrand" }, async (input, ctx) => {
  await addVersion(ctx, { ...input, source: "manual" });
  return null;
});

export const saveVisualIdentity = createBrandAction({ schema: visualIdentityInput, permission: "editBrand" }, async (input, ctx) => {
  if (input.logo_path && !input.logo_path.startsWith(`${ctx.organization.id}/${ctx.brand.id}/`)) throw new AppError("forbidden");
  await addVersion(ctx, { visual_identity: input as Json, source: "manual" });
  return null;
});

export const restoreBrandProfile = createBrandAction({ schema: z.object({ version: z.number().int().min(1) }), permission: "editBrand" }, async ({ version }, ctx) => {
  const old = unwrap(await ctx.supabase.from("brand_profiles").select("*").eq("brand_id", ctx.brand.id).eq("version", version).single());
  await addVersion(ctx, {
    summary: old.summary,
    audience: old.audience,
    tone: old.tone,
    vocabulary: old.vocabulary,
    avoid: old.avoid,
    emoji_usage: old.emoji_usage as z.infer<typeof brandProfileInput>["emoji_usage"],
    examples: old.examples as z.infer<typeof brandProfileInput>["examples"],
    visual_identity: old.visual_identity,
    change_note: `v${version}`,
    source: "restore",
  });
  return null;
});

export const regenerateBrandProfile = createBrandAction({ schema: z.object({}), permission: "editBrand", rateLimit: { name: "dna", limit: 10, windowSeconds: 3600 } }, async (_, ctx) => {
  await generateBrandDna(ctx);
  revalidatePath("/app/brand");
  return null;
});

/** Une correction de l'utilisateur enrichit l'ADN : le texte devient un exemple de référence. */
export const addBrandExample = createBrandAction({ schema: z.object({ text: z.string().trim().min(1).max(2000) }), permission: "editBrand" }, async ({ text }, ctx) => {
  const current = await latestProfile(ctx);
  const examples = Array.isArray(current?.examples) ? (current.examples as { text: string; note: string }[]) : [];
  await addVersion(ctx, { examples: [{ text, note: "" }, ...examples].slice(0, 8), source: "correction" });
  return null;
});
