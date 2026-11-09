import { describe, expect, it } from "vitest";
import { chunkText, foldText, hashEmbedding, normalizeDigits } from "@/lib/text";

describe("foldText", () => {
  it("retire accents et diacritiques arabes", () => {
    expect(foldText("Éléphant Aïd")).toBe("elephant aid");
    expect(foldText("رَمَضَان")).toBe("رمضان");
    expect(foldText("أحمد إبراهيم")).toBe("احمد ابراهيم");
  });

  it("convertit les chiffres arabes", () => {
    expect(normalizeDigits("٣٥ دينار")).toBe("35 دينار");
  });
});

describe("chunkText", () => {
  it("garde un texte court en un seul passage", () => {
    expect(chunkText("Bonjour le monde.")).toEqual(["Bonjour le monde."]);
  });

  it("renvoie un tableau vide pour un texte vide", () => {
    expect(chunkText("   \n\n ")).toEqual([]);
  });

  it("découpe sans dépasser la taille et sans perdre de contenu", () => {
    const text = Array.from({ length: 200 }, (_, i) => `Phrase numéro ${i} du catalogue.`).join(" ");
    const chunks = chunkText(text, 400, 40);
    expect(chunks.length).toBeGreaterThan(5);
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(460);
    for (const i of [0, 77, 199]) expect(chunks.join(" ")).toContain(`numéro ${i} `);
  });

  it("gère un mot plus long que la limite", () => {
    const chunks = chunkText("x".repeat(2500), 1000, 0);
    expect(chunks.join("").length).toBe(2500);
  });
});

describe("hashEmbedding", () => {
  const cosine = (a: number[], b: number[]) => a.reduce((sum, v, i) => sum + v * b[i]!, 0);

  it("a la bonne dimension et est normé", () => {
    const v = hashEmbedding("café au lait", 1024);
    expect(v).toHaveLength(1024);
    expect(cosine(v, v)).toBeCloseTo(1, 2);
  });

  it("rapproche les textes qui partagent des mots, en français comme en arabe", () => {
    const fr = hashEmbedding("le prix du café au lait", 1024);
    expect(cosine(fr, hashEmbedding("café au lait prix", 1024))).toBeGreaterThan(cosine(fr, hashEmbedding("réparation de voiture", 1024)) + 0.2);
    const ar = hashEmbedding("سعر القهوة بالحليب", 1024);
    expect(cosine(ar, hashEmbedding("القهوة بالحليب", 1024))).toBeGreaterThan(cosine(ar, hashEmbedding("تصليح السيارات", 1024)) + 0.2);
  });
});
