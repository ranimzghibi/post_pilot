import "server-only";

import { NETWORKS, type ContentLanguage, type Network, type OnboardingAnswers, type Pillar } from "@/lib/domain";
import { parseDate } from "@/lib/utils";
import type { LocalEventRow } from "./prompts";
import type { BrandProfileOutput, CalendarOutput, PostOutput, StrategyOutput, WebsiteProfile } from "./schemas";

/**
 * Générateurs déterministes du mode démo : aucun appel externe, aucune clé.
 * Ils permettent de parcourir le produit de bout en bout ; l'interface signale
 * ce mode tant qu'aucun fournisseur d'IA n'est configuré.
 */

type Lang = ContentLanguage;

const COPY: Record<Lang, {
  hooks: ((topic: string) => string)[];
  closing: (brand: string) => string;
  cta: string[];
  pillars: Pillar[];
  objectives: { title: string; metric: string }[];
  tone: string;
  summary: (brand: string) => string;
  angle: string;
  ideaTitles: ((pillar: string) => string)[];
  eventTitle: (event: string) => string;
  visual: (topic: string) => string;
}> = {
  fr: {
    hooks: [
      (t) => `${t} : voici ce qu'il faut savoir.`,
      (t) => `On en parle ? ${t}, c'est maintenant.`,
      (t) => `Chez nous, ${t} se vit au quotidien.`,
    ],
    closing: (b) => `Toute l'équipe de ${b} vous attend.`,
    cta: ["Passez nous voir", "Écrivez-nous en message privé", "Réservez dès aujourd'hui"],
    pillars: [
      { name: "Nos produits", description: "Ce que nous vendons, montré de près et expliqué simplement.", share: 35 },
      { name: "Coulisses", description: "L'équipe, le savoir-faire, la vie de tous les jours.", share: 25 },
      { name: "Conseils", description: "Des astuces utiles qui prouvent notre expertise.", share: 25 },
      { name: "Communauté", description: "Clients, avis et temps forts locaux.", share: 15 },
    ],
    objectives: [
      { title: "Publier régulièrement toute l'année", metric: "Publications par semaine" },
      { title: "Faire connaître la marque localement", metric: "Portée mensuelle" },
      { title: "Transformer l'audience en clients", metric: "Messages et demandes reçus" },
    ],
    tone: "Proche, clair et concret, sans jargon.",
    summary: (b) => `Un mois centré sur ce qui rend ${b} unique, avec un rythme tenable et des rendez-vous locaux.`,
    angle: "Montrer un exemple réel et finir par une question simple.",
    ideaTitles: [(p) => `${p} : la nouveauté du moment`, (p) => `${p} : 3 choses que vous ignorez`, (p) => `${p} : l'histoire derrière`, (p) => `${p} : la question qu'on nous pose le plus`],
    eventTitle: (e) => `${e} : notre message à nos clients`,
    visual: (t) => `Photo lumineuse et authentique illustrant « ${t} », couleurs de la marque.`,
  },
  en: {
    hooks: [
      (t) => `${t}: here is what you should know.`,
      (t) => `Let's talk about it: ${t}, right now.`,
      (t) => `For us, ${t} is part of every day.`,
    ],
    closing: (b) => `The whole ${b} team is looking forward to seeing you.`,
    cta: ["Come and see us", "Send us a message", "Book today"],
    pillars: [
      { name: "Our products", description: "What we sell, shown up close and explained simply.", share: 35 },
      { name: "Behind the scenes", description: "The team, the craft, everyday life.", share: 25 },
      { name: "Tips", description: "Useful advice that proves our expertise.", share: 25 },
      { name: "Community", description: "Customers, reviews and local moments.", share: 15 },
    ],
    objectives: [
      { title: "Publish consistently all year", metric: "Posts per week" },
      { title: "Grow local brand awareness", metric: "Monthly reach" },
      { title: "Turn the audience into customers", metric: "Messages and enquiries" },
    ],
    tone: "Friendly, clear and concrete, with no jargon.",
    summary: (b) => `A month focused on what makes ${b} unique, at a sustainable pace with local moments.`,
    angle: "Show one real example and end with a simple question.",
    ideaTitles: [(p) => `${p}: what's new`, (p) => `${p}: 3 things you didn't know`, (p) => `${p}: the story behind it`, (p) => `${p}: the question we hear most`],
    eventTitle: (e) => `${e}: our message to our customers`,
    visual: (t) => `Bright, authentic photo illustrating "${t}", in brand colours.`,
  },
  ar: {
    hooks: [
      (t) => `${t}: إليكم ما يجب معرفته.`,
      (t) => `لنتحدث عن ${t} الآن.`,
      (t) => `عندنا، ${t} جزء من كل يوم.`,
    ],
    closing: (b) => `فريق ${b} في انتظاركم.`,
    cta: ["زورونا", "راسلونا على الخاص", "احجزوا اليوم"],
    pillars: [
      { name: "منتجاتنا", description: "ما نقدمه، عن قرب وبشرح بسيط.", share: 35 },
      { name: "كواليس العمل", description: "الفريق والحرفة والحياة اليومية.", share: 25 },
      { name: "نصائح", description: "معلومات مفيدة تُثبت خبرتنا.", share: 25 },
      { name: "المجتمع", description: "الزبائن والآراء والمناسبات المحلية.", share: 15 },
    ],
    objectives: [
      { title: "النشر بانتظام طوال السنة", metric: "عدد المنشورات في الأسبوع" },
      { title: "التعريف بالعلامة محليًا", metric: "الوصول الشهري" },
      { title: "تحويل المتابعين إلى زبائن", metric: "الرسائل والطلبات" },
    ],
    tone: "قريب وواضح وملموس، دون مصطلحات معقدة.",
    summary: (b) => `شهر يركز على ما يميز ${b}، بوتيرة معقولة ومناسبات محلية.`,
    angle: "عرض مثال حقيقي والختام بسؤال بسيط.",
    ideaTitles: [(p) => `${p}: الجديد`, (p) => `${p}: 3 أشياء لا تعرفونها`, (p) => `${p}: القصة وراءه`, (p) => `${p}: السؤال الأكثر تكرارًا`],
    eventTitle: (e) => `${e}: رسالتنا إلى زبائننا`,
    visual: (t) => `صورة مضيئة وطبيعية توضح «${t}» بألوان العلامة.`,
  },
  tn: {
    hooks: [
      (t) => `${t}: هاو شنوة لازم تعرف.`,
      (t) => `نحكيو توا على ${t}.`,
      (t) => `عنا، ${t} حاجة نعيشوها كل نهار.`,
    ],
    closing: (b) => `فريق ${b} يستنى فيكم.`,
    cta: ["تعدّاو علينا", "ابعثولنا ميساج", "احجزوا توا"],
    pillars: [
      { name: "منتوجاتنا", description: "شنوة نبيعو، من قريب وبالساهل.", share: 35 },
      { name: "وراء الكواليس", description: "الفريق والصنعة والحياة اليومية.", share: 25 },
      { name: "نصايح", description: "حاجات مفيدة تبيّن خبرتنا.", share: 25 },
      { name: "الناس متاعنا", description: "الحرفاء والمناسبات في بلادنا.", share: 15 },
    ],
    objectives: [
      { title: "نپوبليو بانتظام", metric: "عدد البوستات في الجمعة" },
      { title: "الناس تعرف الماركة", metric: "الوصول في الشهر" },
      { title: "المتابعين يوليو حرفاء", metric: "الميساجات والطلبات" },
    ],
    tone: "قريب وواضح وتونسي، بلاش كلام كبير.",
    summary: (b) => `شهر يركز على شنوة يميز ${b}، بريتم معقول ومناسبات تونسية.`,
    angle: "ورّي مثال حقيقي وكمّل بسؤال ساهل.",
    ideaTitles: [(p) => `${p}: الجديد`, (p) => `${p}: 3 حاجات ما تعرفهمش`, (p) => `${p}: الحكاية متاعو`, (p) => `${p}: السؤال اللي ديما يتعاود`],
    eventTitle: (e) => `${e}: كلمتنا لحرفائنا`,
    visual: (t) => `تصويرة طبيعية ومضوية على «${t}» بألوان الماركة.`,
  },
};

