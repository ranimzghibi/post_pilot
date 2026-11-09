import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ForgotForm } from "@/features/auth/auth-forms";
import { Link } from "@/i18n/navigation";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth");
  return { title: t("forgot_title") };
}

export default async function ForgotPasswordPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("auth");
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">{t("forgot_title")}</h1>
      <p className="mt-1.5 mb-7 text-sm text-muted-foreground">{t("forgot_subtitle")}</p>
      <ForgotForm />
      <p className="mt-6 text-center text-sm">
        <Link href="/login" className="text-primary hover:underline">
          {t("back_to_login")}
        </Link>
      </p>
    </>
  );
}
