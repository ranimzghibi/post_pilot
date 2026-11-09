import { describe, expect, it } from "vitest";
import { ideasForMonth, monthDates, normalizeFormatMix, normalizeFrequency, normalizeIdeas, normalizePillars, weekOf } from "@/server/content/normalize";

const fallback = [
  { name: "A", description: "", share: 25 },
  { name: "B", description: "", share: 25 },
  { name: "C", description: "", share: 25 },
];

describe("normalizePillars", () => {
  it("impose entre 3 et 5 piliers et un total de 100", () => {
    const seven = Array.from({ length: 7 }, (_, i) => ({ name: `P${i}`, description: "", share: 13 }));
    const result = normalizePillars(seven, fallback);
    expect(result).toHaveLength(5);
    expect(result.reduce((s, p) => s + p.share, 0)).toBe(100);
  });

  it("complète un résultat trop court et supprime les doublons", () => {
    const result = normalizePillars([{ name: "Produits", description: "", share: 50 }, { name: "produits", description: "", share: 50 }], fallback);
    expect(result.map((p) => p.name)).toEqual(["Produits", "A", "B"]);
    expect(result.reduce((s, p) => s + p.share, 0)).toBe(100);
  });

  it("gère des parts nulles", () => {
    const result = normalizePillars(fallback.map((p) => ({ ...p, share: 0 })), fallback);
    expect(result.reduce((s, p) => s + p.share, 0)).toBe(100);
  });
});

describe("frequency and mix", () => {
  it("borne le rythme hebdomadaire", () => {
    expect(normalizeFrequency([{ network: "facebook", posts_per_week: 40 }], ["facebook", "instagram"])).toEqual({ facebook: 7, instagram: 3 });
  });

  it("équilibre la répartition des formats", () => {
    const mix = normalizeFormatMix([{ network: "instagram", text: 1, image: 1, carousel: 1 }], ["instagram"]).instagram!;
    expect(mix.text + mix.image + mix.carousel).toBe(100);
  });

  it("calcule le nombre d'idées du mois", () => {
    expect(ideasForMonth({ facebook: 3 }, "2027-02-01")).toBe(12);
    expect(ideasForMonth({ facebook: 2, instagram: 4 }, "2026-11-01")).toBe(17);
  });
});

describe("normalizeIdeas", () => {
  const options = { allowedDates: monthDates("2026-11-01"), pillars: ["Produits", "Conseils"], networks: ["facebook", "instagram"] as ("facebook" | "instagram")[], max: 3, knownEvents: ["black-friday"] };
  const idea = { date: "2026-11-10", pillar: "Produits", format: "image" as const, networks: ["instagram"], title: "Idée", angle: "", local_event_slug: null };

  it("écarte les dates hors du mois et les titres vides", () => {
    const result = normalizeIdeas([{ ...idea, date: "2027-01-01" }, { ...idea, title: "  " }, idea], options);
    expect(result).toHaveLength(1);
  });

  it("corrige un pilier inconnu et un réseau inconnu", () => {
    const [result] = normalizeIdeas([{ ...idea, pillar: "Inventé", networks: ["tiktok"] }], options);
    expect(result!.pillar).toBe("Produits");
    expect(result!.networks).toEqual(["facebook", "instagram"]);
  });

  it("respecte le maximum et ignore un temps fort inconnu", () => {
    const result = normalizeIdeas(Array.from({ length: 5 }, () => ({ ...idea, local_event_slug: "fake" })), options);
    expect(result).toHaveLength(3);
    expect(result[0]!.local_event_slug).toBeNull();
  });
});

describe("dates", () => {
  it("liste les jours du mois, année bissextile comprise", () => {
    expect(monthDates("2028-02-01")).toHaveLength(29);
    expect(monthDates("2026-11-01")[29]).toBe("2026-11-30");
  });

  it("calcule la semaine du mois", () => {
    expect(weekOf("2026-11-01")).toBe(0);
    expect(weekOf("2026-11-08")).toBe(1);
    expect(weekOf("2026-11-31")).toBe(4);
  });
});
