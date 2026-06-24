import json, re, sys

JOBS_PATH = "/Users/ashel/Documents/Programming/job-scrapping/jobs.json"
OUTPUT_PATH = "/Users/ashel/Documents/Programming/job-scrapping/filtered_jobs.json"

with open(JOBS_PATH) as f:
    jobs = json.load(f)

print(f"Total jobs: {len(jobs)}", file=sys.stderr)

# ─── 1. Location filter ──────────────────────────────────────
# Keep: Remote anywhere, CDMX, Mexico City, Metro Area, Estado de México
KEEP_LOCATIONS = [
    "remote",
    "ciudad de méxico",
    "mexico city",
    "metropolitan area",
    "estado de méxico",
    "naucalpan",
    "huixquilucan",
    "cuajimalpa",
    "venustiano carranza",
    "cuauhtémoc",
    "miguel hidalgo",
]

def passes_location(loc):
    loc_lower = loc.lower()
    for k in KEEP_LOCATIONS:
        if k in loc_lower:
            return True
    return False

before_loc = len(jobs)
jobs = [j for j in jobs if passes_location(j.get("location", ""))]
print(f"After location filter: {len(jobs)} (removed {before_loc - len(jobs)})", file=sys.stderr)

# ─── 2. Experience filter ─────────────────────────────────────
# Remove jobs that clearly ask for >3 years of experience
# Check: title for senior/sr, description for years of experience

def extract_experience_years(desc, title):
    text = (title + " " + desc).lower()

    # Patterns: "X+ years", "X–Y years", "X - Y years", "at least X years"
    patterns = [
        r'(\d+)\s*\+\s*(?:años|years|yrs)',
        r'(\d+)\s*(?:años|years|yrs)\s*(?:\+|de|of)?\s*(?:experiencia|experience)?',
        r'(?:mínimo|minimum|at least)\s*(\d+)\s*(?:años|years|yrs)',
        r'(\d+)\s*-\s*(\d+)\s*(?:años|years|yrs)',
        r'(\d+)\s*(?:años|years|yrs)\s*(?:de|of)?\s*(?:experiencia|experience)',
    ]

    for pat in patterns:
        m = re.search(pat, text)
        if m:
            groups = m.groups()
            if len(groups) == 2:
                # Range like "3-5 years" → use upper bound
                if int(groups[1]) > 3:
                    return int(groups[1])
            else:
                if int(groups[0]) > 3:
                    return int(groups[0])
    return 0

def passes_experience(job):
    desc = job.get("description", "")
    title = job.get("title", "")
    title_lower = title.lower()

    # Remove if title contains senior/sr
    if re.search(r'\b(senior|sr\.?|sênior)\b', title_lower):
        return False

    # Remove if description explicitly asks for >3 years
    years = extract_experience_years(desc, title)
    if years > 3:
        return False

    return True

before_exp = len(jobs)
jobs = [j for j in jobs if passes_experience(j)]
print(f"After experience filter: {len(jobs)} (removed {before_exp - len(jobs)})", file=sys.stderr)

# ─── 3. Relevance filter ──────────────────────────────────────
# Remove jobs unrelated to marketing (dev, admin, data entry, etc.)

UNRELATED_TITLES = [
    "developer", "engineer", "engineering", "software", "backend", "frontend",
    "full stack", "wordpress developer", "web developer",
    "data entry", "capturista de datos",
    "virtual assistant", "executive assistant", "asistente virtual",
    "tutor", "online tutor", "teacher", "profesor",
    "trainer", "corporate trainer",
    "technical writer",
    "ai annotator", "ai writing", "ai trainer",
    "call center", "call center agent",
    "invoice", "accounting", "contable",
    "aduanal", "customs", "logistics coordinator",
    "travel concierge",
    "hr ", "human resources", "recruiter", "recruitment",
    "nurse", "doctor", "medical",
    "electrician", "plumber", "mechanic",
    "security guard", "driver", "delivery",
    "banamex", "afore", "bank",
    "service design lead",
    "operations manager", "operations and customer",
    "shopify expert",
    "video editor", "motion graphics",
]

def passes_relevance(job):
    title = job.get("title", "").lower()
    for term in UNRELATED_TITLES:
        if term in title:
            return False
    return True

before_rel = len(jobs)
jobs = [j for j in jobs if passes_relevance(j)]
print(f"After relevance filter: {len(jobs)} (removed {before_rel - len(jobs)})", file=sys.stderr)

# ─── 4. Company filter (remove intermediaries/staffing agencies) ──
STAFFING_COMPANIES = [
    "hire feed",
    "quik hire staffing",
    "talentpop app",
    "veta virtual",
    "insideout",
    "remote leverage",
    "simera",
    "hire hangar",
    "talent scout",
    "bruntwork",
    "contractor click",
    "micro1",
    "vpm solutions",
    "gce global solutions",
    "scale army careers",
    "big language solutions",
    "turing-ia",
    "turing",
    "emma of torre.ai",
    "torre.ai",
    # generic staffing keywords
    "outsourcing",
    "staffing",
    "recruitment agency",
]

def passes_company(job):
    company = job.get("company", "").lower().strip()
    for c in STAFFING_COMPANIES:
        if c in company:
            return False
    return True

before_comp = len(jobs)
jobs = [j for j in jobs if passes_company(j)]
print(f"After company filter: {len(jobs)} (removed {before_comp - len(jobs)})", file=sys.stderr)

# ─── 5. Remove duplicates (same title + company) ──────────────
seen = set()
unique = []
for j in jobs:
    key = (j.get("title", "").strip().lower(), j.get("company", "").strip().lower())
    if key not in seen:
        seen.add(key)
        unique.append(j)

print(f"After dedup: {len(unique)} (removed {len(jobs) - len(unique)})", file=sys.stderr)

# ─── Save / Output ─────────────────────────────────────────────
result = json.dumps(unique, indent=2, ensure_ascii=False)

if "--save" in sys.argv:
    with open(OUTPUT_PATH, "w") as f:
        f.write(result)
    print(f"\n✅ {len(unique)} jobs → {OUTPUT_PATH}", file=sys.stderr)
else:
    print(result, end="")
