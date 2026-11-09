"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import sharp from "sharp";
import { z } from "zod";
import { IMAGE_MIME_TYPES, MAX_UPLOAD_BYTES } from "@/lib/domain";
import type { Json } from "@/lib/supabase/database.types";
import { createBrandAction } from "@/server/action";
import { latestProfile } from "@/server/ai/brand-context";
import { generateBrandImage } from "@/server/ai/images";
import { withQuota } from "@/server/ai/run";
import type { BrandContext } from "@/server/context";
import { AppError, unwrap } from "@/server/errors";
import { downloadMedia, loadBrandVisuals, resolveSlide } from "@/server/render/brand-assets";
import { renderSlide } from "@/server/render/render";
import { FORMATS } from "@/server/render/templates";
import type { VisualIdentity } from "@/lib/domain";
import { exportSchema } from "./schemas";

async function signed(ctx: BrandContext, path: string) {
  const { data } = await ctx.supabase.storage.from("media").createSignedUrl(path, 3600);
  return data?.signedUrl ?? "";
}

async function storeImage(ctx: BrandContext, buffer: Buffer, row: { source: "ai" | "template" | "upload"; path: string; width: number; height: number; alt?: string; prompt?: string; ai_generation_id?: string | null; project_id?: string; position?: number }) {
  const { error } = await ctx.supabase.storage.from("media").upload(row.path, buffer, { contentType: "image/jpeg", upsert: true });
  if (error) throw error;
  return unwrap(
    await ctx.supabase
      .from("media_assets")
      .insert({
        organization_id: ctx.organization.id,
        brand_id: ctx.brand.id,
        source: row.source,
        storage_path: row.path,
        mime_type: "image/jpeg",
        size_bytes: buffer.length,
        width: row.width,
        height: row.height,
        alt: row.alt ?? "",
        prompt: row.prompt ?? null,
        ai_generation_id: row.ai_generation_id ?? null,
        project_id: row.project_id ?? null,
        position: row.position ?? 0,
        created_by: ctx.userId,
      })
      .select("id")
      .single(),
  );
}

export const generateStudioImage = createBrandAction(
  { schema: z.object({ prompt: z.string().trim().min(3, "required").max(1000) }), permission: "editContent", rateLimit: { name: "image", limit: 15, windowSeconds: 60 } },
  async ({ prompt }, ctx) =>
    withQuota(ctx.organization.id, "images", 1, async () => {
      const profile = await latestProfile(ctx);
      const identity = (profile?.visual_identity ?? {}) as VisualIdentity;
      const colors = Object.values(identity.colors ?? {}).join(", ");
      const fullPrompt = `${prompt}. Photographic, natural light, no text in the image.${colors ? ` Palette: ${colors}.` : ""}`;
      const { image, generationId } = await generateBrandImage(fullPrompt, identity, { organizationId: ctx.organization.id, brandId: ctx.brand.id, userId: ctx.userId, brandProfileVersion: profile?.version });

      const jpeg = await sharp(image).rotate().jpeg({ quality: 90, mozjpeg: true }).toBuffer();
      const { width = 0, height = 0 } = await sharp(jpeg).metadata();
      const path = `${ctx.organization.id}/${ctx.brand.id}/ai/${randomUUID()}.jpg`;
      const asset = await storeImage(ctx, jpeg, { source: "ai", path, width, height, prompt, alt: prompt.slice(0, 200), ai_generation_id: generationId });
      revalidatePath("/app/studio");
      return { id: asset.id, url: await signed(ctx, path) };
    }),
);

