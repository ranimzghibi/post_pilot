"use client";

import { History, ImagePlus, Plus, RotateCcw, Sparkles, Trash2 } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { ChoiceChips, TagInput } from "@/components/common/tag-input";
import { useAction } from "@/components/common/use-action";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Textarea } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/menu";
import { useRouter } from "@/i18n/navigation";
import { DEFAULT_COLORS, EMOJI_USAGE, IMAGE_MIME_TYPES, type EmojiUsage, type VisualIdentity } from "@/lib/domain";
import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/client";
import { safeFileName } from "@/lib/utils";
import { regenerateBrandProfile, restoreBrandProfile, saveBrandProfile, saveVisualIdentity } from "./actions";

type Profile = Database["public"]["Tables"]["brand_profiles"]["Row"];
type Example = { text: string; note: string };

const COLOR_KEYS = ["primary", "secondary", "accent", "background", "text"] as const;

type EditorProps = {
  current: Profile | null;
  history: Pick<Profile, "version" | "source" | "change_note" | "created_at">[];
  logoUrl: string | null;
  orgId: string;
  brandId: string;
  readOnly: boolean;
};

/** L'onglet reste ouvert quand une nouvelle version recharge le formulaire. */
export function BrandEditor(props: EditorProps) {
  const [tab, setTab] = useState("voice");
  return <BrandEditorForm key={props.current?.version ?? 0} {...props} tab={tab} onTabChange={setTab} />;
}

