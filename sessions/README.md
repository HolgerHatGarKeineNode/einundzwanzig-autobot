# Sessions — ein Ordner pro Generierung/Prompt-Run

Konvention: `sessions/YYYY-MM-DD-<slug>/` — **jeder neue Artikel-/Generierungs-Run
aus frischem Kontext bekommt seinen eigenen Ordner.** Nichts mehr flach in
`autobot/` ablegen.

## Standard-Inhalt eines Session-Ordners

| Datei/Ordner | Zweck |
|---|---|
| `article.md` | Markdown-Body (H2-Sektionen, ohne Bilder) |
| `article-meta.json` | `{ title, summary, hashtags[], cover, sections[] }` — Input für `tools/gen-illustrated.cjs` |
| `images/` | FLUX2-Output: `manifest.json` (output_dir → dieser Ordner!), PNGs, `results.json` |
| `image-urls.json` | Blossom-URLs je Bild-Schlüssel (cover + sections) |
| `article-spec.json` / `article-illustrated.md` | generiert von `tools/gen-illustrated.cjs <sessionDir>` |
| `archive/` | überholte Einmal-Skripte/Artefakte des Runs (nur Historie) |
| Logs | Generierungs-/QA-Logs des Runs |

## Neuer Run (Kurzrezept)

1. `mkdir -p sessions/$(date +%F)-<slug>/images`
2. `article.md` + `article-meta.json` schreiben (Regeln: `../WRITING_RULES.md`, Grounding: `../contexts/`)
3. `images/manifest.json` (output_dir auf den Session-images-Ordner!) → `imagegen/generate.py --manifest …` → QA-Loop
4. `node tools/gen-upload-job.cjs --files sessions/<s>/images` → `browser_run_code filename=tools/blossom-upload.run.js` → URLs nach `image-urls.json`
5. `node tools/gen-illustrated.cjs sessions/<s>`
6. `node tools/gen-edit-job.cjs --dtag <dTag> --spec sessions/<s>/article-spec.json …` → `browser_run_code filename=tools/edit-article.run.js`
