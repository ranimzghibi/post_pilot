"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { NETWORK_LIST, type Network, type Pillar, type Sector } from "@/lib/domain";
import type { Json } from "@/lib/supabase/database.types";
import { createBrandAction } from "@/server/action";
import { loadBrandAiContext } from "@/server/ai/brand-context";
import { demoCalendar, demoStrategy } from "@/server/ai/demo";
import { brandBlock, eventsBlock, GUARDRAILS, languageName, newsBlock, pillarsBlock, PROMPT_VERSIONS, type LocalEventRow } from "@/server/ai/prompts";
import { generateStructured } from "@/server/ai/run";
import { calendarSchema, strategySchema } from "@/server/ai/schemas";
import { ideasForMonth, monthDates, normalizeFormatMix, normalizeFrequency, normalizeIdeas, normalizePillars, weekOf, type NormalizedFrequency } from "@/server/content/normalize";
import type { BrandContext } from "@/server/context";
import { AppError, unwrap } from "@/server/errors";

const period = z.string().regex(/^\d{4}-\d{2}-01$/, "invalid_period");
const AI_LIMIT = { name: "planning", limit: 20, windowSeconds: 3600 };

async function connectedNetworks(ctx: BrandContext): Promise<Network[]> {
  const { data } = await ctx.supabase.from("social_accounts").select("network").eq("brand_id", ctx.brand.id);
  const networks = Array.from(new Set((data ?? []).map((a) => a.network))).filter((n): n is Network => (NETWORK_LIST as string[]).includes(n));
  return networks.length ? networks : NETWORK_LIST;
}

async function eventsOfMonth(ctx: BrandContext, month: string): Promise<LocalEventRow[]> {
  const dates = monthDates(month);
  const { data } = await ctx.supabase.from("local_events").select("*").gte("event_date", dates[0]!).lte("event_date", dates[dates.length - 1]!).order("event_date");
  const sector = ctx.brand.industry as Sector | null;
  return (data ?? []).filter((e) => !e.sectors.length || !sector || e.sectors.includes(sector === "cafe" ? "restaurant" : sector));
}

export const generateStrategy = createBrandAction({ schema: z.object({ period }), permission: "editBrand", rateLimit: AI_LIMIT }, async ({ period: month }, ctx) => {
  const ai = await loadBrandAiContext(ctx);
  const [networks, events] = await Promise.all([connectedNetworks(ctx), eventsOfMonth(ctx, month)]);

  const fallback = demoStrategy(ctx.brand.name, networks, ai.language);
  const { object, generationId } = await generateStructured({
    feature: "strategy",
    tier: "smart",
    schema: strategySchema,
    system: `${GUARDRAILS}\n\n${brandBlock(ctx.brand, ai.profile, ai.answers)}`,
    prompt: [
      `Build the editorial strategy of this brand for the month starting ${month}. Write every text value in ${languageName(ai.language)}.`,
      `Business goals: ${(ai.answers.goals ?? []).join(", ") || "not specified"}.`,
      `Target networks: ${networks.join(", ")}.`,
      `Current business news:\n${newsBlock(ai.news)}`,
      `Local highlights this month:\n${eventsBlock(events)}`,
      "Provide 3 measurable objectives, 3 to 5 content pillars whose shares sum to 100, a realistic posts-per-week rhythm for a small team on each network, and a format mix (text, image, carousel percentages) per network.",
    ].join("\n\n"),
    promptVersion: PROMPT_VERSIONS.strategy,
    scope: { organizationId: ctx.organization.id, brandId: ctx.brand.id, userId: ctx.userId, brandProfileVersion: ai.profile?.version },
    demo: () => fallback,
  });

  const row = unwrap(
    await ctx.supabase
      .from("strategies")
      .upsert(
        {
          organization_id: ctx.organization.id,
          brand_id: ctx.brand.id,
          period: month,
          summary: object.summary.slice(0, 2000),
          objectives: object.objectives.slice(0, 5) as Json,
          pillars: normalizePillars(object.pillars, fallback.pillars) as Json,
          tone: object.tone.slice(0, 2000),
          frequency: normalizeFrequency(object.frequency, networks) as Json,
          format_mix: normalizeFormatMix(object.format_mix, networks) as Json,
          status: "active",
          brand_profile_version: ai.profile?.version ?? null,
          ai_generation_id: generationId,
          created_by: ctx.userId,
        },
        { onConflict: "brand_id,period" },
      )
      .select("id")
      .single(),
  );

  revalidatePath("/app/strategy");
  revalidatePath("/app");
  return { id: row.id };
});

