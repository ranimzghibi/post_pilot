import { z } from "zod";
import { CONTENT_LANGUAGES, EMOJI_USAGE, GOALS, SECTORS, TONES } from "@/lib/domain";

export const answersSchema = z.object({
  sector: z.enum(SECTORS).optional(),
  offer: z.string().trim().max(2000).optional(),
  audience: z.string().trim().max(2000).optional(),
  goals: z.array(z.enum(GOALS)).max(6).optional(),
  difference: z.string().trim().max(2000).optional(),
  tones: z.array(z.enum(TONES)).max(3).optional(),
  languages: z.array(z.enum(CONTENT_LANGUAGES)).min(1).max(4).optional(),
  avoid: z.array(z.string().trim().min(1).max(60)).max(40).optional(),
  emoji_usage: z.enum(EMOJI_USAGE).optional(),
  example_post: z.string().trim().max(2000).optional(),
});

export const saveOnboardingSchema = z.object({ step: z.number().int().min(0).max(5), answers: answersSchema });
