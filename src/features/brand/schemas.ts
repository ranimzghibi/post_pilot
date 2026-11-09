import { z } from "zod";
import { EMOJI_USAGE } from "@/lib/domain";

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "invalid_color");

export const brandProfileInput = z.object({
  summary: z.string().trim().max(2000),
  audience: z.string().trim().max(2000),
  tone: z.string().trim().max(2000),
  vocabulary: z.array(z.string().trim().min(1).max(60)).max(40),
  avoid: z.array(z.string().trim().min(1).max(60)).max(60),
  emoji_usage: z.enum(EMOJI_USAGE),
  examples: z.array(z.object({ text: z.string().trim().min(1).max(2000), note: z.string().trim().max(300) })).max(8),
  change_note: z.string().trim().max(300).optional(),
});

export const visualIdentityInput = z.object({
  logo_path: z.string().max(512).nullable(),
  colors: z.object({ primary: hex, secondary: hex, accent: hex, background: hex, text: hex }),
  heading_font: z.enum(["sans", "serif"]),
});
