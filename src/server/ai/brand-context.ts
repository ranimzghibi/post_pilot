import "server-only";

import type { ContentLanguage, OnboardingAnswers } from "@/lib/domain";
import type { BrandContext } from "../context";
import { unwrap } from "../errors";
import type { BrandNewsRow, BrandProfileRow } from "./prompts";

export type BrandAiContext = {
  profile: BrandProfileRow | null;
  answers: OnboardingAnswers;
  news: BrandNewsRow[];
  language: ContentLanguage;
};

export async function latestProfile(ctx: BrandContext): Promise<BrandProfileRow | null> {
  const { data } = await ctx.supabase.from("brand_profiles").select("*").eq("brand_id", ctx.brand.id).order("version", { ascending: false }).limit(1).maybeSingle();
  return data;
}

export async function loadBrandAiContext(ctx: BrandContext): Promise<BrandAiContext> {
  const today = new Date().toISOString().slice(0, 10);
  const [profile, onboarding, news] = await Promise.all([
    latestProfile(ctx),
    ctx.supabase.from("brand_onboarding").select("answers").eq("brand_id", ctx.brand.id).maybeSingle(),
    ctx.supabase.from("brand_news").select("*").eq("brand_id", ctx.brand.id).eq("is_active", true).or(`ends_on.is.null,ends_on.gte.${today}`).order("created_at", { ascending: false }).limit(10),
  ]);
  return {
    profile,
    answers: (onboarding.data?.answers ?? {}) as OnboardingAnswers,
    news: unwrap(news) ?? [],
    language: (ctx.brand.languages[0] ?? "fr") as ContentLanguage,
  };
}
