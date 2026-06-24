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

async function scrapeJobsForQuery(query, page) {
  const jobs = [];

  for (let p = 0; p < PAGES; p++) {
    const start = p * 25;
    const url = `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(query)}&geoId=${GEO_ID}&location=${encodeURIComponent(LOCATION_TEXT)}&f_TPR=r86400${start > 0 ? `&start=${start}` : ""}`;
    console.log(`  Pagina ${p + 1}...`);

    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
    } catch {
      if (p === 0) return jobs;
      continue;
    }

    try {
      await page.waitForSelector(".job-card-container", { timeout: 8000 });
    } catch {
      break;
    }

    // Quick scroll to load cards
    const scrollContainer = page.locator(".scaffold-layout__list > div").first();
    for (let i = 0; i < 5; i++) {
      await scrollContainer.evaluate((el) => el.scrollBy(0, 400), { timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(500).catch(() => {});
    }

    const cards = page.locator(".job-card-container");
    let total = await cards.count().catch(() => 0);
    if (total === 0) break;
    total = Math.min(total, MAX_CARDS);

    for (let i = 0; i < total; i++) {
      try {
        await cards.nth(i).scrollIntoViewIfNeeded();
        await cards.nth(i).click();
        await page.waitForTimeout(1500);

        let cardTitle = "", cardCompany = "", cardLocation = "", cardUrl = "";
        try {
          cardTitle = (await cards.nth(i).locator("a.job-card-container__link span[aria-hidden='true']").innerText()) || "";
          cardCompany = (await cards.nth(i).locator(".artdeco-entity-lockup__subtitle span").innerText()) || "";
          cardLocation = (await cards.nth(i).locator(".job-card-container__metadata-wrapper li span").innerText()) || "";
          cardUrl = (await cards.nth(i).locator("a.job-card-container__link").getAttribute("href")) || "";
        } catch { continue; }

        const details = await page.evaluate(() => {
          const pane = document.querySelector(".jobs-search__job-details--wrapper");
          if (!pane) return {};

          const skills = [];
          const descEl = pane.querySelector(".jobs-description__content, .jobs-box__html-content");
          if (descEl) {
            for (const ul of descEl.querySelectorAll("ul")) {
              for (const li of ul.querySelectorAll("li")) {
                const t = li.innerText.trim();
                if (t) skills.push(t);
              }
            }
          }

          let posted = "";
          for (const s of pane.querySelectorAll("span")) {
            const t = s.innerText.toLowerCase().trim();
            if (t.includes("ago") || t.includes("hace") || t.includes("repost") || t.includes("publicado")) {
              const c = s.innerText.trim();
              if (!posted || c.length < posted.length) posted = c;
            }
          }

          let easyApply = false;
          for (const b of pane.querySelectorAll("button, a")) {
            const t = b.innerText.trim().toLowerCase();
            if (t === "apply" || t === "apply now" || t === "solicitar" || t === "solicitar ahora" || t.includes("easy apply")) {
              easyApply = t.includes("easy apply") || t.includes("solicitud rápida") || t.includes("solicitar rápido");
              break;
            }
          }

          return { posted, easyApply, description: descEl?.innerText?.trim() || "", skills };
        });

        const fullLinkedInUrl = cardUrl.startsWith("http") ? cardUrl : `https://www.linkedin.com${cardUrl}`;
        const category = QUERY_CATEGORY[query] || query;
        jobs.push({
          title: cardTitle,
          company: cardCompany,
          location: cardLocation,
          url: fullLinkedInUrl,
          postedDate: parseRelativeTime(details.posted),
          scrapedAt: new Date().toISOString(),
          skills: details.skills || [],
          description: details.description || "",
          easyApply: details.easyApply || false,
          category,
        });
      } catch (err) {
        console.log(`  Error card ${i}: ${err.message.slice(0, 60)}`);
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

  for (const query of QUERIES) {
    console.log(`\n--- ${query} ---`);
    try { await context.pages(); } catch { break; }
    const jobs = await scrapeJobsForQuery(query, page);
    let nuevos = 0;
    for (const job of jobs) {
      if (!seen.has(job.url)) {
        seen.add(job.url);
        allJobs.push(job);
        nuevos++;
      }
    }
    console.log(`  ${jobs.length} encontradas, ${nuevos} nuevas`);
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
  const urls = new Set(cumulative.map((j) => j.url));
  let appended = 0;
  for (const job of todayFiltered) {
    if (!urls.has(job.url)) {
      urls.add(job.url);
      cumulative.push(job);
      appended++;
    }
  }
  cumulative.sort((a, b) => (b.postedDate || "").localeCompare(a.postedDate || ""));
  fs.writeFileSync(filteredPath, JSON.stringify(cumulative, null, 2));
  console.log(`  ${todayFiltered.length} hoy, ${appended} nuevas en histórico → ${cumulative.length} totales`);

  console.log(`\n✅ ${allJobs.length} vacantes guardadas → jobs.json`);

  await context.storageState({ path: STATE_FILE }).catch(() => {});
  await browser.close().catch(() => {});
})();
