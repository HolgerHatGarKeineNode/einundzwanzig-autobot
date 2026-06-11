# Einundzwanzig Autobot

Claude schreibt, illustriert und publiziert Longform-Artikel (Nostr kind 30023)
auf einer [Einundzwanzig-Board](https://media.einundzwanzig.space)-Instanz —
gesteuert über Playwright-MCP, geerdet auf **deine eigenen Wissens-Kontexte**
(z. B. ein Buch als PDF), standardmäßig im **Dry-Run** (lokaler Draft).
Live-Publish nur auf ausdrückliche Freigabe.

## Was du brauchst

| | Pflicht? | |
|---|---|---|
| [Claude Code](https://code.claude.com) + Playwright-MCP | ✅ | Claude ist der Operator |
| Node.js ≥ 20 | ✅ | Job-Generatoren, Bridge-Build |
| Nostr-Account + NIP-46-Signer (z. B. [Amber](https://github.com/greenart7c3/Amber)) | ✅ | Login & Signieren — der Bot sieht deinen nsec nie |
| Mindestens **ein Wissens-Kontext** (Buch-PDF o. Textdatei) | ✅ | ohne Grounding schreibt der Bot nicht |
| poppler-utils (`pdftotext`) | optional | Kontexte aus PDFs extrahieren |
| NVIDIA-GPU + FLUX.2 | optional | lokale Bildgenerierung — sonst eigene Bilder nutzen |
| [OpenRouter](https://openrouter.ai)-Account + `ffmpeg` | optional | Artikel-Vertonung (Audio-MP3 via Gemini TTS) — API-Key aus [openrouter.ai/keys](https://openrouter.ai/keys) |

Details zu jedem Punkt: **[INSTALL.md](INSTALL.md)**.

## Quickstart

```bash
git clone <repo-url> && cd einundzwanzig-autobot
npm install
npm run setup            # .env anlegen, Client-Key erzeugen, Bridge bauen, Checks
```

Dann die drei Einrichtungsschritte (das Setup zeigt sie dir auch an):

1. **Login:** `bunker://…`-URL aus Amber in `.env` eintragen → `npm run gen:inject`
   ([INSTALL.md → Nostr-Login](INSTALL.md))
2. **Kontext:** mindestens EINEN Wissens-Kontext anlegen und in `contexts/active`
   eintragen (mehrere möglich, ein Name pro Zeile — alle werden gemischt) —
   Rezept in [contexts/README.md](contexts/README.md)
3. **Ziel prüfen:** `autobot.config.json` → `baseUrl` (Default:
   `https://media.einundzwanzig.space`; eigene Board-Instanz einfach eintragen)

## Loslegen

Claude Code **in diesem Ordner** starten und z. B. sagen:

> Starte eine Session und schreib einen Artikel über …

Claude führt dann `tools/setup-session.run.js` aus (Login), lädt deine aktiven
Groundings, schreibt nach `WRITING_RULES.md`, generiert optional Bilder
(FLUX2 + QA-Loop), lädt sie zu Blossom hoch und legt einen **lokalen Draft** an.
Live geht ein Artikel erst, wenn du es ausdrücklich freigibst.

## Konfiguration

| Datei | Inhalt |
|---|---|
| `.env` | **Secrets**: `NOSTR_BUNKER_URL`, `NOSTR_CLIENT_SK`, optional `OPENROUTER_API_KEY` (für Audio-Vertonung, Key aus [openrouter.ai/keys](https://openrouter.ai/keys)) — nie committen |
| `autobot.config.json` | Alles Nicht-Geheime: `baseUrl`, Blossom-Server, Relays, FLUX2-Python-Pfad, `mustNotDefault` (Tabu-Wörter-Gate) |
| `autobot.config.local.json` | Optional, gitignored: **deine persönlichen Overrides** — überschreibt Schlüssel aus `autobot.config.json` (z. B. eigene Tabu-Wörter) |
| `contexts/active` | Deine aktiven Wissens-Kontexte (ein Name pro Zeile, lokal) |
| `WRITING_RULES.md` | Schreibregeln (Handwerk) — gelten für alle Artikel |
| `WRITING_RULES.local.md` | Optional, gitignored: **deine persönlichen Schreibregeln** (Stil-Entscheidungen, Tabu-Begründungen) — gleiche Verbindlichkeit |

## Ordnerstruktur

```
├── README.md            # diese Datei — Quelle der Wahrheit
├── INSTALL.md           # Abhängigkeiten Schritt für Schritt
├── WRITING_RULES.md     # Schreibregeln (stilles Grounding, Humanisierung)
├── autobot.config.json  # zentrale Konfiguration (nicht-geheim)
├── .env                 # Secrets (aus .env.example, gitignored)
├── bridge/              # NIP-46→window.nostr-Bridge (Build: npm run build:bridge)
├── tools/               # generische, parametrisierte Skripte (Tabelle unten)
│   └── jobs/            # ephemere, generierte Job-Parameter (pro Lauf neu)
├── contexts/            # DEINE Wissens-Groundings (initial leer; `active` = Auswahl)
├── imagegen/            # FLUX2-Toolkit: generate.py, QA-Rubrik, INSTALL.md
├── sessions/            # ein Ordner pro Generierung: YYYY-MM-DD-<slug>/
└── docs/                # Plattform-Karten + Playbook (Selektoren, Editor-Referenz)
```

## Tools (alle generisch & parametrisiert)

| Skript | Aufruf | Zweck |
|---|---|---|
| `tools/setup-session.run.js` | browser_run_code (filename) | Kompletter Session-Bootstrap: Blossom-Seed + Bridge + stiller Login. |
| `tools/login.run.js` | browser_run_code (filename) | Nur NIP-46-Connect anstoßen (Teilschritt, selten nötig). |
| `tools/gen-inject.cjs` | `npm run gen:inject` | Nach `.env`-Änderung `bridge/connect.inject.js` neu erzeugen. |
| `tools/gen-upload-job.cjs` | `node … --files <pfad/ordner[,…]> [--server url]` | Upload-Job schreiben (Ordner → alle Bilder). |
| `tools/blossom-upload.run.js` | browser_run_code (filename) | Headless BUD-02-Upload der Job-Dateien → `[{file,url,hash}]`. |
| `tools/gen-illustrated.cjs` | `node … <sessionDir>` | `article.md` + `article-meta.json` + `image-urls.json` → spec/inject/illustrated. |
| `tools/gen-edit-job.cjs` | `node … [--dtag <d>] --spec <spec.json> [--publish] [--must csv] [--must-not csv] [--h2 n]` | Edit-Job schreiben. **Neue Artikel: `--dtag` weglassen** → Titel-Slug wird erzeugt (dTag = öffentlicher URL-Slug `/s/<site>/<dTag>`, nach dem Teilen unveränderlich — nie den App-Fallback `draft-<timestamp>` übernehmen). Bestehende Artikel: ihren dTag übergeben (Replace). |
| `tools/edit-article.run.js` | browser_run_code (filename) | Artikel anlegen/editieren über Edit-Route, Checks, Save locally, optional Live-Publish. Enthält alle Gotcha-Absicherungen. Für NEUE Artikel. |
| `tools/gen-quick-edit-job.cjs` | `node … --dtag <d> (--patch <patches.json> \| --spec <spec.json>) [--publish] [--must csv] [--must-not csv] [--title/--summary/--image …]` | Quick-Edit-Job schreiben (patches.json = `[{search, replace}]`, search muss exakt 1× matchen). |
| `tools/quick-edit.run.js` | browser_run_code (filename) | **SCHNELLSTER Weg für Text-Updates bestehender Artikel:** patcht das Live-Event direkt (Relay-Fetch → Patch → Gates → signEvent → Backend-POST + Relay-Broadcast → Relay-Verifikation) — EIN Lauf, kein Editor (`publish=false` = Preview). |
| `tools/tts-generate.cjs` | `node … --in <article.md> --out <audio.mp3> [--voice Algieba] [--title "…"] [--sample] [--dry]` | **Artikel-Vertonung** via OpenRouter (Gemini TTS) → komprimiertes mobiles MP3 (mono, 48 kbps, loudnorm). Reines Node, kein Browser. `--dry` = nur Vorlese-Text prüfen, `--sample` = kurze Hörprobe. Braucht `OPENROUTER_API_KEY` in `.env` + ffmpeg. |
| `tools/blossom-upload-node.cjs` | `node … --files <pfad[,…]> [--server url]` | **Headless** BUD-02-Upload (kein Browser): signiert das kind-24242-Auth-Event direkt via NIP-46-Bunker (gleicher Client-Key wie die Bridge → stille Freigabe). Für MP3s u. a. Nicht-Bild-Blobs. Rückgabe `[{file,url,hash}]`. |
| `tools/quick-edit-node.cjs` | `node …` (Preview) / `node … --go` (LIVE) | **Headless** Quick-Edit (kein Browser): funktionsgleicher Zwilling zu `quick-edit.run.js` für Umgebungen ohne lauffähige Playwright-Runner. Liest denselben Job (`gen-quick-edit-job.cjs`), gleiche Gates, signiert via NIP-46-Bunker. Ohne `--go` nur Preview. |
| `tools/setup.cjs` | `npm run setup` | Erst-Einrichtung & Gesundheitscheck (idempotent). |

## Audio-Vertonung (optional)

**Default:** Beim Erzeugen eines Artikel-Events wird **standardmäßig eine Audioversion
generiert** und als Hör-Link eingebettet (Stimme: `Algieba`). Nur übersprungen, wenn
kein `OPENROUTER_API_KEY` gesetzt ist oder der Nutzer es ausdrücklich abwählt.

**Voraussetzung:** `OPENROUTER_API_KEY` in `.env` (Key aus
[openrouter.ai/keys](https://openrouter.ai/keys)) + `ffmpeg`. Kosten ~0,03 $/Audio-Minute (Gemini 3.1).

1. **Vollvertonung:** `node tools/tts-generate.cjs --in <session>/article-illustrated.md --title "…" --voice Algieba --out <session>/audio/<slug>.mp3` (Stimme wechseln/vorhören: `--sample` + andere Namen; ruhig/seriös männlich: `Charon`, `Rasalgethi`, `Iapetus`, `Algieba`, `Sadaltager`; 30 Gemini-Stimmen).
2. **Hochladen:** `node tools/blossom-upload-node.cjs --files <session>/audio/<slug>.mp3` → Blossom-URL.
3. **Einbetten:** zwei Blockquote-Boxen (oben Hinweis-Box, unten nach Trennlinie) nach der
   festen Vorlage **[docs/AUDIO_EMBED.md](docs/AUDIO_EMBED.md)** — rendert auf dem Board
   (`marked`) und in allen Nostr-Clients.
4. **Publizieren:** neuer Artikel → Boxen in `article-spec.json` → `edit-article`; bestehender
   Live-Artikel → `audio-patches.json` → `gen-quick-edit-job.cjs --patch …` → `quick-edit`
   (bzw. headless `quick-edit-node.cjs`).

## Dry-Run-Sicherheit

Live wird ein Nostr-Event **nur** durch den Publish-Schritt erzeugt
(`edit-article.run.js`/`quick-edit.run.js` nur mit `--publish` im Job — und das
nur auf ausdrückliche menschliche Freigabe in derselben Sitzung). Alles andere
(Editor füllen, Save locally, Preview, Blossom-Uploads) ist ungefährlich bzw.
ersetzt nichts Öffentliches. Die must/must-not/Sanity-Gates laufen zwingend VOR
dem Signieren; nach jedem Publish folgt eine Relay-Verifikation.
Details: `docs/CLAUDE_MCP_PLAYBOOK.md` + `docs/ARTICLE_EDITOR.md`.

## Lizenz

[MIT](LICENSE)
