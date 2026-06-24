#!/usr/bin/env python3
"""
Regenerate cvs/skill_per_category.json from raw jobs.json.

Groups jobs by category, extracts tools/methodologies/competencies
from titles + descriptions using predefined keyword lists.

Usage:
  python3 scripts/build_skill_per_category.py
"""

import json, os, re
from collections import Counter

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
JOBS_PATH = os.path.join(ROOT, "jobs.json")
OUT_PATH = os.path.join(ROOT, "cvs", "skill_per_category.json")

TOOLS = [
    "Adobe Analytics", "Adobe Creative Suite", "Adobe Photoshop", "Adobe Premiere",
    "After Effects", "Ahrefs", "Amazon Ads", "Amazon Seller Central", "Asana",
    "Canva", "CAPI", "ChatGPT", "Claude", "ClickUp", "Google Ads", "Google Analytics",
    "GA4", "Google Search Console", "Google Sheets", "Google Slides", "Gemini",
    "GoHighLevel", "HubSpot", "HTML", "Instagram Ads", "JavaScript", "Jira",
    "Klaviyo", "LinkedIn Ads", "LinkedIn Sales Navigator", "Looker Studio",
    "LLMs", "Mailchimp", "Marketo", "Mercado Libre", "Meta Ads", "Meta Business Suite",
    "Microsoft Office", "Midjourney", "Monday.com", "Notion", "Nova",
    "Performance Max", "Perplexity", "Power BI", "PowerPoint", "Pulse", "Python",
    "RAG", "REST APIs", "SEMrush", "SQL", "Salesforce", "Salesforce Marketing Cloud",
    "Screaming Frog", "Shopify", "Slack", "Tableau", "Teams", "TikTok Ads",
    "Twitter Ads", "WordPress", "Zoom", "Figma", "Excel", "CSS",
    "Google Business Profile", "GoToWebinar",
]

METHODOLOGIES = [
    "A/B Testing", "A+ Content", "Account Management", "B2B Marketing",
    "Brand Identity", "Brand Management", "Brand Marketing", "Brand Voice",
    "Budget Management", "CRO", "Campaign Management", "Co-marketing",
    "Community Management", "Content Creation", "Content Strategy",
    "Conversion Optimization", "Conversion Rate Optimization", "Copywriting",
    "Creative Direction", "Cross-Functional Collaboration", "Customer Experience",
    "Customer Success", "Data Analysis", "Data Visualization",
    "Data-Driven Decision Making", "Demand Generation", "Digital Transformation",
    "Email Marketing", "Event Marketing", "Experimentation", "Funnel Optimization",
    "GEO", "Google Business Profile optimization", "Growth Marketing",
    "Inbound Marketing", "Influencer Marketing", "Inventory Management",
    "Keyword Research", "Lead Generation", "Local SEO", "Marketing Automation",
    "Market Research", "Nurturing", "Onboarding", "PPC", "Paid Media",
    "Paid Search", "Paid Social", "Partner Marketing", "Performance Marketing",
    "Product Launch", "Product Marketing", "Project Management",
    "Reporting & Analytics", "Retention", "SEM", "SEO", "Sales",
    "Sales Development", "Sales Enablement", "Segmentation",
    "Social Media Management", "Social Media Strategy", "Strategic Planning",
    "Supply Chain", "UGC", "UI", "UX", "Visual Identity",
    "Lead Generation", "Content Creation",
]

COMPETENCIES = [
    "Accountability", "Adaptability", "Analytical mindset", "Attention to detail",
    "Autonomy", "Collaboration", "Conflict resolution", "Continuous learning",
    "Creativity", "Critical thinking", "Cross-functional collaboration",
    "Curiosity", "Customer service", "Decision making", "Detail-oriented",
    "Effective communication", "Empathy", "Fast learner", "Follow-through",
    "Growth mindset", "Leadership", "Multitasking", "Negotiation",
    "Organization", "Ownership", "Persistence", "Presentation skills",
    "Proactive", "Problem-solving", "Project management",
    "Results-oriented", "Resilience", "Self-starter", "Storytelling",
    "Strategic thinking", "Teamwork", "Time management",
    "Verbal communication", "Written communication",
]

LANGUAGES = ["English", "Spanish", "Portuguese"]

INDUSTRIES = [
    "Advertising", "Agencies", "B2B", "D2C", "E-commerce", "Education",
    "FinTech", "Healthcare", "Hospitality", "Marketplace", "Media",
    "Real Estate", "Retail", "SaaS", "Startups", "Technology", "Travel",
]


def find_matches(text, keywords):
    text_lower = text.lower()
    found = set()
    for kw in keywords:
        if kw.lower() in text_lower:
            found.add(kw)
    return sorted(found)


def main():
    if not os.path.exists(JOBS_PATH):
        print(f"❌ {JOBS_PATH} not found. Run scraper first.")
        return

    with open(JOBS_PATH) as f:
        jobs = json.load(f)

    categories = {}
    for j in jobs:
        cat = j.get("category", "").lower().strip()
        if not cat:
            continue
        title = j.get("title", "")
        desc = j.get("description", "")
        text = f"{title}\n{desc}"
        categories.setdefault(cat, {"texts": [], "count": 0})
        categories[cat]["texts"].append(text)
        categories[cat]["count"] += 1

    # Preserve existing categories not found in current jobs
    if os.path.exists(OUT_PATH):
        with open(OUT_PATH) as f:
            existing = json.load(f)
    else:
        existing = {}

    result = {}
    for cat, data in sorted(categories.items()):
        combined = " ".join(data["texts"])
        result[cat] = {
            "total_jobs": data["count"],
            "tools": find_matches(combined, TOOLS),
            "methodologies": find_matches(combined, METHODOLOGIES),
            "competencies": find_matches(combined, COMPETENCIES),
            "languages": find_matches(combined, LANGUAGES),
            "industries": find_matches(combined, INDUSTRIES),
        }
        print(f"  {cat}: {data['count']} jobs → {len(result[cat]['tools'])} tools, "
              f"{len(result[cat]['methodologies'])} methods, "
              f"{len(result[cat]['competencies'])} competencies")

    # Keep existing categories that weren't in jobs.json
    for cat, data in existing.items():
        if cat not in result:
            result[cat] = data
            print(f"  {cat}: preserved ({data['total_jobs']} jobs)")

    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    with open(OUT_PATH, "w") as f:
        json.dump(result, f, indent=2, ensure_ascii=False)
    print(f"\n✅ Saved: {OUT_PATH} ({len(result)} categories)")


if __name__ == "__main__":
    main()
