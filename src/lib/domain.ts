/** Constantes métier partagées entre le serveur, les schémas et l'interface. */

export const NETWORKS = {
  facebook: { label: "Facebook", captionLimit: 63206, idealLength: 500, hashtagLimit: 5 },
  instagram: { label: "Instagram", captionLimit: 2200, idealLength: 300, hashtagLimit: 30 },
} as const;

export type Network = keyof typeof NETWORKS;
export const NETWORK_LIST = Object.keys(NETWORKS) as Network[];

export const CONTENT_LANGUAGES = ["fr", "ar", "en", "tn"] as const;
export type ContentLanguage = (typeof CONTENT_LANGUAGES)[number];

export const SECTORS = ["restaurant", "cafe", "retail", "ecommerce", "fashion", "beauty", "fitness", "health", "training", "services", "real_estate", "crafts", "other"] as const;
export type Sector = (typeof SECTORS)[number];

export const GOALS = ["awareness", "sales", "loyalty", "traffic", "recruitment", "launch"] as const;
export const TONES = ["warm", "professional", "playful", "premium", "direct", "inspiring"] as const;
export const EMOJI_USAGE = ["none", "rare", "moderate", "frequent"] as const;
export type EmojiUsage = (typeof EMOJI_USAGE)[number];

export const POST_FORMATS = ["text", "image", "carousel"] as const;
export type PostFormat = (typeof POST_FORMATS)[number];

export const NEWS_KINDS = ["new_product", "promotion", "closure", "event", "other"] as const;

export type OnboardingAnswers = {
  sector?: Sector;
  offer?: string;
  audience?: string;
  goals?: (typeof GOALS)[number][];
  difference?: string;
  tones?: (typeof TONES)[number][];
  languages?: ContentLanguage[];
  avoid?: string[];
  emoji_usage?: EmojiUsage;
  example_post?: string;
};

export type Pillar = { name: string; description: string; share: number };
export type Objective = { title: string; metric: string };

export type VisualIdentity = {
  logo_path?: string | null;
  colors?: { primary?: string; secondary?: string; accent?: string; background?: string; text?: string };
  heading_font?: "sans" | "serif";
};

export const DEFAULT_COLORS = {
  primary: "#1F4FD8",
  secondary: "#14161F",
  accent: "#E8553D",
  background: "#FBFBF8",
  text: "#14161F",
};

export type ComplianceIssue = {
  code: "avoided_word" | "unverified_fact" | "too_long" | "too_many_hashtags" | "sensitive_topic" | "emoji_policy" | "tone";
  severity: "high" | "medium" | "low";
  detail: string;
};

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
export const KNOWLEDGE_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/csv",
  "text/markdown",
];
export const IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