const SECTOR_TAGS: Record<string, string[]> = {
  restaurant: ["restaurant", "tunis", "cuisine", "foodtunisie"],
  cafe: ["cafe", "coffee", "tunis", "pausecafe"],
  retail: ["boutique", "shopping", "tunisie", "nouveautes"],
  ecommerce: ["enligne", "shopping", "livraison", "tunisie"],
  fashion: ["mode", "style", "tunisie", "tendance"],
  beauty: ["beaute", "soin", "tunisie", "selfcare"],
  fitness: ["sport", "fitness", "motivation", "tunisie"],
};

function hashtagsFor(sector: string | null | undefined, count: number, brand: string): string[] {
  const base = SECTOR_TAGS[sector ?? ""] ?? ["tunisie", "madeintunisia", "local", "entreprise"];
  const brandTag = brand.replace(/[^\p{L}\p{N}]/gu, "").toLowerCase();
  return [brandTag, ...base].filter(Boolean).slice(0, count);
}

export const demoHashtags = (sector: string | null | undefined, brand: string, network: Network) =>
  hashtagsFor(sector, network === "instagram" ? 5 : 3, brand);

export function demoWebsite(url: string, title: string, description: string): WebsiteProfile {
  return {
    name: title.split(/[|\-–—]/)[0]?.trim() || new URL(url).hostname.replace(/^www\./, ""),
    sector: "other",
    offer: description,
    audience: "",
    difference: "",
  };
}

