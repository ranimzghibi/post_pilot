import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PageHeader } from "@/components/ui/misc";
import { BrandsManager } from "@/features/workspaces/settings-forms";
import { can } from "@/lib/rbac";
import { requireContext } from "@/server/context";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings.brands");
  return { title: t("title") };
}

export default async function BrandsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const ctx = await requireContext();
  const t = await getTranslations("settings.brands");
  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />
      <BrandsManager
        brands={ctx.brands.map((b) => ({ id: b.id, name: b.name, timezone: b.timezone, website_url: b.website_url }))}
        workspaceName={ctx.organization.name}
        canManageBrands={can(ctx.role, "manageBrands")}
        canDeleteBrand={can(ctx.role, "deleteBrand")}
        canRenameWorkspace={can(ctx.role, "manageWorkspace")}
        maxBrands={ctx.plan.max_brands}
      />
    </>
  );
}
