"use client";

import { ArrowRight, Compass, Pencil, Plus, Sparkles, Target, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { MonthNav } from "@/components/common/month-nav";
import { NetworkIcon } from "@/components/common/network-icon";
import { useAction } from "@/components/common/use-action";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { Link, useRouter } from "@/i18n/navigation";
import { NETWORKS, type Objective, type Pillar } from "@/lib/domain";
import type { Database } from "@/lib/supabase/database.types";
import { generateStrategy, updateStrategy } from "./actions";

type Strategy = Database["public"]["Tables"]["strategies"]["Row"];

export const PILLAR_COLORS = ["#2C5BDE", "#E8553D", "#2E9E6B", "#C98A1B", "#7A4FD0"];

function EditDialog({ strategy, onClose }: { strategy: Strategy; onClose: () => void }) {
  const t = useTranslations("strategy");
  const router = useRouter();
  const [summary, setSummary] = useState(strategy.summary);
  const [tone, setTone] = useState(strategy.tone);
  const [objectives, setObjectives] = useState(strategy.objectives as Objective[]);
  const [pillars, setPillars] = useState(strategy.pillars as Pillar[]);
  const [frequency, setFrequency] = useState(strategy.frequency as Record<string, number>);
  const save = useAction(updateStrategy, {
    success: t("saved"),
    onSuccess: () => {
      onClose();
      router.refresh();
    },
  });
  const total = pillars.reduce((sum, p) => sum + p.share, 0);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("edit")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-5">
          <Field label={t("summary")} htmlFor="stSummary">
            <Textarea id="stSummary" value={summary} onChange={(e) => setSummary(e.target.value)} maxLength={2000} />
          </Field>
          <Field label={t("tone")} htmlFor="stTone">
            <Textarea id="stTone" value={tone} onChange={(e) => setTone(e.target.value)} maxLength={2000} className="min-h-16" />
          </Field>

          <Field label={t("objectives")}>
            <div className="space-y-2">
              {objectives.map((objective, index) => (
                <div key={index} className="grid gap-2 sm:grid-cols-2">
                  <Input aria-label={t("objectives")} value={objective.title} maxLength={200} onChange={(e) => setObjectives(objectives.map((o, i) => (i === index ? { ...o, title: e.target.value } : o)))} />
                  <Input aria-label={t("metric")} value={objective.metric} maxLength={200} placeholder={t("metric")} onChange={(e) => setObjectives(objectives.map((o, i) => (i === index ? { ...o, metric: e.target.value } : o)))} />
                </div>
              ))}
            </div>
          </Field>

          <Field label={`${t("pillars")} (${total} %)`} hint={t("pillars_hint")}>
            <div className="space-y-2">
              {pillars.map((pillar, index) => (
                <div key={index} className="flex items-start gap-2">
                  <div className="grid flex-1 gap-2 sm:grid-cols-[1fr_2fr]">
                    <Input aria-label={t("pillar_name")} value={pillar.name} maxLength={80} onChange={(e) => setPillars(pillars.map((p, i) => (i === index ? { ...p, name: e.target.value } : p)))} />
                    <Input aria-label={t("pillar_description")} value={pillar.description} maxLength={300} onChange={(e) => setPillars(pillars.map((p, i) => (i === index ? { ...p, description: e.target.value } : p)))} />
                  </div>
                  <Input aria-label={t("pillar_share")} type="number" min={0} max={100} className="w-20" value={pillar.share} onChange={(e) => setPillars(pillars.map((p, i) => (i === index ? { ...p, share: Number(e.target.value) } : p)))} />
                  <Button variant="ghost" size="icon-sm" disabled={pillars.length <= 3} aria-label={t("pillar_remove")} onClick={() => setPillars(pillars.filter((_, i) => i !== index))}>
                    <Trash2 />
                  </Button>
                </div>
              ))}
              {pillars.length < 5 && (
                <Button variant="ghost" size="sm" onClick={() => setPillars([...pillars, { name: "", description: "", share: 0 }])}>
                  <Plus />
                  {t("pillar_add")}
                </Button>
              )}
            </div>
          </Field>

          <Field label={t("frequency")}>
            <div className="flex flex-wrap gap-4">
              {Object.entries(frequency).map(([network, value]) => (
                <label key={network} className="flex items-center gap-2 text-[13px]">
                  <NetworkIcon network={network} />
                  <Input type="number" min={1} max={7} className="w-16" value={value} aria-label={network} onChange={(e) => setFrequency({ ...frequency, [network]: Math.min(7, Math.max(1, Number(e.target.value) || 1)) })} />
                  {t("per_week")}
                </label>
              ))}
            </div>
          </Field>
        </div>
        <DialogFooter>
          <Button loading={save.pending} disabled={pillars.some((p) => !p.name.trim())} onClick={() => save.run({ id: strategy.id, summary, tone, objectives: objectives.filter((o) => o.title.trim()), pillars, frequency })}>
            {t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function StrategyView({ strategy, period, canEdit, hasProfile }: { strategy: Strategy | null; period: string; canEdit: boolean; hasProfile: boolean }) {
  const t = useTranslations("strategy");
  const tContent = useTranslations("calendar");
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const generate = useAction(generateStrategy, { success: t("generated"), onSuccess: () => router.refresh() });

  const pillars = (strategy?.pillars ?? []) as Pillar[];
  const objectives = (strategy?.objectives ?? []) as Objective[];
  const frequency = (strategy?.frequency ?? {}) as Record<string, number>;
  const mix = (strategy?.format_mix ?? {}) as Record<string, { text: number; image: number; carousel: number }>;

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        actions={
          <>
            <MonthNav period={period} basePath="/app/strategy" />
            {strategy && canEdit && (
              <>
                <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
                  <Pencil />
                  {t("edit")}
                </Button>
                <Button variant="secondary" size="sm" loading={generate.pending} onClick={() => generate.run({ period })}>
                  {!generate.pending && <Sparkles />}
                  {t("regenerate")}
                </Button>
              </>
            )}
          </>
        }
      />

      {!strategy ? (
        <EmptyState icon={Compass} title={t("empty_title")} description={hasProfile ? t("empty_text") : t("empty_no_profile")}>
          {canEdit && hasProfile && (
            <Button loading={generate.pending} onClick={() => generate.run({ period })}>
              {!generate.pending && <Sparkles />}
              {t("generate")}
            </Button>
          )}
          {!hasProfile && (
            <Button asChild>
              <Link href="/app/onboarding">{t("go_onboarding")}</Link>
            </Button>
          )}
        </EmptyState>
      ) : (
        <div className="grid animate-rise gap-5 lg:grid-cols-3">
          <Card className="lg:col-span-3">
            <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[15px] leading-relaxed">{strategy.summary}</p>
                <p className="mt-1.5 text-[13px] text-muted-foreground">
                  <span className="font-medium text-foreground">{t("tone")} : </span>
                  {strategy.tone}
                </p>
              </div>
              <Button asChild className="shrink-0">
                <Link href={`/app/calendar?period=${period}`}>
                  {tContent("open")}
                  <ArrowRight className="rtl:rotate-180" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("objectives")}</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                {objectives.map((objective) => (
                  <li key={objective.title} className="flex gap-2.5">
                    <Target className="mt-0.5 size-4 shrink-0 text-primary" />
                    <div>
                      <div className="text-[13px] font-medium">{objective.title}</div>
                      <div className="text-xs text-muted-foreground">{objective.metric}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>{t("pillars")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-4 flex h-2 overflow-hidden rounded-full">
                {pillars.map((pillar, i) => (
                  <span key={pillar.name} style={{ width: `${pillar.share}%`, background: PILLAR_COLORS[i % PILLAR_COLORS.length] }} />
                ))}
              </div>
              <ul className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                {pillars.map((pillar, i) => (
                  <li key={pillar.name}>
                    <div className="flex items-center gap-2 text-[13px] font-medium">
                      <span className="size-2 rounded-full" style={{ background: PILLAR_COLORS[i % PILLAR_COLORS.length] }} />
                      {pillar.name}
                      <span className="ms-auto font-mono text-xs text-muted-foreground" dir="ltr">
                        {pillar.share}%
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{pillar.description}</p>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle>{t("rhythm")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2">
                {Object.entries(frequency).map(([network, value]) => (
                  <div key={network} className="rounded-xl bg-secondary p-4">
                    <div className="flex items-center gap-2">
                      <NetworkIcon network={network} />
                      <span className="text-[13px] font-semibold">{NETWORKS[network as keyof typeof NETWORKS]?.label ?? network}</span>
                      <span className="ms-auto text-[13px] text-muted-foreground">{t("posts_per_week", { count: value })}</span>
                    </div>
                    {mix[network] && (
                      <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
                        {(["text", "image", "carousel"] as const).map((format) => (
                          <div key={format} className="rounded-lg bg-card py-2">
                            <dd className="font-mono text-[15px] font-semibold" dir="ltr">
                              {mix[network]![format]}%
                            </dd>
                            <dt className="text-[11px] text-muted-foreground">{t(`format_${format}`)}</dt>
                          </div>
                        ))}
                      </dl>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {editing && strategy && <EditDialog strategy={strategy} onClose={() => setEditing(false)} />}
    </>
  );
}
