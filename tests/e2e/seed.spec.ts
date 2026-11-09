import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

/**
 * Le compte préparé (section 15 de la migration) s'ouvre sur des pages remplies,
 * pour chacune des trois marques. Se désactive si cette section est retirée.
 */

const SHOTS = process.env.E2E_SCREENSHOTS;
const SUPABASE = "http://127.0.0.1:54399";
const migrations = path.resolve(__dirname, "..", "..", "supabase", "migrations");
const hasSeed = readFileSync(path.join(migrations, readdirSync(migrations).sort()[0]!), "utf8").includes("-- 15. Données prêtes à l'emploi");

const BRANDS = [
  { name: "Maison Yasmina", knowledge: "Carte et prix", news: "Soirée malouf", pillar: "Nos rendez-vous", draft: "La nouvelle carte d'hiver" },
  { name: "Atelier Nour", knowledge: "Collections et prix", news: "Collection Carthage", pillar: "Savoir-faire", draft: "Que glisser dans un coffret cadeau ?" },
  { name: "Beldi Box", knowledge: "المنتجات والأسعار", news: "زيت الموسم الجديد وصل", pillar: "منتوجاتنا", draft: "هريسة عربي كيف متاع أمي" },
];

test.describe.serial("Compte préparé", () => {
  test.skip(!hasSeed, "section 15 retirée de la migration");

  let page: Page;
  const errors: string[] = [];

  async function useBrand(name: string) {
    const response = await fetch(`${SUPABASE}/rest/v1/brands?select=id&name=eq.${encodeURIComponent(name)}`, { headers: { apikey: "fake-service-key", Authorization: "Bearer fake-service-key" } });
    const [brand] = (await response.json()) as { id: string }[];
    await page.context().addCookies([{ name: "pp_brand", value: brand!.id, domain: "localhost", path: "/" }]);
  }

  async function open(route: string) {
    await page.goto(route);
    await expect(page.locator("main")).toBeVisible();
  }

  async function shot(name: string) {
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/seed-${name}.png`, fullPage: true });
  }

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
  });

  test("à l'inscription, l'espace est déjà prêt : pas d'onboarding", async () => {
    await page.goto("/signup");
    await page.getByLabel("Nom complet").fill("Ranim Zghibi");
    await page.getByLabel("Adresse e-mail").fill("ranimzghibi5@gmail.com");
    await page.getByLabel("Mot de passe").fill("motdepasse-solide");
    await page.getByRole("button", { name: "Créer mon compte" }).click();
    await page.waitForURL(/\/app/);
    await expect(page).not.toHaveURL(/onboarding/);
    await expect(page.getByText("6/6")).toBeVisible();
    await expect(page.getByText("Agence", { exact: true })).toBeVisible();
    await shot("tableau-de-bord");
  });

  for (const brand of BRANDS) {
    test(`${brand.name} : toutes les pages sont remplies`, async () => {
      await useBrand(brand.name);

      await open("/app");
      await expect(page.getByText("6/6")).toBeVisible();

      await open("/app/brand");
      await shot(`${brand.name}-adn`);
      await page.getByRole("tab", { name: "Historique" }).click();
      await expect(page.getByText("v2", { exact: true })).toBeVisible();

      await open("/app/knowledge");
      await expect(page.locator("main")).toContainText(brand.knowledge);

      await open("/app/news");
      await expect(page.locator("main")).toContainText(brand.news);

      await open("/app/connections");
      await expect(page.getByText("Bac à sable").first()).toBeVisible();

      await open("/app/strategy");
      await expect(page.locator("main")).toContainText(brand.pillar);

      await open("/app/calendar");
      await expect(page.locator("main button").filter({ hasText: /\S/ }).first()).toBeVisible();
      await shot(`${brand.name}-calendrier`);

      await open("/app/content");
      await page.getByText(brand.draft, { exact: true }).first().click();
      await page.waitForURL(/\/app\/content\/[0-9a-f-]{36}/);
      await expect(page.getByRole("tab", { name: /C$/ })).toBeVisible();
      await expect(page.locator("#caption")).not.toHaveValue("");
      await shot(`${brand.name}-publication`);

      await open("/app/studio");
    });
  }

  test("les publications verrouillées et les alertes de conformité s'affichent", async () => {
    await useBrand("Maison Yasmina");
    await open("/app/content");
    await page.getByText("Le couscous au mérou du vendredi", { exact: true }).first().click();
    await page.waitForURL(/\/app\/content\/[0-9a-f-]{36}/);
    await expect(page.locator("#caption")).toBeDisabled();

    await open("/app/content");
    await page.getByText("Le makroudh de la fin de repas", { exact: true }).first().click();
    await page.waitForURL(/\/app\/content\/[0-9a-f-]{36}/);
    await expect(page.locator("main aside")).toContainText("pas cher");
    await expect(page.locator("main aside")).toContainText("3 DT");
    await shot("conformite");
  });

  test("l'équipe et les marques sont listées, sans erreur côté navigateur", async () => {
    await open("/app/settings/team");
    await expect(page.getByText("salma.redaction@example.com")).toBeVisible();
    await open("/app/settings/brands");
    for (const brand of BRANDS) await expect(page.getByText(brand.name).first()).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("la recherche retrouve les passages de la base de connaissances", async () => {
    await useBrand("Maison Yasmina");
    await open("/app/knowledge");
    const input = page.locator("main form input");
    await input.fill("couscous mérou");
    await input.press("Enter");
    await expect(page.locator("main")).toContainText("42 DT");
  });
});
