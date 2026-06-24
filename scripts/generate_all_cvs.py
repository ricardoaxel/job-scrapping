#!/usr/bin/env python3
"""
Batch format: finds all MD files in cvs/Generated/<Category>/
and runs generate_cv.py on each to produce DOCX + PDFs.

Usage:
  python3 scripts/generate_all_cvs.py
"""

import os, subprocess, sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
GENERATED = os.path.join(ROOT, "cvs", "Generated")
GENERATE_CV = os.path.join(ROOT, "skills", "generate-cvs", "generate_cv.py")


def main():
    if not os.path.exists(GENERATE_CV):
        print(f"❌ generate_cv.py not found: {GENERATE_CV}")
        sys.exit(1)

    if not os.path.isdir(GENERATED):
        print(f"❌ Generated dir not found: {GENERATED}")
        sys.exit(1)

    entries = sorted(os.listdir(GENERATED))
    found = 0
    for entry in entries:
        cat_dir = os.path.join(GENERATED, entry)
        if not os.path.isdir(cat_dir):
            continue
        # Find MD file for this category
        for fname in os.listdir(cat_dir):
            if fname.endswith(".md") and not fname.startswith("__"):
                md_path = os.path.join(cat_dir, fname)
                category = entry
                print(f"[{category}] {fname}")
                r = subprocess.run(
                    [sys.executable, GENERATE_CV, "--md", md_path, "--category", category],
                    capture_output=True, timeout=60)
                for line in r.stdout.decode().split("\n"):
                    if line.strip():
                        print(f"  {line}")
                if r.returncode != 0:
                    print(f"  ⚠️  {r.stderr.decode()[:200]}")
                found += 1
                break  # only first MD per category dir

    if found == 0:
        print("⚠️  No MD files found in cvs/Generated/*/")
    else:
        print(f"\n✅ Done. {found} CV(s) formatted.")


if __name__ == "__main__":
    main()
