import "server-only";

import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateImage } from "ai";
import sharp from "sharp";
import { DEFAULT_COLORS, type VisualIdentity } from "@/lib/domain";
import { createAdminClient } from "@/lib/supabase/admin";
import { toErrorMessage } from "@/lib/utils";
import { AppError } from "../errors";
import { IMAGE_COST_USD, imageProviderConfigured } from "./config";
import type { AiScope } from "./run";

export const isDemoImages = () => !imageProviderConfigured();

/** Composition abstraite aux couleurs de la marque, utilisée tant qu'aucun modèle n'est configuré. */
async function demoImage(identity: VisualIdentity, seed: number): Promise<Buffer> {
  const c = { ...DEFAULT_COLORS, ...identity.colors };
  const x = 200 + (seed % 600);
  const y = 200 + ((seed >> 4) % 600);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c.primary}"/><stop offset="1" stop-color="${c.secondary}"/></linearGradient>
      <radialGradient id="r"><stop offset="0" stop-color="${c.accent}" stop-opacity="0.95"/><stop offset="1" stop-color="${c.accent}" stop-opacity="0"/></radialGradient>
    </defs>
    <rect width="1200" height="1200" fill="url(#g)"/>
    <circle cx="${x}" cy="${y}" r="520" fill="url(#r)"/>
    <circle cx="${1200 - x}" cy="${1200 - y}" r="260" fill="#ffffff" opacity="0.08"/>
  </svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toBuffer();
}

/** Génère une image à partir d'une description, et l'inscrit au journal des coûts. */
export async function generateBrandImage(prompt: string, identity: VisualIdentity, scope: AiScope): Promise<{ image: Buffer; generationId: string | null; demo: boolean }> {
  const admin = createAdminClient();
  const startedAt = Date.now();
  const demo = isDemoImages();
  const model = demo ? "demo" : (process.env.IMAGE_MODEL ?? "");

  const log = async (status: "succeeded" | "failed", error?: string) => {
    const { data } = await admin
      .from("ai_generations")
      .insert({
        organization_id: scope.organizationId,
        brand_id: scope.brandId ?? null,
        user_id: scope.userId ?? null,
        feature: "image",
        provider: demo ? "demo" : "openai-compatible",
        model,
        prompt_version: "image.v1",
        brand_profile_version: scope.brandProfileVersion ?? null,
        prompt,
        cost_usd: demo || status === "failed" ? 0 : IMAGE_COST_USD,
        latency_ms: Date.now() - startedAt,
        status,
        error: error?.slice(0, 1000) ?? null,
      })
      .select("id")
      .single();
    return data?.id ?? null;
  };

  if (demo) {
    const image = await demoImage(identity, Date.now() % 4096);
    return { image, generationId: await log("succeeded"), demo: true };
  }

  try {
    const provider = createOpenAICompatible({
      name: "images",
      baseURL: process.env.IMAGE_BASE_URL ?? "",
      apiKey: process.env.IMAGE_API_KEY || undefined,
    });
    const { image } = await generateImage({ model: provider.imageModel(model), prompt, size: "1024x1024", n: 1 });
    return { image: Buffer.from(image.uint8Array), generationId: await log("succeeded"), demo: false };
  } catch (error) {
    console.error("[ai:image]", error);
    await log("failed", toErrorMessage(error));
    throw new AppError("ai_failed");
  }
}
