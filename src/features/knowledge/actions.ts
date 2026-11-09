"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { KNOWLEDGE_MIME_TYPES, MAX_UPLOAD_BYTES } from "@/lib/domain";
import { createBrandAction } from "@/server/action";
import { searchKnowledge } from "@/server/ai/embeddings";
import type { BrandContext } from "@/server/context";
import { AppError, unwrap } from "@/server/errors";
import { ingestDocument } from "@/server/knowledge/ingest";
import { extractSite } from "@/server/web/extract-site";
import { safeFetchHtml } from "@/server/web/safe-fetch";

const INGEST_LIMIT = { name: "ingest", limit: 30, windowSeconds: 3600 };

async function createDocument(ctx: BrandContext, doc: { source_type: "file" | "url" | "text" | "faq"; title: string; raw_text?: string; storage_path?: string; mime_type?: string; size_bytes?: number }) {
  const created = unwrap(
    await ctx.supabase
      .from("knowledge_documents")
      .insert({ organization_id: ctx.organization.id, brand_id: ctx.brand.id, created_by: ctx.userId, ...doc })
      .select("id")
      .single(),
  );
  after(() => ingestDocument(created.id));
  revalidatePath("/app/knowledge");
  return { id: created.id };
}

export const addTextDocument = createBrandAction(
  {
    schema: z.object({ title: z.string().trim().min(1, "required").max(200), text: z.string().trim().min(10, "too_short").max(200_000), kind: z.enum(["text", "faq"]) }),
    permission: "editContent",
    rateLimit: INGEST_LIMIT,
  },
  async ({ title, text, kind }, ctx) => createDocument(ctx, { source_type: kind, title, raw_text: text }),
);

export const addUrlDocument = createBrandAction(
  { schema: z.object({ url: z.url("invalid_url").max(2048) }), permission: "editContent", rateLimit: INGEST_LIMIT },
  async ({ url }, ctx) => {
    const { url: finalUrl, html } = await safeFetchHtml(url);
    const site = extractSite(html, finalUrl, 100_000);
    if (site.text.length < 20) throw new AppError("website_empty");
    return createDocument(ctx, { source_type: "url", title: (site.title || finalUrl).slice(0, 200), raw_text: site.text });
  },
);

export const registerUpload = createBrandAction(
  {
    schema: z.object({ title: z.string().trim().min(1).max(200), path: z.string().min(1).max(512), mime: z.string().max(120), size: z.number().int().positive().max(MAX_UPLOAD_BYTES) }),
    permission: "editContent",
    rateLimit: INGEST_LIMIT,
  },
  async ({ title, path, mime, size }, ctx) => {
    if (!path.startsWith(`${ctx.organization.id}/${ctx.brand.id}/`)) throw new AppError("forbidden");
    if (!KNOWLEDGE_MIME_TYPES.includes(mime)) throw new AppError("file_type");
    return createDocument(ctx, { source_type: "file", title, storage_path: path, mime_type: mime, size_bytes: size });
  },
);

export const deleteDocument = createBrandAction({ schema: z.object({ id: z.uuid() }), permission: "editContent" }, async ({ id }, ctx) => {
  const doc = unwrap(await ctx.supabase.from("knowledge_documents").select("storage_path").eq("id", id).eq("brand_id", ctx.brand.id).single());
  if (doc.storage_path) await ctx.supabase.storage.from("knowledge").remove([doc.storage_path]);
  unwrap(await ctx.supabase.from("knowledge_documents").delete().eq("id", id).eq("brand_id", ctx.brand.id));
  revalidatePath("/app/knowledge");
  return null;
});

export const retryDocument = createBrandAction({ schema: z.object({ id: z.uuid() }), permission: "editContent", rateLimit: INGEST_LIMIT }, async ({ id }, ctx) => {
  unwrap(await ctx.supabase.from("knowledge_documents").select("id").eq("id", id).eq("brand_id", ctx.brand.id).single());
  after(() => ingestDocument(id));
  return null;
});

export const testKnowledgeSearch = createBrandAction(
  { schema: z.object({ query: z.string().trim().min(2).max(500) }), rateLimit: { name: "kb-search", limit: 60, windowSeconds: 60 } },
  async ({ query }, ctx) => searchKnowledge(ctx.supabase, ctx.brand.id, query, 5),
);