const pillarInput = z.object({ name: z.string().trim().min(1).max(80), description: z.string().trim().max(300), share: z.number().min(0).max(100) });

export const updateStrategy = createBrandAction(
  {
    schema: z.object({
      id: z.uuid(),
      summary: z.string().trim().max(2000),
      tone: z.string().trim().max(2000),
      objectives: z.array(z.object({ title: z.string().trim().min(1).max(200), metric: z.string().trim().max(200) })).max(5),
      pillars: z.array(pillarInput).min(3, "pillars_range").max(5, "pillars_range"),
      frequency: z.record(z.string(), z.number().int().min(1).max(7)),
    }),
    permission: "editBrand",
  },
  async ({ id, ...input }, ctx) => {
    const fallback: Pillar[] = [];
    unwrap(
      await ctx.supabase
        .from("strategies")
        .update({ ...input, pillars: normalizePillars(input.pillars, fallback) as Json, objectives: input.objectives as Json, frequency: input.frequency as Json })
        .eq("id", id)
        .eq("brand_id", ctx.brand.id),
    );
    revalidatePath("/app/strategy");
    return null;
  },
);

type StrategyRow = NonNullable<Awaited<ReturnType<typeof loadStrategy>>>;

async function loadStrategy(ctx: BrandContext, month: string) {
  const { data } = await ctx.supabase.from("strategies").select("*").eq("brand_id", ctx.brand.id).eq("period", month).maybeSingle();
  return data;
}

async function draftIdeas(ctx: BrandContext, strategy: StrategyRow, input: { month: string; dates: string[]; count: number; existing: { planned_on: string; title: string }[]; instruction?: string; onlyPillar?: string }) {
  const ai = await loadBrandAiContext(ctx);
  const allPillars = strategy.pillars as Pillar[];
  const pillars = input.onlyPillar ? allPillars.filter((p) => p.name === input.onlyPillar) : allPillars;
  const networks = Object.keys(strategy.frequency as NormalizedFrequency) as Network[];
  const events = (await eventsOfMonth(ctx, input.month)).filter((e) => input.dates.includes(e.event_date));

  const { object, generationId } = await generateStructured({
    feature: "calendar",
    tier: "smart",
    schema: calendarSchema,
    system: `${GUARDRAILS}\n\n${brandBlock(ctx.brand, ai.profile, ai.answers)}\n\nContent pillars:\n${pillarsBlock(allPillars)}`,
    prompt: [
      `Plan exactly ${input.count} dated post ideas. Write titles and angles in ${languageName(ai.language)}.`,
      `Only use these dates: ${input.dates.join(", ")}. Spread the ideas evenly.`,
      `Use these pillar names exactly: ${pillars.map((p) => p.name).join(", ")}, respecting their shares.`,
      `Allowed networks: ${networks.join(", ")}. Formats: text, image, carousel.`,
      `Local highlights to use when relevant (set local_event_slug):\n${eventsBlock(events)}`,
      `Current business news to weave in:\n${newsBlock(ai.news)}`,
      input.existing.length ? `Already planned, do not repeat:\n${input.existing.map((e) => `- ${e.planned_on}: ${e.title}`).join("\n")}` : "",
      input.instruction ? `Extra request from the user: ${input.instruction}` : "",
    ]
      .filter(Boolean)
      .join("\n\n"),
    promptVersion: PROMPT_VERSIONS.calendar,
    scope: { organizationId: ctx.organization.id, brandId: ctx.brand.id, userId: ctx.userId, brandProfileVersion: ai.profile?.version },
    demo: () => demoCalendar({ period: input.month, pillars, networks, count: input.count, language: ai.language, events, allowedDates: input.dates }),
    maxOutputTokens: 12000,
  });

  const normalized = normalizeIdeas(object.ideas, {
    allowedDates: input.dates,
    pillars: pillars.map((p) => p.name),
    networks,
    max: input.count,
    knownEvents: events.map((e) => e.slug),
  });

  return { normalized, events, generationId };
}

async function insertIdeas(ctx: BrandContext, strategy: StrategyRow, result: Awaited<ReturnType<typeof draftIdeas>>) {
  if (!result.normalized.length) throw new AppError("ai_failed");
  unwrap(
    await ctx.supabase.from("calendar_ideas").insert(
      result.normalized.map(({ local_event_slug, ...idea }) => ({
        ...idea,
        organization_id: ctx.organization.id,
        brand_id: ctx.brand.id,
        strategy_id: strategy.id,
        local_event_id: result.events.find((e) => e.slug === local_event_slug)?.id ?? null,
      })),
    ),
  );
}

