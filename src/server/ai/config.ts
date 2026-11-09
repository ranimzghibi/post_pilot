import "server-only";

export type AiProvider = "anthropic" | "openai-compatible" | "demo";
export type AiTier = "smart" | "fast";

export function aiProvider(): AiProvider {
  const wanted = process.env.AI_PROVIDER;
  if (wanted === "anthropic" || wanted === "openai-compatible" || wanted === "demo") return wanted;
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.AI_BASE_URL) return "openai-compatible";
  return "demo";
}

export function modelId(tier: AiTier): string {
  if (aiProvider() === "demo") return "demo";
  return tier === "smart"
    ? process.env.AI_TEXT_MODEL || "claude-sonnet-5-5"
    : process.env.AI_FAST_MODEL || process.env.AI_TEXT_MODEL || "claude-haiku-4-5";
}

export const imageProviderConfigured = () => Boolean(process.env.IMAGE_BASE_URL && process.env.IMAGE_MODEL);
export const embeddingProviderConfigured = () => Boolean(process.env.EMBEDDING_BASE_URL);

/** Prix en dollars par million de jetons (entrée, sortie, lecture de cache). */
const PRICING: Record<string, { input: number; output: number; cacheRead: number }> = {
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2 },
  "claude-haiku-4-5": { input: 1, output: 5, cacheRead: 0.1 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01 },
};

export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number, cachedTokens: number): number {
  const price = PRICING[model];
  if (!price) return 0;
  const uncached = Math.max(inputTokens - cachedTokens, 0);
  return (uncached * price.input + cachedTokens * price.cacheRead + outputTokens * price.output) / 1_000_000;
}

/** Fourchette haute des comparatifs cités au tableau 2.11 ; à confirmer une fois le fournisseur choisi. */
export const IMAGE_COST_USD = 0.03;
