# CLAUDE_MCP_PLAYBOOK.md

Playbook zum Steuern der **Live-Site `https://media.einundzwanzig.space`** mit Claude über **Playwright-MCP**, plus ein wiederverwendbares **Artikel-Prompt-Template**.

Diese App nutzt **Hash-Routing** (`createWebHashHistory`). Alle URLs sind hash-präfigiert, z. B. `https://media.einundzwanzig.space/#/login` und `https://media.einundzwanzig.space/#/dashboard/editor`. In den Auth-Komponenten gibt es **keine** `data-testid`/`aria-label`-Attribute — Selektoren stützen sich auf **stabilen Button-TEXT** (i18n Englisch) und die feste Input-ID `#nsec-input`.

> **WICHTIGER VORBEHALT zur Amber-/NIP-46-Anmeldung.** Die Auth-Domain-Map beschreibt den UI-Pfad „Sign in with Amber" als **App-initiierten** Handshake: Die App erzeugt eine `nostrconnect://`-URI und zeigt einen **QR-Code**, den der Nutzer in der Amber-App scannt. Ein Bot kann einen QR-Code **nicht** scannen. Der Nutzer liefert in `/autobot/.env` aber eine **`bunker://`-URL** (`NOSTR_BUNKER_URL`) — das ist der **umgekehrte, Signer-initiierte** NIP-46-Pfad. Das Standard-Login-Modal (`AmberConnectModal.vue`) hat **kein Eingabefeld**, in das man eine `bunker://`-URL einfügen könnte; es generiert nur die `nostrconnect://`-URI und wartet auf den eingehenden Connect. **Deshalb ist die `bunker://`-URL über die sichtbare UI allein nicht eintragbar.** Teil 1 beschreibt daher den realistisch automatisierbaren Weg (Programmatische NIP-46/`bunker://`-Aktivierung bzw. NIP-07-Injektion) und den UI-Weg nur als das, was er ist: ein QR-Scan-Pfad, der menschliche Mitwirkung braucht.

---

## Teil 1 — Schritt-für-Schritt-Runbook (Playwright-MCP)

### Vorbedingungen

- `.env` (Projektroot) enthält:
  - `NOSTR_BUNKER_URL=bunker://<bunkerPubkey>?relay=wss://...&secret=...`
  - `NOSTR_CLIENT_SK=<64 hex>` (von `npm run setup` erzeugt)
- Die Ziel-URL kommt aus `autobot.config.json` (`baseUrl`).
- Die `.env` ist **gitignored** und wird **nie** committet. Den Wert von `NOSTR_BUNKER_URL` **niemals** in Logs, Snapshots oder Ausgaben ausgeben.

#### Env laden (kein `cat` der Secrets in den Chat)

```bash
set -a; source .env; set +a   # im Projektroot
```

Die `bunker://`-URL bleibt in `$NOSTR_BUNKER_URL` und wird nur über `browser_run_code`/`browser_evaluate` per Closure in den Seitenkontext gereicht — nie als Klartext in einen Snapshot.

---

### Schritt 0 — Browser öffnen und zur Login-Seite navigieren

```
browser_navigate
  url: "https://media.einundzwanzig.space/#/login"
```

```
browser_snapshot
```

Im Snapshot erwartete Elemente (siehe Auth-Map, Komponente `components/auth/LoginPrompt.vue`):

- **Wenn** eine NIP-07-Extension erkannt wird (`window.nostr`): primärer oranger Button mit Text **`Connect with Nostr`** (i18n `auth.loginWithExtension`, `BaseButton variant=primary size=lg class w-full`, lucide-Icon `LogIn`).
- **Wenn nicht:** Fallback-Text **`No Nostr extension detected. Install a NIP-07 signer like nos2x, Alby, or Nostr Connect to get started.`** (i18n `auth.noExtension`).
- Darunter immer ein kleiner Textbutton **`More login options`** (i18n `auth.moreOptions`, mit `ChevronDown`/`ChevronUp`).

