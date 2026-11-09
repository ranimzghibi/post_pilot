import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { StrategyView } from "@/features/strategy/strategy-view";
import { can } from "@/lib/rbac";
import { monthStart } from "@/lib/utils";
import { requireBrand } from "@/server/context";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("strategy");
  return { title: t("title") };
}

export default async function StrategyPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ period?: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const ctx = await requireBrand();
  const raw = (await searchParams).period;
  const period = raw && /^\d{4}-\d{2}-01$/.test(raw) ? raw : monthStart();

  const [{ data: strategy }, { count }] = await Promise.all([
    ctx.supabase.from("strategies").select("*").eq("brand_id", ctx.brand.id).eq("period", period).maybeSingle(),
    ctx.supabase.from("brand_profiles").select("id", { count: "exact", head: true }).eq("brand_id", ctx.brand.id),
  ]);

  return <StrategyView key={strategy?.updated_at ?? period} strategy={strategy} period={period} canEdit={can(ctx.role, "editBrand")} hasProfile={(count ?? 0) > 0} />;
}
