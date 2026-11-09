import { defineConfig, devices } from "@playwright/test";

const SUPABASE_PORT = 54399;
const APP_PORT = 3100;
// Même nom d'hôte partout : sinon la réécriture de langue de Next.js part en boucle.
const baseURL = `http://localhost:${APP_PORT}`;

// Parcours complet sans Docker ni compte Cloud : voir tests/support/fake-supabase.mjs.
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 180_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: { baseURL, trace: "retain-on-failure", locale: "fr-FR", timezoneId: "Africa/Tunis" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], channel: "chromium", viewport: { width: 1440, height: 900 } } }],
  webServer: [
    {
      command: "node tests/support/fake-supabase.mjs",
      url: `http://127.0.0.1:${SUPABASE_PORT}/health`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `npx next build && npx next start --port ${APP_PORT}`,
      url: `${baseURL}/robots.txt`,
      reuseExistingServer: false,
      timeout: 540_000,
      env: {
        NEXT_DIST_DIR: ".next-e2e",
        NEXT_PUBLIC_APP_URL: baseURL,
        NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${SUPABASE_PORT}`,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "fake-anon-key",
        SUPABASE_SERVICE_ROLE_KEY: "fake-service-key",
        AI_PROVIDER: "demo",
        META_APP_ID: "",
        META_APP_SECRET: "",
        EMBEDDING_BASE_URL: "",
        IMAGE_BASE_URL: "",
        RESEND_API_KEY: "",
      },
    },
  ],
});
