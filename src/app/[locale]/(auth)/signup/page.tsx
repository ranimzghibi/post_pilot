import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SignupForm } from "@/features/auth/auth-forms";
import { Link, redirect } from "@/i18n/navigation";
import { isSupabaseConfigured } from "@/lib/env";
import { loadAppContext } from "@/server/context";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth");
  return { title: t("signup_title") };
}

export default async function SignupPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ next?: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { next } = await searchParams;
  if (isSupabaseConfigured && (await loadAppContext())) redirect({ href: "/app", locale });
  const t = await getTranslations("auth");

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">{t("signup_title")}</h1>
      <p className="mt-1.5 mb-7 text-sm text-muted-foreground">{t("signup_subtitle")}</p>
      <SignupForm next={next} />
      <p className="mt-6 text-center text-sm text-muted-foreground">
        {t("has_account")}{" "}
        <Link href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"} className="font-medium text-primary hover:underline">
          {t("login_link")}
        </Link>
      </p>
    </>
  );
}
