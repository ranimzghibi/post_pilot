"use client";

import { AlertTriangle, BookmarkPlus, Check, ChevronDown, Hash, ImagePlus, Send, ShieldCheck, Trash2, Wand2, X } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { NetworkIcon } from "@/components/common/network-icon";
import { TagInput } from "@/components/common/tag-input";
import { useAction } from "@/components/common/use-action";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/menu";
import { Avatar, ScoreRing } from "@/components/ui/misc";
import { addBrandExample } from "@/features/brand/actions";
import { PublishDialog, type LibraryAsset } from "@/features/connections/connections-view";
import { detachAsset } from "@/features/studio/actions";
import { Link, useRouter } from "@/i18n/navigation";
import { NETWORKS, type ComplianceIssue, type Network } from "@/lib/domain";
import type { Database } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";
import { deletePost, rewriteVariant, selectOption, suggestHashtags, updateVariant } from "./actions";

type Tables = Database["public"]["Tables"];
type Variant = Tables["post_variants"]["Row"];
type Post = Tables["posts"]["Row"];
type Generation = Pick<Tables["ai_generations"]["Row"], "provider" | "model" | "prompt_version" | "prompt" | "created_at"> | null;
type Account = Tables["social_accounts"]["Row"];
type EditableFields = { caption: string; hashtags: string[]; cta: string; score: number | null; issues: ComplianceIssue[]; edited: boolean };

const QUICK = ["shorter", "longer", "direct", "warmer", "question"] as const;

function initial(variants: Variant[]) {
  return Object.fromEntries(variants.map((v) => [v.id, { caption: v.caption, hashtags: v.hashtags, cta: v.cta, score: v.compliance_score, issues: v.compliance_issues as unknown as ComplianceIssue[], edited: v.edited_by_user } satisfies EditableFields]));
}

