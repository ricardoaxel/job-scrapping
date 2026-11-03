# Pipeline de Scraping y Generación de CVs

## 1. Scraping

```bash
node scripts/scraper.js
```

- Scraps LinkedIn marketing jobs in Mexico City using 18 search queries (marketing general, performance/paid, SEO, brand, product, analytics, martech, ecommerce, social)
- Saves raw results to `jobs.json` (143 jobs typical with working account)
- Runs `scripts/filter.py` automatically at the end
- **Session**: uses `li_at` token from `linkedin-state.json` for authenticated access
- **Login refresh** if session expired: `node scripts/login.js`
- Original LinkedIn account is the only reliable one (~143-191 jobs); other accounts get 0-19

## 2. Filtrado (automático tras scrape + manual review)

`scripts/filter.py` filters by:
- **Location**: CDMX, Edomex, Área Metropolitana, Remote (for CDMX)
- **Experience**: ≤3 years
- **Relevance**: exclude dev, call center, accounting, economics, etc.
- **Company**: exclude staffing agencies (mannpower, adecco, etc.)
- Output: cumulative `filtered_jobs.json` (append + dedup by URL)

**Manual review always recommended** — the filter is a heuristic; check for edge cases.

**Language detection**: `filter.py` automatically detects if each job is in Spanish or English (field `"language": "es"` or `"en"`) based on character and word analysis. 24 EN / 14 ES in current dataset.

## 3. Reconstruir Skills por Categoría

```bash
python3 scripts/build_skill_per_category.py
```

- Reads `jobs.json` → extracts tools/methodologies/competencies per category
- Preserves existing categories from `skill_per_category.json` not in current scrape
- Output: `cvs/skill_per_category.json` (8 categories: Marketing Intern, Growth Marketing, Content Marketing, Customer Success, Marketing Jr, CRM Marketing, Email Marketing, Social Media Marketing)

Run this after every scrape to keep skills up to date.

## 4. Generar CVs por Categoría (AI step)

For each of the 8 categories, create a tailored Markdown CV in `cvs/Generated/<Category>/`.

**Spanish versions**: create `*_es.md` files alongside English ones. Use Spanish headers: `## Resumen Profesional`, `## Experiencia Profesional`, `## Educación`, `## Habilidades`, `## Competencias`, `## Idiomas`.

### Rules (from `skills/generate-cvs/skill.md`):

**Estructura**: Same as `cvs/base-cv.md` (header + summary + experience + education + skills + competencies + languages)

**Summary**: focused on the category — highlight relevant tools, industries, and strengths. No fluff.

**Experience bullets**: max 6 per role. Filter/reframe from base-cv.md content only. No invented experience. Prioritize bullets most relevant to the category.

**Skills**: 4-5 lines grouped by relevance to category. Use `- **Label:** items` format.

**Competencies**: 3-5 bullets. Soft skills relevant to the category.

**Education & Languages**: unchanged from base-cv.md.

**Naming**: `CV_Valeria_Paez_Reyes_<Category>.md` (Category with spaces replaced by `_`). Spanish versions: add `_es` suffix before `.md`.

## 5. Generar CV General (sin discriminación por categoría)

El CV General es una copia directa de `base-cv.md` sin filtros ni adaptaciones. Se usa como versión completa de referencia.

```bash
cp cvs/base-cv.md "cvs/Generated/General/CV_Valeria_Paez_Reyes_General.md"
```

No requiere intervención de AI — solo copiar y formatear.

## 6. Formatear CVs (DOCX + PDF)

```bash
python3 scripts/generate_all_cvs.py
```

Scans `cvs/Generated/*/` for `.md` files and runs `generate_cv.py` on each:

- **DOCX**: generated from `cvs/WordTemplate.docx` template with `keep_with_next` on headers
- **`_simple.pdf`**: via md-bookify (minimal, LLM-friendly metadata)
- **`_styled.pdf`**: via pandoc → CSS → Playwright (Times font, page-break control, human-friendly)

Output files land in each category folder alongside the MD.

**Tips:**
- Para regenerar solo el General tras editar `base-cv.md`: copia el MD y corre `generate_all_cvs.py`.
- `generate_all_cvs.py` procesa todos los folders que tengan `.md`; si un folder tiene solo DOCX/PDF sin `.md`, se salta.

## 7. Lenguaje de CVs (ES/EN)

- `generate_cv.py` soporta `--lang es` para usar headers en español y sufijo `_es` en los archivos generados
- `generate_all_cvs.py` detecta archivos `_es.md` en los folders y pasa `--lang es` automáticamente
- `filter.py` detecta idioma de cada trabajo (campo `"language": "es"` o `"en"`) usando análisis de caracteres y palabras clave
- El sitio web muestra los CVs que coinciden con el idioma del trabajo

## 8. Dashboard Web (GitHub Pages)

El sitio es una SPA en `site/` (index.html + style.css + app.js) desplegada en GitHub Pages:

