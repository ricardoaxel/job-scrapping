#!/usr/bin/env python3
"""Build the market-insights dataset consumed by site/insights.html.

Reads filtered_jobs.json, extracts structured features from every posting and
writes insights.json with a compact job index, taxonomy and the CV skill set.

The output is intentionally job-level (not pre-aggregated) so the page can
combine arbitrary time buckets, categories and modalities, and also show
comparisons and trends without shipping the full 25 MB dataset.
"""

import json
import os
import re
import statistics
import sys
import unicodedata
from collections import Counter
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
JOBS_PATH = os.path.join(ROOT, "filtered_jobs.json")
CV_PATH = os.path.join(ROOT, "cvs", "base-cv.md")
OUT_PATH = os.path.join(ROOT, "insights.json")


def norm(text):
    text = (text or "").lower()
    text = unicodedata.normalize("NFD", text)
    return "".join(c for c in text if unicodedata.category(c) != "Mn")


def rx(*patterns):
    return [re.compile(p, re.IGNORECASE) for p in patterns]


TAXONOMY = {
    "tools": {
        "Google Analytics (GA4)": rx(r"\bga4\b", r"google analytics"),
        "Google Ads": rx(r"google ads", r"\badwords\b"),
        "Meta Ads": rx(r"meta ads", r"facebook ads", r"instagram ads", r"meta business", r"ads manager"),
        "Meta Pixel": rx(r"meta pixel", r"facebook pixel"),
        "Google Search Console": rx(r"search console"),
        "Google Tag Manager": rx(r"google tag manager", r"\bgtm\b"),
        "Google Sheets": rx(r"google sheets", r"hojas de calculo"),
        "Excel": rx(r"\bexcel\b", r"microsoft excel"),
        "Looker Studio": rx(r"looker studio", r"\blooker\b", r"data studio"),
        "Tableau": rx(r"\btableau\b"),
        "Power BI": rx(r"power bi", r"\bpowerbi\b"),
        "SQL": rx(r"\bsql\b"),
        "Python": rx(r"\bpython\b"),
        "HTML/CSS": rx(r"\bhtml\b", r"\bcss\b"),
        "JavaScript": rx(r"javascript", r"\bjs\b"),
        "HubSpot": rx(r"hubspot"),
        "Salesforce": rx(r"salesforce"),
        "Salesforce Marketing Cloud": rx(r"marketing cloud", r"\bsfmc\b"),
        "Mailchimp": rx(r"mailchimp"),
        "Klaviyo": rx(r"klaviyo"),
        "Braze": rx(r"\bbraze\b"),
        "Marketo": rx(r"marketo"),
        "ActiveCampaign": rx(r"activecampaign", r"active campaign"),
        "GoHighLevel": rx(r"gohighlevel", r"highlevel"),
        "Semrush": rx(r"semrush"),
        "Ahrefs": rx(r"ahrefs"),
        "Screaming Frog": rx(r"screaming frog"),
        "Canva": rx(r"canva"),
        "Figma": rx(r"figma"),
        "Adobe Photoshop": rx(r"photoshop"),
        "Adobe Illustrator": rx(r"illustrator"),
        "Adobe Creative Suite": rx(r"adobe creative", r"creative suite", r"adobe suite"),
        "Premiere Pro": rx(r"premiere"),
        "CapCut": rx(r"capcut"),
        "TikTok Ads": rx(r"tiktok ads", r"tiktok shop", r"tiktok business"),
        "LinkedIn Ads": rx(r"linkedin ads", r"campaign manager"),
        "Shopify": rx(r"shopify"),
        "WordPress": rx(r"wordpress"),
        "Webflow": rx(r"webflow"),
        "Notion": rx(r"\bnotion\b"),
        "Asana": rx(r"\basana\b"),
        "Trello": rx(r"trello"),
        "Jira": rx(r"\bjira\b"),
        "ClickUp": rx(r"clickup"),
        "Monday.com": rx(r"monday\.com", r"monday com"),
        "Slack": rx(r"\bslack\b"),
        "Microsoft Teams": rx(r"microsoft teams", r"ms teams"),
        "Google Workspace": rx(r"google workspace", r"g suite"),
        "ChatGPT": rx(r"chatgpt", r"chat gpt"),
        "Claude": rx(r"\bclaude\b"),
        "Gemini": rx(r"\bgemini\b"),
        "Perplexity": rx(r"perplexity"),
        "Midjourney": rx(r"midjourney"),
        "Copilot": rx(r"\bcopilot\b"),
        "Synthesia": rx(r"synthesia"),
        "HeyGen": rx(r"heygen"),
        "ElevenLabs": rx(r"elevenlabs"),
        "Zapier": rx(r"zapier"),
        "Make / Integromat": rx(r"make\.com", r"integromat", r"\bn8n\b"),
        "DV360": rx(r"\bdv360\b", r"display & video 360", r"display and video 360"),
        "The Trade Desk": rx(r"the trade desk", r"trade desk"),
        "Google Merchant Center": rx(r"merchant center"),
        "Amazon Ads": rx(r"amazon ads", r"amazon advertising"),
        "Mercado Ads": rx(r"mercado ads", r"mercado libre ads"),
        "Criteo": rx(r"criteo"),
        "Programmatic": rx(r"programmatic", r"programatica"),
        "Bing Ads": rx(r"bing ads", r"microsoft advertising"),
        "Amplitude": rx(r"amplitude"),
        "Mixpanel": rx(r"mixpanel"),
        "Metabase": rx(r"metabase"),
        "Segment": rx(r"segment\.io", r"twilio segment"),
        "Iterable": rx(r"iterable"),
        "Twilio": rx(r"\btwilio\b"),
        "SendGrid": rx(r"sendgrid"),
        "SurveyMonkey": rx(r"surveymonkey"),
        "Qualtrics": rx(r"qualtrics"),
        "Calendly": rx(r"calendly"),
        "Pipedrive": rx(r"pipedrive"),
        "Zoho": rx(r"\bzoho\b"),
        "Odoo": rx(r"\bodoo\b"),
        "SAP": rx(r"\bsap\b"),
        "Oracle": rx(r"\boracle\b"),
        "Magento": rx(r"magento"),
        "WooCommerce": rx(r"woocommerce"),
        "After Effects": rx(r"after effects"),
        "InDesign": rx(r"indesign"),
        "Adobe XD": rx(r"adobe xd"),
        "Miro": rx(r"miro\.com", r"miro board", r"\bmiro\b"),
        "Loom": rx(r"\bloom\b"),
        "Descript": rx(r"\bdescript\b", r"descript\.com"),
        "PowerPoint": rx(r"powerpoint", r"power point"),
        "Zendesk": rx(r"zendesk"),
        "Intercom": rx(r"intercom"),
        "Freshdesk": rx(r"freshdesk"),
        "Amazon Seller Central": rx(r"seller central", r"amazon seller"),
        "Mercado Libre": rx(r"mercado libre", r"mercadolibre"),
        "WhatsApp Business": rx(r"whatsapp"),
        "Airtable": rx(r"airtable"),
        "Hootsuite": rx(r"hootsuite"),
        "Sprout Social": rx(r"sprout social"),
        "Hotjar": rx(r"hotjar"),
        "Optimizely": rx(r"optimizely"),
        "Unbounce": rx(r"unbounce"),
        "Typeform": rx(r"typeform"),
        "MailerLite": rx(r"mailerlite"),
        "Brevo": rx(r"\bbrevo\b"),
        "Pardot": rx(r"pardot"),
        "Microsoft Office": rx(r"microsoft office", r"office 365"),
    },
    "methods": {
        "SEO": rx(r"\bseo\b"),
        "SEM": rx(r"\bsem\b"),
        "PPC": rx(r"\bppc\b"),
        "Paid Media": rx(r"paid media", r"medios pagados"),
        "Paid Social": rx(r"paid social", r"social ads"),
        "Content Marketing": rx(r"content marketing", r"marketing de contenidos"),
        "Content Strategy": rx(r"content strategy", r"estrategia de contenido"),
        "Copywriting": rx(r"copywriting", r"redaccion publicitaria"),
        "Email Marketing": rx(r"email marketing", r"correo electronico", r"mailing"),
        "Marketing Automation": rx(r"marketing automation", r"automatizacion de marketing"),
        "Lead Generation": rx(r"lead generation", r"generacion de leads"),
        "Demand Generation": rx(r"demand generation"),
        "Inbound Marketing": rx(r"inbound marketing"),
        "Account-Based Marketing": rx(r"account[- ]based marketing", r"\babm\b"),
        "Growth Marketing": rx(r"growth marketing", r"growth hacking"),
        "Performance Marketing": rx(r"performance marketing"),
        "Affiliate Marketing": rx(r"affiliate marketing", r"marketing de afiliados"),
        "Influencer Marketing": rx(r"influencer marketing", r"marketing de influencia"),
        "Community Management": rx(r"community management", r"gestion de comunidad"),
        "Social Media Management": rx(r"social media management", r"gestion de redes"),
        "Brand Strategy": rx(r"brand strategy", r"estrategia de marca"),
        "Brand Identity": rx(r"brand identity", r"identidad de marca"),
        "Product Marketing": rx(r"product marketing"),
        "Product Launch": rx(r"product launch", r"lanzamiento de producto"),
        "Market Research": rx(r"market research", r"investigacion de mercado"),
        "Competitor Analysis": rx(r"competitor analysis", r"analisis de competencia"),
        "Customer Segmentation": rx(r"segmentation", r"segmentacion"),
        "CRM": rx(r"\bcrm\b"),
        "Customer Success": rx(r"customer success", r"exito del cliente"),
        "Customer Experience": rx(r"customer experience", r"\bcx\b"),
        "Retention": rx(r"retention", r"retencion"),
        "Churn": rx(r"\bchurn\b"),
        "Onboarding": rx(r"onboarding"),
        "Nurturing": rx(r"nurturing", r"nutricion de leads"),
        "Funnel Optimization": rx(r"funnel optimization", r"optimizacion de embudo"),
        "Conversion Rate Optimization": rx(r"\bcro\b", r"conversion rate optimization", r"optimizacion de conversion"),
        "A/B Testing": rx(r"a/b test", r"a-b test", r"split test", r"pruebas a/b"),
        "Data Analysis": rx(r"data analysis", r"analisis de datos"),
        "Reporting": rx(r"\breporting\b", r"reportes"),
        "KPIs": rx(r"\bkpis?\b"),
        "Budget Management": rx(r"budget management", r"gestion de presupuesto"),
        "Project Management": rx(r"project management", r"gestion de proyectos"),
        "Agile/Scrum": rx(r"\bscrum\b", r"\bagile\b"),
        "Event Marketing": rx(r"event marketing", r"marketing de eventos"),
        "Trade Marketing": rx(r"trade marketing"),
        "E-commerce": rx(r"e-?commerce", r"comercio electronico"),
        "Marketplace Management": rx(r"marketplace"),
        "Go-to-Market": rx(r"go[- ]to[- ]market", r"\bgtm\b"),
        "Sales Enablement": rx(r"sales enablement"),
        "B2B": rx(r"\bb2b\b"),
        "B2C": rx(r"\bb2c\b"),
        "Storytelling": rx(r"storytelling"),
        "UGC": rx(r"\bugc\b", r"user generated content"),
        "Video Marketing": rx(r"video marketing", r"marketing de video"),
        "Webinars": rx(r"webinars?"),
        "Public Relations": rx(r"public relations", r"relaciones publicas"),
        "Local SEO": rx(r"local seo"),
        "Mobile Marketing": rx(r"mobile marketing"),
        "SMS Marketing": rx(r"sms marketing"),
        "Loyalty Programs": rx(r"loyalty", r"lealtad"),
        "Media Buying": rx(r"media buying", r"compra de medios"),
        "Social Listening": rx(r"social listening"),
        "Generative Engine Optimization": rx(r"generative engine optimization"),
    },
    "experience": {
        "Trato / atención a clientes": rx(
            r"trato con (?:el |los )?clientes?", r"atenci[oó]n (?:a|al) clientes?",
            r"atenci[oó]n al cliente", r"client[- ]facing", r"customer[- ]facing",
            r"contacto directo con clientes", r"relaci[oó]n con clientes",
            r"customer service", r"servicio al cliente",
        ),
        "Gestión de presupuesto": rx(
            r"gesti[oó]n (?:de|del) presupuesto", r"manejo de presupuesto",
            r"administraci[oó]n de presupuesto", r"control de presupuesto",
            r"budget management", r"budget ownership", r"own(?:ing)? (?:the )?budget",
        ),
        "Manejo / liderazgo de equipos": rx(
            r"(?:manejo|liderazgo|gesti[oó]n|supervisi[oó]n) de equipos?",
            r"team management", r"leading a team", r"team lead", r"people management",
        ),
        "Trabajo con agencias": rx(r"agencias?", r"\bagency\b", r"agencias de medios"),
        "Reportes a dirección": rx(
            r"report(?:es|ar) (?:a|al) (?:la )?(?:direcci[oó]n|gerencia)", r"reporting to (?:senior )?management",
            r"\bc-level\b", r"direcci[oó]n general", r"board of directors",
        ),
        "Colaboración con ventas": rx(
            r"equipos? de ventas", r"sales team", r"colaboraci[oó]n con ventas", r"work(?:ing)? with sales",
        ),
        "SaaS": rx(r"\bsaas\b", r"software as a service"),
        "Startup": rx(r"startups?", r"start-up"),
        "Retail": rx(r"\bretail\b"),
        "Internacional / LATAM": rx(
            r"\blatam\b", r"latinoam[eé]rica", r"internacional", r"international",
            r"multi-?country",
        ),
        "Inglés B2+": rx(
            r"ingl[eé]s (?:b2|avanzado|fluido|biling[uü]e)", r"advanced english", r"b2 english",
            r"fluent english", r"english (?:b2|advanced|fluent|bilingual)", r"nivel (?:avanzado|fluido) de ingl[eé]s", r"\bb2\b",
        ),
        "Portugués": rx(r"portugu[eé]s", r"portuguese"),
        "Manejo de datos / SQL": rx(
            r"\bsql\b", r"bases? de datos", r"data analysis", r"an[aá]lisis de datos",
        ),
        "IA aplicada / LLMs": rx(
            r"\bai\b", r"\bia\b", r"inteligencia artificial", r"\bllms?\b",
            r"chatgpt", r"\bclaude\b", r"\bgemini\b", r"copilot",
        ),
        "Dashboards": rx(r"dashboards?", r"tableros?", r"looker studio", r"power bi"),
        "Automatización": rx(r"automatizaci[oó]n", r"\bautomation\b", r"zapier", r"make\.com", r"\bn8n\b"),
        "Prospección / outbound": rx(
            r"prospecci[oó]n", r"outbound", r"cold (?:call|email|outreach)", r"lead generation",
        ),
        "Account management": rx(r"account management", r"gesti[oó]n de cuentas", r"key account"),
        "Partnerships": rx(r"partnerships?", r"alianzas", r"partner marketing", r"strategic partners?"),
        "Pricing": rx(r"\bpricing\b", r"precios"),
        "Análisis financiero": rx(r"an[aá]lisis financiero", r"financial analysis", r"\bp&l\b"),
        "Trabajo bajo presión": rx(r"bajo presi[oó]n", r"under pressure", r"fast[- ]paced"),
        "Multitarea / varios proyectos": rx(
            r"multitarea", r"multitasking", r"m[uú]ltiples proyectos", r"multiple projects",
        ),
        "Disponibilidad para viajar": rx(r"disponibilidad para viajar", r"willing(?:ness)? to travel", r"travel required"),
    },
    "soft": {
        "Communication": rx(r"communication", r"comunicacion"),
        "Collaboration": rx(r"collaboration", r"colaboracion", r"teamwork", r"trabajo en equipo"),
        "Analytical Skills": rx(r"analytical", r"analitico"),
        "Problem Solving": rx(r"problem solving", r"resolucion de problemas"),
        "Creativity": rx(r"creativity", r"creatividad"),
        "Attention to Detail": rx(r"attention to detail", r"atencion al detalle"),
        "Time Management": rx(r"time management", r"gestion del tiempo"),
        "Adaptability": rx(r"adaptability", r"adaptabilidad"),
        "Leadership": rx(r"leadership", r"liderazgo"),
        "Ownership": rx(r"\bownership\b"),
        "Proactivity": rx(r"proactive", r"proactivo"),
        "Customer Service": rx(r"customer service", r"atencion al cliente"),
        "Negotiation": rx(r"negotiation", r"negociacion"),
        "Critical Thinking": rx(r"critical thinking", r"pensamiento critico"),
        "Self-starter": rx(r"self[- ]starter", r"autonomia", r"autonomy"),
        "Organization": rx(r"organization", r"organizacion"),
        "Presentation Skills": rx(r"presentation skills", r"habilidades de presentacion"),
        "Stakeholder Management": rx(r"stakeholder"),
        "Empathy": rx(r"empathy", r"empatia"),
        "Resilience": rx(r"resilience", r"resiliencia"),
        "Multitasking": rx(r"multitasking", r"multitarea"),
        "Results-oriented": rx(r"results[- ]oriented", r"orientado a resultados"),
        "Strategic Thinking": rx(r"strategic thinking", r"pensamiento estrategico"),
    },
    "languages": {
        "English": rx(r"\benglish\b", r"\bingles\b"),
        "Spanish": rx(r"\bspanish\b", r"\bespanol\b"),
        "Portuguese": rx(r"\bportuguese\b", r"\bportugues\b"),
        "French": rx(r"\bfrench\b", r"\bfrances\b"),
        "German": rx(r"\bgerman\b", r"\baleman\b"),
        "Italian": rx(r"\bitalian\b", r"\bitaliano\b"),
    },
}