export function PostEditor({
  post,
  variants,
  generation,
  brandName,
  media,
  accounts,
  canEdit,
  canPublish,
}: {
  post: Post;
  variants: Variant[];
  generation: Generation;
  brandName: string;
  media: LibraryAsset[];
  accounts: Account[];
  canEdit: boolean;
  canPublish: boolean;
}) {
  const t = useTranslations("content");
  const tIssues = useTranslations("issues");
  const format = useFormatter();
  const router = useRouter();

  const networks = useMemo(() => Array.from(new Set(variants.map((v) => v.network))) as Network[], [variants]);
  const options = useMemo(() => Array.from(new Set(variants.map((v) => v.option_index))).sort(), [variants]);
  const selectedOption = variants.find((v) => v.is_selected)?.option_index ?? 0;

  const [option, setOption] = useState(selectedOption);
  const [network, setNetwork] = useState<Network>(networks[0]!);
  const [state, setState] = useState(() => initial(variants));
  const [dirty, setDirty] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [publishOpen, setPublishOpen] = useState(false);
  const [selected, setSelected] = useState(selectedOption);

  const variant = variants.find((v) => v.option_index === option && v.network === network) ?? variants.find((v) => v.option_index === option)!;
  const fields = state[variant.id]!;
  const patch = (next: Partial<EditableFields>) => {
    setState((s) => ({ ...s, [variant.id]: { ...s[variant.id]!, ...next } }));
    setDirty(true);
  };
  const applyResult = (result: { caption?: string; hashtags?: string[]; cta?: string; score: number; issues: ComplianceIssue[] }, edited: boolean) => {
    setState((s) => ({ ...s, [variant.id]: { ...s[variant.id]!, ...(result.caption !== undefined ? { caption: result.caption, hashtags: result.hashtags!, cta: result.cta! } : {}), score: result.score, issues: result.issues, edited } }));
    setDirty(false);
  };

  const locked = post.status !== "draft";
  const readOnly = !canEdit || locked;

  const save = useAction(updateVariant, { success: t("saved"), onSuccess: (result) => applyResult(result, true) });
  const rewrite = useAction(rewriteVariant, {
    onSuccess: (result) => {
      applyResult(result, false);
      setInstruction("");
    },
  });
  const pick = useAction(selectOption, { success: t("option_chosen"), onSuccess: () => setSelected(option) });
  const hashtags = useAction(suggestHashtags, { onSuccess: (tags) => patch({ hashtags: Array.from(new Set([...fields.hashtags, ...tags])).slice(0, NETWORKS[network].hashtagLimit) }) });
  const example = useAction(addBrandExample, { success: t("example_added") });
  const remove = useAction(deletePost, { onSuccess: () => router.push("/app/content") });
  const detach = useAction(detachAsset, { onSuccess: () => router.refresh() });

  const limit = NETWORKS[network].captionLimit;
  const issueText = (issue: ComplianceIssue) => tIssues(issue.code, { detail: issue.code === "sensitive_topic" ? tIssues(`topic_${issue.detail}`) : issue.detail });

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
      <div className="min-w-0 space-y-5">
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b p-3">
            <Tabs value={String(option)} onValueChange={(v) => setOption(Number(v))}>
              <TabsList>
                {options.map((index) => (
                  <TabsTrigger key={index} value={String(index)}>
                    {t("option", { letter: String.fromCharCode(65 + index) })}
                    {index === selected && <Check className="text-primary" />}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <Tabs value={network} onValueChange={(v) => setNetwork(v as Network)}>
              <TabsList>
                {networks.map((n) => (
                  <TabsTrigger key={n} value={n}>
                    <NetworkIcon network={n} className="size-3.5 rounded" />
                    {NETWORKS[n].label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>

          <CardContent className="space-y-4">
            <Field label={t("caption")} htmlFor="caption">
              <Textarea id="caption" dir="auto" value={fields.caption} disabled={readOnly} onChange={(e) => patch({ caption: e.target.value })} className="min-h-44" />
              <div className={cn("text-end font-mono text-[11px]", fields.caption.length > limit ? "text-destructive" : "text-muted-foreground")} dir="ltr">
                {fields.caption.length} / {limit}
              </div>
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("cta")} htmlFor="cta">
                <Input id="cta" dir="auto" value={fields.cta} disabled={readOnly} maxLength={200} onChange={(e) => patch({ cta: e.target.value })} />
              </Field>
              <Field
                label={
                  <span className="flex items-center justify-between">
                    {t("hashtags")}
                    {!readOnly && (
                      <button type="button" className="inline-flex items-center gap-1 text-xs text-primary hover:underline disabled:opacity-50" disabled={hashtags.pending} onClick={() => hashtags.run({ id: variant.id })}>
                        <Hash className="size-3" />
                        {t("suggest")}
                      </button>
                    )}
                  </span>
                }
              >
                <TagInput value={fields.hashtags} onChange={(tags) => patch({ hashtags: tags })} disabled={readOnly} max={NETWORKS[network].hashtagLimit} placeholder={t("hashtags_placeholder")} />
              </Field>
            </div>

            {!readOnly && (
              <div className="flex flex-wrap items-center gap-2 border-t pt-4">
                <Button loading={save.pending} disabled={!dirty} onClick={() => save.run({ id: variant.id, caption: fields.caption, hashtags: fields.hashtags, cta: fields.cta })}>
                  {t("save")}
                </Button>
                {option !== selected && (
                  <Button variant="soft" loading={pick.pending} onClick={() => pick.run({ postId: post.id, optionIndex: option })}>
                    <Check />
                    {t("choose_option")}
                  </Button>
                )}
                {fields.edited && (
                  <Button variant="ghost" loading={example.pending} onClick={() => example.run({ text: fields.caption })}>
                    <BookmarkPlus />
                    {t("add_example")}
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {!readOnly && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wand2 className="size-4 text-primary" />
                {t("rewrite_title")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-1.5">
                {QUICK.map((key) => (
                  <Button key={key} variant="secondary" size="sm" disabled={rewrite.pending} onClick={() => rewrite.run({ id: variant.id, instruction: t(`quick_${key}`) })}>
                    {t(`quick_${key}`)}
                  </Button>
                ))}
              </div>
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (instruction.trim().length >= 2) rewrite.run({ id: variant.id, instruction });
                }}
              >
                <Input value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder={t("rewrite_placeholder")} aria-label={t("rewrite_title")} maxLength={500} />
                <Button type="submit" variant="secondary" loading={rewrite.pending}>
                  {t("rewrite_submit")}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>{t("visuals")}</CardTitle>
            {canEdit && (
              <Button variant="secondary" size="sm" asChild>
                <Link href={`/app/studio?post=${post.id}`}>
                  <ImagePlus />
                  {t("create_visual")}
                </Link>
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {variant.visual_brief && <p className="mb-3 rounded-lg bg-secondary p-2.5 text-xs leading-relaxed text-muted-foreground">{variant.visual_brief}</p>}
            {media.length > 0 ? (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                {media.map((asset) => (
                  <div key={asset.id} className="group relative aspect-square overflow-hidden rounded-lg border">
                    {/* eslint-disable-next-line @next/next/no-img-element -- URL signée à durée limitée */}
                    <img src={asset.url} alt={asset.alt} className="size-full object-cover" />
                    {canEdit && (
                      <button type="button" aria-label={t("detach")} onClick={() => detach.run({ postId: post.id, assetId: asset.id })} className="absolute end-1 top-1 rounded-md bg-black/60 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100">
                        <X className="size-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[13px] text-muted-foreground">{t("no_visuals")}</p>
            )}
          </CardContent>
        </Card>
      </div>

      <aside className="space-y-5 lg:sticky lg:top-20">
        <Card>
          <CardContent>
            <div className="flex items-center gap-3">
              <ScoreRing score={fields.score} />
              <div>
                <div className="text-[13px] font-semibold">{t("compliance")}</div>
                <div className="text-xs leading-relaxed text-muted-foreground">{t("compliance_text")}</div>
              </div>
            </div>
            {fields.issues.length > 0 ? (
              <ul className="mt-4 space-y-2">
                {fields.issues.map((issue, index) => (
                  <li key={index} className={cn("flex items-start gap-2 rounded-lg p-2.5 text-xs leading-relaxed", issue.severity === "high" ? "bg-destructive-soft text-destructive" : issue.severity === "medium" ? "bg-warning-soft text-warning" : "bg-secondary text-muted-foreground")}>
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                    {issueText(issue)}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 flex items-center gap-2 rounded-lg bg-success-soft p-2.5 text-xs text-success">
                <ShieldCheck className="size-3.5" />
                {t("compliance_ok")}
              </p>
            )}
            {post.sensitive_topics.length > 0 && <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{t("sensitive_notice")}</p>}
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <div className="flex items-center gap-2.5 p-3">
            <Avatar name={brandName} className="size-8" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-semibold">{brandName}</div>
              <div className="text-[11px] text-muted-foreground">{t("preview")}</div>
            </div>
            <NetworkIcon network={network} />
          </div>
          {media[0] && (
            // eslint-disable-next-line @next/next/no-img-element -- URL signée à durée limitée
            <img src={media[0].url} alt="" className="aspect-square w-full object-cover" />
          )}
          <div className="p-3">
            <p className="line-clamp-[9] text-[13px] leading-relaxed whitespace-pre-line" dir="auto">
              {fields.caption}
            </p>
            {fields.cta && (
              <p className="mt-2 text-[13px] font-medium" dir="auto">
                {fields.cta}
              </p>
            )}
            {fields.hashtags.length > 0 && (
              <p className="mt-2 text-[13px] text-primary" dir="auto">
                {fields.hashtags.map((tag) => `#${tag}`).join(" ")}
              </p>
            )}
          </div>
        </Card>

        {canPublish && accounts.some((a) => a.is_test) && (
          <Button variant="secondary" className="w-full" onClick={() => setPublishOpen(true)}>
            <Send />
            {t("publish_test")}
          </Button>
        )}

        {generation && (
          <details className="group rounded-xl border bg-card p-4 text-xs">
            <summary className="flex cursor-pointer list-none items-center justify-between font-semibold">
              {t("trace")}
              <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" />
            </summary>
            <dl className="mt-3 space-y-1.5 text-muted-foreground">
              <div className="flex justify-between gap-3">
                <dt>{t("trace_model")}</dt>
                <dd className="font-mono" dir="ltr">
                  {generation.model}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>{t("trace_prompt")}</dt>
                <dd className="font-mono" dir="ltr">
                  {generation.prompt_version}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>{t("trace_dna")}</dt>
                <dd className="font-mono" dir="ltr">
                  v{post.brand_profile_version ?? "–"}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>{t("trace_date")}</dt>
                <dd>{format.dateTime(new Date(generation.created_at), { dateStyle: "short", timeStyle: "short" })}</dd>
              </div>
            </dl>
          </details>
        )}

        {canEdit && !locked && (
          <ConfirmDialog
            trigger={
              <Button variant="ghost" size="sm" className="w-full text-destructive">
                <Trash2 />
                {t("delete")}
              </Button>
            }
            title={t("delete_title")}
            confirmLabel={t("delete")}
            loading={remove.pending}
            onConfirm={() => remove.run({ id: post.id })}
          />
        )}
      </aside>

      <PublishDialog
        accounts={accounts}
        assets={media}
        open={publishOpen}
        onOpenChange={setPublishOpen}
        initialCaption={[fields.caption, fields.cta, fields.hashtags.map((tag) => `#${tag}`).join(" ")].filter(Boolean).join("\n\n")}
        initialAssetId={media[0]?.id ?? null}
        variantId={variant.id}
        onPublished={() => toast.success(t("published"))}
      />
    </div>
  );
}
