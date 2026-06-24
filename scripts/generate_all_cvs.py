#!/usr/bin/env python3
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
        md_files = sorted(f for f in os.listdir(cat_dir)
                          if f.endswith(".md") and not f.startswith("__"))
        for fname in md_files:
            md_path = os.path.join(cat_dir, fname)
            lang = "es" if "_es." in fname else "en"
            print(f"[{entry}] {fname} (lang={lang})")
            r = subprocess.run(
                [sys.executable, GENERATE_CV, "--md", md_path,
                 "--category", entry, "--lang", lang],
                capture_output=True, timeout=60)
            for line in r.stdout.decode().split("\n"):
                if line.strip():
                    print(f"  {line}")
            if r.returncode != 0:
                print(f"  ⚠️  {r.stderr.decode()[:200]}")
            found += 1

    if found == 0:
        print("⚠️  No MD files found in cvs/Generated/*/")
    else:
        print(f"\n✅ Done. {found} CV(s) formatted.")


if __name__ == "__main__":
    main()
