"use client";

import { CalendarDays, Lock, PartyPopper, PenLine, Plus, RefreshCw, Sparkles, Trash2, Unlock } from "lucide-react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { ChoiceChips } from "@/components/common/tag-input";
import { MonthNav } from "@/components/common/month-nav";
import { NetworkIcon } from "@/components/common/network-icon";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { useAction } from "@/components/common/use-action";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, SheetContent } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/menu";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { generateCalendar, deleteIdea, regenerateIdeas, saveIdea } from "@/features/strategy/actions";
import { PILLAR_COLORS } from "@/features/strategy/strategy-view";
import { Link, useRouter } from "@/i18n/navigation";
import { NETWORK_LIST, POST_FORMATS, type Network, type Pillar, type PostFormat } from "@/lib/domain";
import type { Database } from "@/lib/supabase/database.types";
import { cn, parseDate } from "@/lib/utils";

type Idea = Database["public"]["Tables"]["calendar_ideas"]["Row"];
type LocalEvent = Pick<Database["public"]["Tables"]["local_events"]["Row"], "id" | "event_date" | "end_date" | "names" | "category" | "is_estimated">;
type Draft = { id?: string; planned_on: string; pillar: string; format: PostFormat; networks: Network[]; title: string; angle: string; is_locked: boolean; status?: Idea["status"]; post?: string | null };

