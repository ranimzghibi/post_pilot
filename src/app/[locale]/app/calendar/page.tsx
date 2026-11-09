import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CalendarView } from "@/features/calendar/calendar-view";
import type { Pillar } from "@/lib/domain";
import { can } from "@/lib/rbac";
import { monthStart } from "@/lib/utils";
import { monthDates } from "@/server/content/normalize";
import { requireBrand } from "@/server/context";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("calendar");
  return { title: t("title") };
}

export default async function CalendarPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ period?: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const ctx = await requireBrand();
  const raw = (await searchParams).period;
  const period = raw && /^\d{4}-\d{2}-01$/.test(raw) ? raw : monthStart();
  const dates = monthDates(period);
  const first = dates[0]!;
  const last = dates[dates.length - 1]!;

  const [{ data: strategy }, { data: ideas }, { data: events }, { data: posts }] = await Promise.all([
    ctx.supabase.from("strategies").select("id, pillars").eq("brand_id", ctx.brand.id).eq("period", period).maybeSingle(),
    ctx.supabase.from("calendar_ideas").select("*").eq("brand_id", ctx.brand.id).gte("planned_on", first).lte("planned_on", last).order("planned_on"),
    ctx.supabase.from("local_events").select("id, event_date, end_date, names, category, is_estimated").lte("event_date", last).or(`end_date.gte.${first},event_date.gte.${first}`).order("event_date"),
    ctx.supabase.from("posts").select("id, idea_id").eq("brand_id", ctx.brand.id).not("idea_id", "is", null),
  ]);

  return (
    <CalendarView
      period={period}
      ideas={ideas ?? []}
      events={events ?? []}
      pillars={(strategy?.pillars ?? []) as Pillar[]}
      hasStrategy={!!strategy}
      canEdit={can(ctx.role, "editContent")}
      posts={Object.fromEntries((posts ?? []).map((p) => [p.idea_id!, p.id]))}
    />
  );
}
