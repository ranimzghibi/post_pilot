import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { LoginForm } from "@/features/auth/auth-forms";
import { Link, redirect } from "@/i18n/navigation";
import { isSupabaseConfigured } from "@/lib/env";
import { safeInternalPath } from "@/lib/utils";
import { loadAppContext } from "@/server/context";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth");
  return { title: t("login_title") };
}

export default async function LoginPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ next?: string; notice?: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { next, notice } = await searchParams;
  if (isSupabaseConfigured && (await loadAppContext())) redirect({ href: safeInternalPath(next), locale });
  const t = await getTranslations("auth");

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">{t("login_title")}</h1>
      <p className="mt-1.5 mb-7 text-sm text-muted-foreground">{t("login_subtitle")}</p>
      {notice && <p className="mb-5 rounded-lg bg-accent px-3 py-2.5 text-[13px] text-accent-foreground">{t(notice === "link_used" ? "notice_link_used" : "notice_link_invalid")}</p>}
      {!isSupabaseConfigured && <p className="mb-5 rounded-lg bg-warning-soft px-3 py-2.5 text-[13px] text-warning">{t("not_configured")}</p>}
      <LoginForm next={next} />
      <p className="mt-6 text-center text-sm text-muted-foreground">
        {t("no_account")}{" "}
        <Link href={next ? `/signup?next=${encodeURIComponent(next)}` : "/signup"} className="font-medium text-primary hover:underline">
          {t("signup_link")}
        </Link>
      </p>
    </>
  );
}
