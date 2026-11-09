"use client";

import { CheckCircle2, Loader2, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { NetworkIcon } from "@/components/common/network-icon";
import { ChoiceChips } from "@/components/common/tag-input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, Textarea } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/misc";
import { useRouter } from "@/i18n/navigation";
import { CONTENT_LANGUAGES, NETWORK_LIST, type ContentLanguage, type Network } from "@/lib/domain";
import { cn } from "@/lib/utils";

type Partial = { options?: ({ variants?: ({ network?: string; caption?: string; cta?: string } | undefined)[] } | undefined)[] };
type Step = "context" | "writing" | "checking";

export function Composer({ idea, defaultLanguage }: { idea: { id: string; title: string; angle: string; networks: string[] } | null; defaultLanguage: ContentLanguage }) {
  const t = useTranslations("content");
  const tDomain = useTranslations("domain");
  const tErrors = useTranslations("errors");
  const router = useRouter();
  const [brief, setBrief] = useState("");
  const [language, setLanguage] = useState<ContentLanguage>(defaultLanguage);
  const [networks, setNetworks] = useState<Network[]>((idea?.networks as Network[]) ?? [...NETWORK_LIST]);
  const [partial, setPartial] = useState<Partial | null>(null);
  const [step, setStep] = useState<Step | null>(null);
  const abort = useRef<AbortController | null>(null);
  const running = step !== null;

  const fail = (code: string) => {
    toast.error(tErrors.has(code) ? tErrors(code) : tErrors("unexpected"));
    setStep(null);
  };

  const generate = async () => {
    setPartial(null);
    setStep("context");
    abort.current = new AbortController();
    try {
      const response = await fetch("/api/ai/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ideaId: idea?.id ?? null, brief, language, networks }),
        signal: abort.current.signal,
      });
      if (!response.ok || !response.body) {
        const body = await response.json().catch(() => ({}));
        fail(body.error ?? "unexpected");
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const message = JSON.parse(line);
          if (message.type === "status") setStep(message.step);
          if (message.type === "partial") setPartial(message.data);
          if (message.type === "error") {
            fail(message.error);
            return;
          }
          if (message.type === "done") {
            router.push(`/app/content/${message.postId}`);
            return;
          }
        }
      }
    } catch {
      fail("unexpected");
    }
  };

  const steps: Step[] = ["context", "writing", "checking"];

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,420px)_1fr]">
      <Card className="h-fit">
        <CardContent className="space-y-5">
          {idea && (
            <div className="rounded-xl bg-accent p-3.5 text-accent-foreground">
              <Badge variant="primary" className="mb-1.5 bg-card">
                {t("from_calendar")}
              </Badge>
              <div className="text-[13px] font-semibold">{idea.title}</div>
              {idea.angle && <p className="mt-0.5 text-xs opacity-80">{idea.angle}</p>}
            </div>
          )}
          <Field label={idea ? t("brief_extra") : t("brief")} htmlFor="brief" hint={t("brief_hint")}>
            <Textarea id="brief" value={brief} onChange={(e) => setBrief(e.target.value)} maxLength={4000} className="min-h-28" placeholder={t("brief_placeholder")} disabled={running} />
          </Field>
          <Field label={t("language")}>
            <ChoiceChips options={CONTENT_LANGUAGES.map((value) => ({ value, label: tDomain(`lang_${value}`) }))} value={[language]} onChange={([value]) => value && setLanguage(value)} />
          </Field>
          <Field label={t("networks")}>
            <ChoiceChips multiple options={NETWORK_LIST.map((n) => ({ value: n, label: n === "facebook" ? "Facebook" : "Instagram" }))} value={networks} onChange={setNetworks} />
          </Field>
          <Button size="lg" className="w-full" loading={running} disabled={!networks.length || (!idea && brief.trim().length < 3)} onClick={generate}>
            {!running && <Sparkles />}
            {t("generate")}
          </Button>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {running && (
          <ol className="flex flex-wrap items-center gap-x-5 gap-y-1">
            {steps.map((item, index) => {
              const current = steps.indexOf(step!);
              return (
                <li key={item} className={cn("flex items-center gap-1.5 text-xs font-medium", index > current ? "text-muted-foreground/60" : "text-foreground")}>
                  {index < current ? <CheckCircle2 className="size-3.5 text-success" /> : index === current ? <Loader2 className="size-3.5 animate-spin text-primary" /> : <span className="size-3.5 rounded-full border" />}
                  {t(`step_${item}`)}
                </li>
              );
            })}
          </ol>
        )}

        {!running && !partial && (
          <div className="bg-dots flex min-h-72 flex-col items-center justify-center rounded-2xl border border-dashed p-8 text-center">
            <Sparkles className="mb-3 size-5 text-primary" />
            <p className="max-w-sm text-[13px] leading-relaxed text-muted-foreground">{t("composer_hint")}</p>
          </div>
        )}

        {running && !partial && (
          <div className="grid gap-3 md:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Card key={i} className="space-y-2.5 p-4">
                <Skeleton className="w-1/3" />
                <Skeleton />
                <Skeleton />
                <Skeleton className="w-2/3" />
              </Card>
            ))}
          </div>
        )}

        {partial?.options && (
          <div className="grid gap-3 md:grid-cols-3">
            {partial.options.map((option, index) => {
              const variant = option?.variants?.[0];
              return (
                <Card key={index} className="animate-rise p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="text-xs font-semibold text-muted-foreground">{t("option", { letter: String.fromCharCode(65 + index) })}</span>
                    {variant?.network && <NetworkIcon network={variant.network} className="ms-auto size-4 rounded" />}
                  </div>
                  <p className="text-[13px] leading-relaxed whitespace-pre-line">{variant?.caption}</p>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
