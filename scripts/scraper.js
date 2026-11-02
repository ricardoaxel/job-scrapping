const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

function parseRelativeTime(text) {
  if (!text) return "";
  const t = text.toLowerCase().trim();
  const now = Date.now();
  const patterns = [
    [/(\d+)\s*(?:minute|minuto)s?\s*(?:ago|atrás|hace)/, 60 * 1000],
    [/(\d+)\s*(?:hour|hora)s?\s*(?:ago|atrás|hace)/, 3600 * 1000],
    [/(\d+)\s*(?:day|día|dia)s?\s*(?:ago|atrás|hace)/, 86400 * 1000],
    [/(\d+)\s*(?:week|semana)s?\s*(?:ago|atrás|hace)/, 7 * 86400 * 1000],
    [/(\d+)\s*(?:month|mes|mese)s?\s*(?:ago|atrás|hace)/, 30 * 86400 * 1000],
  ];
  for (const [re, mul] of patterns) {
    const m = t.match(re);
    if (m) {
      const val = parseInt(m[1]);
      return new Date(now - val * mul).toISOString();
    }
  }
  return "";
}

const ROOT = path.resolve(__dirname, "..");
const STATE_FILE = path.join(ROOT, "linkedin-state.json");
const GEO_ID = "103323778";
const LOCATION_TEXT = "Ciudad de México";
const MODE = process.env.MODE || "full";

const QUERY_CATEGORY = {
  "marketing intern": "Marketing Intern",
  "growth marketing": "Growth Marketing",
  "content marketing": "Content Marketing",
  "customer success": "Customer Success",
  "marketing jr": "Marketing Jr",
  "crm marketing": "CRM Marketing",
  "email marketing": "Email Marketing",
  "social media marketing": "Social Media Marketing",
};

const QUERIES = MODE === "test"
  ? ["marketing intern"]
  : [
      "marketing intern",
      "growth marketing",
      "content marketing",
      "customer success",
      "marketing jr",
      "crm marketing",
      "email marketing",
      "social media marketing",
    ];

const PAGES = 2;
const MAX_CARDS = 12;

const CARD_SELECTOR = '[componentkey^="job-card-component-ref-"]';

function parseCardText(text) {
  const lines = text
    .split("\n")
    .map((s) => s.trim().replace(/\s*\((?:verified job|empleo verificado)\)\s*$/i, ""))
    .filter(Boolean)
    .filter((l, i, arr) => l !== arr[i - 1]);
  const locationLine = lines.find((l) => /\(([^)]*(hybrid|on-?site|remote|híbrido|presencial|remoto)[^)]*)\)/i.test(l));
  return {
    title: lines[0] || "",
    company: lines[1] || "",
    location: locationLine || lines[2] || "",
  };
}

async function scrapeJobsForQuery(query, page) {
  const jobs = [];

  for (let p = 0; p < PAGES; p++) {
    const start = p * 25;
    const url = `https://www.linkedin.com/jobs/search-results/?keywords=${encodeURIComponent(query)}&geoId=${GEO_ID}&location=${encodeURIComponent(LOCATION_TEXT)}&f_TPR=r86400${start > 0 ? `&start=${start}` : ""}`;
    console.log(`  Pagina ${p + 1}...`);

    await page.goto(url, { waitUntil: "commit", timeout: 20000 }).catch(() => {});

    try {
      await page.waitForSelector(CARD_SELECTOR, { timeout: 20000 });
    } catch {
      console.log("  Sin tarjetas (sesión inválida o UI cambiada)");
      break;
    }

    const cards = await page.evaluate((sel) => {
      const seen = new Set();
      const out = [];
      for (const el of document.querySelectorAll(sel)) {
        const id = (el.getAttribute("componentkey") || "").replace("job-card-component-ref-", "");
        if (!id || seen.has(id)) continue;
        seen.add(id);
        out.push({ id, text: el.innerText });
      }
      return out;
    }, CARD_SELECTOR);
    if (cards.length === 0) break;

    for (const { id: jobId, text: cardText } of cards.slice(0, MAX_CARDS)) {
      try {
        const { title, company, location } = parseCardText(cardText);
        if (!title || !company) continue;

        const card = page.locator(`${CARD_SELECTOR}[componentkey="job-card-component-ref-${jobId}"]:visible`).first();
        await card.locator("p").first().click({ timeout: 5000 }).catch(() => card.click({ timeout: 5000 }));
        await page.waitForSelector(`[id^="JobDetails_AboutTheJob_${jobId}"]`, { timeout: 6000 }).catch(() => {});
        await page.waitForTimeout(800);

        const details = await page.evaluate((id) => {
          const sections = [...document.querySelectorAll('[id^="JobDetails_AboutTheJob_"]')];
          const section = sections.find((s) => s.id.endsWith(id)) || sections[0];
          const descEl = section?.querySelector('[data-testid="expandable-text-box"]');
          const skills = [];
          if (descEl) {
            for (const li of descEl.querySelectorAll("li")) {
              const t = li.innerText.trim();
              if (t) skills.push(t);
            }
          }

          let posted = "";
          if (section) {
            const chain = new Set();
            for (let p = section; p; p = p.parentElement) chain.add(p);
            let best = null;
            let bestSteps = Infinity;
            for (const el of document.querySelectorAll("span, strong, p")) {
              const t = (el.innerText || "").trim();
              if (!/(?:reposted|posted|publicado|publicado hace|hace)\b/i.test(t) || t.length > 80) continue;
              let steps = 0;
              let a = el;
              while (a && !chain.has(a)) { a = a.parentElement; steps++; }
              if (a && steps < bestSteps) { best = t; bestSteps = steps; }
            }
            posted = best || "";
          }

          return { description: descEl?.innerText?.trim() || "", skills, posted };
        }, jobId);

        const postedMatch = cardText.match(/(?:reposted|posted|publicado|republicado)[^\n]*/i);
        const category = QUERY_CATEGORY[query] || query;
        jobs.push({
          title,
          company,
          location,
          url: `https://www.linkedin.com/jobs/view/${jobId}/`,
          postedDate: parseRelativeTime(postedMatch?.[0] || details.posted || cardText),
          scrapedAt: new Date().toISOString(),
          skills: details.skills || [],
          description: details.description || "",
          easyApply: /easy apply|solicitud rápida|solicitar rápido/i.test(cardText),
          category,
        });
      } catch (err) {
        console.log(`  Error card ${jobId}: ${err.message.slice(0, 60)}`);
      }
    }
  }

  return jobs;
}

