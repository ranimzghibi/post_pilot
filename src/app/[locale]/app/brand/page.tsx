import { Fingerprint } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { BrandEditor } from "@/features/brand/brand-editor";
import { Link } from "@/i18n/navigation";
import type { VisualIdentity } from "@/lib/domain";
import { can } from "@/lib/rbac";
import { requireBrand } from "@/server/context";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("brand");
  return { title: t("title") };
}

export default async function BrandPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const ctx = await requireBrand();
  const t = await getTranslations("brand");

  const { data: profiles } = await ctx.supabase.from("brand_profiles").select("*").eq("brand_id", ctx.brand.id).order("version", { ascending: false }).limit(50);
  const current = profiles?.[0] ?? null;

  let logoUrl: string | null = null;
  const logoPath = (current?.visual_identity as VisualIdentity | undefined)?.logo_path;
  if (logoPath) {
    const { data } = await ctx.supabase.storage.from("media").createSignedUrl(logoPath, 3600);
    logoUrl = data?.signedUrl ?? null;
  }

  return (
    <>
      <PageHeader eyebrow={ctx.brand.name} title={t("title")} description={t("subtitle")} />
      {current ? (
        <BrandEditor
          current={current}
          history={profiles ?? []}
          logoUrl={logoUrl}
          orgId={ctx.organization.id}
          brandId={ctx.brand.id}
          readOnly={!can(ctx.role, "editBrand")}
        />
      ) : (
        <EmptyState icon={Fingerprint} title={t("empty_title")} description={t("empty_text")}>
          <Button asChild>
            <Link href="/app/onboarding">{t("empty_cta")}</Link>
          </Button>
        </EmptyState>
      )}
    </>
  );
}
