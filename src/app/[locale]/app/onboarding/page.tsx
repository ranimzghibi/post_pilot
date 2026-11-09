import { Store } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { OnboardingWizard } from "@/features/onboarding/onboarding-wizard";
import type { OnboardingAnswers } from "@/lib/domain";
import { can } from "@/lib/rbac";
import { requireContext } from "@/server/context";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("onboarding");
  return { title: t("title") };
}

export default async function OnboardingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const ctx = await requireContext();
  const t = await getTranslations("onboarding");

  if (!ctx.brand && !can(ctx.role, "manageBrands")) {
    return <EmptyState icon={Store} title={t("no_brand_title")} description={t("no_brand_text")} />;
  }

  const { data: onboarding } = ctx.brand ? await ctx.supabase.from("brand_onboarding").select("answers, current_step").eq("brand_id", ctx.brand.id).maybeSingle() : { data: null };

  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />
      <OnboardingWizard
        brand={ctx.brand ? { id: ctx.brand.id, name: ctx.brand.name, website_url: ctx.brand.website_url } : null}
        initialAnswers={(onboarding?.answers ?? {}) as OnboardingAnswers}
        initialStep={onboarding?.current_step ?? 0}
      />
    </>
  );
}
