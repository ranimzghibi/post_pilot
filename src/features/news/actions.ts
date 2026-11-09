"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { NEWS_KINDS } from "@/lib/domain";
import { createBrandAction } from "@/server/action";
import { unwrap } from "@/server/errors";

const date = z.union([z.iso.date(), z.literal("")]).optional();

const newsSchema = z
  .object({
    id: z.uuid().optional(),
    kind: z.enum(NEWS_KINDS),
    title: z.string().trim().min(1, "required").max(200),
    details: z.string().trim().max(2000),
    starts_on: date,
    ends_on: date,
  })
  .refine((v) => !v.starts_on || !v.ends_on || v.ends_on >= v.starts_on, { path: ["ends_on"], message: "date_order" });

export const saveNews = createBrandAction({ schema: newsSchema, permission: "editBrand" }, async ({ id, ...input }, ctx) => {
  const values = { ...input, starts_on: input.starts_on || null, ends_on: input.ends_on || null };
  if (id) {
    unwrap(await ctx.supabase.from("brand_news").update(values).eq("id", id).eq("brand_id", ctx.brand.id));
  } else {
    unwrap(await ctx.supabase.from("brand_news").insert({ ...values, organization_id: ctx.organization.id, brand_id: ctx.brand.id, created_by: ctx.userId }));
  }
  revalidatePath("/app/news");
  return null;
});

export const toggleNews = createBrandAction({ schema: z.object({ id: z.uuid(), is_active: z.boolean() }), permission: "editBrand" }, async ({ id, is_active }, ctx) => {
  unwrap(await ctx.supabase.from("brand_news").update({ is_active }).eq("id", id).eq("brand_id", ctx.brand.id));
  revalidatePath("/app/news");
  return null;
});

export const deleteNews = createBrandAction({ schema: z.object({ id: z.uuid() }), permission: "editBrand" }, async ({ id }, ctx) => {
  unwrap(await ctx.supabase.from("brand_news").delete().eq("id", id).eq("brand_id", ctx.brand.id));
  revalidatePath("/app/news");
  return null;
});
