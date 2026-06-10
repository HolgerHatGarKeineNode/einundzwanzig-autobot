# ARTICLE_EDITOR.md — Längsschnitt: Artikel-Editor & Publishing-Pipeline

Präzise Parameter-Referenz für das Erstellen eines NIP-23 Longform-Artikels (kind `30023`) im EINUNDZWANZIG-Hub. Bezieht sich auf die Domain `editor-articles`. Alle Pfade absolut.

**Wichtig vorab (für Playwright / Automatisierung):**
- Die App nutzt **Hash-Routing** (`createWebHashHistory`). Die Editor-URL ist `/#/dashboard/editor` (neu) bzw. `/#/dashboard/editor/<articleKey>` (bearbeiten).
- Alle `/dashboard/*`-Routen sind `meta.requiresAuth=true` → ohne aktive Session + aktiven Signer landet man auf `/#/login?redirect=...`.
- Es gibt **keine** `data-testid`/`aria-label` an den Editor-Feldern. Selektoren stützen sich auf i18n-Texte (englische Default-Keys, unten verbatim) und Platzhalter.

---

## 0. Quelldateien (verbatim, absolut)

| Rolle | Datei |
|---|---|
| View / Orchestrator | `<standup>/src/views/dashboard/EditorView.vue` |
| Editor-State (Composable) | `<standup>/src/composables/useEditor.js` |
| Metadaten-Sidebar | `<standup>/src/components/editor/EditorMetadata.vue` |
| Speichern/Publish-Toolbar | `<standup>/src/components/editor/EditorToolbar.vue` |
| Markdown-Format-Toolbar | `<standup>/src/components/editor/EditorFormatToolbar.vue` |
| Milkdown-Editor | `<standup>/src/components/editor/ArticleEditor.vue` |
| Vorschau | `<standup>/src/components/editor/ArticlePreview.vue` |
| Publish-Overlay | `<standup>/src/components/editor/PublishingOverlay.vue` |
| Draft-Store | `<standup>/src/stores/draft.store.js` |
| Draft/Publish-Service | `<standup>/src/services/draft.service.js` |
| Event-Builder | `<standup>/src/services/event-builder.service.js` |
| Kind-Konstanten | `<standup>/src/constants/nostr.js` |
| UI-Konstanten | `<standup>/src/constants/ui.js` |

Relevante Konstanten (verbatim):
- `KIND_ARTICLE = 30023`, `KIND_DRAFT = 30024`, `KIND_ENCRYPTED_DRAFT = 31234`, `KIND_DELETION = 5`
- `DEBOUNCE_AUTOSAVE = 30_000` (30 s Autosave-Intervall), `MAX_LOCAL_DRAFTS = 15`
- `FEATURED_CROP = { aspectRatio: 1.91, outputWidth: 1200, outputHeight: 630 }` (Cover-Crop)
- `NO_CROP = { aspectRatio: 0, outputWidth: 0, outputHeight: 0 }` (Inline-Bild, kein Crop)
- `PUBLISH_OVERLAY_TIMEOUT = 15_000` (Watchdog, ms)

---

## 1. Vollständige Feld-/Parameter-Referenz

Quelle der Wahrheit für den Editor-State: `useEditor()`. Default-`dTag` = `` `draft-${Date.now()}` `` (Zeile 12/47 in `useEditor.js`).