- **URL**: `https://ricardoaxel.github.io/job-scrapping/`
- **Paginación**: 20 jobs por página
- **Búsqueda**: por texto en título/empresa/descripción
- **Filtros**: pills por categoría
- **Modal**: detalle del trabajo + botones de descarga de CV que coinciden con el idioma del trabajo
- **Badge**: muestra ES/EN en cada tarjeta de trabajo
- **Deploy**: GitHub Actions (`.github/workflows/deploy.yml`) — copia `site/`, `filtered_jobs.json`, `skill_per_category.json`, `cvs/Generated/` a `_site/` y despliega a Pages
- **Path dinámico**: `app.js` usa `BASE = window.location.pathname` para rutas correctas bajo `/job-scrapping/`

## 9. Archivos Sensibles (`.gitignore`)

El repositorio es público, así que `.gitignore` excluye:
- `linkedin-state.json` — sesión de LinkedIn (contiene `li_at` token)
- `node_modules/` — dependencias de Playwright
- `.DS_Store` — archivos del sistema macOS

## 10. CV Source of Truth

- `cvs/base-cv.md` — Valeria maintains this manually in English. All generated CVs derive from it.
- Contact info is parsed from the preamble (name, location, email, LinkedIn).
- Sections: Summary, Experience (3 jobs), Education, Skills, Competencies, Languages.
- Skills format: `- **Label:** description` (required by generate_cv.py parser).

## 8. Página de Insights de Mercado

`site/insights.html` es una subpágina con el análisis del dataset:

```bash
python3 scripts/build_insights.py
```

- Genera `insights.json` (índice compacto por vacante + skills extraídas + skills del CV base)
- La página calcula en el navegador: ventanas 7/30/90/12m/todo, comparación de periodos, rankings por categoría, modalidad, salario, tendencias y gaps vs `cvs/base-cv.md`
- Filtros globales opcionales: excluir empresas específicas y **cap por empresa** (máximo N roles únicos por empresa, seleccionando los más recientes; se aplica por vista y por periodo/mes para no sesgar las tendencias)
- Click en cualquier barra, segmento o punto de un gráfico abre un modal con las vacantes que lo componen (sin salir de la página), ordenadas por fecha y con filtros propios: búsqueda, categoría, modalidad, idioma, experiencia, fecha desde/hasta, Easy Apply, salario, orden y paginación
- Se regenera automáticamente al final de `scripts/scraper.js`
- Deploy: `.github/workflows/deploy.yml` copia `insights.json` a `_site/data/` y `site/insights.*` a `_site/`

## 9. Archivos Relevantes

| File | Purpose |
|------|---------|
| `scripts/scraper.js` | LinkedIn scraper (8 queries, 2 pages, 12 max cards) |
| `scripts/login.js` | LinkedIn login + session persistence |
| `scripts/filter.py` | Filter pipeline (location/exp/relevance/company/dedup) |
| `scripts/build_skill_per_category.py` | Extract skills from jobs.json → skill_per_category.json |
| `scripts/build_insights.py` | Extract per-job features from filtered_jobs.json → insights.json |
| `insights.json` | Compact insights dataset (jobs, skills, CV gap) for the Mercado page |
| `site/insights.html` / `.js` / `.css` | Market insights subpage |
| `scripts/generate_all_cvs.py` | Batch format all category CVs |
| `scripts/generate_cv.py` | Single CV formatter (MD → DOCX + 2 PDFs) |
| `cvs/base-cv.md` | Master CV (English, manual) |
| `cvs/base-cv-es.md` | Master CV (Spanish, manual) |
| `cvs/WordTemplate.docx` | DOCX formatting template (Spanish original) |
| `cvs/skill_per_category.json` | Skills/tools/methodologies per category (8 categories) |
| `linkedin-state.json` | Browser session (sensitive — do not commit) |
| `jobs.json` | Daily raw scrape (overwrite) |
| `filtered_jobs.json` | Cumulative filtered jobs (append + dedup) |
| `skills/generate-cvs/skill.md` | Detailed skill description for category CV generation |

## 9. Notes

- LinkedIn kills sessions after X interactions per account. Preserve the original session.
- Two PDF variants: `_simple` (md-bookify, LLM-friendly) and `_styled` (pandoc+Playwright, human-friendly).
- `generate_cv.py` template mapping is fixed-index based on WordTemplate.docx structure; if template changes, indices must be updated.

## 11. Sitio v2 (Vale OS)

- `site/index.html` + `site/v2.css` + `site/v2.js` — shell moderno con light/dark/system, navegación, dashboard, vacantes, mercado, empresas, aplicaciones, CV, recursos y ajustes.
- `scripts/build_v2.py` genera `data/v2/jobs.json` (índice compacto con familia de rol, seniority, relevancia, agencias, lifecycle y links de CV). Se ejecuta después de `build_insights.py` en cada scrape.
- Filtros por defecto: ventana 90 días, solo relevantes y solo empleadores directos (las agencias se pueden reactivar).
- Datos personales (tracker, búsquedas, XP, racha, tema) viven en `localStorage`; no hay backend.
- Deploy: `.github/workflows/deploy.yml` copia `data/v2` y `site/v2.*`.
