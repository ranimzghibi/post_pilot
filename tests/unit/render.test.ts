import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { renderSlide } from "@/server/render/render";
import { FORMATS, readableOn, TEMPLATE_IDS, type VisualFormat } from "@/server/render/templates";

const OUT = process.env.RENDER_SAMPLES;
if (OUT) mkdirSync(OUT, { recursive: true });

const identity = { colors: { primary: "#1F4FD8", secondary: "#14161F", accent: "#E8553D", background: "#FBFBF8", text: "#14161F" } };

const slides = {
  fr: { kicker: "Chaque dimanche", title: "Le brunch revient en terrasse", body: "Pain maison, œufs fermiers et vue sur le golfe.", badge: "35 DT" },
  ar: { kicker: "كل يوم أحد", title: "فطور الأحد يعود إلى الشرفة مع إطلالة جميلة على الخليج", body: "خبز منزلي وبيض طازج وأجواء عائلية لا تُنسى في قلب المدينة.", badge: "35 د.ت" },
};

async function render(template: (typeof TEMPLATE_IDS)[number], format: VisualFormat, slide: Record<string, string>, name: string) {
  const jpeg = await renderSlide({ template, format, slide, identity, logo: null, brandName: "Café Sidi Bou", index: 0, total: 1 });
  if (OUT) writeFileSync(path.join(OUT, `${name}.jpg`), jpeg);
  return jpeg;
}

describe("rendu des visuels", () => {
  for (const template of TEMPLATE_IDS) {
    it(`gabarit ${template} : JPEG aux dimensions du format`, async () => {
      const jpeg = await render(template, "square", template === "tips" ? { ...slides.fr, body: "Réservez tôt\nVenez à deux\nGoûtez la citronnade" } : slides.fr, `${template}-fr`);
      const meta = await sharp(jpeg).metadata();
      expect(meta.format).toBe("jpeg");
      expect({ width: meta.width, height: meta.height }).toEqual(FORMATS.square);
    });
  }

  for (const format of Object.keys(FORMATS) as VisualFormat[]) {
    it(`format ${format} : dimensions exactes`, async () => {
      const meta = await sharp(await render("headline", format, slides.fr, `format-${format}`)).metadata();
      expect({ width: meta.width, height: meta.height }).toEqual(FORMATS[format]);
    });
  }

  it("compose l'arabe sans erreur, sur tous les gabarits", async () => {
    for (const template of TEMPLATE_IDS) {
      expect((await render(template, "portrait", slides.ar, `${template}-ar`)).length).toBeGreaterThan(5000);
    }
  });

  it("le titre reste visible par-dessus une photo", async () => {
    const photo = await sharp({ create: { width: 200, height: 200, channels: 3, background: "#203040" } }).jpeg().toBuffer();
    const image = `data:image/jpeg;base64,${photo.toString("base64")}`;
    const withTitle = await renderSlide({ template: "photo", format: "square", slide: { title: "Chaque dimanche", image }, identity, logo: null, brandName: "B" });
    const without = await renderSlide({ template: "photo", format: "square", slide: { title: "", image }, identity, logo: null, brandName: "B" });
    expect(withTitle.equals(without)).toBe(false);
  });

  it("choisit un texte lisible selon le fond", () => {
    expect(readableOn("#FBFBF8")).toBe("#14161F");
    expect(readableOn("#14161F")).toBe("#FFFFFF");
  });
});