function RegenerateDialog({ period, pillars, onClose }: { period: string; pillars: Pillar[]; onClose: () => void }) {
  const t = useTranslations("calendar");
  const router = useRouter();
  const [kind, setKind] = useState("all");
  const [week, setWeek] = useState("0");
  const [pillar, setPillar] = useState(pillars[0]?.name ?? "");
  const [instruction, setInstruction] = useState("");
  const regenerate = useAction(regenerateIdeas, {
    success: t("regenerated"),
    onSuccess: () => {
      onClose();
      router.refresh();
    },
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("regenerate_title")}</DialogTitle>
          <DialogDescription>{t("regenerate_text")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Field label={t("scope")}>
            <ChoiceChips options={[{ value: "all", label: t("scope_all") }, { value: "week", label: t("scope_week") }, { value: "pillar", label: t("scope_pillar") }]} value={[kind]} onChange={([value]) => value && setKind(value)} />
          </Field>
          {kind === "week" && <Select aria-label={t("scope_week")} value={week} onValueChange={setWeek} options={[0, 1, 2, 3, 4].map((w) => ({ value: String(w), label: t("week_n", { n: w + 1 }) }))} />}
          {kind === "pillar" && <Select aria-label={t("scope_pillar")} value={pillar} onValueChange={setPillar} options={pillars.map((p) => ({ value: p.name, label: p.name }))} />}
          <Field label={t("instruction")} htmlFor="calInstruction">
            <Textarea id="calInstruction" value={instruction} onChange={(e) => setInstruction(e.target.value)} maxLength={500} className="min-h-16" placeholder={t("instruction_placeholder")} />
          </Field>
        </div>
        <DialogFooter>
          <Button
            loading={regenerate.pending}
            onClick={() =>
              regenerate.run({
                period,
                instruction: instruction || undefined,
                scope: kind === "week" ? { kind: "week", week: Number(week) } : kind === "pillar" ? { kind: "pillar", pillar } : { kind: "all" },
              })
            }
          >
            {!regenerate.pending && <Sparkles />}
            {t("regenerate_submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function IdeaSheet({ draft, period, pillars, canEdit, onClose }: { draft: Draft; period: string; pillars: Pillar[]; canEdit: boolean; onClose: () => void }) {
  const t = useTranslations("calendar");
  const tStrategy = useTranslations("strategy");
  const router = useRouter();
  const [value, setValue] = useState(draft);
  const patch = (next: Partial<Draft>) => setValue((v) => ({ ...v, ...next }));
  const finish = () => {
    onClose();
    router.refresh();
  };
  const save = useAction(saveIdea, { success: t("saved"), onSuccess: finish });
  const remove = useAction(deleteIdea, { onSuccess: finish });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <SheetContent>
        <DialogHeader>
          <DialogTitle>{value.id ? t("idea_edit") : t("idea_new")}</DialogTitle>
        </DialogHeader>
        <fieldset disabled={!canEdit} className="flex-1 space-y-4">
          <Field label={t("idea_title")} htmlFor="ideaTitle">
            <Input id="ideaTitle" value={value.title} maxLength={200} onChange={(e) => patch({ title: e.target.value })} />
          </Field>
          <Field label={t("idea_angle")} htmlFor="ideaAngle">
            <Textarea id="ideaAngle" value={value.angle} maxLength={1000} onChange={(e) => patch({ angle: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("idea_date")} htmlFor="ideaDate">
              <Input id="ideaDate" type="date" value={value.planned_on} min={period} max={`${period.slice(0, 8)}31`} onChange={(e) => patch({ planned_on: e.target.value })} />
            </Field>
            <Field label={t("idea_pillar")} htmlFor="ideaPillar">
              <Select id="ideaPillar" value={value.pillar} onValueChange={(pillar) => patch({ pillar })} options={pillars.map((p) => ({ value: p.name, label: p.name }))} />
            </Field>
          </div>
          <Field label={t("idea_format")}>
            <ChoiceChips options={POST_FORMATS.map((f) => ({ value: f, label: tStrategy(`format_${f}`) }))} value={[value.format]} onChange={([format]) => format && patch({ format })} />
          </Field>
          <Field label={t("idea_networks")}>
            <ChoiceChips multiple options={NETWORK_LIST.map((n) => ({ value: n, label: n === "facebook" ? "Facebook" : "Instagram" }))} value={value.networks} onChange={(networks) => patch({ networks })} />
          </Field>
          <Button variant="ghost" size="sm" onClick={() => patch({ is_locked: !value.is_locked })}>
            {value.is_locked ? <Lock /> : <Unlock />}
            {value.is_locked ? t("locked") : t("lock")}
          </Button>
        </fieldset>

        <div className="mt-6 space-y-2">
          {value.id && canEdit && value.status === "idea" && (
            <Button variant="soft" className="w-full" asChild>
              <Link href={`/app/content/new?idea=${value.id}`}>
                <PenLine />
                {t("write_post")}
              </Link>
            </Button>
          )}
          {value.post && (
            <Button variant="soft" className="w-full" asChild>
              <Link href={`/app/content/${value.post}`}>{t("open_post")}</Link>
            </Button>
          )}
          {canEdit && (
            <div className="flex gap-2">
              <Button className="flex-1" loading={save.pending} disabled={!value.title.trim() || !value.networks.length || !value.pillar} onClick={() => save.run({ id: value.id, period, planned_on: value.planned_on, pillar: value.pillar, format: value.format, networks: value.networks, title: value.title, angle: value.angle, is_locked: value.is_locked })}>
                {t("save")}
              </Button>
              {value.id && (
                <ConfirmDialog
                  trigger={
                    <Button variant="secondary" size="icon" aria-label={t("delete")}>
                      <Trash2 />
                    </Button>
                  }
                  title={t("delete_title")}
                  confirmLabel={t("delete")}
                  loading={remove.pending}
                  onConfirm={() => remove.run({ id: value.id! })}
                />
              )}
            </div>
          )}
        </div>
      </SheetContent>
    </Dialog>
  );
}

export function CalendarView({
  period,
  ideas,
  events,
  pillars,
  hasStrategy,
  canEdit,
  posts,
}: {
  period: string;
  ideas: Idea[];
  events: LocalEvent[];
  pillars: Pillar[];
  hasStrategy: boolean;
  canEdit: boolean;
  posts: Record<string, string>;
}) {
  const t = useTranslations("calendar");
  const tStrategy = useTranslations("strategy");
  const format = useFormatter();
  const locale = useLocale();
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const generate = useAction(generateCalendar, { success: t("generated"), onSuccess: () => router.refresh() });

  const colorOf = (pillar: string) => {
    const index = pillars.findIndex((p) => p.name === pillar);
    return PILLAR_COLORS[(index < 0 ? 0 : index) % PILLAR_COLORS.length]!;
  };
  const eventName = (e: LocalEvent) => {
    const names = e.names as Record<string, string>;
    return names[locale] ?? names.fr ?? "";
  };

  const grid = useMemo(() => {
    const first = parseDate(period);
    const days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    // Semaine commençant le lundi, comme en Tunisie.
    const lead = (first.getDay() + 6) % 7;
    return { lead, cells: Array.from({ length: days }, (_, i) => `${period.slice(0, 8)}${String(i + 1).padStart(2, "0")}`) };
  }, [period]);

  const byDate = useMemo(() => {
    const map = new Map<string, Idea[]>();
    for (const idea of ideas) map.set(idea.planned_on, [...(map.get(idea.planned_on) ?? []), idea]);
    return map;
  }, [ideas]);

  const eventsOn = (date: string) => events.filter((e) => e.event_date <= date && (e.end_date ?? e.event_date) >= date);
  const weekdays = Array.from({ length: 7 }, (_, i) => format.dateTime(new Date(2024, 0, 1 + i, 12), { weekday: "short" }));

  const openIdea = (idea: Idea) =>
    setDraft({ id: idea.id, planned_on: idea.planned_on, pillar: idea.pillar, format: idea.format as PostFormat, networks: idea.networks as Network[], title: idea.title, angle: idea.angle, is_locked: idea.is_locked, status: idea.status, post: posts[idea.id] ?? null });
  const newIdea = (date: string) => setDraft({ planned_on: date, pillar: pillars[0]?.name ?? "", format: "image", networks: [...NETWORK_LIST], title: "", angle: "", is_locked: false });

  const IdeaChip = ({ idea }: { idea: Idea }) => (
    <button type="button" onClick={() => openIdea(idea)} className={cn("group flex w-full items-start gap-1.5 rounded-md border bg-card px-1.5 py-1 text-start shadow-card transition-colors hover:border-input", idea.status === "drafted" && "opacity-60")} style={{ borderInlineStartColor: colorOf(idea.pillar), borderInlineStartWidth: 3 }}>
      <span dir="auto" className="line-clamp-2 min-w-0 flex-1 text-[11px] leading-snug font-medium">{idea.title}</span>
      {idea.is_locked && <Lock className="mt-0.5 size-2.5 shrink-0 text-muted-foreground" />}
    </button>
  );

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        actions={
          <>
            <MonthNav period={period} basePath="/app/calendar" />
            {canEdit && ideas.length > 0 && (
              <Button variant="secondary" size="sm" onClick={() => setRegenerating(true)}>
                <RefreshCw />
                {t("regenerate")}
              </Button>
            )}
          </>
        }
      />

      {ideas.length === 0 ? (
        <EmptyState icon={CalendarDays} title={hasStrategy ? t("empty_title") : t("no_strategy_title")} description={hasStrategy ? t("empty_text") : t("no_strategy_text")}>
          {hasStrategy && canEdit && (
            <Button loading={generate.pending} onClick={() => generate.run({ period })}>
              {!generate.pending && <Sparkles />}
              {t("generate")}
            </Button>
          )}
          {!hasStrategy && (
            <Button asChild>
              <Link href={`/app/strategy?period=${period}`}>{t("go_strategy")}</Link>
            </Button>
          )}
        </EmptyState>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
            {pillars.map((pillar) => (
              <span key={pillar.name} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="size-2 rounded-full" style={{ background: colorOf(pillar.name) }} />
                {pillar.name}
              </span>
            ))}
          </div>

          <Card className="hidden overflow-hidden md:block">
            <div className="grid grid-cols-7 border-b bg-secondary">
              {weekdays.map((day) => (
                <div key={day} className="px-2 py-1.5 text-center text-[11px] font-semibold text-muted-foreground">
                  {day}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {Array.from({ length: grid.lead }, (_, i) => (
                <div key={`lead-${i}`} className="min-h-28 border-e border-b bg-secondary/40" />
              ))}
              {grid.cells.map((date) => {
                const dayEvents = eventsOn(date);
                return (
                  <div key={date} className="group/day relative min-h-28 space-y-1 border-e border-b p-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-medium text-muted-foreground tabular-nums">{Number(date.slice(8))}</span>
                      {canEdit && hasStrategy && (
                        <button type="button" aria-label={t("idea_new")} onClick={() => newIdea(date)} className="rounded p-0.5 text-muted-foreground opacity-0 transition-opacity group-hover/day:opacity-100 hover:bg-secondary focus-visible:opacity-100">
                          <Plus className="size-3" />
                        </button>
                      )}
                    </div>
                    {dayEvents.map((event) => (
                      <div key={event.id} className="flex items-center gap-1 truncate rounded bg-warm-soft px-1 py-0.5 text-[10px] font-medium text-warm" title={event.is_estimated ? t("estimated") : undefined}>
                        <PartyPopper className="size-2.5 shrink-0" />
                        <span className="truncate">{eventName(event)}</span>
                      </div>
                    ))}
                    {(byDate.get(date) ?? []).map((idea) => (
                      <IdeaChip key={idea.id} idea={idea} />
                    ))}
                  </div>
                );
              })}
            </div>
          </Card>

          <div className="space-y-2 md:hidden">
            {grid.cells
              .filter((date) => byDate.has(date) || eventsOn(date).length)
              .map((date) => (
                <Card key={date} className="p-3">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="text-[13px] font-semibold capitalize">{format.dateTime(parseDate(date), { weekday: "long", day: "numeric", month: "short" })}</span>
                    {eventsOn(date).map((event) => (
                      <Badge key={event.id} variant="warm">
                        {eventName(event)}
                      </Badge>
                    ))}
                  </div>
                  <div className="space-y-1.5">
                    {(byDate.get(date) ?? []).map((idea) => (
                      <button key={idea.id} type="button" onClick={() => openIdea(idea)} className="flex w-full items-center gap-2 rounded-lg bg-secondary p-2.5 text-start">
                        <span className="h-8 w-1 shrink-0 rounded-full" style={{ background: colorOf(idea.pillar) }} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[13px] font-medium">{idea.title}</span>
                          <span className="text-xs text-muted-foreground">
                            {idea.pillar} · {tStrategy(`format_${idea.format}`)}
                          </span>
                        </span>
                        <span className="flex gap-0.5">
                          {idea.networks.map((n) => (
                            <NetworkIcon key={n} network={n} className="size-4 rounded" />
                          ))}
                        </span>
                      </button>
                    ))}
                  </div>
                </Card>
              ))}
          </div>
        </>
      )}

      {regenerating && <RegenerateDialog period={period} pillars={pillars} onClose={() => setRegenerating(false)} />}
      {draft && <IdeaSheet draft={draft} period={period} pillars={pillars} canEdit={canEdit} onClose={() => setDraft(null)} />}
    </>
  );
}
