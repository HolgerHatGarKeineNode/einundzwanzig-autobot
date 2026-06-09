# Autobot — Claude-MCP Automation für media.einundzwanzig.space

Eigenständiges Projekt (schlankes Git-Repo — Secrets/Kontexte/Sessions sind unversioniert, siehe `.gitignore`).
Claude steuert per Playwright-MCP das Live-Frontend von
`https://media.einundzwanzig.space` — standardmäßig im **Dry-Run** (lokaler Draft),
Live-Publish nur auf ausdrückliche Freigabe.

## Ordnerstruktur

```
autobot/
├── README.md            # diese Datei — Quelle der Wahrheit
├── WRITING_RULES.md     # PFLICHT-Schreibregeln (stilles Grounding, kein Haltungs-Label, Humanisierung)
├── .env / .env.example  # Secrets (NOSTR_BUNKER_URL, NOSTR_CLIENT_SK, …) — nie committen
├── bridge/              # NIP-46→window.nostr-Bridge (entry, gebautes IIFE, generiertes connect.inject.js)
├── tools/               # GENERISCHE, parametrisierte Skripte (siehe Tabelle)
│   └── jobs/            # ephemere, generierte Job-Parameter (pro Lauf neu)
├── contexts/            # austauschbare Wissens-Groundings; `active` zeigt den Default
│   └── kryptooekonomie/ # DEFAULT-Kontext (source.pdf, raw.txt, grounding.md, README.md)
├── imagegen/            # FLUX2-Toolkit: generate.py, QA_RUBRIC.md, NEGATIVE_PROMPTS.md
├── sessions/            # EIN ORDNER PRO GENERIERUNG: YYYY-MM-DD-<slug>/ (siehe sessions/README.md)
└── docs/                # Plattform-Karten + Playbook (Selektoren, Editor-Referenz)
```

## Neue Session / nach `/new` (Kontext-Reset)

1. **Erinnern:** Projekt-Memory lädt automatisch → diese README ist die Quelle der Wahrheit.
2. **Einloggen:** `browser_run_code` mit `filename = autobot/tools/setup-session.run.js`
   → seedet Blossom, injiziert Bridge, stummer Reconnect (persistenter Client-Key), Login.
3. **Grounding:** `cat contexts/active` → `contexts/<name>/grounding.md` vollständig laden
   (chunked) — Protokoll in `contexts/README.md`. **Default bleibt `kryptooekonomie`.**
4. **Schreibregeln:** `WRITING_RULES.md` gilt für jeden Artikel.
5. **Session-Ordner:** `sessions/$(date +%F)-<slug>/` anlegen — ALLE Artefakte des Runs
   dort hinein (Rezept: `sessions/README.md`).

## Tools (alle generisch & parametrisiert)

| Skript | Aufruf | Zweck |
|---|---|---|
| `tools/setup-session.run.js` | browser_run_code (filename) | Kompletter Session-Bootstrap: Blossom-Seed + Bridge + stiller Login. |
| `tools/login.run.js` | browser_run_code (filename) | Nur NIP-46-Connect anstoßen (Teilschritt, selten nötig). |
| `tools/gen-inject.cjs` | `node …` | Nach `.env`-Änderung `bridge/connect.inject.js` neu erzeugen. |
| `tools/gen-upload-job.cjs` | `node … --files <pfad/ordner[,…]> [--server url]` | Upload-Job schreiben (Ordner → alle Bilder). |
| `tools/blossom-upload.run.js` | browser_run_code (filename) | Headless BUD-02-Upload der Job-Dateien → `[{file,url,hash}]`. |
| `tools/gen-illustrated.cjs` | `node … <sessionDir>` | `article.md` + `article-meta.json` + `image-urls.json` → spec/inject/illustrated. |
| `tools/gen-edit-job.cjs` | `node … [--dtag <d>] --spec <spec.json> [--publish] [--must csv] [--must-not csv] [--h2 n]` | Edit-Job schreiben. **Neue Artikel: `--dtag` weglassen** → Titel-Slug wird erzeugt (dTag = öffentlicher URL-Slug `/s/<site>/<dTag>`, nach dem Teilen unveränderlich — nie den App-Fallback `draft-<timestamp>` übernehmen). Bestehende Artikel: ihren dTag übergeben (Replace). |
| `tools/edit-article.run.js` | browser_run_code (filename) | Artikel anlegen/editieren über Edit-Route, Checks, Save locally, optional Live-Publish. Enthält alle Gotcha-Absicherungen (ProseMirror-Selektion, ignoreNextUpdate-Race, Signer-Guard, Bild+Tags-Pflicht). Für NEUE Artikel. |
| `tools/gen-quick-edit-job.cjs` | `node … --dtag <d> (--patch <patches.json> \| --spec <spec.json>) [--publish] [--must csv] [--must-not csv] [--title/--summary/--image …]` | Quick-Edit-Job schreiben (patches.json = `[{search, replace}]`, search muss exakt 1× matchen). |
| `tools/quick-edit.run.js` | browser_run_code (filename) | **SCHNELLSTER Weg für Text-Updates bestehender Artikel:** patcht das Live-Event direkt (Relay-Fetch → Patch → Gates → signEvent → Backend-POST + Relay-Broadcast → Relay-Verifikation) — EIN Lauf, kein Editor, kein separater Dry-Run (Gates laufen zwingend vor dem Signieren; `publish=false` = Preview). |

Bridge neu bauen nach Änderung: `npx esbuild bridge/bunker-bridge.entry.js --bundle --format=iife --platform=browser --target=es2020 --outfile=bridge/bunker-bridge.iife.js  # nostr-tools ggf. aus ~/Code/standup/node_modules auflösen`

## Dry-Run-Sicherheit

Live wird ein Nostr-Event **nur** durch den Publish-Schritt erzeugt (kind 30023 —
`edit-article.run.js`/`quick-edit.run.js` nur mit `--publish` im Job, und das nur auf
ausdrückliche menschliche Freigabe in derselben Sitzung). Alles andere (Editor füllen,
Save locally, Preview, Uploads zu Blossom) ist ungefährlich bzw. ersetzt nichts Öffentliches.
**Text-Updates bestehender Artikel:** `quick-edit.run.js` ist der Standardweg — die Gates
(must/must-not/Längen-Sanity) laufen dort zwingend VOR dem Signieren im selben Lauf und
ersetzen den früheren separaten Dry-Run-Lauf; danach automatische Relay-Verifikation.
Details: `docs/CLAUDE_MCP_PLAYBOOK.md` + `docs/ARTICLE_EDITOR.md`.

## Status (historisch)

- ✅ Login bewiesen (El Presidento Ben, persistenter Client-Key)
- ✅ Editor-Dry-Run, headless Blossom-Upload, Bild-QA-Loop, Site-Config
- ✅ Voller Artikel-Flow inkl. Live-Publish & Re-Publish (Replace via d-Tag) —
  Beispiele: `sessions/2026-06-09-selfcustody/`, `sessions/2026-06-09-petition/`
