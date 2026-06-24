const { chromium } = require("playwright");
const fs = require("fs");

const STATE_FILE = "linkedin-state.json";

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto("https://www.linkedin.com/login", { waitUntil: "domcontentloaded" });

  console.log(" LinkedIn login. Inicia sesión y resuelve cualquier verificación.");
  console.log("El navegador se cerrará solo cuando detecte la sesión activa.\n");

  // Poll every 2s checking if li_at cookie exists
  while (true) {
    const cookies = await context.cookies();
    const hasLiAt = cookies.some(c => c.name === "li_at");
    if (hasLiAt) break;
    await page.waitForTimeout(2000);
  }

  // Visit jobs page after login to fully initialize session (localStorage, etc.)
  await page.goto("https://www.linkedin.com/jobs/search/?keywords=marketing&geoId=103323778", { waitUntil: "domcontentloaded", timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(3000);

  await context.storageState({ path: STATE_FILE });

  console.log(`\n Sesión guardada en ${STATE_FILE}`);
  console.log(`Cookies: ${(await context.cookies()).length} | Token li_at: SÍ`);
  console.log(" LinkedIn session lista!");

  await browser.close();
})();
