"use client";

import { Check, Download, ImagePlus, Link2, Loader2, Plus, Sparkles, Trash2, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ChoiceChips } from "@/components/common/tag-input";
import { useAction } from "@/components/common/use-action";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger, Tooltip } from "@/components/ui/menu";
import { PageHeader } from "@/components/ui/misc";
import { Link, useRouter } from "@/i18n/navigation";
import { IMAGE_MIME_TYPES, MAX_UPLOAD_BYTES } from "@/lib/domain";
import { createClient } from "@/lib/supabase/client";
import { cn, safeFileName } from "@/lib/utils";
import { attachAsset, deleteAsset, exportVisual, generateStudioImage, registerPhoto } from "./actions";
import type { SlideInput } from "./schemas";

export type StudioAsset = { id: string; url: string; alt: string; source: string; projectId: string | null };

type TemplateId = "headline" | "offer" | "quote" | "tips" | "event" | "photo";
type FormatId = "square" | "portrait" | "landscape" | "story";

const TEMPLATES: TemplateId[] = ["headline", "offer", "quote", "tips", "event", "photo"];
const FORMATS: { id: FormatId; ratio: string; hint: string }[] = [
  { id: "square", ratio: "aspect-square", hint: "1080 × 1080" },
  { id: "portrait", ratio: "aspect-[4/5]", hint: "1080 × 1350" },
  { id: "landscape", ratio: "aspect-[120/63]", hint: "1200 × 630" },
  { id: "story", ratio: "aspect-[9/16]", hint: "1080 × 1920" },
];

const FIELDS_BY_TEMPLATE: Record<TemplateId, (keyof SlideInput)[]> = {
  headline: ["kicker", "title", "body"],
  offer: ["badge", "kicker", "title", "body"],
  quote: ["title", "body"],
  tips: ["kicker", "title", "body"],
  event: ["kicker", "title", "body"],
  photo: ["kicker", "title", "body"],
};

