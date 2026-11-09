import { readFile } from "node:fs/promises";
import path from "node:path";
import satori from "satori";
import sharp from "sharp";
import { buildSlide, FORMATS, type RenderInput, type VisualFormat } from "./templates";

const FONT_FILES = [
  { name: "Sans", weight: 400, file: "@fontsource/inter/files/inter-latin-400-normal.woff" },
  { name: "Sans", weight: 700, file: "@fontsource/inter/files/inter-latin-700-normal.woff" },
  { name: "Sans", weight: 400, file: "@fontsource/inter/files/inter-latin-ext-400-normal.woff" },
  { name: "Sans", weight: 700, file: "@fontsource/inter/files/inter-latin-ext-700-normal.woff" },
  { name: "Serif", weight: 400, file: "@fontsource/instrument-serif/files/instrument-serif-latin-400-normal.woff" },
  { name: "Serif", weight: 700, file: "@fontsource/instrument-serif/files/instrument-serif-latin-400-normal.woff" },
  { name: "Arabic", weight: 400, file: "@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-400-normal.woff" },
  { name: "Arabic", weight: 700, file: "@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-700-normal.woff" },
] as const;

type SatoriFont = { name: string; data: Buffer; weight: 400 | 700; style: "normal" };

let fontsPromise: Promise<SatoriFont[]> | undefined;

function loadFonts(): Promise<SatoriFont[]> {
  fontsPromise ??= Promise.all(
    FONT_FILES.map(async (font) => ({
      name: font.name,
      weight: font.weight,
      style: "normal" as const,
      data: await readFile(path.join(process.cwd(), "node_modules", font.file)),
    })),
  );
  return fontsPromise;
}

/** Rend une diapositive en JPEG (BF-65), à la taille du format demandé. */
export async function renderSlide(input: RenderInput, options: { previewWidth?: number } = {}): Promise<Buffer> {
  const { width, height } = FORMATS[input.format];
  const svg = await satori(buildSlide(input) as never, { width, height, fonts: await loadFonts() });
  let image = sharp(Buffer.from(svg));
  if (options.previewWidth) image = image.resize({ width: options.previewWidth });
  return image.flatten({ background: "#ffffff" }).jpeg({ quality: options.previewWidth ? 78 : 90, mozjpeg: true }).toBuffer();
}

/** Recadre une image au format du réseau, en gardant la zone la plus intéressante (BF-63). */
export async function cropToFormat(source: Buffer, format: VisualFormat): Promise<Buffer> {
  const { width, height } = FORMATS[format];
  return sharp(source).rotate().resize(width, height, { fit: "cover", position: sharp.strategy.attention }).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
}

export const toDataUrl = (buffer: Buffer, mime = "image/jpeg") => `data:${mime};base64,${buffer.toString("base64")}`;

/** Convertit un logo importé en PNG de taille raisonnable pour l'incruster. */
export async function logoToDataUrl(source: Buffer): Promise<string> {
  const png = await sharp(source).resize({ height: 160, fit: "inside", withoutEnlargement: true }).png().toBuffer();
  return toDataUrl(png, "image/png");
}
