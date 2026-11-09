import "server-only";

import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import { chunkText } from "@/lib/text";
import { isTenantPath, toErrorMessage } from "@/lib/utils";
import { embedTexts, toVectorLiteral } from "../ai/embeddings";

export async function extractFromBuffer(buffer: Buffer, mime: string): Promise<string> {
  if (mime === "application/pdf") {
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { text } = await extractText(pdf, { mergePages: true });
    return text;
  }
  if (mime.includes("wordprocessingml")) {
    return (await mammoth.extractRawText({ buffer })).value;
  }
  return buffer.toString("utf8");
}

const BATCH = 32;

/**
 * Indexe un document : extraction, découpage, vecteurs, écriture des passages.
 * Tâche d'arrière-plan : l'appelant a déjà vérifié les droits sur le document.
 */
export async function ingestDocument(documentId: string): Promise<void> {
  const admin = createAdminClient();
  const { data: doc } = await admin.from("knowledge_documents").select("*").eq("id", documentId).single();
  if (!doc) return;

  await admin.from("knowledge_documents").update({ status: "processing", error: null }).eq("id", documentId);

  try {
    let text = doc.raw_text ?? "";
    if (doc.storage_path) {
      if (!isTenantPath(doc.storage_path, doc.organization_id, doc.brand_id)) throw new Error("invalid_path");
      const { data, error } = await admin.storage.from("knowledge").download(doc.storage_path);
      if (error || !data) throw new Error(error?.message ?? "download_failed");
      text = await extractFromBuffer(Buffer.from(await data.arrayBuffer()), doc.mime_type ?? "text/plain");
    }

    const chunks = chunkText(text);
    if (!chunks.length) throw new Error("empty_document");

    const rows: Database["public"]["Tables"]["knowledge_chunks"]["Insert"][] = [];
    for (let i = 0; i < chunks.length; i += BATCH) {
      const slice = chunks.slice(i, i + BATCH);
      const { vectors, model } = await embedTexts(slice);
      slice.forEach((content, offset) => {
        rows.push({
          organization_id: doc.organization_id,
          brand_id: doc.brand_id,
          document_id: doc.id,
          chunk_index: i + offset,
          content,
          embedding: toVectorLiteral(vectors[offset]!),
          embedding_model: model,
        });
      });
    }

    await admin.from("knowledge_chunks").delete().eq("document_id", doc.id);
    const { error: insertError } = await admin.from("knowledge_chunks").insert(rows);
    if (insertError) throw insertError;

    await admin
      .from("knowledge_documents")
      .update({ status: "ready", char_count: text.length, chunk_count: chunks.length, error: null })
      .eq("id", doc.id);
  } catch (error) {
    console.error("[knowledge] indexation échouée", toErrorMessage(error));
    await admin
      .from("knowledge_documents")
      .update({ status: "failed", error: toErrorMessage(error).slice(0, 300) })
      .eq("id", doc.id);
  }
}
