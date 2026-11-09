import { Palette } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { StudioView, type StudioAsset } from "@/features/studio/studio-view";
import { can } from "@/lib/rbac";
import { isDemoImages } from "@/server/ai/images";
import { requireBrand } from "@/server/context";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("studio");
  return { title: t("title") };
}

export default async function StudioPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ post?: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const ctx = await requireBrand();
  const t = await getTranslations("studio");

  if (!can(ctx.role, "editContent")) {
    return (
      <>
        <PageHeader title={t("title")} />
        <EmptyState icon={Palette} title={t("readonly_title")} description={t("readonly_text")} />
      </>
    );
  }

  const postId = (await searchParams).post;
  const { data: post } = postId && /^[0-9a-f-]{36}$/.test(postId) ? await ctx.supabase.from("posts").select("id, idea, brief, post_variants(visual_brief, is_selected)").eq("id", postId).eq("brand_id", ctx.brand.id).maybeSingle() : { data: null };

  const { data: media } = await ctx.supabase.from("media_assets").select("id, storage_path, alt, source, project_id").eq("brand_id", ctx.brand.id).eq("kind", "image").order("created_at", { ascending: false }).limit(60);
  const paths = (media ?? []).map((m) => m.storage_path);
  const { data: signed } = paths.length ? await ctx.supabase.storage.from("media").createSignedUrls(paths, 3600) : { data: [] };
  const assets: StudioAsset[] = (media ?? []).flatMap((m, i) => (signed?.[i]?.signedUrl ? [{ id: m.id, url: signed[i]!.signedUrl, alt: m.alt, source: m.source, projectId: m.project_id }] : []));

  return (
    <StudioView
      orgId={ctx.organization.id}
      brandId={ctx.brand.id}
      assets={assets}
      post={post ? { id: post.id, title: post.idea || post.brief, visualBrief: post.post_variants.find((v) => v.is_selected)?.visual_brief ?? "" } : null}
      demoImages={isDemoImages()}
    />
  );
}
