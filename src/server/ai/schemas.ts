import { z } from "zod";

// Schémas envoyés au modèle : volontairement sans bornes numériques, que certaines
// API de sortie structurée refusent. Les limites sont appliquées à la réception.

export const websiteProfileSchema = z.object({
  name: z.string(),
  sector: z.string().describe("One of: restaurant, cafe, retail, ecommerce, fashion, beauty, fitness, health, training, services, real_estate, crafts, other"),
  offer: z.string(),
  audience: z.string(),
  difference: z.string(),
});
export type WebsiteProfile = z.infer<typeof websiteProfileSchema>;

export const brandProfileSchema = z.object({
  summary: z.string(),
  audience: z.string(),
  tone: z.string(),
  vocabulary: z.array(z.string()),
  avoid: z.array(z.string()),
  emoji_usage: z.enum(["none", "rare", "moderate", "frequent"]),
  examples: z.array(z.object({ text: z.string(), note: z.string() })),
});
export type BrandProfileOutput = z.infer<typeof brandProfileSchema>;

export const strategySchema = z.object({
  summary: z.string(),
  objectives: z.array(z.object({ title: z.string(), metric: z.string() })),
  pillars: z.array(z.object({ name: z.string(), description: z.string(), share: z.number() })),
  tone: z.string(),
  frequency: z.array(z.object({ network: z.string(), posts_per_week: z.number() })),
  format_mix: z.array(z.object({ network: z.string(), text: z.number(), image: z.number(), carousel: z.number() })),
});
export type StrategyOutput = z.infer<typeof strategySchema>;

export const calendarSchema = z.object({
  ideas: z.array(
    z.object({
      date: z.string().describe("YYYY-MM-DD"),
      pillar: z.string(),
      format: z.enum(["text", "image", "carousel"]),
      networks: z.array(z.string()),
      title: z.string(),
      angle: z.string(),
      local_event_slug: z.string().nullable(),
    }),
  ),
});
export type CalendarOutput = z.infer<typeof calendarSchema>;

export const postSchema = z.object({
  options: z.array(
    z.object({
      visual_brief: z.string(),
      variants: z.array(z.object({ network: z.string(), caption: z.string(), hashtags: z.array(z.string()), cta: z.string() })),
    }),
  ),
});
export type PostOutput = z.infer<typeof postSchema>;

export const rewriteSchema = z.object({ caption: z.string(), hashtags: z.array(z.string()), cta: z.string() });
export type RewriteOutput = z.infer<typeof rewriteSchema>;

export const hashtagsSchema = z.object({ hashtags: z.array(z.string()) });

export const toneSchema = z.object({
  scores: z.array(z.object({ index: z.number(), score: z.number().describe("0 to 100"), note: z.string() })),
});
export type ToneOutput = z.infer<typeof toneSchema>;
