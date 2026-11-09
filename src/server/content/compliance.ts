import { foldText, normalizeDigits } from "@/lib/text";
import { NETWORKS, type ComplianceIssue, type EmojiUsage, type Network } from "@/lib/domain";

/**
 * Contrôles déterministes d'une publication (BF-56) : longueur, mots à éviter,
 * faits absents de la base de connaissances, sujets sensibles.
 * Sans dépendance serveur : testable et réutilisable.
 */

export const SENSITIVE_LEXICON: Record<string, string[]> = {
  religion: ["ramadan", "aid", "dieu", "allah", "priere", "mosquee", "eglise", "religion", "islam", "رمضان", "عيد", "الله", "صلاه", "جامع", "مسجد", "دين", "god", "prayer", "church", "mosque"],
  politics: ["election", "gouvernement", "president", "parti politique", "ministre", "parlement", "انتخابات", "حكومه", "رئيس", "برلمان", "government", "parliament", "minister"],
  health: ["guerir", "guerison", "medicament", "maladie", "traitement", "cancer", "diabete", "علاج", "دواء", "مرض", "سرطان", "cure", "disease", "medicine"],
  tragedy: ["deces", "attentat", "guerre", "catastrophe", "seisme", "وفاه", "حرب", "كارثه", "زلزال", "death", "attack", "war", "disaster"],
};

function containsWord(foldedText: string, foldedTerm: string): boolean {
  if (!foldedTerm) return false;
  const escaped = foldedTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`, "u").test(foldedText);
}

export function detectSensitiveTopics(text: string): string[] {
  const folded = foldText(text);
  return Object.entries(SENSITIVE_LEXICON)
    .filter(([, terms]) => terms.some((term) => containsWord(folded, foldText(term))))
    .map(([topic]) => topic);
}

const FACT_PATTERNS: { kind: string; regex: RegExp }[] = [
  { kind: "price", regex: /\d+(?:[.,]\d+)?\s?(?:dt\b|tnd\b|dinars?\b|د\.?ت|دينار|€|\$|eur\b|mill\b|مليم)/giu },
  { kind: "percent", regex: /-?\d+(?:[.,]\d+)?\s?%/gu },
  { kind: "phone", regex: /(?:\+216[\s.-]?)?\b\d{2}[\s.-]?\d{3}[\s.-]?\d{3}\b/gu },
  { kind: "time", regex: /\b\d{1,2}\s?(?:h|:)\s?\d{0,2}\b/giu },
  { kind: "url", regex: /\b(?:https?:\/\/|www\.)\S+/giu },
  { kind: "email", regex: /[\w.+-]+@[\w-]+\.[\w.-]+/gu },
];

function canonicalNumber(value: string): string {
  const digits = value.match(/\d+(?:[.,]\d+)?/u)?.[0] ?? value;
  const n = Number(digits.replace(",", "."));
  return Number.isNaN(n) ? digits : String(n);
}

function canonicalFact(kind: string, raw: string): string {
  if (kind === "price" || kind === "percent") return canonicalNumber(raw);
  if (kind === "phone") return raw.replace(/\D/g, "").replace(/^216/, "");
  if (kind === "time") {
    const [h, m] = raw.split(/\s?(?:h|H|:)\s?/);
    return `${Number(h)}:${(m || "00").padStart(2, "0")}`;
  }
  return raw.toLowerCase().replace(/[.,;!?)]+$/, "");
}

export function extractFacts(text: string): { kind: string; raw: string; canonical: string }[] {
  const normalized = normalizeDigits(text);
  const facts: { kind: string; raw: string; canonical: string }[] = [];
  for (const { kind, regex } of FACT_PATTERNS) {
    for (const match of normalized.matchAll(regex)) {
      facts.push({ kind, raw: match[0], canonical: canonicalFact(kind, match[0]) });
    }
  }
  return facts;
}

function knownFacts(reference: string): Set<string> {
  return new Set(extractFacts(reference).map((f) => `${f.kind}:${f.canonical}`));
}

const EMOJI = /\p{Extended_Pictographic}/gu;

const PENALTY = { high: 30, medium: 15, low: 5 } as const;

export type ComplianceInput = {
  caption: string;
  hashtags: string[];
  network: Network;
  avoid: string[];
  emojiUsage: EmojiUsage;
  /** Tout ce qui fait foi pour les faits : base de connaissances, actualités, consigne. */
  reference: string;
};

export type ComplianceResult = { score: number; issues: ComplianceIssue[]; sensitiveTopics: string[] };

export function checkCompliance(input: ComplianceInput): ComplianceResult {
  const issues: ComplianceIssue[] = [];
  const rules = NETWORKS[input.network];
  const folded = foldText(input.caption);

  if (input.caption.length > rules.captionLimit) {
    issues.push({ code: "too_long", severity: "high", detail: String(input.caption.length - rules.captionLimit) });
  }
  if (input.hashtags.length > rules.hashtagLimit) {
    issues.push({ code: "too_many_hashtags", severity: "medium", detail: String(input.hashtags.length) });
  }

  for (const word of input.avoid) {
    if (containsWord(folded, foldText(word))) issues.push({ code: "avoided_word", severity: "high", detail: word });
  }

  const known = knownFacts(input.reference);
  const seen = new Set<string>();
  for (const fact of extractFacts(input.caption)) {
    const key = `${fact.kind}:${fact.canonical}`;
    if (!known.has(key) && !seen.has(key)) {
      seen.add(key);
      issues.push({ code: "unverified_fact", severity: "high", detail: fact.raw.trim() });
    }
  }

  const emojiCount = (input.caption.match(EMOJI) ?? []).length;
  if (input.emojiUsage === "none" && emojiCount > 0) {
    issues.push({ code: "emoji_policy", severity: "medium", detail: String(emojiCount) });
  } else if (input.emojiUsage === "rare" && emojiCount > 2) {
    issues.push({ code: "emoji_policy", severity: "low", detail: String(emojiCount) });
  }

  const sensitiveTopics = detectSensitiveTopics(input.caption);
  for (const topic of sensitiveTopics) {
    issues.push({ code: "sensitive_topic", severity: "low", detail: topic });
  }

  const score = Math.max(0, 100 - issues.reduce((sum, issue) => sum + PENALTY[issue.severity], 0));
  return { score, issues, sensitiveTopics };
}

export function normalizeHashtags(tags: string[], limit: number): string[] {
  const cleaned = tags.map((t) => t.replace(/^#+/, "").replace(/[^\p{L}\p{N}_]/gu, "")).filter(Boolean);
  return Array.from(new Set(cleaned)).slice(0, limit);
}
