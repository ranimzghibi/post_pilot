import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/misc";
import type { LibraryAsset } from "@/features/connections/connections-view";
import { PostEditor } from "@/features/content/post-editor";
import { can } from "@/lib/rbac";
import { requireBrand } from "@/server/context";

export default async function PostPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const ctx = await requireBrand();
  const t = await getTranslations("content");
  const tStatus = await getTranslations("post_status");

  const { data: post } = await ctx.supabase.from("posts").select("*").eq("id", id).eq("brand_id", ctx.brand.id).maybeSingle();
  if (!post) notFound();

  const [{ data: variants }, { data: generation }, { data: links }, { data: accounts }] = await Promise.all([
    ctx.supabase.from("post_variants").select("*").eq("post_id", id).order("option_index"),
    post.ai_generation_id ? ctx.supabase.from("ai_generations").select("provider, model, prompt_version, prompt, created_at").eq("id", post.ai_generation_id).maybeSingle() : Promise.resolve({ data: null }),
    ctx.supabase.from("post_media").select("position, asset:media_assets(id, storage_path, alt)").eq("post_id", id).order("position"),
    ctx.supabase.from("social_accounts").select("*").eq("brand_id", ctx.brand.id),
  ]);
  if (!variants?.length) notFound();

  const assets = (links ?? []).map((l) => l.asset);
  const { data: signed } = assets.length ? await ctx.supabase.storage.from("media").createSignedUrls(assets.map((a) => a.storage_path), 3600) : { data: [] };
  const media: LibraryAsset[] = assets.flatMap((a, i) => (signed?.[i]?.signedUrl ? [{ id: a.id, url: signed[i]!.signedUrl, alt: a.alt }] : []));

  return (
    <>
      <PageHeader eyebrow={t("title")} title={post.idea || post.brief || t("untitled")} actions={<Badge>{tStatus(post.status)}</Badge>} />
      <PostEditor
        post={post}
        variants={variants}
        generation={generation}
        brandName={ctx.brand.name}
        media={media}
        accounts={accounts ?? []}
        canEdit={can(ctx.role, "editContent")}
        canPublish={can(ctx.role, "publishTest")}
      />
    </>
  );
}
