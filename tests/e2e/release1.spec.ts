import { expect, test, type Page } from "@playwright/test";
import { samplePdf } from "../support/sample-files";

/**
 * Parcours de la Release 1 : inscription, onboarding, base de connaissances,
 * connexions, stratégie, calendrier, publication, studio, équipe, cloisonnement.
 */

const SHOTS = process.env.E2E_SCREENSHOTS;
const stamp = Date.now();
const owner = { name: "Leila Trabelsi", email: `leila.${stamp}@example.com`, password: "motdepasse-solide" };
const intruder = { name: "Karim Intrus", email: `karim.${stamp}@example.com`, password: "motdepasse-solide" };

async function shot(page: Page, name: string, fullPage = true) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage });
}

async function signUp(page: Page, user: typeof owner) {
  await page.goto("/signup");
  await page.getByLabel("Nom complet").fill(user.name);
  await page.getByLabel("Adresse e-mail").fill(user.email);
  await page.getByLabel("Mot de passe").fill(user.password);
  await page.getByRole("button", { name: "Créer mon compte" }).click();
  await page.waitForURL(/\/app/);
}

test.describe.serial("Release 1", () => {
  let page: Page;
  let postUrl = "";

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
  });

  test("page d'accueil en français, en anglais et en arabe (droite à gauche)", async () => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await shot(page, "01-landing-fr");

    await page.goto("/ar");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.locator("html")).toHaveAttribute("lang", "ar");
    await shot(page, "02-landing-ar", false);

    await page.goto("/en/login");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    // La langue visitée est mémorisée : le reste du parcours repart du français.
    await page.context().clearCookies();
  });

  test("une page protégée renvoie vers la connexion", async () => {
    await page.goto("/app/strategy");
    await page.waitForURL(/\/login/);
    await shot(page, "03-login");
  });

  test("inscription : l'espace est créé, l'onboarding démarre", async () => {
    await signUp(page, owner);
    await page.waitForURL(/\/app\/onboarding/);
    await expect(page.getByText("Votre marque", { exact: true })).toBeVisible();
    await shot(page, "04-onboarding");
  });

  test("onboarding : questionnaire puis génération de l'ADN", async () => {
    await page.getByLabel("Nom de la marque").fill("Café Sidi Bou");
    await page.getByRole("button", { name: "Continuer" }).click();

    await expect(page.getByRole("heading", { name: "Votre activité" })).toBeVisible();
    await page.getByRole("combobox", { name: "Dans quel secteur travaillez-vous ?" }).click();
    await page.getByRole("option", { name: "Café, salon de thé" }).click();
    await page.getByLabel("Que proposez-vous ?").fill("Café de spécialité et brunch le week-end.");
    await page.getByLabel("Qui sont vos clients ?").fill("Jeunes actifs du quartier.");
    await page.getByRole("button", { name: "Continuer" }).click();

    await expect(page.getByRole("heading", { name: "Vos objectifs et votre différence" })).toBeVisible();
    await page.getByRole("button", { name: "Fidéliser" }).click();
    await page.getByRole("button", { name: "Chaleureux" }).click();
    await page.getByLabel("Qu'est-ce qui vous rend différent ?").fill("Torréfaction sur place, terrasse avec vue");
    await shot(page, "05-onboarding-voice");
    await page.getByRole("button", { name: "Continuer" }).click();

    await expect(page.getByRole("heading", { name: "Votre style" })).toBeVisible();
    await page.getByLabel("Quels mots voulez-vous éviter ?").fill("pas cher");
    await page.getByLabel("Quels mots voulez-vous éviter ?").press("Enter");
    await page.getByRole("button", { name: "Continuer" }).click();

    await page.getByRole("button", { name: "Générer mon ADN de marque" }).click();
    await page.waitForURL(/\/app\/brand/);
    await expect(page.getByText("pas cher")).toBeVisible();
    await shot(page, "06-brand-dna");
  });

  test("ADN : chaque modification crée une version, la restauration aussi", async () => {
    await page.getByLabel("Ton", { exact: true }).fill("Chaleureux et précis");
    await page.getByRole("button", { name: "Enregistrer une nouvelle version" }).click();
    await expect(page.getByText("Nouvelle version enregistrée")).toBeVisible();
    await page.getByRole("tab", { name: "Historique" }).click();
    await expect(page.getByText("v2", { exact: true })).toBeVisible();
    await shot(page, "07-brand-history");
    await page.getByRole("button", { name: "Restaurer" }).first().click();
    await expect(page.getByText("v3", { exact: true })).toBeVisible();
  });

  test("base de connaissances : indexation et recherche", async () => {
    await page.goto("/app/knowledge");
    await page.getByRole("button", { name: "Ajouter" }).click();
    await page.getByRole("tab", { name: "Texte" }).click();
    await page.getByLabel("Titre").fill("Carte du café");
    await page.getByLabel("Contenu").fill("Brunch du dimanche : 35 DT par personne. Espresso : 3 DT. Ouvert de 8h à 22h30.");
    await page.getByRole("dialog").getByRole("button", { name: "Ajouter" }).click();
    await expect(page.getByText("Carte du café")).toBeVisible();

    await expect(async () => {
      await page.reload();
      await expect(page.getByText("Indexé", { exact: true })).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 30_000 });

    await page.getByRole("textbox", { name: "Tester la recherche" }).fill("prix du brunch");
    await page.getByRole("button", { name: "Tester la recherche" }).click();
    await expect(page.getByText("35 DT par personne")).toBeVisible();
    await shot(page, "08-knowledge");

    // Fichier réel : envoi direct au stockage, relecture serveur, extraction du PDF.
    await page.getByRole("button", { name: "Ajouter" }).click();
    await page.locator('input[type="file"]').setInputFiles({ name: "tarifs.pdf", mimeType: "application/pdf", buffer: samplePdf("Livraison gratuite des 40 DT") });
    await expect(page.getByText("tarifs.pdf")).toBeVisible();
    await expect(async () => {
      await page.reload();
      await expect(page.getByText("Indexé", { exact: true })).toHaveCount(2, { timeout: 2000 });
    }).toPass({ timeout: 30_000 });
    await page.getByRole("textbox", { name: "Tester la recherche" }).fill("livraison gratuite");
    await page.getByRole("button", { name: "Tester la recherche" }).click();
    await expect(page.getByText("Livraison gratuite des 40 DT").first()).toBeVisible();
  });

  test("actualités : signaler une promotion", async () => {
    await page.goto("/app/news");
    await page.getByRole("button", { name: "Signaler une actualité" }).first().click();
    await page.getByLabel("Titre").fill("Menu spécial Black Friday");
    await page.getByLabel("Détails").fill("Réduction de 20 % sur le brunch.");
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page.getByText("Menu spécial Black Friday")).toBeVisible();
    await shot(page, "09-news");
  });

  test("connexions : comptes bac à sable, état affiché", async () => {
    await page.goto("/app/connections");
    await expect(page.getByText("Mode bac à sable")).toBeVisible();
    await page.getByRole("button", { name: "Connecter" }).first().click();
    await expect(page.getByText("Page de démonstration")).toBeVisible();
    await page.getByRole("button", { name: "Connecter" }).nth(1).click();
    await expect(page.getByText("compte.demo")).toBeVisible();
    await shot(page, "10-connections");
  });

  test("stratégie puis calendrier du mois", async () => {
    await page.goto("/app/strategy");
    await page.getByRole("button", { name: "Générer la stratégie" }).click();
    await expect(page.getByRole("heading", { name: "Piliers de contenu" })).toBeVisible();
    await shot(page, "11-strategy");

    await page.getByRole("link", { name: "Voir le calendrier" }).click();
    await page.waitForURL(/\/app\/calendar/);
    await page.getByRole("button", { name: "Générer le calendrier" }).click();
    await expect(page.getByRole("button", { name: "Régénérer une partie" })).toBeVisible();
    await shot(page, "12-calendar");
  });

  test("régénération partielle : une idée verrouillée ne bouge pas", async () => {
    const firstChip = page.locator("button", { hasText: /:/ }).filter({ has: page.locator("span.line-clamp-2") }).first();
    const lockedTitle = await firstChip.innerText();
    await firstChip.click();
    await page.getByRole("button", { name: "Verrouiller cette idée" }).click();
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page.getByText("Idée enregistrée")).toBeVisible();

    await page.getByRole("button", { name: "Régénérer une partie" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Régénérer" }).click();
    await expect(page.getByText("Idées régénérées")).toBeVisible();
    await expect(page.getByRole("button", { name: lockedTitle.trim() }).first()).toBeVisible();
  });

  test("publication : génération en flux, trois variantes, score de conformité", async () => {
    await page.goto("/app/content/new");
    await page.getByLabel("De quoi voulez-vous parler ?").fill("Notre brunch du dimanche");
    await page.getByRole("button", { name: "Générer trois variantes" }).click();
    await page.waitForURL(/\/app\/content\/[0-9a-f-]{36}/, { timeout: 60_000 });
    postUrl = page.url();

    await expect(page.getByRole("tab", { name: /Variante A/ })).toBeVisible();
    await expect(page.getByRole("tab", { name: /Variante C/ })).toBeVisible();
    await expect(page.getByLabel("Texte", { exact: true })).toHaveValue(/brunch/i);
    await shot(page, "13-post-editor");
  });

  test("conformité : un prix inventé et un mot à éviter sont signalés", async () => {
    await page.getByLabel("Texte", { exact: true }).fill("Le brunch est à 99 DT, vraiment pas cher !");
    await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
    await expect(page.getByText("Information absente de la base de connaissances")).toBeVisible();
    await expect(page.getByText("Mot à éviter")).toBeVisible();
    await shot(page, "14-compliance-alerts");

    await page.getByLabel("Texte", { exact: true }).fill("Le brunch est à 35 DT, venez le goûter.");
    await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
    await expect(page.getByText("Aucune alerte sur cette variante.")).toBeVisible();
  });

  test("studio : gabarit, aperçu, export JPEG joint à la publication", async () => {
    await page.goto(`${postUrl.replace(/.*\/content\//, "/app/studio?post=")}`);
    await page.getByLabel("Titre", { exact: true }).fill("Le brunch revient");
    await expect(page.getByRole("img", { name: "Aperçu du visuel" })).toBeVisible();
    await page.getByRole("button", { name: "Ajouter", exact: true }).click();
    await page.getByLabel("Titre", { exact: true }).fill("Chaque dimanche");
    await page.waitForTimeout(800);
    await shot(page, "15-studio");

    // Photo de l'entreprise : import, conversion JPEG, utilisation comme fond.
    await page.getByRole("tab", { name: "Vos photos" }).click();
    await page.locator('input[type="file"]').setInputFiles({ name: "terrasse.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64") });
    await expect(page.getByRole("button", { name: "Photo", exact: true })).toHaveAttribute("aria-pressed", "true");
    await page.waitForTimeout(1200);
    await shot(page, "15b-studio-photo");
    await page.getByRole("button", { name: "Exporter et joindre à la publication" }).click();
    await expect(page.getByText(/images? prêtes?/)).toBeVisible({ timeout: 60_000 });

    await page.goto(postUrl);
    await expect(page.getByText("Aucun visuel associé.")).toHaveCount(0);
    await shot(page, "16-post-with-visual");
  });

  test("publication immédiate sur le compte bac à sable", async () => {
    await page.getByRole("button", { name: "Publier sur un compte de test" }).click();
    await page.getByRole("button", { name: "Publier maintenant" }).click();
    await expect(page.getByText("Publication envoyée")).toBeVisible();
    await page.goto("/app/connections");
    await expect(page.getByText("Réussie")).toBeVisible();
  });

  test("équipe : invitation par lien, marques, tableau de bord", async () => {
    await page.goto("/app/settings/team");
    await page.getByRole("button", { name: "Inviter" }).click();
    await page.getByLabel("Adresse e-mail").fill(`editrice.${stamp}@example.com`);
    await page.getByRole("button", { name: "Envoyer l'invitation" }).click();
    await expect(page.getByLabel("Lien d'invitation")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByText("Invitations en attente")).toBeVisible();
    await shot(page, "17-team");

    await page.goto("/app/settings/brands");
    await expect(page.getByText("Café Sidi Bou").first()).toBeVisible();
    await shot(page, "18-brands");

    await page.goto("/app");
    await expect(page.getByText("Mise en route")).toBeVisible();
    await shot(page, "19-dashboard");
  });

  test("affichage mobile (360 px) et interface arabe", async () => {
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto("/app");
    await expect(page.getByText("Mise en route")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await shot(page, "20-mobile-dashboard");

    await page.goto("/app/calendar");
    await expect(page.getByRole("heading", { name: "Calendrier éditorial" })).toBeVisible();
    await expect(page.getByText("Nos produits").first()).toBeVisible();
    const calendarOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(calendarOverflow).toBeLessThanOrEqual(1);
    await shot(page, "21-mobile-calendar");

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/ar/app");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await page.waitForLoadState("networkidle");
    await shot(page, "22-dashboard-ar");
    await page.goto("/ar/app/calendar");
    await page.waitForLoadState("networkidle");
    await shot(page, "23-calendar-ar");
    await page.goto(postUrl.replace(/\/app\//, "/ar/app/"));
    await expect(page.getByRole("tab", { name: "Instagram" })).toBeVisible();
    await page.waitForLoadState("networkidle");
    await shot(page, "24-editor-ar");
  });

  test("cloisonnement : un autre client n'accède pas à cette publication", async ({ browser }) => {
    const context = await browser.newContext();
    const other = await context.newPage();
    await signUp(other, intruder);
    // Avec une marque à lui, l'intrus atteint vraiment la lecture de la publication.
    await other.getByLabel("Nom de la marque").fill("Intrus SARL");
    await other.getByRole("button", { name: "Continuer" }).click();
    await expect(other.getByRole("heading", { name: "Votre activité" })).toBeVisible();

    await other.goto(postUrl);
    await expect(other.getByText("Page introuvable")).toBeVisible();
    await expect(other.getByText("Notre brunch du dimanche")).toHaveCount(0);
    await context.close();
  });
});