function BrandEditorForm({ current, history, logoUrl, orgId, brandId, readOnly, tab, onTabChange }: EditorProps & { tab: string; onTabChange: (tab: string) => void }) {
  const t = useTranslations("brand");
  const tDomain = useTranslations("domain");
  const format = useFormatter();
  const router = useRouter();
  const refresh = () => router.refresh();

  const [summary, setSummary] = useState(current?.summary ?? "");
  const [audience, setAudience] = useState(current?.audience ?? "");
  const [tone, setTone] = useState(current?.tone ?? "");
  const [vocabulary, setVocabulary] = useState<string[]>(current?.vocabulary ?? []);
  const [avoid, setAvoid] = useState<string[]>(current?.avoid ?? []);
  const [emoji, setEmoji] = useState<EmojiUsage>((current?.emoji_usage as EmojiUsage) ?? "rare");
  const [examples, setExamples] = useState<Example[]>((current?.examples as Example[]) ?? []);

  const identity = (current?.visual_identity ?? {}) as VisualIdentity;
  const [colors, setColors] = useState({ ...DEFAULT_COLORS, ...identity.colors });
  const [font, setFont] = useState<"sans" | "serif">(identity.heading_font ?? "sans");
  const [logoPath, setLogoPath] = useState<string | null>(identity.logo_path ?? null);
  const [logoPreview, setLogoPreview] = useState<string | null>(logoUrl);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const save = useAction(saveBrandProfile, { success: t("saved"), onSuccess: refresh });
  const saveVisual = useAction(saveVisualIdentity, { success: t("saved"), onSuccess: refresh });
  const restore = useAction(restoreBrandProfile, { success: t("restored"), onSuccess: refresh });
  const regenerate = useAction(regenerateBrandProfile, { success: t("regenerated"), onSuccess: refresh });

  const onLogo = async (file: File) => {
    if (!IMAGE_MIME_TYPES.includes(file.type) || file.size > 5 * 1024 * 1024) {
      toast.error(t("logo_invalid"));
      return;
    }
    setUploading(true);
    const path = `${orgId}/${brandId}/logo-${crypto.randomUUID()}-${safeFileName(file.name)}`;
    const { error } = await createClient().storage.from("media").upload(path, file, { contentType: file.type });
    setUploading(false);
    if (error) {
      toast.error(t("logo_failed"));
      return;
    }
    setLogoPath(path);
    setLogoPreview(URL.createObjectURL(file));
  };

  return (
    <Tabs value={tab} onValueChange={onTabChange}>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <TabsList>
          <TabsTrigger value="voice">{t("tab_voice")}</TabsTrigger>
          <TabsTrigger value="visual">{t("tab_visual")}</TabsTrigger>
          <TabsTrigger value="history">
            <History />
            {t("tab_history")}
          </TabsTrigger>
        </TabsList>
        {!readOnly && (
          <Button variant="secondary" size="sm" loading={regenerate.pending} onClick={() => regenerate.run({})}>
            {!regenerate.pending && <Sparkles />}
            {t("regenerate")}
          </Button>
        )}
      </div>

      <TabsContent value="voice">
        <fieldset disabled={readOnly} className="grid gap-5 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>{t("section_identity")}</CardTitle>
              <CardDescription>{t("section_identity_text")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Field label={t("summary")} htmlFor="summary">
                <Textarea id="summary" value={summary} onChange={(e) => setSummary(e.target.value)} maxLength={2000} />
              </Field>
              <Field label={t("audience")} htmlFor="audience">
                <Textarea id="audience" value={audience} onChange={(e) => setAudience(e.target.value)} maxLength={2000} />
              </Field>
              <Field label={t("tone")} htmlFor="tone">
                <Textarea id="tone" value={tone} onChange={(e) => setTone(e.target.value)} maxLength={2000} />
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("section_words")}</CardTitle>
              <CardDescription>{t("section_words_text")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Field label={t("vocabulary")} htmlFor="vocabulary">
                <TagInput id="vocabulary" value={vocabulary} onChange={setVocabulary} disabled={readOnly} placeholder={t("tag_placeholder")} />
              </Field>
              <Field label={t("avoid")} htmlFor="avoidWords">
                <TagInput id="avoidWords" tone="danger" value={avoid} onChange={setAvoid} disabled={readOnly} placeholder={t("tag_placeholder")} />
              </Field>
              <Field label={t("emoji")}>
                <ChoiceChips options={EMOJI_USAGE.map((value) => ({ value, label: tDomain(`emoji_${value}`) }))} value={[emoji]} onChange={([value]) => value && setEmoji(value)} />
              </Field>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>{t("section_examples")}</CardTitle>
              <CardDescription>{t("section_examples_text")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {examples.map((example, index) => (
                <div key={index} className="flex items-start gap-2">
                  <Textarea
                    aria-label={`${t("section_examples")} ${index + 1}`}
                    value={example.text}
                    maxLength={2000}
                    className="min-h-20"
                    onChange={(e) => setExamples(examples.map((item, i) => (i === index ? { ...item, text: e.target.value } : item)))}
                  />
                  {!readOnly && (
                    <Button variant="ghost" size="icon-sm" aria-label={t("remove_example")} onClick={() => setExamples(examples.filter((_, i) => i !== index))}>
                      <Trash2 />
                    </Button>
                  )}
                </div>
              ))}
              {!readOnly && examples.length < 8 && (
                <Button variant="ghost" size="sm" onClick={() => setExamples([...examples, { text: "", note: "" }])}>
                  <Plus />
                  {t("add_example")}
                </Button>
              )}
            </CardContent>
          </Card>
        </fieldset>

        {!readOnly && (
          <div className="sticky bottom-4 mt-5 flex justify-end">
            <Button
              size="lg"
              className="shadow-float"
              loading={save.pending}
              onClick={() => save.run({ summary, audience, tone, vocabulary, avoid, emoji_usage: emoji, examples: examples.filter((e) => e.text.trim()) })}
            >
              {t("save_version")}
            </Button>
          </div>
        )}
      </TabsContent>

      <TabsContent value="visual">
        <fieldset disabled={readOnly} className="grid gap-5 lg:grid-cols-[1fr_320px]">
          <Card>
            <CardContent className="space-y-6">
              <Field label={t("logo")}>
                <div className="flex items-center gap-4">
                  <span className="flex size-20 items-center justify-center overflow-hidden rounded-xl border bg-secondary">
                    {logoPreview ? (
                      // eslint-disable-next-line @next/next/no-img-element -- URL signée à durée limitée
                      <img src={logoPreview} alt="" className="size-full object-contain p-1.5" />
                    ) : (
                      <ImagePlus className="size-5 text-muted-foreground" />
                    )}
                  </span>
                  <input ref={fileInput} type="file" accept={IMAGE_MIME_TYPES.join(",")} hidden onChange={(e) => e.target.files?.[0] && onLogo(e.target.files[0])} />
                  <Button variant="secondary" size="sm" loading={uploading} onClick={() => fileInput.current?.click()}>
                    {t("upload_logo")}
                  </Button>
                </div>
              </Field>

              <Field label={t("colors")}>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                  {COLOR_KEYS.map((key) => (
                    <label key={key} className="block cursor-pointer">
                      <span className="block h-14 rounded-xl border" style={{ background: colors[key] }}>
                        <input type="color" className="size-full cursor-pointer opacity-0" value={colors[key]} aria-label={t(`color_${key}`)} onChange={(e) => setColors({ ...colors, [key]: e.target.value.toUpperCase() })} />
                      </span>
                      <span className="mt-1.5 block text-xs font-medium">{t(`color_${key}`)}</span>
                      <span className="block font-mono text-[11px] text-muted-foreground" dir="ltr">
                        {colors[key]}
                      </span>
                    </label>
                  ))}
                </div>
              </Field>

              <Field label={t("heading_font")}>
                <ChoiceChips
                  options={[
                    { value: "sans" as const, label: t("font_sans") },
                    { value: "serif" as const, label: t("font_serif") },
                  ]}
                  value={[font]}
                  onChange={([value]) => value && setFont(value)}
                />
              </Field>

              {!readOnly && (
                <Button loading={saveVisual.pending} onClick={() => saveVisual.run({ logo_path: logoPath, colors, heading_font: font })}>
                  {t("save_version")}
                </Button>
              )}
            </CardContent>
          </Card>

          <Card className="overflow-hidden">
            <div className="flex aspect-square flex-col justify-end p-6" style={{ background: colors.primary }}>
              <span className="mb-2 inline-flex self-start rounded-md px-2 py-0.5 text-xs font-semibold" style={{ background: colors.accent, color: "#fff" }}>
                {t("preview_badge")}
              </span>
              <span className={font === "serif" ? "text-3xl leading-tight [font-family:var(--font-display)]" : "text-3xl leading-tight font-bold tracking-tight"} style={{ color: "#fff" }}>
                {t("preview_title")}
              </span>
            </div>
            <div className="p-4 text-xs text-muted-foreground">{t("preview_note")}</div>
          </Card>
        </fieldset>
      </TabsContent>

      <TabsContent value="history">
        <Card>
          <ul className="divide-y">
            {history.map((item, index) => (
              <li key={item.version} className="flex items-center gap-3 px-5 py-3">
                <span className="w-9 font-mono text-[13px] font-semibold text-muted-foreground" dir="ltr">
                  v{item.version}
                </span>
                <Badge variant={item.source === "ai" ? "primary" : item.source === "restore" ? "warning" : "neutral"}>{t(`source_${item.source}`)}</Badge>
                <span className="min-w-0 flex-1 truncate text-[13px] text-muted-foreground">
                  {format.dateTime(new Date(item.created_at), { dateStyle: "medium", timeStyle: "short" })}
                </span>
                {index === 0 ? (
                  <Badge variant="success">{t("current")}</Badge>
                ) : (
                  !readOnly && (
                    <Button variant="ghost" size="sm" loading={restore.pending} onClick={() => restore.run({ version: item.version })}>
                      <RotateCcw />
                      {t("restore")}
                    </Button>
                  )
                )}
              </li>
            ))}
          </ul>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