/** Normalise une photo importée en JPEG, le format exigé par Instagram. */
export const registerPhoto = createBrandAction(
  { schema: z.object({ path: z.string().min(1).max(512), mime: z.string().max(60), size: z.number().int().positive().max(MAX_UPLOAD_BYTES), name: z.string().max(200) }), permission: "editContent", rateLimit: { name: "upload", limit: 60, windowSeconds: 3600 } },
  async ({ path, mime, name }, ctx) => {
    if (!path.startsWith(`${ctx.organization.id}/${ctx.brand.id}/`)) throw new AppError("forbidden");
    if (!IMAGE_MIME_TYPES.includes(mime)) throw new AppError("file_type");

    const original = await downloadMedia(ctx, path);
    const jpeg = await sharp(original).rotate().resize({ width: 2160, height: 2160, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
    const { width = 0, height = 0 } = await sharp(jpeg).metadata();
    const finalPath = `${ctx.organization.id}/${ctx.brand.id}/uploads/${randomUUID()}.jpg`;
    const asset = await storeImage(ctx, jpeg, { source: "upload", path: finalPath, width, height, alt: name.slice(0, 200) });
    await ctx.supabase.storage.from("media").remove([path]);
    revalidatePath("/app/studio");
    return { id: asset.id, url: await signed(ctx, finalPath) };
  },
);

/** Rend chaque diapositive dans chaque format demandé, puis enregistre les JPEG (BF-62, 63, 65). */
export const exportVisual = createBrandAction({ schema: exportSchema, permission: "editContent", rateLimit: { name: "export", limit: 30, windowSeconds: 3600 } }, async (input, ctx) => {
  const visuals = await loadBrandVisuals(ctx);
  const project = unwrap(
    await ctx.supabase
      .from("visual_projects")
      .insert({
        organization_id: ctx.organization.id,
        brand_id: ctx.brand.id,
        post_id: input.postId ?? null,
        name: input.name,
        kind: input.slides.length > 1 ? "carousel" : "single",
        template_id: input.template,
        format: input.formats[0]!,
        slides: input.slides as unknown as Json,
        created_by: ctx.userId,
      })
      .select("id")
      .single(),
  );

  const created: { id: string; url: string; format: string }[] = [];
  for (const format of input.formats) {
    for (let index = 0; index < input.slides.length; index++) {
      const slide = await resolveSlide(ctx, input.slides[index]!, format);
      const jpeg = await renderSlide({ template: input.template, format, slide, identity: visuals.identity, logo: visuals.logo, brandName: ctx.brand.name, index, total: input.slides.length });
      const { width, height } = FORMATS[format];
      const path = `${ctx.organization.id}/${ctx.brand.id}/exports/${project.id}/${format}-${index + 1}.jpg`;
      const asset = await storeImage(ctx, jpeg, { source: "template", path, width, height, alt: (slide.title ?? input.name).slice(0, 200), project_id: project.id, position: index });
      created.push({ id: asset.id, url: await signed(ctx, path), format });
    }
  }

  if (input.postId) {
    const firstFormat = created.filter((c) => c.format === input.formats[0]);
    const { data: post } = await ctx.supabase.from("posts").select("id").eq("id", input.postId).eq("brand_id", ctx.brand.id).maybeSingle();
    if (post) {
      unwrap(await ctx.supabase.from("post_media").upsert(firstFormat.map((asset, position) => ({ post_id: post.id, media_asset_id: asset.id, organization_id: ctx.organization.id, position }))));
      revalidatePath(`/app/content/${post.id}`);
    }
  }

  revalidatePath("/app/studio");
  return { projectId: project.id, assets: created };
});

export const attachAsset = createBrandAction({ schema: z.object({ postId: z.uuid(), assetId: z.uuid() }), permission: "editContent" }, async ({ postId, assetId }, ctx) => {
  const { count } = await ctx.supabase.from("post_media").select("media_asset_id", { count: "exact", head: true }).eq("post_id", postId);
  unwrap(await ctx.supabase.from("post_media").upsert({ post_id: postId, media_asset_id: assetId, organization_id: ctx.organization.id, position: count ?? 0 }));
  revalidatePath(`/app/content/${postId}`);
  return null;
});

export const detachAsset = createBrandAction({ schema: z.object({ postId: z.uuid(), assetId: z.uuid() }), permission: "editContent" }, async ({ postId, assetId }, ctx) => {
  unwrap(await ctx.supabase.from("post_media").delete().eq("post_id", postId).eq("media_asset_id", assetId));
  revalidatePath(`/app/content/${postId}`);
  return null;
});

export const deleteAsset = createBrandAction({ schema: z.object({ id: z.uuid() }), permission: "editContent" }, async ({ id }, ctx) => {
  const asset = unwrap(await ctx.supabase.from("media_assets").select("storage_path").eq("id", id).eq("brand_id", ctx.brand.id).single());
  await ctx.supabase.storage.from("media").remove([asset.storage_path]);
  unwrap(await ctx.supabase.from("media_assets").delete().eq("id", id));
  revalidatePath("/app/studio");
  return null;
});
