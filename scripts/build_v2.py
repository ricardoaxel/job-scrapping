#!/usr/bin/env python3
"""Build the compact v2 job index consumed by site/v2.js.

Reads insights.json (extracted features) + filtered_jobs.json (descriptions)
and writes data/v2/jobs.json with role families, seniority, relevance, agency
flags, lifecycle status and CV links.
"""
import json, os, re, unicodedata, statistics
from collections import Counter
from datetime import datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INSIGHTS = os.path.join(ROOT, "insights.json")
FILTERED = os.path.join(ROOT, "filtered_jobs.json")
OUT_DIR = os.path.join(ROOT, "data", "v2")
OUT = os.path.join(OUT_DIR, "jobs.json")


def norm(s):
    s = (s or "").lower()
    s = unicodedata.normalize("NFD", s)
    return "".join(c for c in s if unicodedata.category(c) != "Mn")


def has(text, *pats):
    return any(re.search(p, text, re.I) for p in pats)


FAMILIES = [
    ("Pasantía / Intern", [r"\bbecari[oa]\b", r"practicante", r"\bintern\b", r"\btrainee\b"]),
    ("Performance / Paid Media", [r"performance", r"paid media", r"paid social", r"media buyer", r"\bsem\b", r"\bppc\b", r"google ads", r"meta ads", r"programmatic", r"media buying"]),
    ("SEO", [r"\bseo\b", r"search engine"]),
    ("Content / Copy", [r"content", r"copywrit", r"redact", r"editor", r"storytell"]),
    ("Social / Community", [r"social media", r"community", r"influencer", r"tiktok", r"instagram", r"creator"]),
    ("Brand / Product", [r"\bbrand\b", r"marca", r"product marketing", r"producto", r"lanzamiento"]),
    ("CRM / Lifecycle", [r"\bcrm\b", r"lifecycle", r"retention", r"retenci", r"customer lifecycle"]),
    ("Email Marketing", [r"email marketing", r"correo electr", r"mailchimp", r"klaviyo", r"marketing cloud", r"email specialist"]),
    ("Growth", [r"growth", r"growth hacking"]),
    ("Martech / Ops", [r"marketing ops", r"martech", r"marketing operations", r"automatiz", r"automation", r"hubspot admin", r"salesforce admin"]),
    ("Analytics", [r"analyst", r"analista", r"analytics", r"data", r"insight", r"business intelligence", r"inteligencia de negocio"]),
    ("E-commerce / Marketplace", [r"e-?commerce", r"marketplace", r"amazon", r"mercado libre", r"retail media", r"\bretail\b"]),
    ("Customer Success", [r"customer success", r"client success", r"exito del cliente"]),
    ("Trade / Eventos", [r"trade marketing", r"event marketing", r"eventos?", r"\bevents?\b"]),
    ("PR / Comms", [r"public relations", r"relaciones publicas", r"comunicaci", r"prensa", r"\bpr\b"]),
    ("Diseño / Creativo", [r"designer", r"dise[nñ]ador", r"creative", r"creativ", r"art director", r"director de arte", r"motion", r"video"]),
    ("Ventas / BizDev", [r"\bsales\b", r"ventas", r"business development", r"account executive", r"account manager", r"key account"]),
    ("Marketing Generalista", [r"marketing"]),
]

