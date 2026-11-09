import { ArrowRight, BookOpen, CalendarDays, Check, Compass, Fingerprint, LineChart, PartyPopper, PenLine, RefreshCw, Send, ShieldCheck, Sparkles } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { NetworkIcon } from "@/components/common/network-icon";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScoreRing } from "@/components/ui/misc";
import { MarketingFooter, MarketingHeader } from "@/features/marketing/marketing-chrome";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

const CHIP_COLORS = ["#2C5BDE", "#E8553D", "#2E9E6B", "#C98A1B"];

function ProductMock({ t }: { t: Awaited<ReturnType<typeof getTranslations<"landing">>> }) {
  const days = Array.from({ length: 28 }, (_, i) => i + 1);
  const chips: Record<number, { title: string; color: string }> = {
    3: { title: t("mock_idea_1"), color: CHIP_COLORS[0]! },
    6: { title: t("mock_idea_2"), color: CHIP_COLORS[1]! },
    10: { title: t("mock_idea_3"), color: CHIP_COLORS[2]! },
    14: { title: t("mock_idea_4"), color: CHIP_COLORS[3]! },
    18: { title: t("mock_idea_1"), color: CHIP_COLORS[0]! },
    24: { title: t("mock_idea_2"), color: CHIP_COLORS[1]! },
  };

  return (
    <div className="relative mx-auto mt-14 max-w-5xl" aria-hidden>
      <Card className="overflow-hidden shadow-float">
        <div className="flex items-center justify-between border-b px-4 py-2.5">
          <span className="text-[13px] font-semibold">{t("mock_month")}</span>
          <span className="flex items-center gap-1.5 rounded-full bg-accent px-2 py-0.5 text-[11px] font-medium text-accent-foreground">
            <Sparkles className="size-3" />
            {t("mock_generated")}
          </span>
        </div>
        <div className="grid grid-cols-7">
          {days.map((day) => (
            <div key={day} className="h-16 border-e border-b p-1 sm:h-24 sm:p-1.5">
              <span className="text-[10px] text-muted-foreground tabular-nums">{day}</span>
              {day === 8 && (
                <div className="mt-0.5 hidden items-center gap-1 truncate rounded bg-warm-soft px-1 py-0.5 text-[10px] font-medium text-warm sm:flex">
                  <PartyPopper className="size-2.5 shrink-0" />
                  <span className="truncate">{t("mock_event")}</span>
                </div>
              )}
              {chips[day] && (
                <div className="mt-0.5 truncate rounded border bg-card px-1 py-0.5 text-[9px] font-medium shadow-card sm:text-[10px]" style={{ borderInlineStartColor: chips[day]!.color, borderInlineStartWidth: 3 }}>
                  {chips[day]!.title}
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>

      <Card className="absolute -end-2 -bottom-10 hidden w-72 p-4 shadow-float sm:block md:-end-8">
        <div className="mb-2 flex items-center gap-2">
          <NetworkIcon network="instagram" />
          <span className="text-[13px] font-semibold">{t("mock_post_brand")}</span>
          <div className="ms-auto">
            <ScoreRing score={92} size={38} />
          </div>
        </div>
        <p className="text-[13px] leading-relaxed">{t("mock_post_text")}</p>
        <p className="mt-2 flex items-center gap-1.5 text-xs text-success">
          <ShieldCheck className="size-3.5" />
          {t("mock_post_check")}
        </p>
      </Card>
    </div>
  );
}

export default async function LandingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("landing");

  const loop = [
    { icon: Fingerprint, key: "understand" },
    { icon: Compass, key: "plan" },
    { icon: PenLine, key: "create" },
    { icon: Send, key: "publish" },
    { icon: LineChart, key: "measure" },
    { icon: RefreshCw, key: "learn" },
  ];

  const features = [
    { icon: Fingerprint, key: "dna" },
    { icon: BookOpen, key: "knowledge" },
    { icon: CalendarDays, key: "local" },
  ];

  const plans = [
    { key: "starter", price: "49", brands: 1, accounts: 2, posts: 30, images: 20, members: 1, highlighted: false },
    { key: "pro", price: "99", brands: 1, accounts: 5, posts: 90, images: 60, members: 3, highlighted: true },
    { key: "agency", price: "349", brands: 10, accounts: 30, posts: 300, images: 200, members: 10, highlighted: false },
  ];

  const faqs = ["faq_validation", "faq_invent", "faq_languages", "faq_payment", "faq_networks"];

  return (
    <div className="min-h-dvh">
      <MarketingHeader />

      <main>
        <section className="relative overflow-hidden px-5 pt-16 pb-28 sm:pt-24">
          <div className="bg-dots absolute inset-0 [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_72%)]" />
          <div className="relative mx-auto max-w-3xl text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground shadow-card">
              <span className="size-1.5 rounded-full bg-warm" />
              {t("hero_badge")}
            </span>
            <h1 className="mt-6 text-[40px] leading-[1.06] font-semibold tracking-tight sm:text-[64px]">
              {t.rich("hero_title", { em: (chunks) => <span className="display-italic text-primary">{chunks}</span> })}
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">{t("hero_text")}</p>
            <div className="mt-8 flex flex-col items-center justify-center gap-2.5 sm:flex-row">
              <Button size="lg" asChild>
                <Link href="/signup">
                  {t("cta")}
                  <ArrowRight className="rtl:rotate-180" />
                </Link>
              </Button>
              <Button size="lg" variant="secondary" asChild>
                <Link href="/#loop">{t("cta_secondary")}</Link>
              </Button>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">{t("hero_note")}</p>
          </div>
          <div className="relative">
            <ProductMock t={t} />
          </div>
        </section>

        <section id="loop" className="scroll-mt-20 border-t bg-sidebar px-5 py-20">
          <div className="mx-auto max-w-6xl">
            <p className="overline-label">{t("loop_eyebrow")}</p>
            <h2 className="mt-2 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">{t("loop_title")}</h2>
            <ol className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {loop.map((step, index) => (
                <li key={step.key} className="rounded-xl border bg-card p-5 shadow-card">
                  <div className="flex items-center justify-between">
                    <span className="flex size-9 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                      <step.icon className="size-4" />
                    </span>
                    <span className="font-mono text-xs text-muted-foreground" dir="ltr">
                      0{index + 1}
                    </span>
                  </div>
                  <h3 className="mt-3 text-[15px] font-semibold">{t(`loop_${step.key}`)}</h3>
                  <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{t(`loop_${step.key}_text`)}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="features" className="scroll-mt-20 px-5 py-20">
          <div className="mx-auto max-w-6xl">
            <p className="overline-label">{t("features_eyebrow")}</p>
            <h2 className="mt-2 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
              {t.rich("features_title", { em: (chunks) => <span className="display-italic">{chunks}</span> })}
            </h2>
            <div className="mt-10 grid gap-4 lg:grid-cols-3">
              {features.map((feature) => (
                <article key={feature.key} className="rounded-2xl border bg-card p-6 shadow-card">
                  <feature.icon className="size-5 text-primary" />
                  <h3 className="mt-4 text-lg font-semibold tracking-tight">{t(`feature_${feature.key}`)}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t(`feature_${feature.key}_text`)}</p>
                </article>
              ))}
            </div>

            <div className="mt-4 grid items-center gap-6 rounded-2xl bg-primary p-7 text-primary-foreground sm:p-10 lg:grid-cols-[1fr_1.2fr]">
              <div>
                <ShieldCheck className="size-6" />
                <h3 className="mt-3 text-2xl font-semibold tracking-tight">{t("guard_title")}</h3>
              </div>
              <ul className="grid gap-2.5 text-sm sm:grid-cols-2">
                {["guard_1", "guard_2", "guard_3", "guard_4"].map((key) => (
                  <li key={key} className="flex items-start gap-2">
                    <Check className="mt-0.5 size-4 shrink-0" />
                    {t(key)}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section id="pricing" className="scroll-mt-20 border-t bg-sidebar px-5 py-20">
          <div className="mx-auto max-w-5xl">
            <div className="text-center">
              <p className="overline-label">{t("pricing_eyebrow")}</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{t("pricing_title")}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{t("pricing_text")}</p>
            </div>
            <div className="mt-10 grid gap-4 md:grid-cols-3">
              {plans.map((plan) => (
                <div key={plan.key} className={cn("flex flex-col rounded-2xl border bg-card p-6 shadow-card", plan.highlighted && "border-primary ring-1 ring-primary")}>
                  <h3 className="text-[15px] font-semibold">{t(`plan_${plan.key}`)}</h3>
                  <p className="mt-3 flex items-baseline gap-1">
                    <span className="text-4xl font-semibold tracking-tight tabular-nums">{plan.price}</span>
                    <span className="text-[13px] text-muted-foreground">{t("per_month")}</span>
                  </p>
                  <ul className="mt-5 flex-1 space-y-2 text-[13px]">
                    {[t("plan_brands", { count: plan.brands }), t("plan_accounts", { count: plan.accounts }), t("plan_posts", { count: plan.posts }), t("plan_images", { count: plan.images }), t("plan_members", { count: plan.members })].map((line) => (
                      <li key={line} className="flex items-center gap-2">
                        <Check className="size-3.5 shrink-0 text-primary" />
                        {line}
                      </li>
                    ))}
                  </ul>
                  <Button className="mt-6 w-full" variant={plan.highlighted ? "default" : "secondary"} asChild>
                    <Link href="/signup">{t("plan_cta")}</Link>
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="px-5 py-20">
          <div className="mx-auto max-w-2xl">
            <h2 className="text-3xl font-semibold tracking-tight">{t("faq_title")}</h2>
            <div className="mt-6 divide-y border-y">
              {faqs.map((key) => (
                <details key={key} className="group py-4">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[15px] font-medium">
                    {t(`${key}_q`)}
                    <span className="text-muted-foreground transition-transform group-open:rotate-45">+</span>
                  </summary>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t(`${key}_a`)}</p>
                </details>
              ))}
            </div>
            <div className="mt-12 text-center">
              <Button size="lg" asChild>
                <Link href="/signup">
                  {t("cta")}
                  <ArrowRight className="rtl:rotate-180" />
                </Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}