export function StudioView({ orgId, brandId, assets, post, demoImages }: { orgId: string; brandId: string; assets: StudioAsset[]; post: { id: string; title: string; visualBrief: string } | null; demoImages: boolean }) {
  const t = useTranslations("studio");
  const router = useRouter();
  const [template, setTemplate] = useState<TemplateId>("headline");
  const [format, setFormat] = useState<FormatId>("square");
  const [exportFormats, setExportFormats] = useState<FormatId[]>(["square"]);
  const [slides, setSlides] = useState<SlideInput[]>([{ title: post?.title ?? "", kicker: "", body: "" }]);
  const [active, setActive] = useState(0);
  const [preview, setPreview] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);
  const [prompt, setPrompt] = useState(post?.visualBrief ?? "");
  const [added, setAdded] = useState<StudioAsset[]>([]);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{ projectId: string; urls: { url: string; format: string }[] } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const slide = slides[active] ?? slides[0]!;
  const patchSlide = (next: Partial<SlideInput>) => setSlides((list) => list.map((s, i) => (i === active ? { ...s, ...next } : s)));

  // Les images créées ici s'affichent tout de suite, avant l'actualisation serveur.
  const library = [...added.filter((a) => !assets.some((b) => b.id === a.id)), ...assets];

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setRendering(true);
      try {
        const response = await fetch("/api/studio/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ template, format, slide, index: active, total: slides.length }),
          signal: controller.signal,
        });
        if (response.ok) {
          const blob = await response.blob();
          setPreview((old) => {
            if (old) URL.revokeObjectURL(old);
            return URL.createObjectURL(blob);
          });
        }
      } catch {
        // Requête annulée par une saisie plus récente.
      } finally {
        if (!controller.signal.aborted) setRendering(false);
      }
    }, 350);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [template, format, slide, active, slides.length]);

  const applyBackground = (id: string) => {
    setTemplate("photo");
    patchSlide({ imageAssetId: id });
  };

  const generateImage = useAction(generateStudioImage, {
    success: t("image_ready"),
    onSuccess: (asset) => {
      setAdded((list) => [{ id: asset.id, url: asset.url, alt: prompt, source: "ai", projectId: null }, ...list]);
      applyBackground(asset.id);
    },
  });
  const register = useAction(registerPhoto, {
    onSuccess: (asset) => {
      setAdded((list) => [{ id: asset.id, url: asset.url, alt: "", source: "upload", projectId: null }, ...list]);
      applyBackground(asset.id);
    },
  });
  const exporter = useAction(exportVisual, {
    success: t("exported"),
    onSuccess: (data) => {
      setResult({ projectId: data.projectId, urls: data.assets });
      router.refresh();
    },
  });
  const attach = useAction(attachAsset, { success: t("attached") });
  const remove = useAction(deleteAsset, { onSuccess: () => router.refresh() });

  const removeAsset = (id: string) => {
    setAdded((list) => list.filter((a) => a.id !== id));
    remove.run({ id });
  };

  const onUpload = async (file: File) => {
    if (!IMAGE_MIME_TYPES.includes(file.type) || file.size > MAX_UPLOAD_BYTES) {
      toast.error(t("upload_invalid"));
      return;
    }
    setUploading(true);
    const path = `${orgId}/${brandId}/incoming-${crypto.randomUUID()}-${safeFileName(file.name)}`;
    const { error } = await createClient().storage.from("media").upload(path, file, { contentType: file.type });
    setUploading(false);
    if (error) {
      toast.error(t("upload_failed"));
      return;
    }
    await register.run({ path, mime: file.type, size: file.size, name: file.name });
  };

  const addSlide = () => {
    if (slides.length >= 10) return;
    setSlides([...slides, { title: "", kicker: "", body: "" }]);
    setActive(slides.length);
  };
  const removeSlide = (index: number) => {
    setSlides(slides.filter((_, i) => i !== index));
    setActive((a) => Math.max(0, a >= index ? a - 1 : a));
  };

  const formatMeta = FORMATS.find((f) => f.id === format)!;

  return (
    <>
      <PageHeader
        title={t("title")}
        description={post ? t("for_post", { title: post.title }) : t("subtitle")}
        actions={
          post && (
            <Button variant="secondary" size="sm" asChild>
              <Link href={`/app/content/${post.id}`}>{t("back_to_post")}</Link>
            </Button>
          )
        }
      />

      {demoImages && <p className="mb-5 rounded-lg bg-warm-soft px-3 py-2.5 text-[13px] text-warm">{t("demo_notice")}</p>}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,380px)_1fr] lg:items-start">
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>{t("template")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-2">
                {TEMPLATES.map((id) => (
                  <button key={id} type="button" aria-pressed={template === id} onClick={() => setTemplate(id)} className={cn("rounded-lg border px-2 py-2.5 text-[13px] font-medium transition-colors", template === id ? "border-primary bg-accent text-accent-foreground" : "hover:bg-secondary")}>
                    {t(`template_${id}`)}
                  </button>
                ))}
              </div>
              <div className="mt-4">
                <Field label={t("format")}>
                  <ChoiceChips options={FORMATS.map((f) => ({ value: f.id, label: t(`format_${f.id}`) }))} value={[format]} onChange={([value]) => { if (value) { setFormat(value); setExportFormats((list) => Array.from(new Set([value, ...list]))); } }} />
                </Field>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>{t("slides", { count: slides.length })}</CardTitle>
              <Button variant="ghost" size="sm" disabled={slides.length >= 10} onClick={addSlide}>
                <Plus />
                {t("add_slide")}
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {slides.length > 1 && (
                <div className="flex flex-wrap gap-1">
                  {slides.map((_, index) => (
                    <div key={index} className="relative">
                      <button type="button" aria-current={index === active} aria-label={t("slide_n", { n: index + 1 })} onClick={() => setActive(index)} className={cn("flex size-8 items-center justify-center rounded-md border text-xs font-semibold", index === active ? "border-primary bg-accent text-accent-foreground" : "hover:bg-secondary")}>
                        {index + 1}
                      </button>
                    </div>
                  ))}
                  <Button variant="ghost" size="icon-sm" aria-label={t("remove_slide")} onClick={() => removeSlide(active)}>
                    <Trash2 />
                  </Button>
                </div>
              )}
              {FIELDS_BY_TEMPLATE[template].map((field) =>
                field === "body" ? (
                  <Field key={field} label={t(`field_${template === "tips" ? "tips" : field}`)} htmlFor={`f-${field}`}>
                    <Textarea id={`f-${field}`} dir="auto" value={slide.body ?? ""} maxLength={600} className="min-h-20" onChange={(e) => patchSlide({ body: e.target.value })} />
                  </Field>
                ) : (
                  <Field key={field} label={t(`field_${field}`)} htmlFor={`f-${field}`}>
                    <Input id={`f-${field}`} dir="auto" value={(slide[field] as string) ?? ""} maxLength={field === "title" ? 200 : field === "badge" ? 30 : 80} onChange={(e) => patchSlide({ [field]: e.target.value })} />
                  </Field>
                ),
              )}
            </CardContent>
          </Card>

          <Card>
            <Tabs defaultValue="ai">
              <div className="p-4 pb-0">
                <TabsList>
                  <TabsTrigger value="ai">{t("tab_ai")}</TabsTrigger>
                  <TabsTrigger value="upload">{t("tab_upload")}</TabsTrigger>
                </TabsList>
              </div>
              <CardContent>
                <TabsContent value="ai" className="space-y-3">
                  <Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} maxLength={1000} className="min-h-20" placeholder={t("ai_placeholder")} aria-label={t("tab_ai")} />
                  <Button variant="secondary" className="w-full" loading={generateImage.pending} disabled={prompt.trim().length < 3} onClick={() => generateImage.run({ prompt })}>
                    {!generateImage.pending && <Sparkles />}
                    {t("ai_generate")}
                  </Button>
                </TabsContent>
                <TabsContent value="upload">
                  <input ref={fileInput} type="file" hidden accept={IMAGE_MIME_TYPES.join(",")} onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])} />
                  <Button variant="secondary" className="w-full" loading={uploading || register.pending} onClick={() => fileInput.current?.click()}>
                    {!uploading && !register.pending && <Upload />}
                    {t("upload")}
                  </Button>
                </TabsContent>
              </CardContent>
            </Tabs>
          </Card>
        </div>

        <div className="space-y-5 lg:sticky lg:top-20">
          <Card className="overflow-hidden">
            <div className="bg-dots relative flex items-center justify-center p-6 sm:p-10">
              <div className={cn("relative w-full overflow-hidden rounded-lg bg-secondary shadow-float", formatMeta.ratio, format === "story" ? "max-w-[280px]" : format === "portrait" ? "max-w-[400px]" : "max-w-[480px]")}>
                {preview ? (
                  // eslint-disable-next-line @next/next/no-img-element -- aperçu local (blob)
                  <img src={preview} alt={t("preview")} className={cn("size-full object-cover transition-opacity", rendering && "opacity-70")} />
                ) : (
                  <div className="skeleton size-full rounded-none" />
                )}
                {rendering && <Loader2 className="absolute end-2.5 top-2.5 size-4 animate-spin text-white drop-shadow" />}
              </div>
            </div>
            <div className="space-y-3 border-t p-4">
              <Field label={t("export_formats")} hint={t("export_hint")}>
                <ChoiceChips multiple options={FORMATS.map((f) => ({ value: f.id, label: `${t(`format_${f.id}`)} · ${f.hint}` }))} value={exportFormats} onChange={(list) => setExportFormats(list.slice(-4))} />
              </Field>
              <Button size="lg" className="w-full" loading={exporter.pending} disabled={!exportFormats.length} onClick={() => exporter.run({ name: slides[0]?.title?.slice(0, 120) ?? "", template, formats: exportFormats, slides, postId: post?.id ?? null })}>
                {!exporter.pending && <ImagePlus />}
                {post ? t("export_attach") : t("export")}
              </Button>
              {result && (
                <div className="animate-rise flex flex-wrap items-center justify-between gap-2 rounded-xl bg-success-soft p-3 text-[13px] text-success">
                  <span className="flex items-center gap-1.5 font-medium">
                    <Check className="size-4" />
                    {t("export_done", { count: result.urls.length })}
                  </span>
                  <Button variant="secondary" size="sm" asChild>
                    <a href={`/api/studio/export/${result.projectId}`}>
                      <Download />
                      {t("download_zip")}
                    </a>
                  </Button>
                </div>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("library")}</CardTitle>
            </CardHeader>
            <CardContent>
              {library.length === 0 ? (
                <p className="text-[13px] text-muted-foreground">{t("library_empty")}</p>
              ) : (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-6">
                  {library.map((asset) => (
                    <div key={asset.id} className="group relative aspect-square overflow-hidden rounded-lg border">
                      {/* eslint-disable-next-line @next/next/no-img-element -- URL signée à durée limitée */}
                      <img src={asset.url} alt={asset.alt} className="size-full object-cover" />
                      {asset.source === "ai" && demoImages && (
                        <Badge variant="warm" className="absolute start-1 top-1 scale-90">
                          {t("demo")}
                        </Badge>
                      )}
                      <div className="absolute inset-x-0 bottom-0 flex justify-center gap-0.5 bg-black/55 p-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                        <Tooltip content={t("use_background")}>
                          <button type="button" aria-label={t("use_background")} className="rounded p-1 text-white hover:bg-white/20" onClick={() => applyBackground(asset.id)}>
                            <ImagePlus className="size-3.5" />
                          </button>
                        </Tooltip>
                        {post && (
                          <Tooltip content={t("attach")}>
                            <button type="button" aria-label={t("attach")} className="rounded p-1 text-white hover:bg-white/20" onClick={() => attach.run({ postId: post.id, assetId: asset.id })}>
                              <Link2 className="size-3.5" />
                            </button>
                          </Tooltip>
                        )}
                        <Tooltip content={t("download")}>
                          <a aria-label={t("download")} href={asset.url} download className="rounded p-1 text-white hover:bg-white/20">
                            <Download className="size-3.5" />
                          </a>
                        </Tooltip>
                        <Tooltip content={t("delete")}>
                          <button type="button" aria-label={t("delete")} className="rounded p-1 text-white hover:bg-white/20" onClick={() => removeAsset(asset.id)}>
                            <Trash2 className="size-3.5" />
                          </button>
                        </Tooltip>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