| Feld | Typ | Pflicht? | Erlaubte Werte / Transform | Default | Wo gesetzt | Playwright-Selektor-Hinweis |
|---|---|---|---|---|---|---|
| **title** | string | nein (Code erlaubt leer; UI-Fallback „Untitled") | keine Längen-/Format-Validierung | `''` | `input` oben in `EditorMetadata.vue` | borderloses `input` mit `placeholder = t('editor.articleTitlePlaceholder')`, Klassen `text-2xl font-bold` |
| **summary** | string | nein | beliebig; Tag nur wenn nicht-leer | `''` | `textarea` in `EditorMetadata.vue` | `textarea[rows="2"]` mit `placeholder = t('editor.summaryPlaceholder')`, `resize-none` |
| **image** (Cover/Featured, manuell) | string (URL) | nein | beliebige URL | `''` | `BaseInput` in `EditorMetadata.vue` | `BaseInput` mit `placeholder = t('editor.featuredImage')` |
| **image** (Cover via Upload) | string (URL) | nein | erzwungener Crop **1.91:1**, Output **1200×630** (OG-Card) | — | `@pick-image` → `openMediaPicker('featured')` | Ghost-Button `t('editor.uploadImage')` neben dem Cover-Input → öffnet `MediaPicker` mit `imagePickTarget='featured'` |
| **hashtags** (tag hinzufügen) | string[] (je Eintrag) | nein | `trim().toLowerCase().replace(/^#/, '')`, dedupliziert; **kein Max** | `[]` | `BaseInput` + Enter, `addTag()` | `BaseInput` mit `placeholder = t('editor.addTag')`, `@keydown.enter.prevent='addTag'` |
| **hashtags** (tag entfernen) | string | — | — | — | `@remove` an `BaseChip` | orange `BaseChip` `removable` (X) |
| **authorPubkey** (Autor / Veröffentlichen für jemand anderen) | string (npub1… \| 64-hex \| NIP-05) | nein | gespeichert als **hex**; NIP-05 via `nip05.queryProfile` (debounce **600 ms**); npub via `npubDecode` | `''` | `BaseInput`, `onAuthorInput`/`lookupAuthor` | Input nur sichtbar solange kein Profil aufgelöst; `placeholder = t('editor.authorPubkey')`, Hint `t('editor.authorPubkeyHint')`; aufgelöste Pille `bg-green-50` mit X (`clearAuthor`); Fehler `editor.authorNip05NotFound` / `editor.authorInvalid` / `editor.authorLookupFailed` |
| **content** (Markdown) | string (Markdown) | nein | CommonMark + GFM (Tabellen, Task-Lists, Strikethrough, Codeblöcke, Blockquotes) | `''` | Milkdown `ArticleEditor.vue` | `div.milkdown-editor` (`.ProseMirror`, **contenteditable**, **keine** textarea); Placeholder „Start writing your article…" |
| **contentType / Format** | enum | implizit | `article` \| `gallery` \| `interview` | `article` | Format-Karten rechts; `requestFormatSwitch()` | 3 Karten `t('editor.formatArticle')`/`formatGallery`/`formatInterview` (+ `*Desc`); Wechsel bei vorhandenem Content → Confirm `t('editor.switchFormatTitle')` / `t('confirm.switchFormat')` → **löscht Content** |
| **dTag / identifier** | string | auto | `` `draft-${Date.now()}` `` (neu) **oder** geerbt vom resumed Draft/Article-Key | auto | `useEditor.js` Z.12/47 | **NICHT** im UI editierbar — kein Eingabefeld |
| **published_at** | number (epoch s) | auto | `Math.floor(Date.now()/1000)` **immer** beim Publish | now | `draft.service.js#publish` Z.144 | **Keine** Scheduling-/Backdating-UI |
| **slug** | — | — | nicht im UI editierbar (backend leitet von dTag ab) | — | — | kein Feld |

### Felder, die der Editor NICHT hat (häufig erwartet, hier aber abwesend)

| Erwartetes Feld | Status im Editor | Wo stattdessen |
|---|---|---|
| **language / Sprache** | **nicht vorhanden** — kein Eingabefeld, kein `['l', …]`-Tag | — |
| **canonical / source URL** | **nicht im Editor-Formular**; nur programmatisch vom RSS-Importer als `extraTags = ['source', feedUrl]` (nur Drafts) | Imports-Domain (`draft.service.js` `extraTags`) |
| **Scheduling / geplantes Datum** | **nicht vorhanden**; `published_at` = jetzt | — |
| **visibility / gating** | **nicht vorhanden** im Editor (kein Sichtbarkeits-/Paywall-Feld) | Badge-Gates (auth-Domain), nicht artikelgebunden |
| **Site-Zuweisung** | **nicht im Editor** — passiert **nach** Publish | `ArticleInspector` (Articles-View), `siteStore.assign/unassign`; Event kind `30004` |
| **Magazin-Zuweisung** | im Inspector nur read-only | Magazin-Issue-Editor (separate Domain) |

---

## 2. Markdown-Format-Toolbar (nur bei `contentType === 'article'`)

Jeder Button mappt auf ein Milkdown-Command (`EditorView.vue#handleFormatCommand`). Buttons tragen `:title = t(<label>)`.

| Aktion | i18n-`title` | Milkdown-Command |
|---|---|---|
| Undo | `editor.undo` | `Undo` |
| Redo | `editor.redo` | `Redo` |
| Heading 1/2/3 | `editor.heading1` / `heading2` / `heading3` | `WrapInHeading` `{ level: 1\|2\|3 }` |
| Bold | `editor.bold` | `ToggleStrong` |
| Italic | `editor.italic` | `ToggleEmphasis` |
| Strikethrough | `editor.strikethrough` | `ToggleStrikeThrough` |
| Inline-Code | `editor.inlineCode` | `ToggleInlineCode` |
| Bullet-List | `editor.bulletList` | `WrapInBulletList` |
| Ordered-List | `editor.orderedList` | `WrapInOrderedList` |
| Blockquote | `editor.blockquote` | `WrapInBlockquote` |
| Code-Block | `editor.codeBlock` | `CreateCodeBlock` |
| Horizontal Rule | `editor.horizontalRule` | `InsertHr` |
| **Link** | `editor.link` | `window.prompt(t('editor.linkUrl'))` → `ToggleLink { href }` (native Prompt-Dialog!) |
| **Bild** (inline) | `editor.insertImage` | `openMediaPicker('inline')` → `insertMarkdown('\n![](<url>)\n')` (kein Crop, `aspectRatio=0`) |
| Table | `editor.table` | `InsertTable` |

**Vorschau:** Tabs oben im Schreib-Panel: `t('editor.writeMode')` (PenLine) ↔ `t('editor.previewMode')` (Eye). Preview rendert via `marked` (GFM); für gallery/interview kommen `GalleryViewer`/`InterviewViewer`.

---

## 3. EDITOR-FLOW (Schritt für Schritt)

### 3a. Von „neuer Artikel" bis „Draft speichern" (lokal — DRY-RUN-sicher)

1. Navigiere zu `/#/dashboard/editor` (Sidebar-Item `nav.editor`, PenLine-Icon, href `/dashboard/editor`).
   → `useEditor()` erzeugt frischen `dTag = draft-<Date.now()>`, `contentType = 'article'`.
2. Titel: in das `input` mit `placeholder=t('editor.articleTitlePlaceholder')` tippen → `update:title` → `markDirty()`.
3. (optional) Summary/Cover/Tags/Autor in der Sidebar setzen (siehe §1).
4. Content: in `div.milkdown-editor .ProseMirror` (contenteditable) tippen → `update:modelValue` → `markDirty()`.
5. **Speichern lokal:** Klick auf den Split-Button `t('editor.saveDraft')` (HardDrive-Icon, ChevronDown) → Dropdown öffnet → Item **„Save locally"** (`t('editor.saveLocal')` / Desc `editor.saveLocalDesc`).
   - **Hinweis Automatisierung:** Dropdown-Items nutzen `@mousedown.prevent` und das Menü schließt nach `150 ms` `blur` — also **mousedown** statt click+blur verwenden.
   - Pfad: `@save-draft` → `handleSaveDraft('local')` → `saveDraft('local')` → `draftService.saveLocal()` → **nur** `localStorage` Key `editor-drafts:<pubkey>` (gekappt auf `MAX_LOCAL_DRAFTS=15`). **Kein Nostr-Event, keine Signatur, kein Backend.**
6. **Autosave (implizit):** alle `DEBOUNCE_AUTOSAVE = 30_000 ms` falls `hasMeaningfulContent`; zusätzlich `onUnmounted` falls `isDirty` → ebenfalls nur `local`. Navigieren weg ⇒ kann still einen lokalen Draft persistieren.

### 3b. Von „neuer Artikel" bis „Draft auf Relays" (kind 30024) — LIVE

Wie 3a Schritte 1–4, dann:
- Split-Button-Dropdown → **„Save to relays"** (`t('editor.saveToRelays')` / `saveToRelaysDesc`, Cloud-Icon) → `@save-shared` → `handleSaveDraft('shared')`.
- Pfad: `draftService.saveSharedDraft()` → `eventBuilder.draft()` → **`signEvent` (SIGNATUR!)** → `apiService.submitEvent` (backend-first) → `relayService.publish` (Write-Relays).

Variante **verschlüsselt (kind 31234, NIP-37):** Dropdown → **„Save encrypted"** (`t('editor.saveEncrypted')` / `saveEncryptedDesc`, Lock-Icon) → `@save-encrypted`. Baut inneres kind-30024-JSON, verschlüsselt zu sich selbst (NIP-44 bevorzugt, NIP-04 Fallback), wrappt in kind 31234. **Wirft**, wenn der Signer weder NIP-44 noch NIP-04 kann.

### 3c. Von „neuer Artikel" bis „Publish" (kind 30023) — LIVE

Wie 3a Schritte 1–4, dann:
1. Primär-Button **„Publish"** (`t('editor.publish')`, `BaseButton variant=primary`) → `@publish` → `handlePublish()`.
2. `isPublishing=true` → **`PublishingOverlay`** (teleported in `<main>`, `role=status`, `t('editor.publishing')`); Watchdog `15 s`; Navigation geblockt via `onBeforeRouteLeave` (`window.confirm(t('editor.leavePublishingConfirm'))`) + `beforeunload`.
3. `publish()` → `draftStore.publishDraft()` → `draftService.publish()`:
   - `resolveAuthorPubkey(authorPubkey)` (npub→hex / 64-hex),
   - `eventBuilder.article({ … published_at: Math.floor(Date.now()/1000) })`,
   - **`signEvent` (SIGNATUR!)**,
   - `apiService.submitEvent` (backend-first, rendert HTML) → `relayService.publish` (Write-Relays).
4. Erfolg: Editor-Reset, Draft aus Store entfernt, Artikel **optimistisch** in `article.store` eingefügt, **zwei konvergierende Refetches** (`5 s`, `15 s`). Toast `t('toast.publishSuccess')`, Fehler `t('toast.publishError')`, „langsam" `t('toast.publishStillRunning')`.

> Fehler-Semantik (Drafts & Publish): backend-first; wirft nur, wenn **sowohl** Backend **als auch** alle Relays scheitern (`!backendOk && successes.length === 0`).

---

## 4. Erzeugte Nostr-Events (kind + Tags, verbatim aus `event-builder.service.js`)

### Publish — `eventBuilder.article()` → **kind `30023`** (`KIND_ARTICLE`)
`content` = Markdown. Tags in dieser Reihenfolge:
```
['d', dTag]
['title', title]
['summary', summary]          // nur wenn summary nicht-leer
['image', image]              // nur wenn image nicht-leer
['published_at', String(publishedAt)]   // immer beim Publish (now)
['t', hashtag]                // je hashtag eine Zeile
['p', authorPubkey, '', 'author']        // nur wenn authorPubkey gesetzt
['client', 'EINUNDZWANZIG HUB']
```
`created_at = Math.floor(Date.now()/1000)`.

### Shared Draft — `eventBuilder.draft()` → **kind `30024`** (`KIND_DRAFT`)
Gleiche Form wie `article`, **ohne** `['client', …]`, **plus** optional `extraTags` (z. B. `['source', feedUrl]` vom RSS-Import; nicht-Array-Einträge werden defensiv übersprungen):
```
['d', dTag]
['title', title]
['summary', summary]?         ['image', image]?
['published_at', …]?          ['t', hashtag]*
['p', authorPubkey, '', 'author']?
…extraTags
```

### Encrypted Draft — `eventBuilder.encryptedDraft()` → **kind `31234`** (`KIND_ENCRYPTED_DRAFT`)
Äußeres Event, `content` = NIP-44/04-Chiffre des inneren kind-30024-JSON:
```
['d', dTag]
['k', '30024']
```
`published_at`, `source` und die übrigen Felder reisen **im verschlüsselten inneren** Event (Privacy).

### Draft löschen — `eventBuilder.deletion()` → **kind `5`** (`KIND_DELETION`, NIP-09)
Nur für relay-/encrypted-Drafts (lokale werden nur aus dem Store gedroppt). Gruppiert nach `kind` → max. ein Signer-Prompt je Kind:
```
['e', eventId]*   ['a', aRef]*   ['k', String(kind)]?
content = reason  // 'Draft deleted'
```

---

## 5. DRY-RUN-CUTOFF (letzter sicherer Schritt vor Live-Event)

**Sicherer Stop-Punkt = „Save locally" (`type='local'`) und der 30-s-Autosave.**

- `draftService.saveLocal()` schreibt **ausschließlich** nach `localStorage` (`editor-drafts:<pubkey>`). Es wird **nichts signiert** (`signEvent` wird nicht aufgerufen) und **nichts** an Backend/Relays gesendet.
- Sobald **eine** der folgenden Aktionen ausgelöst wird, ist die Dry-Run-Grenze überschritten (es folgt `signEvent` = Signatur + Publish):
  - „Save to relays" (`@save-shared`, kind 30024),
  - „Save encrypted" (`@save-encrypted`, kind 31234),
  - „Publish" (`@publish`, kind 30023),
  - Draft löschen für relay-/encrypted-Drafts (kind 5).
- **Achtung Auto-Persistenz:** Der 30-s-Autosave und `onUnmounted`-Save bleiben im Dry-Run (nur `local`), schreiben aber still einen lokalen Draft — beim automatisierten Testen kann das Wegnavigieren also einen lokalen Draft hinterlassen, ohne je ein Nostr-Event zu erzeugen.

**Faustregel für Bots:** Editor frei befüllen + „Save locally" / Autosave = 100 % event-frei. Erst Klick auf „Save to relays", „Save encrypted" oder „Publish" löst eine Signatur und damit ein Live-Event aus.