TAXONOMY_ORDER = ["tools", "methods", "experience", "soft", "languages"]
SKILLS = []
SKILL_INDEX = {}
for skill_type in TAXONOMY_ORDER:
    for name in TAXONOMY[skill_type]:
        SKILL_INDEX[name] = len(SKILLS)
        SKILLS.append({"n": name, "t": skill_type})

YEARS_RE = re.compile(r"(\d{1,2})\s*(?:\+|a|to|-|–)?\s*(?:\d{1,2})?\s*(?:years?|anos?)\b", re.IGNORECASE)
SALARY_RE = re.compile(
    r"(?:\$|mxn|mx\$|pesos)\s*([0-9]{1,3}(?:[.,][0-9]{3})+|[0-9]{4,6})"
    r"|([0-9]{1,3}(?:[.,][0-9]{3})+|[0-9]{4,6})\s*(?:mxn|pesos|mensuales|al mes)",
    re.IGNORECASE,
)


def match_skills(text):
    found = []
    for skill_type in TAXONOMY_ORDER:
        for name, patterns in TAXONOMY[skill_type].items():
            if any(p.search(text) for p in patterns):
                found.append(SKILL_INDEX[name])
    return found


def modality(location):
    loc = norm(location)
    if "remote" in loc or "remoto" in loc:
        return "remote"
    if "hybrid" in loc or "hibrido" in loc:
        return "hybrid"
    if "on-site" in loc or "onsite" in loc or "presencial" in loc:
        return "onsite"
    return "other"


