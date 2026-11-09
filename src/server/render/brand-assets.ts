import "server-only";

import type { VisualIdentity } from "@/lib/domain";
import type { SlideInput } from "@/features/studio/schemas";
import { latestProfile } from "../ai/brand-context";
import type { BrandContext } from "../context";
import { AppError } from "../errors";
import { cropToFormat, logoToDataUrl, toDataUrl } from "./render";
import type { Slide, VisualFormat } from "./templates";

export async function downloadMedia(ctx: BrandContext, path: string): Promise<Buffer> {
  const { data, error } = await ctx.supabase.storage.from("media").download(path);
  if (error || !data) throw new AppError("not_found");
  return Buffer.from(await data.arrayBuffer());
}

export async function loadBrandVisuals(ctx: BrandContext): Promise<{ identity: VisualIdentity; logo: string | null }> {
  const profile = await latestProfile(ctx);
  const identity = (profile?.visual_identity ?? {}) as VisualIdentity;
  const logo = identity.logo_path ? await downloadMedia(ctx, identity.logo_path).then(logoToDataUrl).catch(() => null) : null;
  return { identity, logo };
}

/** Résout l'image d'une diapositive : l'actif doit appartenir à la marque active. */
export async function resolveSlide(ctx: BrandContext, input: SlideInput, format: VisualFormat): Promise<Slide> {
  const { imageAssetId, ...text } = input;
  if (!imageAssetId) return text;
  const { data: asset } = await ctx.supabase.from("media_assets").select("storage_path").eq("id", imageAssetId).eq("brand_id", ctx.brand.id).maybeSingle();
  if (!asset) throw new AppError("not_found");
  const cropped = await cropToFormat(await downloadMedia(ctx, asset.storage_path), format);
  return { ...text, image: toDataUrl(cropped) };
}
