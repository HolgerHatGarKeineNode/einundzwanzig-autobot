# einundzwanzig-autobot

Claude-gesteuerte Playwright-MCP-Automation für eine **Einundzwanzig-Board-Instanz**
(Nostr-Publishing-Plattform; Ziel = `baseUrl` in `autobot.config.json`, Default:
`https://media.einundzwanzig.space`): Artikel schreiben, illustrieren (FLUX2 + QA),
hochladen (Blossom) und als Draft anlegen bzw. — nur auf ausdrückliche Freigabe — live
publizieren (kind 30023).

## Quelle der Wahrheit

`README.md` (Struktur, Tools, Session-Protokoll) → von dort: `WRITING_RULES.md`,
`contexts/README.md`, `sessions/README.md`, `docs/CLAUDE_MCP_PLAYBOOK.md`.

## Plattform-Codebase: standup (falls lokal vorhanden)

Die Zielplattform ist das [Einundzwanzig Board](https://github.com/Buho-Ecosystem/standup)
(Vue 3 SPA, Milkdown-Editor, nostr-tools). Liegt die Codebase lokal vor
(z. B. `~/Code/standup`), **bei JEDER Frage, wie die App
intern funktioniert** (Selektoren, Stores, Editor-Verhalten, Publish-Flow, i18n-Texte),
dort nachsehen statt raten — sonst `docs/` (Plattform-Karten) verwenden:

- Editor: `src/views/dashboard/EditorView.vue`, `src/components/editor/*`,
  `src/composables/useEditor.js` (dTag = `route.params.articleKey`!)
- Stores: `src/stores/draft.store.js` (publishDraft, localStorage `editor-drafts:<pubkey>`),
  `article.store.js`, `site.store.js`
- i18n (Platzhalter/Buttontexte für Selektoren): `src/i18n/en.js`
- Brücken bauen: Verhalten zuerst im standup-Code verifizieren, dann hier ein
  Tool/Gotcha ergänzen (so entstanden ProseMirror-Selektions-Fix & ignoreNextUpdate-Race).

## Eiserne Regeln

1. **Gates vor jedem Publish.** Live publizieren NUR `tools/edit-article.run.js` (neue
   Artikel) bzw. `tools/quick-edit.run.js` (Text-Updates bestehender Artikel) mit
   `--publish` im Job — und das nur nach ausdrücklicher menschlicher Freigabe in
   derselben Sitzung. Die must/must-not/Sanity-Gates laufen in beiden Runnern zwingend
   VOR dem Signieren — ein separater Dry-Run-Lauf ist NICHT nötig (bei Unsicherheit:
   `quick-edit` ohne `--publish` = Preview). Nach jedem Publish: Relay-Verifikation
   (kind 30023, `#d`-Filter — quick-edit macht sie automatisch), nie der UI glauben.
2. **Schreibregeln sind Pflicht** (`WRITING_RULES.md` **plus, falls vorhanden,
   `WRITING_RULES.local.md`** — persönliche Regeln des Nutzers, gleiche
   Verbindlichkeit, gewinnen bei Konflikt): stilles Grounding (Quelle/Buch NIE
   nennen), Haltung nie etikettieren, Text humanisieren.
3. **Grounding:** `cat contexts/active` → kann MEHRERE Kontexte listen (ein Name
   pro Zeile); für JEDEN `contexts/<name>/grounding.md` VOLLSTÄNDIG laden, bevor
   NEU geschrieben wird — Artikel entstehen aus der vermischten Sicht aller
   aktiven Groundings. **Ohne mindestens einen aktiven Kontext werden KEINE
   neuen Artikel geschrieben** (Nutzer bitten, einen anzulegen). Für reine
   Text-Patches an bestehenden (bereits geerdeten) Artikeln reicht gezieltes Laden
   der themenrelevanten Abschnitte. Neue Kontexte aus PDFs: `contexts/README.md`.
4. **Ein Session-Ordner pro Run:** `sessions/YYYY-MM-DD-<slug>/` — nichts flach ins Root.
5. **Bild-QA ist Pflicht** für jedes generierte Bild (`imagegen/QA_RUBRIC.md`, max 3 Re-Rolls).
6. **Secrets** (`.env`, `bridge/connect.inject.js`) nie loggen, nie committen.
7. **Audio per Default.** Beim Erzeugen eines Artikel-Events standardmäßig eine
   Audioversion generieren (`tools/tts-generate.cjs`, Stimme `Algieba`), via
   `tools/blossom-upload-node.cjs` hochladen und als zwei Hör-Boxen einbetten
   (feste Vorlage: `docs/AUDIO_EMBED.md` — oben Hinweis-Box, unten nach Trennlinie).
   Übersprungen NUR ohne `OPENROUTER_API_KEY` oder auf ausdrücklichen Wunsch des
   Nutzers. Headless-Publish-Pfad (falls Browser-Runner nicht laufen):
   `tools/quick-edit-node.cjs` / Upload via `blossom-upload-node.cjs`.

## Session-Start (nach Kontext-Reset)

1. `browser_run_code` mit `filename=<projektroot>/tools/setup-session.run.js`
   (Blossom-Seed + Bridge + stiller NIP-46-Reconnect + Login). Login-Klick navigiert
   manchmal erst nach dem Messzeitpunkt → bei `ok:false` kurz nachprüfen statt neu einloggen.
2. Grounding laden (Regel 3), `WRITING_RULES.md` + ggf. `WRITING_RULES.local.md` beachten.
3. `window.nostr` ist ein Laufzeit-Shim: nach Browser-Neustart/Reload weg → Schritt 1
   wiederholen. Alle Runner haben Signer-Guards und brechen sauber ab.

## Technik-Eckpunkte

- `autobot.config.local.json` (gitignored, optional) überschreibt Schlüssel aus
  `autobot.config.json` — jedes Tool, das die Config liest, merged sie (shallow:
  Schlüssel werden als Ganzes ersetzt). Persönliche Tabu-Wörter: `mustNotDefault`.
- `tools/*.run.js` = genau EIN `async (page) => {…}`-Ausdruck (MCP-Loader evalt sie);
  Parameter via generierte `tools/jobs/*.inject.js` (`gen-edit-job.cjs`, `gen-upload-job.cjs`,
  `gen-quick-edit-job.cjs`).
- **dTag = öffentlicher URL-Slug** (`/s/<site>/<dTag>`), nach dem ersten Teilen
  unveränderlich. Neue Artikel: `gen-edit-job.cjs` OHNE `--dtag` aufrufen → Titel-Slug
  wird erzeugt. NIE den App-Fallback `draft-<timestamp>` übernehmen (`useEditor.js:12`
  generiert ihn, wenn die Editor-Route ohne articleKey geöffnet wird). Vor dem ersten
  Publish eines neuen Slugs: Relay-Check, dass kein fremder Artikel ihn belegt.
  Bestehende Artikel behalten ihren dTag (Replace) — auch wenn er hässlich ist.
- FLUX2 (optional): `<flux2Python aus autobot.config.json> imagegen/generate.py
  --manifest …` (Manifest liegt IM Session-Ordner, `output_dir` ebenda). Nicht
  eingerichtet → Generierung überspringen, eigene Bilder des Nutzers verwenden
  (Setup: `imagegen/INSTALL.md`).
- Playwright-MCP konfiguriert in `~/.claude/playwright-mcp.config.json`
  (viewport null, festes Fenster — Einrichtung: `INSTALL.md`) — `--viewport-size`
  nie setzen.
- Browser-Dateizugriffe (Screenshots etc.) sind auf die Session-Workspace-Roots
  beschränkt → Claude-Sessions für dieses Projekt IN DIESEM Ordner starten.

## Sprache

Mit dem Nutzer Deutsch; Artikel auf Deutsch nach `WRITING_RULES.md`.
