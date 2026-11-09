import "server-only";

import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText, Output, streamText, type LanguageModel, type LanguageModelUsage, type SystemModelMessage } from "ai";
import type { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { toErrorMessage } from "@/lib/utils";
import { AppError } from "../errors";
import { aiProvider, estimateCostUsd, modelId, type AiTier } from "./config";

export type AiFeature = "brand_profile" | "website" | "strategy" | "calendar" | "post" | "regenerate" | "hashtags" | "compliance" | "image";

export type AiScope = {
  organizationId: string;
  brandId?: string | null;
  userId?: string | null;
  brandProfileVersion?: number | null;
};

export type StructuredRequest<T> = {
  feature: AiFeature;
  tier: AiTier;
  schema: z.ZodType<T>;
  /** Partie stable (rôle, garde-fous, ADN de marque) : mise en cache par le fournisseur. */
  system: string;
  prompt: string;
  promptVersion: string;
  scope: AiScope;
  effort?: "low" | "medium" | "high";
  maxOutputTokens?: number;
  /** Résultat du mode démo, utilisé quand aucun fournisseur n'est configuré. */
  demo: () => T;
};

export type GenerationResult<T> = { object: T; generationId: string | null };

function languageModel(tier: AiTier): LanguageModel {
  const id = modelId(tier);
  if (aiProvider() === "anthropic") {
    return createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY })(id);
  }
  const provider = createOpenAICompatible({
    name: "openai-compatible",
    baseURL: process.env.AI_BASE_URL ?? "",
    apiKey: process.env.AI_API_KEY || undefined,
    supportsStructuredOutputs: true,
  });
  return provider.chatModel(id);
}

function systemMessage(system: string): SystemModelMessage {
  return { role: "system", content: system, providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } } };
}

/** Les modèles récents refusent le mode « outil forcé » : on impose la sortie structurée native. */
function providerOptions<T>(request: StructuredRequest<T>) {
  return { anthropic: { structuredOutputMode: "outputFormat" as const, effort: request.effort ?? "medium" } };
}

type Ledger = {
  status: "succeeded" | "failed";
  usage?: LanguageModelUsage;
  startedAt: number;
  error?: string;
};

async function record<T>(request: StructuredRequest<T>, ledger: Ledger): Promise<string | null> {
  const model = modelId(request.tier);
  const input = ledger.usage?.inputTokens ?? 0;
  const output = ledger.usage?.outputTokens ?? 0;
  const cached = ledger.usage?.inputTokenDetails?.cacheReadTokens ?? 0;
  const { data, error } = await createAdminClient()
    .from("ai_generations")
    .insert({
      organization_id: request.scope.organizationId,
      brand_id: request.scope.brandId ?? null,
      user_id: request.scope.userId ?? null,
      feature: request.feature,
      provider: aiProvider(),
      model,
      prompt_version: request.promptVersion,
      brand_profile_version: request.scope.brandProfileVersion ?? null,
      prompt: request.prompt.slice(0, 20_000),
      input_tokens: input,
      output_tokens: output,
      cached_input_tokens: cached,
      cost_usd: estimateCostUsd(model, input, output, cached),
      latency_ms: Date.now() - ledger.startedAt,
      status: ledger.status,
      error: ledger.error?.slice(0, 1000) ?? null,
    })
    .select("id")
    .single();
  if (error) console.error("[ai] journal non écrit", error.message);
  return data?.id ?? null;
}

export async function generateStructured<T>(request: StructuredRequest<T>): Promise<GenerationResult<T>> {
  const startedAt = Date.now();

  if (aiProvider() === "demo") {
    const object = request.demo();
    return { object, generationId: await record(request, { status: "succeeded", startedAt }) };
  }

  try {
    const result = await generateText({
      model: languageModel(request.tier),
      system: systemMessage(request.system),
      prompt: request.prompt,
      output: Output.object({ schema: request.schema }),
      providerOptions: providerOptions(request),
      maxOutputTokens: request.maxOutputTokens ?? 8000,
      maxRetries: 2,
    });
    const generationId = await record(request, { status: "succeeded", usage: result.totalUsage, startedAt });
    return { object: result.output as T, generationId };
  } catch (error) {
    console.error(`[ai:${request.feature}]`, error);
    await record(request, { status: "failed", startedAt, error: toErrorMessage(error) });
    throw new AppError("ai_failed");
  }
}

/** Révèle progressivement un objet : reproduit un flux en mode démo. */
export function revealObject<T>(value: T, ratio: number): T {
  if (typeof value === "string") return value.slice(0, Math.ceil(value.length * ratio)) as T;
  if (Array.isArray(value)) return value.map((v) => revealObject(v, ratio)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, revealObject(v, ratio)])) as T;
  }
  return value;
}

export type StructuredStream<T> = {
  partial: AsyncIterable<unknown>;
  final: Promise<GenerationResult<T>>;
};

/** Flux d'objets partiels, puis résultat validé : les premiers mots arrivent sans attendre la fin. */
export function streamStructured<T>(request: StructuredRequest<T>): StructuredStream<T> {
  const startedAt = Date.now();

  if (aiProvider() === "demo") {
    const object = request.demo();
    return {
      partial: (async function* () {
        for (let step = 1; step <= 16; step++) {
          await new Promise((resolve) => setTimeout(resolve, 70));
          yield revealObject(object, step / 16);
        }
      })(),
      final: record(request, { status: "succeeded", startedAt }).then((generationId) => ({ object, generationId })),
    };
  }

  const result = streamText({
    model: languageModel(request.tier),
    system: systemMessage(request.system),
    prompt: request.prompt,
    output: Output.object({ schema: request.schema }),
    providerOptions: providerOptions(request),
    maxOutputTokens: request.maxOutputTokens ?? 12000,
    maxRetries: 2,
  });

  const final = (async () => {
    try {
      const object = (await result.output) as T;
      const usage = await result.totalUsage;
      return { object, generationId: await record(request, { status: "succeeded", usage, startedAt }) };
    } catch (error) {
      console.error(`[ai:${request.feature}]`, error);
      await record(request, { status: "failed", startedAt, error: toErrorMessage(error) });
      throw new AppError("ai_failed");
    }
  })();
  final.catch(() => undefined);

  return { partial: result.partialOutputStream, final };
}

/** Consomme une unité de quota, exécute, et rend l'unité si la génération échoue. */
export async function withQuota<R>(organizationId: string, kind: "posts" | "images", amount: number, fn: () => Promise<R>): Promise<R> {
  const admin = createAdminClient();
  const { error } = await admin.rpc("consume_quota", { p_org: organizationId, p_kind: kind, p_amount: amount });
  if (error) throw error;
  try {
    return await fn();
  } catch (failure) {
    await admin.rpc("refund_quota", { p_org: organizationId, p_kind: kind, p_amount: amount });
    throw failure;
  }
}
