import "server-only";

import type { Json } from "@/lib/supabase/database.types";
import { connectorFor, readToken } from "../connectors/service";
import type { BrandContext } from "../context";
import { unwrap } from "../errors";
import { loadBrandAiContext } from "../ai/brand-context";
import { demoBrandProfile } from "../ai/demo";
import { GUARDRAILS, languageName, PROMPT_VERSIONS, untrusted } from "../ai/prompts";
import { generateStructured } from "../ai/run";
import { brandProfileSchema } from "../ai/schemas";

/** Lit les dernières publications des comptes connectés (BF-21). Un échec n'empêche rien. */
async function recentPostsOf(ctx: BrandContext): Promise<string[]> {
  const { data: accounts } = await ctx.supabase.from("social_accounts").select("*").eq("brand_id", ctx.brand.id).eq("is_sandbox", false);
  const posts: string[] = [];
  for (const account of accounts ?? []) {
    try {
      const token = await readToken(account.id, "access");
      if (token) posts.push(...(await connectorFor(account).recentPosts(account.external_id, token, 10)));
    } catch (error) {
      console.warn("[brand] publications récentes indisponibles", error);
    }
  }
  return posts;
}

/** Rédige la fiche ADN à partir du questionnaire, du site et des publications récentes (BF-23). */
export async function generateBrandDna(ctx: BrandContext): Promise<number> {
  const { profile, answers, language } = await loadBrandAiContext(ctx);
  const { data: onboarding } = await ctx.supabase.from("brand_onboarding").select("website_snapshot").eq("brand_id", ctx.brand.id).maybeSingle();
  const website = onboarding?.website_snapshot as { text?: string } | null;
  const posts = await recentPostsOf(ctx);

  const prompt = [
    `Write the brand DNA sheet for "${ctx.brand.name}". Every field value must be written in ${languageName(language)}.`,
    `Questionnaire answers:\n${JSON.stringify(answers, null, 2)}`,
    website?.text ? `Website content:\n${untrusted("website", website.text)}` : "",
    posts.length ? `Recent posts by the brand:\n${untrusted("social_posts", posts.join("\n---\n"))}` : "",
    "Describe a tone specific enough to recognise this brand. Provide 8 to 15 vocabulary items, the words and phrasings to avoid, and 2 to 3 short reference posts in the brand's voice. Do not invent prices, hours or addresses in the reference posts.",
  ]
    .filter(Boolean)
    .join("\n\n");

  const { object } = await generateStructured({
    feature: "brand_profile",
    tier: "smart",
    schema: brandProfileSchema,
    system: GUARDRAILS,
    prompt,
    promptVersion: PROMPT_VERSIONS.brandProfile,
    scope: { organizationId: ctx.organization.id, brandId: ctx.brand.id, userId: ctx.userId },
    demo: () => demoBrandProfile(ctx.brand.name, answers, language),
  });

  const avoid = Array.from(new Set([...object.avoid, ...(answers.avoid ?? [])])).slice(0, 60);

  const created = unwrap(
    await ctx.supabase
      .from("brand_profiles")
      .insert({
        organization_id: ctx.organization.id,
        brand_id: ctx.brand.id,
        summary: object.summary.slice(0, 2000),
        audience: object.audience.slice(0, 2000),
        tone: object.tone.slice(0, 2000),
        vocabulary: object.vocabulary.slice(0, 40),
        avoid,
        emoji_usage: object.emoji_usage,
        examples: object.examples.slice(0, 6) as Json,
        visual_identity: (profile?.visual_identity ?? {}) as Json,
        source: "ai",
        created_by: ctx.userId,
      })
      .select("version")
      .single(),
  );
  return created.version;
}
