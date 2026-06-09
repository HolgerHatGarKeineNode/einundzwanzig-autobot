# einundzwanzig-autobot

Claude-gesteuerte Playwright-MCP-Automation für **https://media.einundzwanzig.space**
(EINUNDZWANZIG Nostr-Publishing-Plattform): Artikel schreiben, illustrieren (FLUX2 + QA),
hochladen (Blossom) und als Draft anlegen bzw. — nur auf ausdrückliche Freigabe — live
publizieren (kind 30023).

## Quelle der Wahrheit

`README.md` (Struktur, Tools, Session-Protokoll) → von dort: `WRITING_RULES.md`,
`contexts/README.md`, `sessions/README.md`, `docs/CLAUDE_MCP_PLAYBOOK.md`.

## Schwester-Projekt: ~/Code/standup (die Plattform selbst)

`/home/user/Code/standup` ist die **Codebase der Zielplattform** (Vue 3 SPA,
Milkdown-Editor, nostr-tools; CodeGraph indexiert). **Bei JEDER Frage, wie die App
intern funktioniert** (Selektoren, Stores, Editor-Verhalten, Publish-Flow, i18n-Texte),
dort nachsehen statt raten:

- Editor: `src/views/dashboard/EditorView.vue`, `src/components/editor/*`,
  `src/composables/useEditor.js` (dTag = `route.params.articleKey`!)
- Stores: `src/stores/draft.store.js` (publishDraft, localStorage `editor-drafts:<pubkey>`),
  `article.store.js`, `site.store.js`
- i18n (Platzhalter/Buttontexte für Selektoren): `src/i18n/en.js`
- Brücken bauen: Verhalten zuerst im standup-Code verifizieren, dann hier ein
  Tool/Gotcha ergänzen (so entstanden ProseMirror-Selektions-Fix & ignoreNextUpdate-Race).

## Eiserne Regeln

1. **Dry-Run zuerst.** Live publiziert NUR `tools/edit-article.run.js` mit `--publish`
   im Job — und das nur nach ausdrücklicher menschlicher Freigabe in derselben Sitzung.
   Nach jedem Publish: Relay-Verifikation (kind 30023, `#d`-Filter), nie der UI glauben.
2. **Schreibregeln sind Pflicht** (`WRITING_RULES.md`): stilles Grounding (Quelle/Buch
   NIE nennen), Haltung nie etikettieren, Text humanisieren.
3. **Grounding:** `cat contexts/active` → `contexts/<name>/grounding.md` VOLLSTÄNDIG
   laden, bevor geschrieben wird (Default: `kryptooekonomie`). Neue Kontexte aus PDFs:
   `contexts/README.md`.
4. **Ein Session-Ordner pro Run:** `sessions/YYYY-MM-DD-<slug>/` — nichts flach ins Root.
5. **Bild-QA ist Pflicht** für jedes generierte Bild (`imagegen/QA_RUBRIC.md`, max 3 Re-Rolls).
6. **Secrets** (`.env`, `bridge/connect.inject.js`) nie loggen, nie committen.

## Session-Start (nach Kontext-Reset)

1. `browser_run_code` mit `filename=/home/user/Code/einundzwanzig-autobot/tools/setup-session.run.js`
   (Blossom-Seed + Bridge + stiller NIP-46-Reconnect + Login). Login-Klick navigiert
   manchmal erst nach dem Messzeitpunkt → bei `ok:false` kurz nachprüfen statt neu einloggen.
2. Grounding laden (Regel 3), `WRITING_RULES.md` beachten.
3. `window.nostr` ist ein Laufzeit-Shim: nach Browser-Neustart/Reload weg → Schritt 1
   wiederholen. Alle Runner haben Signer-Guards und brechen sauber ab.

## Technik-Eckpunkte

- `tools/*.run.js` = genau EIN `async (page) => {…}`-Ausdruck (MCP-Loader evalt sie);
  Parameter via generierte `tools/jobs/*.inject.js` (`gen-edit-job.cjs`, `gen-upload-job.cjs`).
- FLUX2: `/home/user/Apps/FLUX2/.venv/bin/python imagegen/generate.py --manifest …`
  (Manifest liegt IM Session-Ordner, `output_dir` ebenda).
- Playwright-MCP global konfiguriert in `~/.claude/playwright-mcp.config.json`
  (viewport null, Fenster 1900×980) — `--viewport-size` nie setzen.
- Browser-Dateizugriffe (Screenshots etc.) sind auf die Session-Workspace-Roots
  beschränkt → Claude-Sessions für dieses Projekt IN DIESEM Ordner starten.

## Sprache

Mit dem Nutzer Deutsch; Artikel auf Deutsch nach `WRITING_RULES.md`.
