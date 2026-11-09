import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ConfirmForm } from "@/features/auth/auth-forms";

const TYPES = ["email", "signup", "recovery", "email_change", "magiclink", "invite"] as const;
type LinkType = (typeof TYPES)[number];

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth");
  return { title: t("confirm_title"), robots: { index: false } };
}

export default async function ConfirmPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ token_hash?: string; type?: string; next?: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { token_hash: tokenHash, type, next } = await searchParams;
  const t = await getTranslations("auth");

  if (!tokenHash || !TYPES.includes(type as LinkType)) {
    return <p className="rounded-lg bg-accent px-3 py-2.5 text-[13px] text-accent-foreground">{t("notice_link_invalid")}</p>;
  }

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">{t("confirm_title")}</h1>
      <p className="mt-1.5 mb-7 text-sm text-muted-foreground">{t("confirm_text")}</p>
      <ConfirmForm tokenHash={tokenHash} type={type as LinkType} next={next} />
    </>
  );
}
