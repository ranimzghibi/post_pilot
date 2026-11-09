import { describe, expect, it } from "vitest";
import { extractFromBuffer } from "@/server/knowledge/ingest";
import { sampleDocx, samplePdf } from "../support/sample-files";

describe("extraction des documents", () => {
  it("lit un PDF", async () => {
    expect(await extractFromBuffer(samplePdf("Brunch 35 DT"), "application/pdf")).toContain("Brunch 35 DT");
  });

  it("lit un document Word", async () => {
    const mime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    expect(await extractFromBuffer(sampleDocx("Horaires : 8h à 22h30"), mime)).toContain("Horaires : 8h à 22h30");
  });

  it("lit du texte brut, en arabe comme en français", async () => {
    expect(await extractFromBuffer(Buffer.from("السعر 35 دينار"), "text/plain")).toBe("السعر 35 دينار");
  });
});
