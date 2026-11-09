import { DEFAULT_COLORS, type VisualIdentity } from "@/lib/domain";

/** Gabarits de visuels (BF-61), décrits en arbres d'éléments pour Satori. */

export const FORMATS = {
  square: { width: 1080, height: 1080 },
  portrait: { width: 1080, height: 1350 },
  landscape: { width: 1200, height: 630 },
  story: { width: 1080, height: 1920 },
} as const;
export type VisualFormat = keyof typeof FORMATS;

export const TEMPLATE_IDS = ["headline", "offer", "quote", "tips", "event", "photo"] as const;
export type TemplateId = (typeof TEMPLATE_IDS)[number];

export type Slide = {
  kicker?: string;
  title?: string;
  body?: string;
  badge?: string;
  footer?: string;
  /** Image de fond, déjà recadrée, en data URL. */
  image?: string;
};

type Node = { type: string; props: Record<string, unknown> };
type Style = Record<string, unknown>;

function el(type: string, style: Style, children?: unknown, extra?: Record<string, unknown>): Node {
  return { type, props: { style: { display: "flex", ...style }, children, ...extra } };
}

const isArabic = (text: string) => /[؀-ۿݐ-ݿࢠ-ࣿ]/.test(text);

function luminance(hex: string): number {
  const value = hex.replace("#", "");
  const channel = (i: number) => {
    const c = parseInt(value.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}

export const readableOn = (background: string) => (luminance(background) > 0.45 ? "#14161F" : "#FFFFFF");

function fitSize(text: string, base: number, width: number): number {
  const scale = width / 1080;
  const length = text.length;
  const factor = length < 24 ? 1 : length < 48 ? 0.82 : length < 80 ? 0.66 : length < 130 ? 0.54 : 0.44;
  return Math.round(base * factor * scale);
}

function textBlock(text: string, style: Style): Node {
  const rtl = isArabic(text);
  // Positionné : sinon les fonds et images en absolu se peignent par-dessus le texte.
  return el("div", { position: "relative", alignSelf: "stretch", justifyContent: rtl ? "flex-end" : "flex-start", textAlign: rtl ? "right" : "left", ...style }, text);
}

export type RenderInput = {
  template: TemplateId;
  format: VisualFormat;
  slide: Slide;
  identity: VisualIdentity;
  logo?: string | null;
  brandName: string;
  index?: number;
  total?: number;
};

function footerRow(input: RenderInput, color: string, padding: number): Node {
  const { width } = FORMATS[input.format];
  const size = Math.round(26 * (width / 1080));
  const left: Node[] = [];
  if (input.logo) left.push(el("img", { height: size * 1.9, objectFit: "contain" }, undefined, { src: input.logo, height: size * 1.9 }));
  else left.push(textBlock(input.brandName, { fontSize: size, fontWeight: 700, color, width: "auto" }));
  const right = input.total && input.total > 1 ? `${(input.index ?? 0) + 1} / ${input.total}` : (input.slide.footer ?? "");
  return el("div", { position: "absolute", left: padding, right: padding, bottom: padding, justifyContent: "space-between", alignItems: "center" }, [
    el("div", { alignItems: "center" }, left),
    el("div", { fontSize: size * 0.85, color, opacity: 0.75 }, right),
  ]);
}

export function buildSlide(input: RenderInput): Node {
  const { width, height } = FORMATS[input.format];
  const colors = { ...DEFAULT_COLORS, ...input.identity.colors };
  const headingFont = input.identity.heading_font === "serif" ? "Serif" : "Sans";
  const pad = Math.round(84 * (width / 1080));
  const { slide } = input;
  const title = slide.title ?? "";
  const body = slide.body ?? "";
  const kicker = slide.kicker ?? "";
  const fontFamily = (text: string) => (isArabic(text) ? "Arabic" : headingFont);
  const isLandscape = input.format === "landscape";
  const boost = input.format === "story" ? 1.2 : 1;
  const titleSize = Math.round(fitSize(title, isLandscape ? 74 : 148, width) * boost);
  const bodySize = Math.round(fitSize(body, isLandscape ? 38 : 56, width) * 1.05 * boost);
  const root: Style = { width, height, position: "relative", fontFamily: "Sans", boxSizing: "border-box", overflow: "hidden" };

  const kickerNode = (color: string) =>
    kicker ? textBlock(kicker, { fontSize: Math.round(32 * (width / 1080)), fontWeight: 700, color, letterSpacing: isArabic(kicker) ? 0 : 1, fontFamily: isArabic(kicker) ? "Arabic" : "Sans", marginBottom: 26 }) : null;
  const titleNode = (color: string) => textBlock(title, { fontSize: titleSize, fontWeight: 700, lineHeight: 1.08, color, fontFamily: fontFamily(title) });
  const bodyNode = (color: string, marginTop = 30) => (body ? textBlock(body, { fontSize: bodySize, lineHeight: 1.35, color, opacity: 0.88, marginTop, fontFamily: isArabic(body) ? "Arabic" : "Sans" }) : null);

  switch (input.template) {
    case "offer": {
      const on = readableOn(colors.background);
      const accentOn = readableOn(colors.accent);
      return el("div", { ...root, background: colors.background, padding: pad, flexDirection: "column", justifyContent: "center" }, [
        slide.badge
          ? el("div", { alignSelf: isArabic(title) ? "flex-end" : "flex-start", background: colors.accent, color: accentOn, borderRadius: 28, padding: `${Math.round(pad * 0.28)}px ${Math.round(pad * 0.55)}px`, fontSize: Math.round(92 * (width / 1080)), fontWeight: 700, marginBottom: 46, fontFamily: isArabic(slide.badge) ? "Arabic" : "Sans" }, slide.badge)
          : null,
        kickerNode(colors.primary),
        titleNode(on),
        bodyNode(on),
        footerRow(input, on, pad),
      ]);
    }
    case "quote": {
      const on = readableOn(colors.background);
      return el("div", { ...root, background: colors.background, padding: pad, flexDirection: "column", justifyContent: "center" }, [
        el("div", { width: Math.round(120 * (width / 1080)), height: 14, background: colors.accent, borderRadius: 7, marginBottom: 56, alignSelf: isArabic(title) ? "flex-end" : "flex-start" }),
        titleNode(on),
        body ? textBlock(body, { fontSize: Math.round(38 * (width / 1080)), color: colors.primary, marginTop: 44, fontWeight: 700, fontFamily: isArabic(body) ? "Arabic" : "Sans" }) : null,
        footerRow(input, on, pad),
      ]);
    }
    case "tips": {
      const on = readableOn(colors.background);
      const accentOn = readableOn(colors.primary);
      const lines = body.split(/\n+/).map((l) => l.trim()).filter(Boolean).slice(0, 5);
      const rtl = isArabic(title + body);
      return el("div", { ...root, background: colors.background, padding: pad, flexDirection: "column", justifyContent: "center" }, [
        kickerNode(colors.primary),
        textBlock(title, { fontSize: Math.round(titleSize * 0.72), fontWeight: 700, lineHeight: 1.1, color: on, marginBottom: 42, fontFamily: fontFamily(title) }),
        ...lines.map((line, i) =>
          el("div", { flexDirection: rtl ? "row-reverse" : "row", alignItems: "center", marginBottom: 22, alignSelf: "stretch" }, [
            el("div", { width: 66, height: 66, borderRadius: 33, background: colors.primary, color: accentOn, alignItems: "center", justifyContent: "center", fontSize: 32, fontWeight: 700, flexShrink: 0, [rtl ? "marginLeft" : "marginRight"]: 26 }, String(i + 1)),
            el("div", { flex: 1, fontSize: Math.round(fitSize(line, 52, width)), lineHeight: 1.25, color: on, justifyContent: rtl ? "flex-end" : "flex-start", textAlign: rtl ? "right" : "left", fontFamily: isArabic(line) ? "Arabic" : "Sans" }, line),
          ]),
        ),
        footerRow(input, on, pad),
      ]);
    }
    case "event": {
      const on = readableOn(colors.secondary);
      return el("div", { ...root, background: colors.secondary, padding: pad, flexDirection: "column", justifyContent: "center" }, [
        kicker
          ? el("div", { alignSelf: isArabic(title) ? "flex-end" : "flex-start", background: colors.accent, color: readableOn(colors.accent), padding: `${Math.round(pad * 0.2)}px ${Math.round(pad * 0.4)}px`, borderRadius: 16, fontSize: Math.round(40 * (width / 1080)), fontWeight: 700, marginBottom: 46, fontFamily: isArabic(kicker) ? "Arabic" : "Sans" }, kicker)
          : null,
        titleNode(on),
        bodyNode(on),
        footerRow(input, on, pad),
      ]);
    }
    case "photo": {
      return el("div", { ...root, background: colors.secondary, flexDirection: "column", justifyContent: "flex-end" }, [
        slide.image ? el("img", { position: "absolute", left: 0, top: 0, width, height, objectFit: "cover" }, undefined, { src: slide.image, width, height }) : null,
        el("div", { position: "absolute", left: 0, top: 0, width, height, background: "linear-gradient(180deg, rgba(10,12,20,0.05) 35%, rgba(10,12,20,0.82) 100%)" }),
        el("div", { position: "relative", flexDirection: "column", padding: pad, paddingBottom: Math.round(pad * 2.1) }, [kickerNode("#FFFFFF"), titleNode("#FFFFFF"), bodyNode("#FFFFFF", 22)]),
        footerRow(input, "#FFFFFF", pad),
      ]);
    }
    case "headline":
    default: {
      const on = readableOn(colors.primary);
      const circle = isLandscape ? height * 0.9 : width * 0.62;
      const rtl = isArabic(title);
      const clearance = isLandscape ? { [rtl ? "paddingLeft" : "paddingRight"]: Math.round(circle * 0.66 + 40) } : {};
      return el("div", { ...root, background: colors.primary, padding: pad, ...clearance, flexDirection: "column", justifyContent: "center" }, [
        el("div", { position: "absolute", width: circle, height: circle, borderRadius: circle, background: colors.accent, opacity: 0.9, top: -circle * 0.42, [rtl ? "left" : "right"]: -circle * 0.34 }),
        kickerNode(on),
        titleNode(on),
        bodyNode(on),
        footerRow(input, on, pad),
      ]);
    }
  }
}