---

### Schritt 1 — Anmeldung via NIP-46 Amber Bunker (`bunker://`)

#### Schritt 1A — Erweiterte Optionen aufklappen (UI-Inspektion)

```
browser_click
  element: "Textbutton 'More login options'"
  ref: <ref aus Snapshot für button mit Text "More login options">
```

```
browser_snapshot
```

Jetzt sichtbar (i18n-Texte aus der Auth-Map):

- Oranger Button **`Sign in with Amber`** (i18n `auth.loginWithAmber`, lucide `Smartphone`, `background #f97316`).
- Stiller Textbutton **`Developer mode (nsec)`** (i18n `auth.loginWithNsec`, lucide `Terminal`).

#### Schritt 1B — Was der `Sign in with Amber`-Button real tut (und warum er für `bunker://` nicht reicht)

Ein Klick auf **`Sign in with Amber`** öffnet `AmberConnectModal.vue`. Beim Mount ruft es `prepareAmberConnect()` auf:

- generiert ein ephemeres secp256k1-Keypair (`localSk`) + 16-Byte-Hex-Secret,
- baut eine `nostrconnect://<localPubkeyHex>?secret=<hex>&metadata=<json>&relay=wss://relay.damus.io&relay=wss://relay.nostr.band&relay=wss://nos.lol`-URI,
- rendert diese als **220×220-QR** (Modal-Titel **`Scan with Amber`** / `auth.amberScanTitle`, `img alt 'Amber connection QR code'`),
- `completeAmberConnect()` wartet dann via `BunkerSigner.fromURI` auf den eingehenden Connect (**90 s Countdown**, `NIP46_HANDSHAKE_TIMEOUT_S`).

Dieses Modal nimmt **keine** `bunker://`-URL entgegen. Es ist der App-initiierte QR-Pfad → **nicht botfähig**. Wenn der Nutzer ausschließlich diesen UI-Pfad will, ist menschliches Scannen mit der Amber-App nötig:

- (manuell) Amber-App öffnen → QR aus dem Snapshot scannen → in Amber **Connect** tippen.
- Auf Erfolg (Status `Waiting for Amber to connect…` / `auth.amberWaiting` verschwindet) wartet der Bot mit:

```
browser_wait_for
  textGone: "Waiting for Amber to connect…"
```

#### Schritt 1C — Empfohlener automatisierbarer Pfad: `bunker://` programmatisch aktivieren

Da die `bunker://`-URL ein Signer-initiierter Reconnect-Datensatz ist (genau das Format, das die App in `localStorage 'nostr-amber-session'` bzw. beim `restoreAmberSession()` aus `bunker://<bunkerPubkey>?relay=...` rekonstruiert), ist der zuverlässige Bot-Weg, den Amber-Signer **programmatisch** über den App-eigenen Mechanismus zu aktivieren, statt das QR-Modal zu durchlaufen.

> Hinweis: Die genaue programmatische API (`session.loginWithAmber(...)` bzw. `signer.service.js` `activateSigner`) ist nicht auf `window` exponiert — die Signer laufen als Modul-Singletons in `services/signer.service.js`. Das macht eine reine In-Page-Injektion ohne App-Hook fragil. Wenn euer Autobot-Harness einen Setup-Hook hat, der `BunkerSigner.fromURI(bunkerUrl)` baut und an `session.loginWithAmber({signer,pool,bunkerPubkey,relayUrls,pubkey,localSk})` übergibt, ruft diesen **vor** der Navigation auf. Andernfalls nutzt den NIP-07-Fallback (Schritt 1E), der robust und vollständig botfähig ist.

Vorbereitung des `localStorage`-Reconnect-Datensatzes (falls euer Harness die Bunker-Session selbst aufbaut und nur persistieren muss), gesetzt **vor** dem Laden der App:

```
browser_run_code
  // bunkerUrl wird aus process.env per Closure übergeben — niemals als Literal hier hineinschreiben
  code: |
    async (bunkerUrl) => {
      // Reconnect-Marker, die restoreSession() liest:
      localStorage.setItem('nostr-auth-method', 'amber');
      // Die App rekonstruiert den BunkerSigner aus 'nostr-amber-session':
      // { localSkHex, bunkerPubkey, relayUrls } — diese Felder müsst ihr aus eurer
      // bunker://-URL extrahieren (bunkerPubkey + relay-Params) und localSkHex bereitstellen.
      // localStorage.setItem('nostr-amber-session', JSON.stringify({ localSkHex, bunkerPubkey, relayUrls }));
      // localStorage.setItem('nostr-pubkey', '<resolved-hex-pubkey>');
    }
```

> Achtung: `bunker://` liefert `bunkerPubkey`, `relay`-Liste und `secret`, **aber nicht** den lokalen `localSk`. Der App-Reconnect (`restoreAmberSession`) braucht `localSkHex`. Deshalb ist ein reiner `localStorage`-Seed nur dann ausreichend, wenn euer Harness einen `localSk` mitliefert. Praktisch ist der saubere Weg: Harness baut die `BunkerSigner`-Verbindung serverseitig/out-of-band auf und gibt der App die fertige Session. Genau das meint die Auth-Map mit „a Playwright bot CANNOT scan a QR; to automate Amber it must drive the BunkerSigner handshake out-of-band".

#### Schritt 1D — Login bestätigen

Nach Aktivierung der Session (egal über welchen Pfad) navigiert die App selbst (Self-Register `POST /api/tracked('self')`, danach `/onboarding` bei `firstLogin` oder `/dashboard/articles`):

```
browser_wait_for
  text: "Logout"
```

Der **`Logout`**-Button (i18n `auth.logout`, `class text-sm text-gray-500` oben rechts im Dashboard-`AppShell.vue`) bestätigt die aktive Session. Alternativ auf den Profil-Router-Link zu `/dashboard/profile` (Avatar + `display_name`) prüfen.

Falls die App auf `/onboarding` landet (Crawler-Wartebildschirm, `OnboardingView.vue`): entweder den **`skip`**-Link (mit nachgestelltem Pfeil, i18n `onboarding.skipButton`) klicken oder warten, bis automatisch zu `/dashboard/articles` weitergeleitet wird (Idle oder 60-s-Timeout):

```
browser_click
  element: "skip link"
  ref: <ref für skip-Link>
```

#### Schritt 1E — Fallback: NIP-07 `window.nostr`-Injektion (vollständig botfähig)

Wenn der `bunker://`-Pfad im Harness nicht greift, ist NIP-07-Injektion der robusteste Bot-Login. Ein Mock-`window.nostr` muss `getPublicKey`, `signEvent` und (für verschlüsselte Drafts) `nip44`/`nip04` bereitstellen. Den Schlüssel niemals loggen.

```
browser_run_code
  code: |
    async () => {
      // Realer Signer muss aus einem privaten Schlüssel im Harness gebaut werden.
      // Pseudostruktur — echte Krypto im Harness, nicht hier inline:
      window.nostr = {
        getPublicKey: async () => '<hex-pubkey>',
        signEvent: async (evt) => /* signiertes Event */ evt,
        nip44: { encrypt: async (pk, pt) => '...', decrypt: async (pk, ct) => '...' },
        nip04: { encrypt: async (pk, pt) => '...', decrypt: async (pk, ct) => '...' },
      };
    }
```

Dann zur Login-Seite navigieren (damit `hasNostrExtension()` `window.nostr` sieht und den Button zeigt):

```
browser_navigate
  url: "https://media.einundzwanzig.space/#/login"
```

```
browser_snapshot
```

```
browser_click
  element: "Primärer Button 'Connect with Nostr'"
  ref: <ref für button "Connect with Nostr">
```

```
browser_wait_for
  text: "Logout"
```

#### Schritt 1F — Notnagel-Fallback für reine UI-Demos: nsec-Developer-Mode