OFFTOPIC = [
    r"\bdeveloper\b", r"\bsoftware\b", r"\bbackend\b", r"\bfrontend\b", r"\bfull[- ]stack\b",
    r"\bengineer(?:ing)?\b", r"interpreter", r"int[eé]rprete", r"voice", r"\bactor\b",
    r"translator", r"traductor", r"\btutor\b", r"\bteacher\b", r"profesor", r"\bnurse\b",
    r"\bdoctor\b", r"\bmedical\b", r"\blawyer\b", r"\baccountant\b", r"contable", r"recruiter",
    r"recruitment", r"human resources", r"recursos humanos", r"\bhr\b", r"payroll", r"driver",
    r"warehouse", r"security guard", r"call center", r"data entry", r"capturista", r"culinario",
    r"chef", r"electrician", r"plumber", r"mechanic", r"logistics", r"customs", r"aduanal",
    r"shopify expert", r"tutor", r"teacher", r"operations manager", r"service design lead",
    r"ingenier", r"fisioterapeuta", r"inmobiliar", r"auxiliar administrativ", r"administrativ[oa]",
    r"recepcionista", r"secretari[oa]", r"abogad", r"contador", r"m[eé]dico", r"enfermera",
    r"profesor", r"maestr[oa]", r"traductor", r"int[eé]rprete", r"promotor", r"t[eé]cnico",
    r"soporte t[eé]cnico", r"desarrollador", r"programador", r"capturista", r"almac[eé]n",
    r"chofer", r"repartidor", r"guardia", r"chef", r"cajero", r"vendedor", r"representante de ventas",
    r"ejecutivo de ventas", r"asesor comercial", r"real estate", r"seguros", r"fitness",
    r"chargeback", r"payments? risk", r"risk consultant", r"customer service", r"servicio al cliente",
    r"atencion a clientes", r"atenci[oó]n a clientes", r"screener", r"candidate screen",
    r"gesti[oó]n de ventas", r"sales development", r"account executive", r"business development",
    r"representante de ventas", r"ejecutivo de ventas", r"asesor comercial",
]
AGENCY = [
    r"globaltize", r"virtustant", r"floowi", r"jobgether", r"hire with near", r"sagan",
    r"solvo", r"\bhired\b", r"growthassistant", r"pavago", r"simera", r"bruntwork",
    r"talentpop", r"veta", r"insideout", r"remote leverage", r"micro1", r"vpm",
    r"gce global", r"scale army", r"turing", r"torre\.ai", r"recruit", r"staffing",
    r"outsourcing", r"talent global", r"talently", r"tk recruitment", r"nsk consulting",
    r"pyramid consulting", r"hired", r"talent",
]
CDMX = [r"mexico city", r"cdmx", r"\bcmx\b", r"miguel hidalgo", r"benito juarez", r"alvaro obregon",
        r"azcapotzalco", r"venustiano carranza", r"cuauhtemoc", r"cuajimalpa", r"naucalpan",
        r"huixquilucan", r"estado de mexico", r"metropolitan area"]


def family_for(title, desc, category):
    t = norm(title)
    for name, pats in FAMILIES:
        if has(t, *pats):
            return name

    d = norm(desc)
    strong = [
        ("Performance / Paid Media", [r"performance marketing", r"paid media", r"paid social", r"media buyer", r"\bppc\b", r"\bsem\b", r"google ads", r"meta ads", r"programmatic"]),
        ("Email Marketing", [r"email marketing", r"klaviyo", r"mailchimp", r"marketing cloud"]),
        ("CRM / Lifecycle", [r"\bcrm\b", r"lifecycle", r"retention marketing"]),
        ("SEO", [r"\bseo\b", r"search engine optimization"]),
        ("E-commerce / Marketplace", [r"e-?commerce", r"marketplace", r"amazon seller", r"mercado libre"]),
        ("Analytics", [r"data analyst", r"analytics", r"business intelligence"]),
        ("Martech / Ops", [r"marketing ops", r"martech", r"marketing automation"]),
        ("Content / Copy", [r"copywriting", r"content marketing", r"redacci[oó]n"]),
        ("Social / Community", [r"social media marketing", r"community management", r"influencer marketing"]),
    ]
    for name, pats in strong:
        if has(d, *pats):
            return name

    fallback = {
        "Growth Marketing": "Growth",
        "Content Marketing": "Content / Copy",
        "Customer Success": "Customer Success",
        "Marketing Intern": "Pasantía / Intern",
        "Marketing Jr": "Marketing Generalista",
        "CRM Marketing": "CRM / Lifecycle",
        "Email Marketing": "Email Marketing",
        "Social Media Marketing": "Social / Community",
    }
    if category in fallback:
        return fallback[category]
    if "marketing" in t or "marketing" in d:
        return "Marketing Generalista"
    return "Otros"


def seniority_for(title, years):
    t = norm(title)
    if has(t, r"\bbecari[oa]\b", r"practicante", r"\bintern\b", r"\btrainee\b"):
        return "Intern"
    if has(t, r"director", r"\bhead\b", r"\bvp\b", r"chief", r"\bcmo\b"):
        return "Director"
    if has(t, r"manager", r"gerente", r"\blead\b", r"lider", r"supervisor"):
        return "Manager"
    if has(t, r"senior", r"\bsr\.?\b", r"especialista senior"):
        return "Senior"
    if has(t, r"junior", r"\bjr\.?\b", r"asistente", r"assistant", r"coordinador", r"coordinator"):
        return "Junior"
    if years is None:
        return "Mid"
    if years <= 1:
        return "Junior"
    if years <= 4:
        return "Mid"
    return "Senior"


def city_type(location):
    l = norm(location)
    if "latin america" in l or "namer" in l:
        return "latam_remote"
    if "remote" in l and ("mexico" in l or "méxico" in l):
        return "mexico_remote"
    if any(re.search(p, l) for p in CDMX):
        return "cdmx"
    if "remote" in l or "remoto" in l:
        return "other_remote"
    return "other_mx"


