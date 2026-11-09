import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PageHeader } from "@/components/ui/misc";
import { Composer } from "@/features/content/composer";
import { redirect } from "@/i18n/navigation";
import type { ContentLanguage } from "@/lib/domain";
import { can } from "@/lib/rbac";
import { requireBrand } from "@/server/context";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("content");
  return { title: t("new") };
}

export default async function NewPostPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ idea?: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const ctx = await requireBrand();
  if (!can(ctx.role, "editContent")) redirect({ href: "/app/content", locale });
  const t = await getTranslations("content");
  const ideaId = (await searchParams).idea;

  const { data: idea } = ideaId && /^[0-9a-f-]{36}$/.test(ideaId) ? await ctx.supabase.from("calendar_ideas").select("id, title, angle, networks").eq("id", ideaId).eq("brand_id", ctx.brand.id).maybeSingle() : { data: null };

  return (
    <>
      <PageHeader title={t("new")} description={t("new_subtitle")} />
      <Composer idea={idea} defaultLanguage={(ctx.brand.languages[0] ?? "fr") as ContentLanguage} />
    </>
  );
}
