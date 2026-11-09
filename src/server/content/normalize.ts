import { NETWORK_LIST, type Network, type Pillar } from "@/lib/domain";
import type { CalendarOutput, StrategyOutput } from "../ai/schemas";

/** Remise en forme des sorties de l'IA : les contraintes métier sont appliquées ici, sans confiance. */

export function daysInMonth(period: string): number {
  const [year, month] = period.split("-").map(Number);
  return new Date(year!, month!, 0).getDate();
}

export function monthDates(period: string): string[] {
  const prefix = period.slice(0, 8);
  return Array.from({ length: daysInMonth(period) }, (_, i) => `${prefix}${String(i + 1).padStart(2, "0")}`);
}

export const weekOf = (date: string) => Math.min(Math.floor((Number(date.slice(8, 10)) - 1) / 7), 4);

const asNetwork = (value: string): Network | null => (NETWORK_LIST as string[]).includes(value) ? (value as Network) : null;

/** Entre 3 et 5 piliers (BF-40), dont les parts totalisent exactement 100. */
export function normalizePillars(input: Pillar[], fallback: Pillar[]): Pillar[] {
  const seen = new Set<string>();
  let pillars = input.filter((p) => {
    const name = p.name.trim();
    if (!name || seen.has(name.toLowerCase())) return false;
    seen.add(name.toLowerCase());
    return true;
  });
  for (const extra of fallback) {
    if (pillars.length >= 3) break;
    if (!seen.has(extra.name.toLowerCase())) pillars.push(extra);
  }
  pillars = pillars.slice(0, 5);

  const total = pillars.reduce((sum, p) => sum + Math.max(p.share, 0), 0);
  const scaled = pillars.map((p) => ({
    name: p.name.trim().slice(0, 80),
    description: p.description.trim().slice(0, 300),
    share: total > 0 ? Math.round((Math.max(p.share, 0) / total) * 100) : Math.round(100 / pillars.length),
  }));
  const drift = 100 - scaled.reduce((sum, p) => sum + p.share, 0);
  if (scaled[0]) scaled[0].share += drift;
  return scaled;
}

export type NormalizedFrequency = Record<string, number>;
export type NormalizedFormatMix = Record<string, { text: number; image: number; carousel: number }>;

export function normalizeFrequency(input: StrategyOutput["frequency"], networks: Network[]): NormalizedFrequency {
  const result: NormalizedFrequency = {};
  for (const network of networks) {
    const entry = input.find((f) => f.network === network);
    result[network] = Math.min(Math.max(Math.round(entry?.posts_per_week ?? 3), 1), 7);
  }
  return result;
}

export function normalizeFormatMix(input: StrategyOutput["format_mix"], networks: Network[]): NormalizedFormatMix {
  const result: NormalizedFormatMix = {};
  for (const network of networks) {
    const entry = input.find((f) => f.network === network);
    const raw = { text: Math.max(entry?.text ?? 0, 0), image: Math.max(entry?.image ?? 70, 0), carousel: Math.max(entry?.carousel ?? 30, 0) };
    const total = raw.text + raw.image + raw.carousel || 1;
    const mix = { text: Math.round((raw.text / total) * 100), image: Math.round((raw.image / total) * 100), carousel: Math.round((raw.carousel / total) * 100) };
    mix.image += 100 - (mix.text + mix.image + mix.carousel);
    result[network] = mix;
  }
  return result;
}

/** Nombre d'idées du mois : le réseau le plus actif donne le rythme, une idée pouvant viser plusieurs réseaux. */
export function ideasForMonth(frequency: NormalizedFrequency, period: string): number {
  const perWeek = Math.max(...Object.values(frequency), 1);
  return Math.min(Math.round((perWeek * daysInMonth(period)) / 7), 31);
}

export type NormalizedIdea = {
  planned_on: string;
  pillar: string;
  format: "text" | "image" | "carousel";
  networks: Network[];
  title: string;
  angle: string;
  local_event_slug: string | null;
};

export function normalizeIdeas(
  ideas: CalendarOutput["ideas"],
  options: { allowedDates: string[]; pillars: string[]; networks: Network[]; max: number; knownEvents: string[] },
): NormalizedIdea[] {
  const allowed = new Set(options.allowedDates);
  const result: NormalizedIdea[] = [];

  for (const idea of ideas) {
    if (result.length >= options.max) break;
    const title = idea.title.trim();
    if (!title || !allowed.has(idea.date)) continue;
    const networks = idea.networks.map(asNetwork).filter((n): n is Network => !!n && options.networks.includes(n));
    result.push({
      planned_on: idea.date,
      pillar: options.pillars.includes(idea.pillar) ? idea.pillar : options.pillars[result.length % options.pillars.length]!,
      format: idea.format,
      networks: networks.length ? Array.from(new Set(networks)) : options.networks,
      title: title.slice(0, 200),
      angle: idea.angle.trim().slice(0, 1000),
      local_event_slug: idea.local_event_slug && options.knownEvents.includes(idea.local_event_slug) ? idea.local_event_slug : null,
    });
  }
  return result;
}
