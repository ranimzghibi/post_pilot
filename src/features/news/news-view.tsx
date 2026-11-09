"use client";

import { Megaphone, Pencil, Plus, Trash2 } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { useAction } from "@/components/common/use-action";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Select, Switch } from "@/components/ui/menu";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { useRouter } from "@/i18n/navigation";
import { NEWS_KINDS } from "@/lib/domain";
import type { Database } from "@/lib/supabase/database.types";
import { parseDate } from "@/lib/utils";
import { deleteNews, saveNews, toggleNews } from "./actions";

type News = Database["public"]["Tables"]["brand_news"]["Row"];
type Draft = { id?: string; kind: (typeof NEWS_KINDS)[number]; title: string; details: string; starts_on: string; ends_on: string };

const EMPTY: Draft = { kind: "promotion", title: "", details: "", starts_on: "", ends_on: "" };
const KIND_VARIANT: Record<string, BadgeVariant> = { new_product: "primary", promotion: "warm", closure: "danger", event: "success", other: "neutral" };

export function NewsView({ items, canEdit }: { items: News[]; canEdit: boolean }) {
  const t = useTranslations("news");
  const tv = useTranslations("validation");
  const format = useFormatter();
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const refresh = () => router.refresh();

  const save = useAction(saveNews, {
    silent: false,
    onSuccess: () => {
      setDraft(null);
      refresh();
    },
    onError: (result) => setErrors(result.fields ?? {}),
  });
  const toggle = useAction(toggleNews, { onSuccess: refresh });
  const remove = useAction(deleteNews, { onSuccess: refresh });

  const fieldError = (key: string) => (errors[key] && tv.has(errors[key]!) ? tv(errors[key]!) : undefined);
  const period = (item: News) => {
    if (!item.starts_on && !item.ends_on) return null;
    const fmt = (v: string) => format.dateTime(parseDate(v), { day: "numeric", month: "short" });
    return [item.starts_on && fmt(item.starts_on), item.ends_on && fmt(item.ends_on)].filter(Boolean).join(" → ");
  };

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        actions={
          canEdit && (
            <Button
              onClick={() => {
                setErrors({});
                setDraft(EMPTY);
              }}
            >
              <Plus />
              {t("add")}
            </Button>
          )
        }
      />

      {items.length === 0 ? (
        <EmptyState icon={Megaphone} title={t("empty_title")} description={t("empty_text")} />
      ) : (
        <Card>
          <ul className="divide-y">
            {items.map((item) => (
              <li key={item.id} className="flex items-center gap-3 px-4 py-3.5">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={KIND_VARIANT[item.kind]}>{t(`kind_${item.kind}`)}</Badge>
                    <span className="text-[13px] font-medium">{item.title}</span>
                    {period(item) && <span className="text-xs text-muted-foreground">{period(item)}</span>}
                  </div>
                  {item.details && <p className="mt-1 line-clamp-2 text-[13px] text-muted-foreground">{item.details}</p>}
                </div>
                {canEdit && (
                  <div className="flex shrink-0 items-center gap-1">
                    <Switch checked={item.is_active} aria-label={t("active")} onCheckedChange={(is_active) => toggle.run({ id: item.id, is_active })} />
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t("edit")}
                      onClick={() => {
                        setErrors({});
                        setDraft({ id: item.id, kind: item.kind as Draft["kind"], title: item.title, details: item.details, starts_on: item.starts_on ?? "", ends_on: item.ends_on ?? "" });
                      }}
                    >
                      <Pencil />
                    </Button>
                    <ConfirmDialog
                      trigger={
                        <Button variant="ghost" size="icon-sm" aria-label={t("delete")}>
                          <Trash2 />
                        </Button>
                      }
                      title={t("delete_title")}
                      confirmLabel={t("delete")}
                      loading={remove.pending}
                      onConfirm={() => remove.run({ id: item.id })}
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Dialog open={!!draft} onOpenChange={(open) => !open && setDraft(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{draft?.id ? t("edit") : t("add")}</DialogTitle>
          </DialogHeader>
          {draft && (
            <div className="space-y-4">
              <Field label={t("kind")} htmlFor="newsKind">
                <Select id="newsKind" value={draft.kind} onValueChange={(kind) => setDraft({ ...draft, kind: kind as Draft["kind"] })} options={NEWS_KINDS.map((value) => ({ value, label: t(`kind_${value}`) }))} />
              </Field>
              <Field label={t("news_title")} htmlFor="newsTitle" error={fieldError("title")}>
                <Input id="newsTitle" value={draft.title} maxLength={200} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder={t("title_placeholder")} />
              </Field>
              <Field label={t("details")} htmlFor="newsDetails" hint={t("details_hint")}>
                <Textarea id="newsDetails" value={draft.details} maxLength={2000} onChange={(e) => setDraft({ ...draft, details: e.target.value })} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label={t("starts_on")} htmlFor="newsStart">
                  <Input id="newsStart" type="date" value={draft.starts_on} onChange={(e) => setDraft({ ...draft, starts_on: e.target.value })} />
                </Field>
                <Field label={t("ends_on")} htmlFor="newsEnd" error={fieldError("ends_on")}>
                  <Input id="newsEnd" type="date" value={draft.ends_on} onChange={(e) => setDraft({ ...draft, ends_on: e.target.value })} />
                </Field>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button loading={save.pending} onClick={() => draft && save.run(draft)}>
              {t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
