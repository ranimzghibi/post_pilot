/** Normalisation de texte multilingue, sans dépendance : utilisable partout. */

const ARABIC_INDIC = /[٠-٩]/g;
const EASTERN_INDIC = /[۰-۹]/g;
const ARABIC_MARKS = /[ً-ٰٟـ]/g;

export function normalizeDigits(text: string): string {
  return text
    .replace(ARABIC_INDIC, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(EASTERN_INDIC, (d) => String(d.charCodeAt(0) - 0x06f0));
}

/** Minuscules, sans accents ni diacritiques arabes, alifs unifiés. */
export function foldText(text: string): string {
  return normalizeDigits(text)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(ARABIC_MARKS, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .toLowerCase();
}

export function tokenize(text: string): string[] {
  return foldText(text).match(/[\p{L}\p{N}]+/gu) ?? [];
}

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

function fnv1a(value: string): number {
  let hash = FNV_OFFSET;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME);
  }
  return hash >>> 0;
}

/**
 * Vecteur lexical par hachage de mots et de trigrammes. Aucun modèle requis :
 * c'est le repli quand aucun serveur de vecteurs n'est configuré.
 */
export function hashEmbedding(text: string, dimensions: number): number[] {
  const vector = new Array<number>(dimensions).fill(0);
  const add = (feature: string, weight: number) => {
    const hash = fnv1a(feature);
    const index = hash % dimensions;
    vector[index]! += hash & 0x80000000 ? -weight : weight;
  };
  for (const token of tokenize(text)) {
    add(`w:${token}`, 1);
    const padded = `^${token}$`;
    for (let i = 0; i + 3 <= padded.length; i++) add(`t:${padded.slice(i, i + 3)}`, 0.35);
  }
  const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0)) || 1;
  return vector.map((v) => Math.round((v / norm) * 1e5) / 1e5);
}

/** Découpe un texte en passages, en respectant paragraphes puis phrases. */
export function chunkText(input: string, maxChars = 1000, overlap = 120): string[] {
  const text = input.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  if (!text) return [];

  const units: string[] = [];
  for (const paragraph of text.split(/\n\n/)) {
    if (paragraph.length <= maxChars) {
      units.push(paragraph);
      continue;
    }
    let current = "";
    for (const sentence of paragraph.split(/(?<=[.!?؟।\n])\s+/)) {
      const pieces = sentence.length > maxChars ? (sentence.match(new RegExp(`[\\s\\S]{1,${maxChars}}`, "g")) ?? []) : [sentence];
      for (const piece of pieces) {
        if (current && current.length + piece.length + 1 > maxChars) {
          units.push(current);
          current = "";
        }
        current = current ? `${current} ${piece}` : piece;
      }
    }
    if (current) units.push(current);
  }

  const chunks: string[] = [];
  let buffer = "";
  for (const unit of units) {
    if (buffer && buffer.length + unit.length + 2 > maxChars) {
      chunks.push(buffer.trim());
      const tail = buffer.slice(-overlap);
      const boundary = tail.search(/\s/);
      buffer = boundary >= 0 ? tail.slice(boundary + 1) : "";
    }
    buffer = buffer ? `${buffer}\n\n${unit}` : unit;
  }
  if (buffer.trim()) chunks.push(buffer.trim());
  return chunks;
}