export function demoBrandProfile(name: string, answers: OnboardingAnswers, language: Lang): BrandProfileOutput {
  const copy = COPY[language];
  return {
    summary: answers.offer || copy.summary(name),
    audience: answers.audience || "",
    tone: copy.tone,
    vocabulary: (answers.difference ?? "").split(/[,.;\n]/).map((s) => s.trim()).filter((s) => s.length > 2 && s.length < 40).slice(0, 8),
    avoid: answers.avoid ?? [],
    emoji_usage: answers.emoji_usage ?? "rare",
    examples: [
      { text: answers.example_post || `${copy.hooks[2]!(name)} ${copy.closing(name)}`, note: "" },
    ],
  };
}

export function demoStrategy(name: string, networks: Network[], language: Lang): StrategyOutput {
  const copy = COPY[language];
  return {
    summary: copy.summary(name),
    objectives: copy.objectives,
    pillars: copy.pillars,
    tone: copy.tone,
    frequency: networks.map((network) => ({ network, posts_per_week: network === "instagram" ? 3 : 2 })),
    format_mix: networks.map((network) => (network === "instagram" ? { network, text: 0, image: 60, carousel: 40 } : { network, text: 20, image: 60, carousel: 20 })),
  };
}

export function demoCalendar(input: {
  period: string;
  pillars: Pillar[];
  networks: Network[];
  count: number;
  language: Lang;
  events: LocalEventRow[];
  allowedDates?: string[];
}): CalendarOutput {
  const copy = COPY[input.language];
  const start = parseDate(input.period);
  const days = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
  const nameKey = input.language === "tn" ? "ar" : input.language;
  const ideas: CalendarOutput["ideas"] = [];
  const pillars = input.pillars.length ? input.pillars : copy.pillars;

  for (const event of input.events) {
    if (ideas.length >= input.count) break;
    if (input.allowedDates && !input.allowedDates.includes(event.event_date)) continue;
    const names = event.names as Record<string, string>;
    ideas.push({
      date: event.event_date,
      pillar: pillars[pillars.length - 1]!.name,
      format: "image",
      networks: input.networks,
      title: copy.eventTitle(names[nameKey] ?? names.fr ?? event.slug),
      angle: copy.angle,
      local_event_slug: event.slug,
    });
  }

  const dates = input.allowedDates ?? Array.from({ length: days }, (_, i) => `${input.period.slice(0, 8)}${String(i + 1).padStart(2, "0")}`);
  const remaining = input.count - ideas.length;
  const free = dates.filter((d) => !ideas.some((idea) => idea.date === d));
  const step = free.length / Math.max(remaining, 1);

  for (let i = 0; i < remaining && free.length; i++) {
    const pillar = pillars[i % pillars.length]!;
    const format = i % 3 === 2 ? "carousel" : "image";
    ideas.push({
      date: free[Math.min(Math.floor(i * step), free.length - 1)]!,
      pillar: pillar.name,
      format,
      networks: input.networks,
      title: copy.ideaTitles[i % copy.ideaTitles.length]!(pillar.name),
      angle: copy.angle,
      local_event_slug: null,
    });
  }
  return { ideas };
}

function firstFact(snippets: string[]): string {
  const line = snippets[0]?.split(/\n/).map((l) => l.trim()).find((l) => l.length > 8);
  return line ? line.slice(0, 180) : "";
}

export function demoPost(input: {
  topic: string;
  brand: string;
  sector: string | null | undefined;
  language: Lang;
  networks: Network[];
  snippets: string[];
  instruction?: string;
}): PostOutput {
  const copy = COPY[input.language];
  const fact = firstFact(input.snippets);
  return {
    options: [0, 1, 2].map((i) => ({
      visual_brief: copy.visual(input.topic),
      variants: input.networks.map((network) => {
        const short = NETWORKS[network].idealLength < 400;
        const parts = short ? [copy.hooks[i]!(input.topic), fact] : [copy.hooks[i]!(input.topic), fact, copy.closing(input.brand)];
        return {
          network,
          caption: parts.filter(Boolean).join("\n\n"),
          hashtags: hashtagsFor(input.sector, network === "instagram" ? 5 : 2, input.brand),
          cta: copy.cta[i]!,
        };
      }),
    })),
  };
}

export function demoRewrite(caption: string, instruction: string): string {
  const shorter = /court|short|قصير/i.test(instruction);
  if (shorter) {
    const first = caption.split(/\n\n/)[0] ?? caption;
    return first;
  }
  return caption;
}
