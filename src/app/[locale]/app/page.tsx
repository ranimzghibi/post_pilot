import { ArrowRight, CalendarDays, Check, Compass, BookOpen, Fingerprint, Image as ImageIcon, PartyPopper, PenLine, Share2, type LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import { getFormatter, getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, PageHeader, Progress } from "@/components/ui/misc";
import { Link, redirect } from "@/i18n/navigation";
import { can } from "@/lib/rbac";
import { cn, isoDate, monthStart, parseDate } from "@/lib/utils";
import { requireContext } from "@/server/context";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("dashboard");
  return { title: t("title") };
}

export default async function DashboardPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const ctx = await requireContext();
  const t = await getTranslations("dashboard");
  const tStatus = await getTranslations("post_status");
  const format = await getFormatter();
  const activeLocale = await getLocale();

  if (!ctx.brand) {
    if (can(ctx.role, "manageBrands")) redirect({ href: "/app/onboarding", locale });
    return <EmptyState icon={Fingerprint} title={t("no_brand_title")} description={t("no_brand_text")} />;
  }

  const brandId = ctx.brand.id;
  const period = monthStart();
  const today = isoDate(new Date());
  const { supabase } = ctx;
  const head = { count: "exact", head: true } as const;

  const [profiles, documents, accounts, strategy, ideas, posts, usage, events, recent] = await Promise.all([
    supabase.from("brand_profiles").select("id", head).eq("brand_id", brandId),
    supabase.from("knowledge_documents").select("id", head).eq("brand_id", brandId).eq("status", "ready"),
    supabase.from("social_accounts").select("id", head).eq("brand_id", brandId),
    supabase.from("strategies").select("id", head).eq("brand_id", brandId).eq("period", period),
    supabase.from("calendar_ideas").select("id", head).eq("brand_id", brandId).gte("planned_on", period),
    supabase.from("posts").select("id", head).eq("brand_id", brandId),
    supabase.from("usage_counters").select("posts_generated, images_generated").eq("organization_id", ctx.organization.id).eq("period", period).maybeSingle(),
    supabase.from("local_events").select("id, event_date, names, is_estimated").gte("event_date", today).order("event_date").limit(5),
    supabase.from("posts").select("id, idea, brief, status").eq("brand_id", brandId).order("created_at", { ascending: false }).limit(5),
  ]);

  const steps: { key: string; icon: LucideIcon; href: string; done: boolean }[] = [
    { key: "dna", icon: Fingerprint, href: (profiles.count ?? 0) > 0 ? "/app/brand" : "/app/onboarding", done: (profiles.count ?? 0) > 0 },
    { key: "knowledge", icon: BookOpen, href: "/app/knowledge", done: (documents.count ?? 0) > 0 },
    { key: "connect", icon: Share2, href: "/app/connections", done: (accounts.count ?? 0) > 0 },
    { key: "strategy", icon: Compass, href: "/app/strategy", done: (strategy.count ?? 0) > 0 },
    { key: "calendar", icon: CalendarDays, href: "/app/calendar", done: (ideas.count ?? 0) > 0 },
    { key: "post", icon: PenLine, href: "/app/content/new", done: (posts.count ?? 0) > 0 },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  const nextStep = steps.find((s) => !s.done);

  const postsUsed = usage.data?.posts_generated ?? 0;
  const imagesUsed = usage.data?.images_generated ?? 0;
  const quotaRows = [
    { label: t("usage_posts"), used: postsUsed, max: ctx.plan.posts_per_month, icon: PenLine },
    { label: t("usage_images"), used: imagesUsed, max: ctx.plan.images_per_month, icon: ImageIcon },
  ];

  return (
    <>
      <PageHeader
        eyebrow={ctx.brand.name}
        title={t("greeting", { name: (ctx.profile.full_name ?? "").split(" ")[0] ?? "" })}
        description={t("subtitle")}
        actions={
          can(ctx.role, "editContent") && (
            <Button asChild>
              <Link href="/app/content/new">
                <PenLine />
                {t("new_post")}
              </Link>
            </Button>
          )
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>{t("setup_title")}</CardTitle>
              <span className="font-mono text-xs text-muted-foreground" dir="ltr">
                {doneCount}/{steps.length}
              </span>
            </div>
            <Progress value={(doneCount / steps.length) * 100} className="mt-2" />
          </CardHeader>
          <CardContent className="pt-3">
            <ul className="grid gap-1 sm:grid-cols-2">
              {steps.map((step) => (
                <li key={step.key}>
                  <Link href={step.href} className={cn("flex items-center gap-3 rounded-lg p-2.5 transition-colors hover:bg-secondary", step === nextStep && "bg-accent hover:bg-accent/70")}>
                    <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", step.done ? "bg-success-soft text-success" : step === nextStep ? "bg-card text-primary shadow-card" : "bg-secondary text-muted-foreground")}>
                      {step.done ? <Check className="size-4" /> : <step.icon className="size-4" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-medium">{t(`step_${step.key}`)}</span>
                      <span className="block truncate text-xs text-muted-foreground">{t(`step_${step.key}_text`)}</span>
                    </span>
                    {step === nextStep && <ArrowRight className="size-4 shrink-0 text-primary rtl:rotate-180" />}
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>{t("usage_title")}</CardTitle>
              <Badge variant="primary">{ctx.plan.name}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {quotaRows.map((row) => {
              const ratio = (row.used / Math.max(row.max, 1)) * 100;
              return (
                <div key={row.label}>
                  <div className="mb-1.5 flex items-center justify-between text-[13px]">
                    <span className="flex items-center gap-1.5 font-medium">
                      <row.icon className="size-3.5 text-muted-foreground" />
                      {row.label}
                    </span>
                    <span className="font-mono text-xs text-muted-foreground" dir="ltr">
                      {row.used} / {row.max}
                    </span>
                  </div>
                  <Progress value={ratio} tone={ratio >= 100 ? "danger" : ratio >= 80 ? "warning" : "primary"} />
                </div>
              );
            })}
            {ctx.organization.plan === "trial" && ctx.organization.trial_ends_at && <p className="text-xs text-muted-foreground">{t("trial_ends", { date: format.dateTime(new Date(ctx.organization.trial_ends_at), { dateStyle: "long" }) })}</p>}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>{t("recent_title")}</CardTitle>
            <Link href="/app/content" className="text-xs text-primary hover:underline">
              {t("see_all")}
            </Link>
          </CardHeader>
          <CardContent className="pt-2">
            {recent.data?.length ? (
              <ul className="divide-y">
                {recent.data.map((post) => (
                  <li key={post.id}>
                    <Link href={`/app/content/${post.id}`} className="flex items-center justify-between gap-3 py-2.5 text-[13px] hover:text-primary">
                      <span className="truncate font-medium">{post.idea || post.brief}</span>
                      <Badge>{tStatus(post.status)}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-2 text-[13px] text-muted-foreground">{t("recent_empty")}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("events_title")}</CardTitle>
          </CardHeader>
          <CardContent className="pt-3">
            <ul className="space-y-3">
              {(events.data ?? []).map((event) => {
                const names = event.names as Record<string, string>;
                const date = parseDate(event.event_date);
                return (
                  <li key={event.id} className="flex items-center gap-3">
                    <span className="flex size-10 shrink-0 flex-col items-center justify-center rounded-lg bg-warm-soft text-warm">
                      <span className="text-[13px] leading-none font-semibold">{date.getDate()}</span>
                      <span className="text-[10px] leading-tight">{format.dateTime(date, { month: "short" })}</span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium">{names[activeLocale] ?? names.fr}</span>
                      {event.is_estimated && <span className="text-[11px] text-muted-foreground">{t("estimated")}</span>}
                    </span>
                    <PartyPopper className="size-3.5 shrink-0 text-muted-foreground" />
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