(async () => {
  if (!fs.existsSync(STATE_FILE)) {
    console.error(`No se encontró ${STATE_FILE}. Primero corre: npm run login`);
    process.exit(1);
  }

  console.log(`Modo: ${MODE === "test" ? "TEST" : "FULL (" + QUERIES.length + " categorías)"}`);

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ storageState: STATE_FILE });
  const page = await context.newPage();

  const seen = new Set();
  let allJobs = [];

  function baseUrl(url) {
    try { return new URL(url).origin + new URL(url).pathname; } catch { return url; }
  }

  const CATEGORY_TIMEOUT = 7 * 60 * 1000; // 7 minutes per category
  const results = {};

  for (const query of QUERIES) {
    console.log(`\n--- ${query} ---`);
    try { await context.pages(); } catch { break; }
    
    let jobs = [];
    let hadError = false;
    const startTime = Date.now();
    try {
      jobs = await Promise.race([
        scrapeJobsForQuery(query, page),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), CATEGORY_TIMEOUT))
      ]);
    } catch (err) {
      hadError = true;
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      console.log(`  ⚠️ Error después de ${elapsed}s: ${err.message === 'Timeout' ? 'se excedió el tiempo máximo (7 min)' : err.message.slice(0, 60)}`);
    }
    
    let nuevos = 0;
    for (const job of jobs) {
      if (!seen.has(baseUrl(job.url))) {
        seen.add(baseUrl(job.url));
        allJobs.push(job);
        nuevos++;
      }
    }
    console.log(`  ${jobs.length} encontradas, ${nuevos} nuevas`);
    results[query] = { found: jobs.length, error: hadError };
  }

  // Summary
  const errors = Object.entries(results).filter(([, r]) => r.error);
  if (errors.length > 0) {
    console.log(`\n⚠️  Error en ${errors.length} categoría${errors.length > 1 ? 's' : ''}:`);
    errors.forEach(([q]) => console.log(`   - ${q}: 0 encontradas (timeout o error)`));
    const ok = Object.entries(results).filter(([, r]) => !r.error);
    console.log(`✅ Categorías exitosas (${ok.length}):`);
    ok.forEach(([q, r]) => console.log(`   - ${q}: ${r.found} encontradas`));
  } else {
    console.log(`\n✅ Todas las categorías completadas sin errores`);
  }

  await page.close().catch(() => {});

  fs.writeFileSync(path.join(ROOT, "jobs.json"), JSON.stringify(allJobs, null, 2));

  console.log("\n🔍 Ejecutando filtro...");
  let todayFiltered;
  try {
    const out = execSync(`python3 "${path.join(__dirname, "filter.py")}"`);
    todayFiltered = JSON.parse(out.toString());
  } catch (e) {
    console.error("Error en filtro:", e.message);
    todayFiltered = [];
  }

  // Append to cumulative filtered_jobs.json (dedup by URL)
  const filteredPath = path.join(ROOT, "filtered_jobs.json");
  let cumulative = [];
  if (fs.existsSync(filteredPath)) {
    try {
      cumulative = JSON.parse(fs.readFileSync(filteredPath, "utf-8"));
    } catch {}
  }
  const urls = new Set(cumulative.map((j) => baseUrl(j.url)));
  let appended = 0;
  for (const job of todayFiltered) {
    if (!urls.has(baseUrl(job.url))) {
      urls.add(baseUrl(job.url));
      cumulative.push(job);
      appended++;
    }
  }
  cumulative.sort((a, b) => (b.postedDate || "").localeCompare(a.postedDate || ""));
  fs.writeFileSync(filteredPath, JSON.stringify(cumulative, null, 2));
  console.log(`  ${todayFiltered.length} hoy, ${appended} nuevas en histórico → ${cumulative.length} totales`);

  console.log(`\n✅ ${allJobs.length} vacantes guardadas → jobs.json`);

  await Promise.race([
    context.storageState({ path: STATE_FILE }).catch(() => {}),
    new Promise((r) => setTimeout(r, 8000)),
  ]);
  await Promise.race([
    browser.close().catch(() => {}),
    new Promise((r) => setTimeout(r, 8000)),
  ]);
  process.exit(0);
})();
