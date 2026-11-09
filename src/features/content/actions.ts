"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { NETWORKS, type ContentLanguage, type Network } from "@/lib/domain";
import type { Json } from "@/lib/supabase/database.types";
import { createBrandAction } from "@/server/action";
import { loadBrandAiContext } from "@/server/ai/brand-context";
import { demoHashtags, demoRewrite } from "@/server/ai/demo";
import { brandBlock, GUARDRAILS, languageName, networkRules, PROMPT_VERSIONS, untrusted } from "@/server/ai/prompts";
import { generateStructured } from "@/server/ai/run";
import { hashtagsSchema, rewriteSchema } from "@/server/ai/schemas";
import { checkCompliance, normalizeHashtags } from "@/server/content/compliance";
import { complianceParams, loadFactReference } from "@/server/content/generate";
import type { BrandContext } from "@/server/context";
import { AppError, unwrap } from "@/server/errors";

async function loadVariant(ctx: BrandContext, id: string) {
  const { data } = await ctx.supabase.from("post_variants").select("*, post:posts(id, brief, idea, language, status, brand_profile_version)").eq("id", id).eq("brand_id", ctx.brand.id).maybeSingle();
  if (!data) throw new AppError("not_found");
  // Après la validation, le texte est figé (cycle de vie de la release 2).
  if (data.post.status !== "draft") throw new AppError("post_locked");
  return data;
}

async function recheck(ctx: BrandContext, input: { caption: string; hashtags: string[]; network: Network; brief: string }) {
  const ai = await loadBrandAiContext(ctx);
  const reference = await loadFactReference(ctx, ai, input.brief);
  return checkCompliance({ caption: input.caption, hashtags: input.hashtags, network: input.network, reference, ...complianceParams(ai) });
}

export const updateVariant = createBrandAction(
  { schema: z.object({ id: z.uuid(), caption: z.string().trim().min(1, "required").max(63206), hashtags: z.array(z.string().max(80)).max(30), cta: z.string().trim().max(200) }), permission: "editContent" },
  async ({ id, caption, hashtags, cta }, ctx) => {
    const variant = await loadVariant(ctx, id);
    const network = variant.network as Network;
    const clean = normalizeHashtags(hashtags, NETWORKS[network].hashtagLimit);
    const check = await recheck(ctx, { caption, hashtags: clean, network, brief: `${variant.post.idea} ${variant.post.brief}` });
    unwrap(
      await ctx.supabase
        .from("post_variants")
        .update({ caption, hashtags: clean, cta, edited_by_user: true, compliance_score: check.score, compliance_issues: check.issues as unknown as Json })
        .eq("id", id),
    );
    revalidatePath(`/app/content/${variant.post_id}`);
    return { score: check.score, issues: check.issues };
  },
);

export const selectOption = createBrandAction({ schema: z.object({ postId: z.uuid(), optionIndex: z.number().int().min(0).max(2) }), permission: "editContent" }, async ({ postId, optionIndex }, ctx) => {
  unwrap(await ctx.supabase.from("post_variants").update({ is_selected: false }).eq("post_id", postId).eq("brand_id", ctx.brand.id));
  unwrap(await ctx.supabase.from("post_variants").update({ is_selected: true }).eq("post_id", postId).eq("brand_id", ctx.brand.id).eq("option_index", optionIndex));
  revalidatePath(`/app/content/${postId}`);
  return null;
});

/** Régénère une variante selon une consigne libre : « plus court », « plus direct »… (BF-54). */
export const rewriteVariant = createBrandAction(
  { schema: z.object({ id: z.uuid(), instruction: z.string().trim().min(2, "required").max(500) }), permission: "editContent", rateLimit: { name: "rewrite", limit: 40, windowSeconds: 60 } },
  async ({ id, instruction }, ctx) => {
    const variant = await loadVariant(ctx, id);
    const network = variant.network as Network;
    const ai = await loadBrandAiContext(ctx);
    const language = variant.post.language as ContentLanguage;

    const { object, generationId } = await generateStructured({
      feature: "regenerate",
      tier: "smart",
      schema: rewriteSchema,
      system: `${GUARDRAILS}\n\n${brandBlock(ctx.brand, ai.profile, ai.answers)}`,
      prompt: [
        `Rewrite this ${network} caption in ${languageName(language)}, following the user's request. Keep every fact unchanged and add none.`,
        networkRules([network]),
        `Current caption:\n${untrusted("draft", variant.caption)}`,
        `Current hashtags: ${variant.hashtags.join(", ")}`,
        `Current call to action: ${variant.cta}`,
        `User request: ${instruction}`,
      ].join("\n\n"),
      promptVersion: PROMPT_VERSIONS.rewrite,
      scope: { organizationId: ctx.organization.id, brandId: ctx.brand.id, userId: ctx.userId, brandProfileVersion: ai.profile?.version },
      effort: "low",
      demo: () => ({ caption: demoRewrite(variant.caption, instruction), hashtags: variant.hashtags, cta: variant.cta }),
    });

    const hashtags = normalizeHashtags(object.hashtags, NETWORKS[network].hashtagLimit);
    const reference = await loadFactReference(ctx, ai, `${variant.post.idea} ${variant.post.brief}`);
    const check = checkCompliance({ caption: object.caption, hashtags, network, reference, ...complianceParams(ai) });

    unwrap(
      await ctx.supabase
        .from("post_variants")
        .update({ caption: object.caption, hashtags, cta: object.cta, edited_by_user: false, compliance_score: check.score, compliance_issues: check.issues as unknown as Json, ai_generation_id: generationId })
        .eq("id", id),
    );
    revalidatePath(`/app/content/${variant.post_id}`);
    return { caption: object.caption, hashtags, cta: object.cta, score: check.score, issues: check.issues };
  },
);

export const suggestHashtags = createBrandAction({ schema: z.object({ id: z.uuid() }), permission: "editContent", rateLimit: { name: "hashtags", limit: 40, windowSeconds: 60 } }, async ({ id }, ctx) => {
  const variant = await loadVariant(ctx, id);
  const network = variant.network as Network;
  const ai = await loadBrandAiContext(ctx);
  const { object } = await generateStructured({
    feature: "hashtags",
    tier: "fast",
    schema: hashtagsSchema,
    system: GUARDRAILS,
    prompt: `Suggest relevant ${network} hashtags (without #) for a ${ctx.brand.industry ?? "local"} business in Tunisia, at most ${NETWORKS[network].hashtagLimit}. Mix local and niche tags.\n\n${untrusted("caption", variant.caption)}`,
    promptVersion: PROMPT_VERSIONS.hashtags,
    scope: { organizationId: ctx.organization.id, brandId: ctx.brand.id, userId: ctx.userId, brandProfileVersion: ai.profile?.version },
    effort: "low",
    demo: () => ({ hashtags: demoHashtags(ctx.brand.industry, ctx.brand.name, network) }),
  });
  return normalizeHashtags(object.hashtags, NETWORKS[network].hashtagLimit);
});

export const deletePost = createBrandAction({ schema: z.object({ id: z.uuid() }), permission: "editContent" }, async ({ id }, ctx) => {
  const { data: post } = await ctx.supabase.from("posts").select("idea_id, status").eq("id", id).eq("brand_id", ctx.brand.id).maybeSingle();
  if (!post) throw new AppError("not_found");
  if (post.status !== "draft") throw new AppError("post_locked");
  unwrap(await ctx.supabase.from("posts").delete().eq("id", id));
  if (post.idea_id) await ctx.supabase.from("calendar_ideas").update({ status: "idea" }).eq("id", post.idea_id);
  revalidatePath("/app/content");
  return null;
});
