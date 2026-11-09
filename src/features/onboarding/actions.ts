"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { SECTORS, type OnboardingAnswers, type Sector } from "@/lib/domain";
import type { Json } from "@/lib/supabase/database.types";
import { createBrandAction } from "@/server/action";
import { demoWebsite } from "@/server/ai/demo";
import { GUARDRAILS, PROMPT_VERSIONS, untrusted } from "@/server/ai/prompts";
import { generateStructured } from "@/server/ai/run";
import { websiteProfileSchema } from "@/server/ai/schemas";
import { generateBrandDna } from "@/server/brand/dna";
import { unwrap } from "@/server/errors";
import { ingestDocument } from "@/server/knowledge/ingest";
import { extractSite } from "@/server/web/extract-site";
import { safeFetchHtml } from "@/server/web/safe-fetch";
import { saveOnboardingSchema } from "./schemas";

export const saveOnboarding = createBrandAction({ schema: saveOnboardingSchema, permission: "editBrand" }, async ({ step, answers }, ctx) => {
  const { data: existing } = await ctx.supabase.from("brand_onboarding").select("answers").eq("brand_id", ctx.brand.id).maybeSingle();
  const merged: OnboardingAnswers = { ...((existing?.answers ?? {}) as OnboardingAnswers), ...answers };

  unwrap(
    await ctx.supabase.from("brand_onboarding").upsert({
      brand_id: ctx.brand.id,
      organization_id: ctx.organization.id,
      answers: merged as Json,
      current_step: step,
    }),
  );
  return null;
});

export const analyzeWebsite = createBrandAction(
  { schema: z.object({ url: z.url("invalid_url").max(2048) }), permission: "editBrand", rateLimit: { name: "website", limit: 10, windowSeconds: 3600 } },
  async ({ url }, ctx) => {
    const { url: finalUrl, html } = await safeFetchHtml(url);
    const site = extractSite(html, finalUrl);

    const { object } = await generateStructured({
      feature: "website",
      tier: "fast",
      schema: websiteProfileSchema,
      system: GUARDRAILS,
      prompt: [
        "From this website, describe the business in the language of the site. Leave a field empty when the site does not say.",
        untrusted("website", `Title: ${site.title}\nDescription: ${site.description}\n\n${site.text}`),
      ].join("\n\n"),
      promptVersion: PROMPT_VERSIONS.website,
      scope: { organizationId: ctx.organization.id, brandId: ctx.brand.id, userId: ctx.userId },
      demo: () => demoWebsite(finalUrl, site.title, site.description),
    });

    unwrap(await ctx.supabase.from("brand_onboarding").update({ website_snapshot: site as unknown as Json }).eq("brand_id", ctx.brand.id));
    unwrap(await ctx.supabase.from("brands").update({ website_url: finalUrl }).eq("id", ctx.brand.id));

    if (site.text.length > 50) {
      const doc = unwrap(
        await ctx.supabase
          .from("knowledge_documents")
          .insert({
            organization_id: ctx.organization.id,
            brand_id: ctx.brand.id,
            source_type: "url",
            title: (site.title || finalUrl).slice(0, 200),
            raw_text: site.text,
            created_by: ctx.userId,
          })
          .select("id")
          .single(),
      );
      after(() => ingestDocument(doc.id));
    }

    return {
      sector: (SECTORS as readonly string[]).includes(object.sector) ? (object.sector as Sector) : undefined,
      offer: object.offer,
      audience: object.audience,
      difference: object.difference,
    };
  },
);

export const completeOnboarding = createBrandAction({ schema: z.object({}), permission: "editBrand", rateLimit: { name: "dna", limit: 10, windowSeconds: 3600 } }, async (_, ctx) => {
  const { data: onboarding } = await ctx.supabase.from("brand_onboarding").select("answers").eq("brand_id", ctx.brand.id).maybeSingle();
  const answers = (onboarding?.answers ?? {}) as OnboardingAnswers;

  await generateBrandDna(ctx);

  const update: { onboarding_completed_at: string; industry?: string; description?: string; languages?: string[] } = {
    onboarding_completed_at: new Date().toISOString(),
  };
  if (answers.sector) update.industry = answers.sector;
  if (answers.offer) update.description = answers.offer;
  if (answers.languages?.length) update.languages = answers.languages;

  // L'éditeur n'écrit pas sur la marque (RLS) : seul un responsable met à jour sa fiche.
  await ctx.supabase.from("brands").update(update).eq("id", ctx.brand.id);
  revalidatePath("/", "layout");
  return null;
});
