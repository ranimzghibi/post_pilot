import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { LegalPage } from "@/features/marketing/legal-page";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("legal");
  return { title: t("deletion_title") };
}

export default async function DataDeletionPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ code?: string }> }) {
  setRequestLocale((await params).locale);
  const t = await getTranslations("legal");
  const { code } = await searchParams;
  return (
    <LegalPage page="deletion" sections={3}>
      {code && /^[0-9a-f]{16}$/.test(code) && (
        <p className="mt-4 rounded-lg bg-success-soft px-3 py-2.5 text-[13px] text-success">{t("deletion_confirmed", { code })}</p>
      )}
    </LegalPage>
  );
}
