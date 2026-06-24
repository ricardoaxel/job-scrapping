# Generate Tailored CVs

Genera CVs por categoría: DOCX (formato Word), MD, _simple.pdf y _styled.pdf.

## Inputs

- `base-cv.md` — CV General, fuente de verdad (lo mantiene Valeria)
- `filtered_jobs.json` — vacantes por categoría (para consultar skills/keywords)
- `cvs/skill_per_category.json` — skills/tools por categoría (regenerar con `build_skill_per_category.py`)
- `cvs/WordTemplate.docx` — template DOCX con formato (bold, fonts, estilos)

## Output

```
cvs/Generated/
├── Marketing Intern/
│   ├── CV_Valeria_Paez_Reyes_Marketing_Intern.md
│   ├── CV_Valeria_Paez_Reyes_Marketing_Intern.docx
│   ├── CV_Valeria_Paez_Reyes_Marketing_Intern_simple.pdf
│   └── CV_Valeria_Paez_Reyes_Marketing_Intern_styled.pdf
├── Growth Marketing/
│   └── ...
└── ... (1 por categoría)
```

## Pipeline

### 1. Scrapear

```bash
npm run start
```

Genera `jobs.json` + filtra a `filtered_jobs.json`.

### 2. Regenerar skill_per_category.json (opcional)

```bash
python3 scripts/build_skill_per_category.py
```

Actualiza `cvs/skill_per_category.json` con tools/methodologies extraídas de `jobs.json`.

### 3. AI: Generar MD por categoría

Para cada categoría en `QUERY_CATEGORY`:
- Leer `filtered_jobs.json`, filtrar por `category`
- Revisar `cvs/skill_per_category.json` para skills clave del área
- Partir del **CV General** y adaptar:
  - **Summary**: enfocado a la categoría
  - **Experience bullets**: refrasear para destacar lo relevante. NO inventar. Máximo 6 por rol. Si un rol no aplica, reducir conservadoramente.
  - **Skills**: solo los relevantes. Reducir a 4-5 líneas.
  - **Competencies**: 3-5 relevantes a la categoría.
  - **Education / Languages**: se mantienen igual.

Guardar MD en `cvs/Generated/<Category>/CV_Valeria_Paez_Reyes_<Category>.md`

### 4. Batch: Dar formato a todos los CVs

```bash
python3 scripts/generate_all_cvs.py
```

Lee los MDs de `cvs/Generated/*/` y corre `generate_cv.py` en cada uno → DOCX + PDFs.

### 5. Individual (opcional)

```bash
python3 skills/generate-cvs/generate_cv.py \
  --md "cvs/Generated/<Category>/CV_Valeria_Paez_Reyes_<Category>.md" \
  --category "<Category>"
```

## Reglas

- NO inventar experiencia. Solo refrasear bullets desde `base-cv.md`.
- NO agregar skills no confirmados por Valeria.
- Skills máximo 5 líneas. Competencies máximo 5. Bullets máximo 6 por rol.
- Education 2 líneas máximo.
