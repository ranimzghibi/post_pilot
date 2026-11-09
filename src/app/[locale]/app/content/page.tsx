import { PenLine, Plus } from "lucide-react";
import type { Metadata } from "next";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { NetworkIcon } from "@/components/common/network-icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader, ScoreRing } from "@/components/ui/misc";
import { Link } from "@/i18n/navigation";
import { can } from "@/lib/rbac";
import { requireBrand } from "@/server/context";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("content");
  return { title: t("title") };
}

export default async function ContentPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const ctx = await requireBrand();
  const t = await getTranslations("content");
  const tStatus = await getTranslations("post_status");
  const tDomain = await getTranslations("domain");
  const format = await getFormatter();

  const { data: posts } = await ctx.supabase
    .from("posts")
    .select("id, idea, brief, status, language, created_at, post_variants(caption, network, compliance_score, is_selected)")
    .eq("brand_id", ctx.brand.id)
    .order("created_at", { ascending: false })
    .limit(100);

  const canEdit = can(ctx.role, "editContent");

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        actions={
          canEdit && (
            <Button asChild>
              <Link href="/app/content/new">
                <Plus />
                {t("new")}
              </Link>
            </Button>
          )
        }
      />

      {!posts?.length ? (
        <EmptyState icon={PenLine} title={t("empty_title")} description={t("empty_text")}>
          {canEdit && (
            <Button asChild>
              <Link href="/app/content/new">{t("new")}</Link>
            </Button>
          )}
        </EmptyState>
      ) : (
        <Card>
          <ul className="divide-y">
            {posts.map((post) => {
              const selected = post.post_variants.filter((v) => v.is_selected);
              const first = selected[0] ?? post.post_variants[0];
              const score = selected.length ? Math.round(selected.reduce((sum, v) => sum + (v.compliance_score ?? 0), 0) / selected.length) : null;
              return (
                <li key={post.id}>
                  <Link href={`/app/content/${post.id}`} className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-secondary/60">
                    <ScoreRing score={score} size={42} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-medium">{post.idea || post.brief}</div>
                      <p className="truncate text-xs text-muted-foreground" dir="auto">
                        {first?.caption}
                      </p>
                    </div>
                    <span className="hidden gap-1 sm:flex">
                      {selected.map((v) => (
                        <NetworkIcon key={v.network} network={v.network} className="size-4 rounded" />
                      ))}
                    </span>
                    <Badge variant="outline" className="hidden sm:inline-flex">
                      {tDomain(`lang_${post.language}`)}
                    </Badge>
                    <Badge>{tStatus(post.status)}</Badge>
                    <span className="hidden w-16 text-end text-xs text-muted-foreground md:block">{format.dateTime(new Date(post.created_at), { day: "numeric", month: "short" })}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </>
  );
}