Nur für Testkonten/Demos; **niemals** mit dem produktiven Schlüssel. (Laut Map der einfachste reine UI-Bot-Pfad.) Reihenfolge: `More login options` → `Developer mode (nsec)` → `I understand — continue` → `#nsec-input` füllen → `Continue`.

```
browser_click
  element: "Button 'Developer mode (nsec)'"
  ref: <ref>
```

```
browser_click
  element: "Button 'I understand — continue'"   // i18n auth.nsecAcknowledge, variant=danger
  ref: <ref>
```

```
browser_type
  element: "Private-key-Input"
  ref: <ref für #nsec-input>          // id='nsec-input', type=password, autocomplete=off
  text: <nsec1... aus sicherer Quelle, niemals loggen>
```

```
browser_click
  element: "Button 'Continue'"        // i18n auth.nsecContinue, variant=primary
  ref: <ref>
```

```
browser_wait_for
  text: "Logout"
```

---

### Schritt 2 — Longform-Artikel anlegen und ALLE Parameter aus der „article spec" setzen

Zielroute: `/dashboard/editor` (Komponente `views/dashboard/EditorView.vue`). **Nicht** `/u/:identifier` (das ist die öffentliche Creator-Page ohne Editor).

```
browser_navigate
  url: "https://media.einundzwanzig.space/#/dashboard/editor"
```

```
browser_snapshot
```

Die folgende JSON-„article spec" treibt das Ausfüllen. Sie mappt 1:1 auf die Editor-Felder (`EditorMetadata.vue`, Milkdown-Editor, `EditorFormatToolbar.vue`, `EditorToolbar.vue`):

```json
{
  "format": "article",
  "title": "Beispieltitel",
  "summary": "Kurzer Anriss / Excerpt",
  "image": "https://example.com/cover-1200x630.jpg",
  "hashtags": ["bitcoin", "nostr"],
  "authorPubkey": "",
  "content": "# Überschrift\n\nMarkdown-Body …",
  "saveType": "local"
}
```

#### Schritt 2.0 — Content-Format wählen (`article` / `gallery` / `interview`)

Standard ist `article` (Milkdown sichtbar). **Achtung:** Format-Wechsel bei vorhandenem Content öffnet einen Bestätigungsdialog (`editor.switchFormatTitle` / `confirm.switchFormat`) und **LÖSCHT den Content**. Deshalb Format **zuerst** setzen, **bevor** Inhalt eingegeben wird. Für `article` ist nichts zu tun.

Falls `spec.format != "article"`, im rechten Sidebar-Bereich die Format-Karte klicken:

```
browser_click
  element: "Format-Karte 'editor.formatGallery'"   // bzw. editor.formatInterview
  ref: <ref>
```

#### Schritt 2.1 — Titel

```
browser_click
  element: "Titel-Input (placeholder 'editor.articleTitlePlaceholder')"
  ref: <ref>   // borderless input, class 'text-2xl font-bold'
```

```
browser_type
  element: "Titel-Input"
  ref: <ref>
  text: "{{spec.title}}"
```

#### Schritt 2.2 — Summary / Excerpt

```
browser_type
  element: "Summary-Textarea (placeholder 'editor.summaryPlaceholder', rows=2)"
  ref: <ref>
  text: "{{spec.summary}}"
```

#### Schritt 2.3 — Cover-Image-URL (manuell)

Wir setzen die URL direkt (kein Blossom-Upload nötig im Dry-Run). Cover-Upload würde sonst durch einen 1.91:1-Cropper (1200×630) laufen.

```
browser_type
  element: "Featured-Image-Input (BaseInput placeholder 'editor.featuredImage')"
  ref: <ref>
  text: "{{spec.image}}"
```

#### Schritt 2.4 — Hashtags (je Tag Enter)

Pro Tag: Tippen + Enter. Transformation in der App: `trim().toLowerCase().replace(/^#/, '')`, dedupe. Für jeden Eintrag aus `spec.hashtags`:

```
browser_type
  element: "Tag-Input (placeholder 'editor.addTag')"
  ref: <ref>
  text: "{{tag}}"
  submit: true          // löst @keydown.enter.prevent='addTag' aus
```

Ergebnis sind orange `BaseChip`-Tags (entfernbar via X / `remove-tag`).

#### Schritt 2.5 — Author-Pubkey (optional, „publish on behalf of")

Nur wenn `spec.authorPubkey` gesetzt ist (npub1…, 64-Hex oder NIP-05). Feld nur sichtbar, solange kein Profil aufgelöst ist. Auflösung ist debounced (600 ms) bei NIP-05.

```
browser_type
  element: "Author-Pubkey-Input (placeholder 'editor.authorPubkey')"
  ref: <ref>
  text: "{{spec.authorPubkey}}"
```

```
browser_wait_for
  text: <erwarteter aufgelöster Name in grünem Pill>   // oder Fehler editor.authorNip05NotFound/authorInvalid
```

#### Schritt 2.6 — Markdown-Body in den Milkdown-Editor

Milkdown ist **contenteditable** (`.milkdown-editor .ProseMirror`), **kein** Textarea. In den Editorbereich klicken (Write-Tab `editor.writeMode`, lucide `PenLine`) und tippen:

```
browser_click
  element: "Milkdown-Editorbereich (.milkdown-editor .ProseMirror)"
  ref: <ref>
```

```
browser_type
  element: "Milkdown-Editor"
  ref: <ref>
  text: "{{spec.content}}"
```

Formatierung optional über `EditorFormatToolbar` (Buttons mit titeln `editor.bold`, `editor.italic`, `editor.heading1/2/3`, `editor.bulletList`, `editor.table` …; jeder dispatcht ein Milkdown-Command). Inline-Link via Toolbar nutzt `window.prompt` (`editor.linkUrl`) → bei Bedarf:

```
browser_handle_dialog
  accept: true
  promptText: "https://ziel-url.example"
```

#### Schritt 2.7 — Verifikation per Preview (kein Schreibvorgang)

```
browser_click
  element: "Preview-Tab (editor.previewMode, lucide Eye)"
  ref: <ref>
```

```
browser_snapshot
```

Im Preview erscheinen Cover, Titel, Summary, Tags und gerenderter Inhalt. Danach zurück zum Write-Tab.

---

### Schritt 3 — STOPP bei „Save Draft" (Dry-Run) + die eine Live-Publish-Zeile

#### Der Dry-Run-sichere Haltepunkt: **Save locally**

`Save Draft` ist ein **Split-Button** in `EditorToolbar` (Haupttext `editor.saveDraft`, lucide `HardDrive`, `ChevronDown`). Der Hauptklick öffnet ein 3-Punkte-Dropdown. **Save locally** schreibt **nur** in `localStorage` (`editor-drafts:<pubkey>`) und **signiert/publiziert NICHTS** auf Nostr. Das ist der Dry-Run-Stopp.

> Dropdown-Gotcha: Die Menü-Items nutzen `@mousedown.prevent` und das Menü schließt 150 ms nach Blur. Daher **`browser_mouse_down`** auf das Item statt eines normalen Klicks (oder sehr zügig klicken).

```
browser_click
  element: "Save-Draft-Split-Button (editor.saveDraft, HardDrive-Icon)"
  ref: <ref>
```

```
browser_snapshot
```

```
browser_mouse_down
  element: "Dropdown-Item 'Save locally' (editor.saveLocal / desc editor.saveLocalDesc)"
  ref: <ref>
```

```
browser_mouse_up
  element: "Dropdown-Item 'Save locally'"
  ref: <ref>
```

Damit ist der Dry-Run abgeschlossen: lokaler Draft gespeichert, **kein** Nostr-Event, **kein** Relay-Publish, **kein** Backend-Submit.

