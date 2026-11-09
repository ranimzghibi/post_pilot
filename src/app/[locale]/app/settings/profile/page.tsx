import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PageHeader } from "@/components/ui/misc";
import { ProfileForm } from "@/features/workspaces/settings-forms";
import { requireContext } from "@/server/context";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings.profile");
  return { title: t("title") };
}

export default async function ProfilePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const ctx = await requireContext();
  const t = await getTranslations("settings.profile");
  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />
      <ProfileForm fullName={ctx.profile.full_name ?? ""} locale={ctx.profile.locale} timezone={ctx.profile.timezone} email={ctx.email} />
    </>
  );
}
