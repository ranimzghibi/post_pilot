import "server-only";

import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { embedMany } from "ai";
import { hashEmbedding } from "@/lib/text";
import type { UserClient } from "@/lib/supabase/server";
import { AppError } from "../errors";
import { embeddingProviderConfigured } from "./config";

export const EMBEDDING_DIMENSIONS = 1024;
export const LOCAL_EMBEDDING_MODEL = "local-hash-v1";

export type Embeddings = { vectors: number[][]; model: string };

export async function embedTexts(texts: string[]): Promise<Embeddings> {
  if (!embeddingProviderConfigured()) {
    return { vectors: texts.map((t) => hashEmbedding(t, EMBEDDING_DIMENSIONS)), model: LOCAL_EMBEDDING_MODEL };
  }

  const model = process.env.EMBEDDING_MODEL || "bge-m3";
  const provider = createOpenAICompatible({
    name: "embeddings",
    baseURL: process.env.EMBEDDING_BASE_URL ?? "",
    apiKey: process.env.EMBEDDING_API_KEY || undefined,
  });
  const { embeddings } = await embedMany({ model: provider.embeddingModel(model), values: texts, maxRetries: 2 });
  if (embeddings.some((v) => v.length !== EMBEDDING_DIMENSIONS)) throw new AppError("embedding_dimension");
  return { vectors: embeddings, model };
}

export const toVectorLiteral = (vector: number[]) => `[${vector.join(",")}]`;

export type KnowledgeMatch = { chunk_id: string; document_id: string; document_title: string; content: string; score: number };

/** Recherche hybride dans la base de connaissances, soumise aux politiques RLS de l'appelant. */
export async function searchKnowledge(client: UserClient, brandId: string, query: string, limit = 6): Promise<KnowledgeMatch[]> {
  if (!query.trim()) return [];
  const { vectors } = await embedTexts([query]);
  const { data, error } = await client.rpc("match_knowledge", {
    p_brand: brandId,
    p_query_embedding: toVectorLiteral(vectors[0]!),
    p_query_text: query,
    p_limit: limit,
  });
  if (error) throw error;
  return data ?? [];
}