> Zusatzhinweis: **Autosave** (`DEBOUNCE_AUTOSAVE`) und „unmount-if-dirty" schreiben ebenfalls **nur** lokal — sie sind ungefährlich. Aber: Beim Wegnavigieren kann still ein lokaler Draft persistiert werden. Das ist immer noch kein Publish.

#### ⛔ DIE EINZIGE ZEILE, DIE LIVE PUBLIZIERT — NIEMALS VERSEHENTLICH AUSFÜHREN ⛔

Der Übergang von Dry-Run zu **Live-Publish** ist **genau ein** expliziter Schritt: der Klick auf den primären **`Publish`**-Button (i18n `editor.publish`) in `EditorToolbar`. Das baut ein **kind 30023** (`KIND_ARTICLE`), signiert es mit dem aktiven Signer, submitted backend-first (`apiService.submitEvent`) und **publiziert auf die Write-Relays** — öffentlich und **nicht zurücknehmbar** (nur per NIP-09 kind-5-Deletion-Request „überschreibbar").

```
# ╔══════════════════════════════════════════════════════════════════╗
# ║  LIVE-PUBLISH — ABSICHTLICH AUSKOMMENTIERT. NUR AUF AUSDRÜCKLICHE  ║
# ║  MENSCHLICHE FREIGABE EINFÜGEN. PUBLIZIERT kind 30023 ÖFFENTLICH.  ║
# ╠══════════════════════════════════════════════════════════════════╣
# browser_click
#   element: "Primärer Button 'Publish' (i18n editor.publish)"
#   ref: <ref für BaseButton primary text 'editor.publish'>
# ╚══════════════════════════════════════════════════════════════════╝
```

Wird `Publish` ausgelöst, erscheint eine `PublishingOverlay` (`role=status`, `editor.publishing`, 15-s-Watchdog) und Navigation wird per Route-Guard + `beforeunload` blockiert. Erfolg: Toast `toast.publishSuccess`; Fehler: `toast.publishError`.

**Regel für Claude:** In Dry-Run-Läufen wird diese Zeile **nie** eingefügt oder ausgeführt. Nur wenn der Nutzer in derselben Sitzung explizit „jetzt live veröffentlichen" sagt, darf der `Publish`-Klick erfolgen.

---

### Saubere Beendigung (optional)

```
browser_click
  element: "Button 'Logout' (auth.logout)"
  ref: <ref>
```

---

## Teil 2 — ARTICLE PROMPT TEMPLATE

Kopiere den folgenden Block, fülle die Felder und gib ihn Claude. Claude liefert **zwei** Artefakte zurück: (a) den **Markdown-Body** und (b) eine **JSON „article spec"**, die exakt auf die Editor-Parameter aus Teil 1, Schritt 2 mappt.

````text
# AUFGABE: Longform-Artikel für media.einundzwanzig.space erzeugen

Erzeuge einen NIP-23-Longform-Artikel. Gib am Ende GENAU ZWEI Blöcke aus:
1) den Markdown-Body (im Block ```markdown … ```),
2) die JSON „article spec" (im Block ```json … ```), deren Felder 1:1 den
   Editor-Parametern entsprechen.

## INHALTLICHE VORGABEN (für die Generierung)
- Thema:            <…>
- Kernbotschaft:    <eine Sätze-These>
- Zielgruppe:       <z. B. Bitcoin-Einsteiger / Fortgeschrittene / Entwickler>
- Tonfall:          <z. B. sachlich, meinungsstark, humorvoll, nüchtern>
- Länge:            <z. B. ca. 800 / 1500 / 3000 Wörter>
- Sprache:          <de / en>   (Standard: de)
- Keywords/SEO:     <Komma-Liste, fließt in Text + Hashtags>
- Quellen/Belege:   <URLs oder Stichpunkte, die eingebaut/verlinkt werden sollen>
- Call-to-Action:   <optional, z. B. Newsletter, Meetup, Spende>
- Tabu/Vermeiden:   <optional, was NICHT vorkommen soll>