def clean_company(name):
    name = re.sub(r"\s+(s\.?a\.?\s+de\s+c\.?v\.?|s\.? de r\.?l\.?|inc\.?|llc|ltd\.?)$", "", name or "", flags=re.I)
    return name.strip()


def scan_cvs():
    out = []
    base = os.path.join(ROOT, "cvs", "Generated")
    if not os.path.isdir(base):
        return out
    for folder in sorted(os.listdir(base)):
        path = os.path.join(base, folder)
        if not os.path.isdir(path):
            continue
        files = sorted(os.listdir(path))
        pdfs = [f for f in files if f.endswith("_styled.pdf")]
        docs = [f for f in files if f.endswith(".docx")]
        for f in pdfs:
            out.append({
                "category": folder,
                "label": folder,
                "type": "PDF",
                "lang": "ES" if re.search(r"_es[_.]", f, re.I) else "EN",
                "url": "cvs/" + folder.replace(" ", "%20") + "/" + f.replace(" ", "%20"),
            })
        for f in docs[:2]:
            out.append({
                "category": folder,
                "label": folder,
                "type": "DOCX",
                "lang": "ES" if re.search(r"_es[_.]", f, re.I) else "EN",
                "url": "cvs/" + folder.replace(" ", "%20") + "/" + f.replace(" ", "%20"),
            })
    return out


def main():
    with open(INSIGHTS, encoding="utf-8") as f:
        ins = json.load(f)
    with open(FILTERED, encoding="utf-8") as f:
        raw = json.load(f)
    desc_by_url = {j.get("url"): (j.get("description") or "") for j in raw}
    skills = ins["skills"]
    cv_have = set(ins["cv"]["have"])
    now = ins["meta"]["maxScrapedAt"]
    now_dt = datetime.fromisoformat(now.replace("Z", "+00:00"))

    jobs = []
    for j in ins["jobs"]:
        title = j.get("t") or ""
        company = clean_company(j.get("c") or "")
        location = j.get("l") or ""
        desc = re.sub(r"^About the job\s*", "", desc_by_url.get(j.get("u"), ""), flags=re.I).strip()
        text = norm(title + " " + desc + " " + location)
        family = family_for(title, desc, j.get("cat") or "")
        years = j.get("yrs")
        off = has(norm(title), *OFFTOPIC)
        if off:
            family = "Otros"
        agency = has(norm(company), *AGENCY)
        sd = j.get("sd") or ""
        try:
            age = (now_dt - datetime.fromisoformat(sd.replace("Z", "+00:00"))).days
        except Exception:
            age = 9999
        status = "active" if age <= 7 else "recent" if age <= 30 else "stale" if age <= 60 else "old"
        rel = 100
        if off:
            rel = 0
        else:
            if family == "Otros":
                rel -= 55
            if family == "Ventas / BizDev":
                rel -= 55
            if agency:
                rel -= 30
            if status in ("stale", "old"):
                rel -= 25
            if len(desc) < 200:
                rel -= 15
            rel = max(0, min(100, rel))
        jobs.append({
            "id": (re.search(r"/jobs/view/(\d+)", j.get("u", "")) or [None, j.get("u", "").rstrip("/").split("/")[-1]])[1],
            "t": title,
            "c": company,
            "l": location,
            "u": j.get("u") or "",
            "cat": j.get("cat") or "",
            "fam": family,
            "sen": seniority_for(title, years),
            "mod": j.get("mod") or "other",
            "loc": city_type(location),
            "lang": j.get("lang") or "en",
            "en": bool(j.get("en")),
            "d": j.get("d") or "",
            "sd": sd,
            "sk": j.get("sk") or [],
            "yrs": years,
            "sal": j.get("sal"),
            "ea": bool(j.get("ea")),
            "agency": agency,
            "off": off,
            "rel": rel,
            "status": status,
            "desc": re.sub(r"\s+", " ", desc)[:300],
        })

    jobs.sort(key=lambda x: (x["sd"] or ""), reverse=True)
    fam_counts = Counter(j["fam"] for j in jobs)
    out = {
        "generatedAt": datetime.utcnow().isoformat() + "Z",
        "updatedAt": now,
        "total": len(jobs),
        "skills": skills,
        "cvHave": sorted(cv_have),
        "families": [f[0] for f in FAMILIES] + ["Otros"],
        "seniorities": ["Intern", "Junior", "Mid", "Senior", "Manager", "Director"],
        "familyCounts": dict(fam_counts),
        "cvs": scan_cvs(),
        "jobs": jobs,
    }
    os.makedirs(OUT_DIR, exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    size = os.path.getsize(OUT) / 1024
    print(f"✅ {OUT}: {len(jobs)} jobs, {size:.0f} KB")
    print("familias:", fam_counts.most_common(10))


if __name__ == "__main__":
    main()
