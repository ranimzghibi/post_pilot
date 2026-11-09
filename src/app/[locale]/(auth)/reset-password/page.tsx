import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ResetForm } from "@/features/auth/auth-forms";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth");
  return { title: t("reset_title") };
}

export default async function ResetPasswordPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("auth");
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">{t("reset_title")}</h1>
      <p className="mt-1.5 mb-7 text-sm text-muted-foreground">{t("reset_subtitle")}</p>
      <ResetForm />
    </>
  );
}
