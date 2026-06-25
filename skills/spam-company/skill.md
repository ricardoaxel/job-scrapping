# Skill: Agregar empresa a lista de spam

Cuando el usuario diga "agrega a spam esta empresa X" o similar:

## Pasos a seguir

### 1. Agregar a `scripts/filter.py`
En la lista `STAFFING_COMPANIES` (sección spam), agregar el nombre de la empresa en minúsculas:
```python
# spam companies
"omnicom",
"omnicom media mexico",
"tinuiti",
"nueva empresa",  # <-- agregar aquí
```

### 2. Buscar vacantes existentes en `filtered_jobs.json`
```bash
node -e "
const fs = require('fs');
const jobs = JSON.parse(fs.readFileSync('filtered_jobs.json','utf8'));
const matches = jobs.filter(j => (j.company||'').toLowerCase().includes('EMPRESA'));
console.log('Encontradas:', matches.length);
"
```

### 3. Marcar como dislike en Firestore
Para cada vacante encontrada, pushear a Firestore con `disliked: true` y `dislikeReason: 'Spam'`:

```bash
node -e '
const https = require("https");
const projectId = "job-search-9d700";
const docUrl = "/v1/projects/" + projectId + "/databases/(default)/documents/tracked/jobs";
const now = new Date().toISOString();

// Primero obtener doc actual
const req = https.request({ hostname: "firestore.googleapis.com", path: docUrl, method: "GET" }, res => {
  let data = "";
  res.on("data", d => data += d);
  res.on("end", () => {
    const doc = JSON.parse(data);
    const dataField = doc.fields?.data?.mapValue?.fields || {};

    // Agregar cada URL encontrada
    const keys = [
      "URL_DE_LA_VACANTE_1",
      "URL_DE_LA_VACANTE_2",
    ];

    keys.forEach(k => {
      dataField[k] = {
        mapValue: {
          fields: {
            disliked: { booleanValue: true },
            dislikeReason: { stringValue: "Spam" },
            trackedAt: { stringValue: now }
          }
        }
      };
    });

    const writeData = JSON.stringify({
      fields: {
        data: { mapValue: { fields: dataField } },
        updatedAt: { stringValue: now }
      }
    });

    const patchOpts = {
      hostname: "firestore.googleapis.com",
      path: docUrl + "?updateMask.fieldPaths=data&updateMask.fieldPaths=updatedAt",
      method: "PATCH",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(writeData) }
    };
    const preq = https.request(patchOpts, pr => {
      let pd = "";
      pr.on("data", d => pd += d);
      pr.on("end", () => { console.log("Firestore:", pr.statusCode); });
    });
    preq.write(writeData);
    preq.end();
  });
});
req.end();
'
```

### 4. Commit y push
```bash
git add scripts/filter.py filtered_jobs.json
git commit -m "feat: block EMPRESA jobs, mark existing as disliked"
git push
```

### 5. Avisar al usuario
Decirle que ya está bloqueado en futuros scrapes y que las existentes fueron marcadas como dislike.

## Notas
- No agregar lógica de auto-dislike en `site/app.js` — solo se hace manualmente vía Firestore REST API
- El bloqueo en `filter.py` evita que el scraper las vuelva a traer
- Las existentes se marcan como dislike manualmente para que queden ocultas por defecto y cuenten en la card "Descartadas" de Stats
