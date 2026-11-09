"use client";

import { ArrowLeft, ArrowRight, BookOpen, Check, Globe, Loader2, Share2, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { ChoiceChips, TagInput } from "@/components/common/tag-input";
import { useAction } from "@/components/common/use-action";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/menu";
import { createBrand } from "@/features/workspaces/actions";
import { Link, useRouter } from "@/i18n/navigation";
import { CONTENT_LANGUAGES, EMOJI_USAGE, GOALS, SECTORS, TONES, type OnboardingAnswers } from "@/lib/domain";
import { cn } from "@/lib/utils";
import { analyzeWebsite, completeOnboarding, saveOnboarding } from "./actions";

const STEPS = ["brand", "business", "voice", "style", "finish"] as const;

export function OnboardingWizard({
  brand,
  initialAnswers,
  initialStep,
}: {
  brand: { id: string; name: string; website_url: string | null } | null;
  initialAnswers: OnboardingAnswers;
  initialStep: number;
}) {
  const t = useTranslations("onboarding");
  const tDomain = useTranslations("domain");
  const router = useRouter();
  const [step, setStep] = useState(brand ? Math.min(initialStep, 4) : 0);
  const [hasBrand, setHasBrand] = useState(!!brand);
  const [name, setName] = useState(brand?.name ?? "");
  const [website, setWebsite] = useState(brand?.website_url ?? "");
  const [answers, setAnswers] = useState<OnboardingAnswers>({ languages: ["fr"], emoji_usage: "rare", ...initialAnswers });
  const patch = (next: Partial<OnboardingAnswers>) => setAnswers((a) => ({ ...a, ...next }));

  const create = useAction(createBrand);
  const save = useAction(saveOnboarding);
  const analyze = useAction(analyzeWebsite, {
    onSuccess: (data) => {
      setAnswers((a) => ({
        ...a,
        sector: data.sector ?? a.sector,
        offer: data.offer || a.offer,
        audience: data.audience || a.audience,
        difference: data.difference || a.difference,
      }));
      toast.success(t("website_done"));
    },
  });
  const finish = useAction(completeOnboarding, { onSuccess: () => router.push("/app/brand") });

  const busy = create.pending || save.pending;

  const next = async () => {
    if (step === 0) {
      if (!name.trim()) {
        toast.error(t("name_required"));
        return;
      }
      if (!hasBrand) {
        const url = website.trim();
        const result = await create.run({ name: name.trim(), timezone: "Africa/Tunis", websiteUrl: url ? (/^https?:\/\//.test(url) ? url : `https://${url}`) : "" });
        if (!result.ok) return;
        setHasBrand(true);
      }
      if (website.trim()) {
        const url = /^https?:\/\//.test(website.trim()) ? website.trim() : `https://${website.trim()}`;
        await analyze.run({ url });
      }
      setStep(1);
      return;
    }
    const result = await save.run({ step: step + 1, answers });
    if (result.ok) setStep(step + 1);
  };

  return (
    <div className="mx-auto max-w-2xl">
      <ol className="mb-7 flex items-center gap-1.5" aria-label={t("progress")}>
        {STEPS.map((key, index) => (
          <li key={key} className="flex flex-1 flex-col gap-1.5">
            <span className={cn("h-1 rounded-full transition-colors", index <= step ? "bg-primary" : "bg-secondary")} />
            <span className={cn("hidden text-[11px] font-medium sm:block", index === step ? "text-foreground" : "text-muted-foreground")}>{t(`step_${key}`)}</span>
          </li>
        ))}
      </ol>

      <Card className="animate-rise p-6 sm:p-8" key={step}>
        {step === 0 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">{t("brand_title")}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{t("brand_subtitle")}</p>
            </div>
            <Field label={t("brand_name")} htmlFor="brandName">
              <Input id="brandName" value={name} onChange={(e) => setName(e.target.value)} disabled={hasBrand} maxLength={120} placeholder={t("brand_name_placeholder")} />
            </Field>
            <Field label={t("website")} htmlFor="website" hint={t("website_hint")}>
              <div className="relative">
                <Globe className="absolute start-3 top-2.5 size-4 text-muted-foreground" />
                <Input id="website" dir="ltr" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="www.exemple.tn" className="ps-9 rtl:text-right" />
              </div>
            </Field>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">{t("business_title")}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{t("business_subtitle")}</p>
            </div>
            <Field label={t("q_sector")} htmlFor="sector">
              <Select id="sector" value={answers.sector} onValueChange={(sector) => patch({ sector: sector as OnboardingAnswers["sector"] })} placeholder={t("q_sector_placeholder")} options={SECTORS.map((value) => ({ value, label: tDomain(`sector_${value}`) }))} />
            </Field>
            <Field label={t("q_offer")} htmlFor="offer">
              <Textarea id="offer" value={answers.offer ?? ""} onChange={(e) => patch({ offer: e.target.value })} maxLength={2000} placeholder={t("q_offer_placeholder")} />
            </Field>
            <Field label={t("q_audience")} htmlFor="audience">
              <Textarea id="audience" value={answers.audience ?? ""} onChange={(e) => patch({ audience: e.target.value })} maxLength={2000} placeholder={t("q_audience_placeholder")} />
            </Field>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">{t("voice_title")}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{t("voice_subtitle")}</p>
            </div>
            <Field label={t("q_goals")}>
              <ChoiceChips multiple options={GOALS.map((value) => ({ value, label: tDomain(`goal_${value}`) }))} value={(answers.goals ?? []) as (typeof GOALS)[number][]} onChange={(goals) => patch({ goals })} />
            </Field>
            <Field label={t("q_difference")} htmlFor="difference">
              <Textarea id="difference" value={answers.difference ?? ""} onChange={(e) => patch({ difference: e.target.value })} maxLength={2000} placeholder={t("q_difference_placeholder")} />
            </Field>
            <Field label={t("q_tones")} hint={t("q_tones_hint")}>
              <ChoiceChips multiple options={TONES.map((value) => ({ value, label: tDomain(`tone_${value}`) }))} value={(answers.tones ?? []) as (typeof TONES)[number][]} onChange={(tones) => patch({ tones: tones.slice(-3) })} />
            </Field>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">{t("style_title")}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{t("style_subtitle")}</p>
            </div>
            <Field label={t("q_languages")} hint={t("q_languages_hint")}>
              <ChoiceChips multiple options={CONTENT_LANGUAGES.map((value) => ({ value, label: tDomain(`lang_${value}`) }))} value={answers.languages ?? []} onChange={(languages) => languages.length && patch({ languages })} />
            </Field>
            <Field label={t("q_avoid")} htmlFor="avoid" hint={t("q_avoid_hint")}>
              <TagInput id="avoid" tone="danger" value={answers.avoid ?? []} onChange={(avoid) => patch({ avoid })} placeholder={t("q_avoid_placeholder")} />
            </Field>
            <Field label={t("q_emoji")}>
              <ChoiceChips options={EMOJI_USAGE.map((value) => ({ value, label: tDomain(`emoji_${value}`) }))} value={answers.emoji_usage ? [answers.emoji_usage] : []} onChange={([emoji_usage]) => patch({ emoji_usage })} />
            </Field>
            <Field label={t("q_example")} htmlFor="example">
              <Textarea id="example" value={answers.example_post ?? ""} onChange={(e) => patch({ example_post: e.target.value })} maxLength={2000} placeholder={t("q_example_placeholder")} />
            </Field>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">{t("finish_title")}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{t("finish_subtitle")}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                { href: "/app/knowledge", icon: BookOpen, title: t("finish_knowledge"), text: t("finish_knowledge_text") },
                { href: "/app/connections", icon: Share2, title: t("finish_connect"), text: t("finish_connect_text") },
              ].map((item) => (
                <Link key={item.href} href={item.href} target="_blank" className="rounded-xl border p-4 transition-colors hover:bg-secondary">
                  <item.icon className="mb-2 size-4 text-primary" />
                  <div className="text-[13px] font-semibold">{item.title}</div>
                  <div className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{item.text}</div>
                </Link>
              ))}
            </div>
            {finish.pending ? (
              <div className="flex items-center gap-3 rounded-xl bg-accent p-4 text-[13px] text-accent-foreground">
                <Loader2 className="size-4 animate-spin" />
                {t("finish_generating")}
              </div>
            ) : (
              <Button size="lg" className="w-full" onClick={() => finish.run({})}>
                <Sparkles />
                {t("finish_submit")}
              </Button>
            )}
          </div>
        )}

        {step < 4 && (
          <div className="mt-8 flex items-center justify-between">
            <Button variant="ghost" onClick={() => setStep(step - 1)} disabled={step === 0}>
              <ArrowLeft className="rtl:rotate-180" />
              {t("back")}
            </Button>
            <Button onClick={next} loading={busy || analyze.pending}>
              {analyze.pending ? t("analyzing") : t("next")}
              {!busy && !analyze.pending && (step === 3 ? <Check /> : <ArrowRight className="rtl:rotate-180" />)}
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
