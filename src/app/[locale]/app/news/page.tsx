import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { NewsView } from "@/features/news/news-view";
import { can } from "@/lib/rbac";
import { requireBrand } from "@/server/context";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("news");
  return { title: t("title") };
}

export default async function NewsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const ctx = await requireBrand();
  const { data } = await ctx.supabase.from("brand_news").select("*").eq("brand_id", ctx.brand.id).order("created_at", { ascending: false });
  return <NewsView items={data ?? []} canEdit={can(ctx.role, "editBrand")} />;
}