def parse_years(text):
    values = []
    for match in YEARS_RE.finditer(text):
        value = int(match.group(1))
        if 0 <= value <= 15:
            values.append(value)
    return min(values) if values else None


def parse_salary(text):
    for match in SALARY_RE.finditer(text):
        raw = match.group(1) or match.group(2) or ""
        digits = re.sub(r"[.,]", "", raw)
        if not digits.isdigit():
            continue
        amount = int(digits)
        if 5000 <= amount <= 300000:
            return amount
    return None


def parse_education(text):
    if re.search(r"\b(maestria|master|mba|posgrado)\b", text):
        return "master"
    if re.search(r"\b(licenciatura|licenciado|bachelor|degree|titulado|ingenieria|ingeniero)\b", text):
        return "degree"
    return None


def iso(value):
    return value or ""


def main():
    if not os.path.exists(JOBS_PATH):
        print(f"No se encontró {JOBS_PATH}", file=sys.stderr)
        return 1

    with open(JOBS_PATH, encoding="utf-8") as f:
        raw = json.load(f)

    jobs = []
    for job in raw:
        title = job.get("title") or ""
        description = job.get("description") or ""
        location = job.get("location") or ""
        text = norm(f"{title} {description}")

        jobs.append({
            "t": title,
            "c": job.get("company") or "",
            "l": location,
            "u": job.get("url") or "",
            "cat": job.get("category") or "",
            "lang": job.get("language") or "en",
            "mod": modality(location),
            "d": iso(job.get("postedDate")),
            "sd": iso(job.get("scrapedAt")),
            "sk": match_skills(text),
            "yrs": parse_years(text),
            "edu": parse_education(text),
            "sal": parse_salary(description),
            "en": bool(re.search(r"\b(english|ingles)\b", text)),
            "ea": bool(job.get("easyApply")),
        })

    scraped = sorted(j["sd"] for j in jobs if j["sd"])
    now = scraped[-1] if scraped else datetime.now(timezone.utc).isoformat()

    cv_text = ""
    if os.path.exists(CV_PATH):
        with open(CV_PATH, encoding="utf-8") as f:
            cv_text = norm(f.read())
    cv_have = [s for s in match_skills(cv_text)]

    salaries = [j["sal"] for j in jobs if j["sal"]]
    years = [j["yrs"] for j in jobs if j["yrs"] is not None]

    output = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "source": "filtered_jobs.json",
        "meta": {
            "total": len(jobs),
            "now": now,
            "minScrapedAt": scraped[0] if scraped else "",
            "maxScrapedAt": now,
            "categories": sorted({j["cat"] for j in jobs if j["cat"]}),
            "languages": dict(Counter(j["lang"] for j in jobs)),
            "salaryCoverage": round(len(salaries) / len(jobs) * 100, 1) if jobs else 0,
            "medianYears": statistics.median(years) if years else None,
        },
        "skills": SKILLS,
        "cv": {
            "have": cv_have,
        },
        "jobs": jobs,
    }

    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, separators=(",", ":"))

    size_kb = os.path.getsize(OUT_PATH) / 1024
    print(
        f"✅ insights.json: {len(jobs)} vacantes, {len(SKILLS)} skills, "
        f"{size_kb:.0f} KB",
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
