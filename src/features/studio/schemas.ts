import { z } from "zod";
import { FORMATS, TEMPLATE_IDS, type VisualFormat } from "@/server/render/templates";

export const FORMAT_LIST = Object.keys(FORMATS) as VisualFormat[];

export const slideInput = z.object({
  kicker: z.string().trim().max(80).optional(),
  title: z.string().trim().max(200).optional(),
  body: z.string().trim().max(600).optional(),
  badge: z.string().trim().max(30).optional(),
  footer: z.string().trim().max(60).optional(),
  imageAssetId: z.uuid().nullish(),
});
export type SlideInput = z.infer<typeof slideInput>;

export const previewSchema = z.object({
  template: z.enum(TEMPLATE_IDS),
  format: z.enum(FORMAT_LIST as [VisualFormat, ...VisualFormat[]]),
  slide: slideInput,
  index: z.number().int().min(0).max(9),
  total: z.number().int().min(1).max(10),
});

export const exportSchema = z.object({
  name: z.string().trim().max(120),
  template: z.enum(TEMPLATE_IDS),
  formats: z.array(z.enum(FORMAT_LIST as [VisualFormat, ...VisualFormat[]])).min(1).max(4),
  slides: z.array(slideInput).min(1).max(10),
  postId: z.uuid().nullish(),
});
