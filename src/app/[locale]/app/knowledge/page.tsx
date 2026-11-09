import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { KnowledgeView } from "@/features/knowledge/knowledge-view";
import { can } from "@/lib/rbac";
import { embeddingProviderConfigured } from "@/server/ai/config";
import { requireBrand } from "@/server/context";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("knowledge");
  return { title: t("title") };
}

export default async function KnowledgePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const ctx = await requireBrand();
  const { data } = await ctx.supabase.from("knowledge_documents").select("*").eq("brand_id", ctx.brand.id).order("created_at", { ascending: false }).limit(200);

  return <KnowledgeView docs={data ?? []} orgId={ctx.organization.id} brandId={ctx.brand.id} canEdit={can(ctx.role, "editContent")} localIndex={!embeddingProviderConfigured()} />;
}