## EDITOR-PARAMETER (müssen vollständig in der JSON-spec gesetzt werden)
- format:           "article" | "gallery" | "interview"   (Standard: "article")
- title:            <Artikeltitel; Pflicht für sinnvollen Publish>
- summary:          <Excerpt/Anriss, 1–2 Sätze>
- image:            <Cover-URL, idealerweise 1200×630 / 1.91:1; leer = kein Cover>
- hashtags:         <Array, lowercase, ohne führendes '#', dedupliziert>
- authorPubkey:     <optional: npub1… | 64-hex | NIP-05; leer = Signer ist Autor>
- content:          <der vollständige Markdown-Body als String>
- saveType:         "local"        (IMMER "local" — Dry-Run; nie "shared"/"encrypted"/Publish)

## REGELN FÜR DIE AUSGABE
- content (Markdown): nur Standard-Markdown/GFM (Überschriften, Listen, Tabellen,
  Codeblöcke, Blockquotes, **fett**, *kursiv*, ~~durchgestrichen~~, Links, Bilder).
  KEIN Frontmatter bei format="article". (gallery/interview brauchen Frontmatter
  `type: gallery` bzw. `type: interview` — nur dann setzen.)
- hashtags: 2–6 Stück, themenrelevant, lowercase, ohne '#'.
- title: prägnant, ohne Markdown-Syntax.
- summary: eigenständig verständlich, kein bloßer Titel-Klon.
- image: nur eine valide URL ODER leerer String "".
- saveType MUSS "local" sein (Dry-Run-Sicherheit). Live-Publish ist ein bewusster,
  separater menschlicher Schritt und NICHT Teil dieser Ausgabe.
- Die JSON-spec MUSS valides JSON sein und ALLE oben gelisteten Editor-Parameter
  enthalten (auch leere als "" bzw. []).

## ERWARTETE AUSGABE (genau dieses Format)

```markdown
<vollständiger Artikel-Body in Markdown>
```

```json
{
  "format": "article",
  "title": "<…>",
  "summary": "<…>",
  "image": "<… oder \"\">",
  "hashtags": ["<…>", "<…>"],
  "authorPubkey": "",
  "content": "<derselbe Markdown-Body als JSON-String>",
  "saveType": "local"
}
```
````

### Mapping-Referenz (article spec → Editor)

| JSON-Feld       | Editor-Element (Selektor-Hint)                                   | Nostr-Tag bei Publish (kind 30023)        |
|-----------------|------------------------------------------------------------------|-------------------------------------------|
| `format`        | Format-Karten rechts (`editor.formatArticle/Gallery/Interview`)  | Frontmatter `type:` (gallery/interview)   |
| `title`         | Titel-Input (`editor.articleTitlePlaceholder`)                   | `['title', value]`                        |
| `summary`       | Textarea (`editor.summaryPlaceholder`)                           | `['summary', value]` (nur wenn non-empty) |
| `image`         | BaseInput (`editor.featuredImage`)                               | `['image', value]` (nur wenn non-empty)   |
| `hashtags[]`    | Tag-Input (`editor.addTag`) + Enter je Tag                       | je `['t', tag]`                           |
| `authorPubkey`  | Input (`editor.authorPubkey`)                                    | `['p', author, '', 'author']`             |
| `content`       | Milkdown `.milkdown-editor .ProseMirror`                         | Event-`content` (Markdown)                |
| `saveType`      | Save-Draft-Dropdown → **Save locally** (`editor.saveLocal`)      | **kein Event** (nur localStorage)         |

> Nicht im Editor steuerbar (daher nicht in der spec): `dTag`/`identifier` (auto `draft-<Date.now()>`), `published_at` (immer „jetzt" beim Publish, keine Scheduling-UI), Sprache, Canonical/Source-URL, Sichtbarkeit/Gating sowie Site-/Magazine-Zuweisung (Letztere passieren nach dem Publish über den `ArticleInspector` bzw. die Magazine-/Sites-Domains).