export const generateCalendar = createBrandAction({ schema: z.object({ period }), permission: "editBrand", rateLimit: AI_LIMIT }, async ({ period: month }, ctx) => {
  const strategy = await loadStrategy(ctx, month);
  if (!strategy) throw new AppError("strategy_required");

  const { data: kept } = await ctx.supabase.from("calendar_ideas").select("id, planned_on, title, is_locked, status").eq("strategy_id", strategy.id);
  const removable = (kept ?? []).filter((i) => !i.is_locked && i.status === "idea");
  const stay = (kept ?? []).filter((i) => i.is_locked || i.status !== "idea");

  const count = Math.max(ideasForMonth(strategy.frequency as NormalizedFrequency, month) - stay.length, 1);
  const dates = monthDates(month).filter((d) => !stay.some((s) => s.planned_on === d));
  const result = await draftIdeas(ctx, strategy, { month, dates, count, existing: stay });

  if (removable.length) unwrap(await ctx.supabase.from("calendar_ideas").delete().in("id", removable.map((i) => i.id)));
  await insertIdeas(ctx, strategy, result);

  revalidatePath("/app/calendar");
  revalidatePath("/app");
  return { count: result.normalized.length };
});

/** Régénération partielle (BF-44) : les idées verrouillées ou déjà rédigées ne bougent pas. */
export const regenerateIdeas = createBrandAction(
  {
    schema: z.object({
      period,
      scope: z.discriminatedUnion("kind", [z.object({ kind: z.literal("all") }), z.object({ kind: z.literal("week"), week: z.number().int().min(0).max(4) }), z.object({ kind: z.literal("pillar"), pillar: z.string().max(80) })]),
      instruction: z.string().trim().max(500).optional(),
    }),
    permission: "editBrand",
    rateLimit: AI_LIMIT,
  },
  async ({ period: month, scope, instruction }, ctx) => {
    const strategy = await loadStrategy(ctx, month);
    if (!strategy) throw new AppError("strategy_required");

    const { data: all } = await ctx.supabase.from("calendar_ideas").select("id, planned_on, title, pillar, is_locked, status").eq("strategy_id", strategy.id);
    const inScope = (idea: { planned_on: string; pillar: string }) => (scope.kind === "all" ? true : scope.kind === "week" ? weekOf(idea.planned_on) === scope.week : idea.pillar === scope.pillar);
    const targets = (all ?? []).filter((i) => !i.is_locked && i.status === "idea" && inScope(i));
    if (!targets.length) throw new AppError("nothing_to_regenerate");

    const others = (all ?? []).filter((i) => !targets.includes(i));
    const dates = Array.from(new Set(targets.map((t) => t.planned_on))).sort();
    const result = await draftIdeas(ctx, strategy, {
      month,
      dates,
      count: targets.length,
      existing: others,
      instruction,
      onlyPillar: scope.kind === "pillar" ? scope.pillar : undefined,
    });

    unwrap(await ctx.supabase.from("calendar_ideas").delete().in("id", targets.map((t) => t.id)));
    await insertIdeas(ctx, strategy, result);
    revalidatePath("/app/calendar");
    return { count: result.normalized.length };
  },
);

const ideaFields = {
  planned_on: z.iso.date(),
  pillar: z.string().trim().min(1).max(80),
  format: z.enum(["text", "image", "carousel"]),
  networks: z.array(z.enum(["facebook", "instagram"])).min(1, "required"),
  title: z.string().trim().min(1, "required").max(200),
  angle: z.string().trim().max(1000),
};

export const saveIdea = createBrandAction(
  { schema: z.object({ id: z.uuid().optional(), period, ...ideaFields, is_locked: z.boolean() }), permission: "editContent" },
  async ({ id, period: month, ...fields }, ctx) => {
    if (fields.planned_on.slice(0, 7) !== month.slice(0, 7)) throw new AppError("date_out_of_month");
    if (id) {
      unwrap(await ctx.supabase.from("calendar_ideas").update(fields).eq("id", id).eq("brand_id", ctx.brand.id));
    } else {
      const strategy = await loadStrategy(ctx, month);
      if (!strategy) throw new AppError("strategy_required");
      unwrap(await ctx.supabase.from("calendar_ideas").insert({ ...fields, organization_id: ctx.organization.id, brand_id: ctx.brand.id, strategy_id: strategy.id }));
    }
    revalidatePath("/app/calendar");
    return null;
  },
);

export const deleteIdea = createBrandAction({ schema: z.object({ id: z.uuid() }), permission: "editContent" }, async ({ id }, ctx) => {
  unwrap(await ctx.supabase.from("calendar_ideas").delete().eq("id", id).eq("brand_id", ctx.brand.id));
  revalidatePath("/app/calendar");
  return null;
});
