import { describe, expect, it } from "vitest";
import { checkCompliance, detectSensitiveTopics, extractFacts, normalizeHashtags } from "@/server/content/compliance";

const base = { hashtags: [], network: "facebook" as const, avoid: [], emojiUsage: "moderate" as const, reference: "" };

describe("checkCompliance", () => {
  it("donne 100 à un texte conforme", () => {
    expect(checkCompliance({ ...base, caption: "Venez découvrir notre nouveau plat." }).score).toBe(100);
  });

  it("signale un mot à éviter, quels que soient accents et casse", () => {
    const result = checkCompliance({ ...base, caption: "Un prix ÉCONOMIQUE pour vous.", avoid: ["economique"] });
    expect(result.issues.map((i) => i.code)).toContain("avoided_word");
    expect(result.score).toBeLessThan(100);
  });

  it("ne confond pas un mot avec un fragment d'un autre mot", () => {
    const result = checkCompliance({ ...base, caption: "Une offre spectaculaire.", avoid: ["spec"] });
    expect(result.issues).toEqual([]);
  });

  it("signale un prix absent de la base", () => {
    const result = checkCompliance({ ...base, caption: "Le menu est à 25 DT aujourd'hui.", reference: "Menu du jour : 18 DT." });
    expect(result.issues).toEqual([{ code: "unverified_fact", severity: "high", detail: "25 DT" }]);
  });

  it("accepte un prix présent, même écrit autrement", () => {
    for (const caption of ["Le menu à 18 dinars.", "Le menu à 18,000 TND.", "القائمة بـ ١٨ دينار"]) {
      expect(checkCompliance({ ...base, caption, reference: "Menu du jour : 18 DT." }).issues).toEqual([]);
    }
  });

  it("vérifie horaires, téléphones et réductions", () => {
    const reference = "Ouvert de 8h à 22h30. Tél : 71 234 567. Promo -20 %.";
    expect(checkCompliance({ ...base, caption: "Ouvert jusqu'à 22:30, appelez le +216 71 234 567 : -20%", reference }).issues).toEqual([]);
    const wrong = checkCompliance({ ...base, caption: "Ouvert jusqu'à 23h, -30%", reference });
    expect(wrong.issues.filter((i) => i.code === "unverified_fact")).toHaveLength(2);
  });

  it("respecte les limites du réseau", () => {
    const result = checkCompliance({ ...base, network: "instagram", caption: "a".repeat(2300), hashtags: Array.from({ length: 31 }, (_, i) => `t${i}`) });
    expect(result.issues.map((i) => i.code)).toEqual(expect.arrayContaining(["too_long", "too_many_hashtags"]));
  });

  it("applique la politique d'émojis", () => {
    expect(checkCompliance({ ...base, emojiUsage: "none", caption: "Bonjour 🎉" }).issues[0]?.code).toBe("emoji_policy");
    expect(checkCompliance({ ...base, emojiUsage: "frequent", caption: "🎉🎉🎉🎉" }).issues).toEqual([]);
  });

  it("le score ne descend jamais sous zéro", () => {
    const result = checkCompliance({ ...base, caption: "x 1 DT 2 DT 3 DT 4 DT 5 DT" });
    expect(result.score).toBe(0);
  });
});

describe("detectSensitiveTopics", () => {
  it("repère les sujets sensibles en français et en arabe", () => {
    expect(detectSensitiveTopics("Bon Ramadan à tous")).toEqual(["religion"]);
    expect(detectSensitiveTopics("عيد مبارك")).toEqual(["religion"]);
    expect(detectSensitiveTopics("Ce produit permet de guérir le diabète")).toEqual(["health"]);
  });

  it("reste silencieux sur un texte ordinaire", () => {
    expect(detectSensitiveTopics("Notre nouveau menu du midi")).toEqual([]);
  });
});

describe("extractFacts", () => {
  it("lit les chiffres arabes", () => {
    expect(extractFacts("السعر ٣٥ دينار").map((f) => f.canonical)).toEqual(["35"]);
  });
});

describe("normalizeHashtags", () => {
  it("nettoie, dédoublonne et limite", () => {
    expect(normalizeHashtags(["#Café", "Café", "##mode tunisie", ""], 5)).toEqual(["Café", "modetunisie"]);
    expect(normalizeHashtags(["a", "b", "c"], 2)).toEqual(["a", "b"]);
  });
});
