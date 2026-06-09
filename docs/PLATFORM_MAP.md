# PLATFORM_MAP.md — EINUNDZWANZIG Nostr Publishing Platform

**Kanonischer Katalog aller Aktivitäten** (media.einundzwanzig.space)

Dieses Dokument ist die Master-Referenz für die Automatisierung der EINUNDZWANZIG Nostr-Publishing-Plattform. Es beschreibt die komplette Route-Tabelle, jede Domäne mit allen Aktivitäten, deren UI-Trigger, Playwright-Selector-Hinweisen, dem ausgelösten Nostr-Event-Kind und den Parametern.

---

## Wichtige Grundlagen für Automatisierung (BITTE ZUERST LESEN)

- **Hash-Routing:** Die App verwendet `createWebHashHistory`. Alle URLs sind hash-präfixiert, z. B. `https://host/#/dashboard/articles`, `https://host/#/login`. Playwright muss zwingend die `#`-Form ansteuern. Gated Redirects werden zu `#/login?redirect=<fullPath>`.
- **Keine `data-testid` / `aria-label`-Attribute** in den Auth-Komponenten — Selektoren müssen auf stabilem Button-**Text** (i18n Englisch) und Input-IDs (z. B. `#nsec-input`) basieren.
- **Login für Bots:** Der `nsec`-Pfad ist mit Abstand am einfachsten. NIP-07 erfordert ein injiziertes `window.nostr`-Mock; NIP-46/Amber erfordert einen echten QR-Scan und ist aus dem Browser allein NICHT automatisierbar.
- **Lese- vs. Schreibpfad:** Alle Reads laufen über das Flask-Backend (`apiService`, SQLite vom Crawler befüllt), NICHT über Live-Relays. Writes werden von `eventBuilder` gebaut, von `signer.service` signiert und an Relays (`RELAY_GROUPS`) und/oder `/api/events` publiziert.
- **Backend-first-Modell:** Schreibflüsse rufen zuerst `apiService.submitEvent`, dann Relay-Publish. Sie werfen nur, wenn weder Backend noch ein Relay akzeptiert.
- **Debounced Publishes:** `site.store` und `subscription.store` nutzen 5s-Debounce mit optimistischem Local State; Wiki-Section-Configs nutzen 900ms-Debounce.
- **NIP-98:** Per-User-Endpunkte (tracked, tags, rss/fetch, me, admin gate writes) nutzen NIP-98-signierte Authorization (kind 27235); jeder solche Call kann einen Signer-/Wallet-Prompt auslösen.

### Auth-Gates im Überblick

| Gate | Mechanismus | Betroffene Routen |
|------|-------------|-------------------|
| `meta.requiresAuth` | `sessionStore.restoreSession()` im `beforeEach`; Redirect `/login?redirect=<fullPath>` | alle `/dashboard/*` |
| `meta.requiresBadge: 'magazines'` | `gateStore.fetchGates()` + `roleStore.refresh()`; Redirect AccessDenied wenn Role-Rank < required (nur wenn `enabled && required_role!='free'`) | alle `/dashboard/magazines/*` |
| `meta.requiresRole: 'admin'` | Role-Rank-Vergleich, immer durchgesetzt | `/dashboard/gates`, `/dashboard/system` |

**Rollenhierarchie:** `free < member < manager < admin`. Gates failen OPEN bei Cold-Start / Netzwerkfehlern.

### Session-Storage-Keys

| Key | Speicher | Inhalt |
|-----|----------|--------|
| `nostr-pubkey` | localStorage | aktueller Pubkey |
| `nostr-auth-method` | localStorage | `nip07` \| `amber` \| `nsec` |
| `nostr-amber-session` | localStorage | JSON `{localSkHex, bunkerPubkey, relayUrls}` |
| `nostr-nsec-dev` | sessionStorage | rohes nsec (tab-scoped, NIE localStorage, NIE Netzwerk) |
| `badge-role-cache-v1` | localStorage | Role-Cache (30 min TTL) |
| `badge-gates-cache-v1` | localStorage | Gate-Registry (5 min TTL) |
| `nwc-connection` | localStorage | NWC-Wallet-URI (Spending-Secret) |

---

## Komplette Route-Tabelle

| Name | Pfad | Komponente | Auth | Gate |
|------|------|-----------|------|------|
| (root redirect) | `/` | redirect → `/dashboard/articles` | nein | — |
| Login | `/login` | `views/LoginView.vue` | nein | — |
| Onboarding | `/onboarding` | `views/OnboardingView.vue` | ja | — |
| AccessDenied | `/access-denied` | `views/AccessDeniedView.vue` | nein | — |
| (dashboard shell) | `/dashboard` | `components/layout/AppShell.vue` → `/dashboard/articles` | ja | — |
| Articles | `/dashboard/articles` | `views/dashboard/ArticlesView.vue` | ja | — |
| Subscriptions | `/dashboard/subscriptions` | `views/dashboard/SubscriptionsView.vue` | ja | — |
| Board | `/dashboard/board` | `views/dashboard/BoardView.vue` | ja | — |
| Matrix | `/dashboard/matrix` | `views/dashboard/MatrixView.vue` | ja | — |
| Editor | `/dashboard/editor` | `views/dashboard/EditorView.vue` | ja | — |
| EditorWithArticle | `/dashboard/editor/:articleKey` | `views/dashboard/EditorView.vue` (props:true) | ja | — |
| Drafts | `/dashboard/drafts` | `views/dashboard/DraftsView.vue` | ja | — |
| Imports | `/dashboard/imports` | `views/dashboard/ImportsView.vue` | ja | — |
| Media | `/dashboard/media` | `views/dashboard/MediaView.vue` | ja | — |
| Sites | `/dashboard/sites` | `views/dashboard/SitesView.vue` | ja | — |
| SiteOrganizeLanding | `/dashboard/sites/organize` | `views/dashboard/SiteOrganizeLandingView.vue` | ja | — |
| SiteDetail | `/dashboard/sites/:siteId` | `views/dashboard/SiteDetailView.vue` (props:true) | ja | — |
| SiteOrganize | `/dashboard/sites/:siteId/organize` | `views/dashboard/SiteOrganizeView.vue` (props:true) | ja | — |
| SiteConfig | `/dashboard/sites/:siteId/config` | `views/dashboard/SiteConfigView.vue` (props:true) | ja | — |
| Magazines | `/dashboard/magazines` | `views/dashboard/MagazinesView.vue` | ja | badge `magazines` |
| MagazineDetail | `/dashboard/magazines/:magId` | `views/dashboard/MagazineDetailView.vue` (props:true) | ja | badge `magazines` |
| MagazineConfig | `/dashboard/magazines/:magId/config` | `views/dashboard/MagazineConfigView.vue` (props:true) | ja | badge `magazines` |
| IssueEditor | `/dashboard/magazines/:magId/issues/:issueId` | `views/dashboard/IssueEditorView.vue` (props:true) | ja | badge `magazines` |
| Tags | `/dashboard/tags` | `views/dashboard/TagsView.vue` | ja | — |
| Activity | `/dashboard/activity` | `views/dashboard/ActivityView.vue` | ja | — |
| Settings | `/dashboard/settings` | `views/dashboard/SettingsView.vue` | ja | — |
| Profile | `/dashboard/profile` | `views/dashboard/ProfileView.vue` | ja | — |
| Gates | `/dashboard/gates` | `views/dashboard/GatesView.vue` | ja | role `admin` |
| System | `/dashboard/system` | `views/dashboard/SystemView.vue` | ja | role `admin` |
| CreatorPage (public) | `/u/:identifier` | `PublicShell.vue` → `views/CreatorPage.vue` (props:true) | nein | — |

**Hinweis:** Die öffentlichen Site-/Magazin-Seiten `/s/:dTag` und `/m/:slug` sind **NICHT** im Vue-Router — sie werden vom Flask-Backend serverseitig gerendert. Playwright-Verifikation des öffentlichen Outputs muss das Backend treffen, nicht den Hash-Router.

---

## Domäne: Core / Routing / Nostr (Backbone)

Das Rückgrat: Route-Tabelle mit Guards, die beiden Layout-Shells, die Cmd+K-Command-Palette, der API-Client, der Multi-Backend-Signer und der zentrale Event-Builder-Katalog. **`event-builder.service.js` ist die Single Source of Truth für jeden publizierten Nostr-Kind.**

### Event-Kind-Katalog (vom Event-Builder erzeugt)

| Kind | Zweck | Builder-Funktion |
|------|-------|------------------|
| 0 | Profil-Metadaten (NIP-01/NIP-24) | `profileMetadata`, `profileMetadataRaw`, `upsertIdentityTag`, `removeIdentityTag` |
| 5 | Löschanfrage (NIP-09) | `deletion` |
| 6 | Repost eines kind:1 Notes (NIP-18) | `noteRepost` |
| 7 | Reaktion (NIP-25) | `reaction`, `noteReaction` |
| 16 | Generic Repost (NIP-18) | `genericRepost`, `noteRepost` |
| 1111 | Kommentar (NIP-22) | `comment`, `profileComment`, `eventComment` |
| 9734 | Zap-Request (NIP-57) | `zapRequest`, `noteZapRequest`, `profileZapRequest` |
| 10002 | Relay-Liste (NIP-65) | `relayList` |
| 10003 | Bookmark-Liste (NIP-51) | `bookmarkListAdd` |
| 10063 | Blossom-Server-Liste (BUD-03) | `blossomServerList` |
| 24242 | Blossom-Auth (BUD-02/04) | (blossom.service) |
| 30000 | Follow-Set / Subscriptions (NIP-51) | `subscriptionsList` |
| 30004 | Curation-Set / Sites & Magazines (NIP-51) | `curationSet`, `magazineCurationSet`, `issueCurationSet` |
| 30023 | Longform-Artikel (NIP-23) | `article` |
| 30024 | Longform-Draft (NIP-23) | `draft` |
| 30078 | App-Data (Site-/Magazin-Config, Feed-Sources) | `siteConfig`, `magazineConfig`, `appData` |
| 31234 | Encrypted Draft (NIP-37) | `encryptedDraft` |

### Aktivitäten

| Aktivität | UI-Trigger | Selector-Hinweise | Kind | Parameter |
|-----------|-----------|-------------------|------|-----------|
| Command Palette öffnen (Cmd+K) | `Cmd/Ctrl+K`, Sidebar-Button `⌘K Search`, `toggle-command-bar` Event | `role=dialog aria-modal=true aria-label=commandBar.aria`; `input placeholder=commandBar.placeholder autocomplete=off`; `role=listbox`; `role=option id=cmd-row-{n} data-row-index`; ArrowUp/Down navigieren, Enter führt aus, Escape schließt | — | `query` (string, optional) |
| Sidebar-Navigation | `router-link` im `<aside>`; mobiler Hamburger; PanelLeft-Toggle | `router-link :to` je `/dashboard/*`; `active-class !bg-orange-50 !text-orange`; PanelLeft icon title=nav.expandSidebar/collapseSidebar; Hamburger svg `M4 6h16M4 12h16M4 18h16` | — | — |
| Logout | Header-Button `auth.logout` (oben rechts) | `button text auth.logout`; `header sticky top-0` | — | — |
| Eigenes Profil / Sign-in CTA | `router-link → /dashboard/profile`; PublicShell `Sign in` Button; Wallet-Icon | PublicShell `BaseButton variant=primary text=publicShell.signIn`; Wallet aria-label=wallet.connect; avatar → goDashboard() | — | — |
| Signed Event an Backend submitten | intern nach jedem `signEvent()` | — (intern) | — | `signedEvent` |
| Profil zu Backend importieren | Profile-Import / First-Publish | — (intern, POST `/api/profiles/import`) | — | `signedEvent` (kind:0) |
| Pubkey tracken/untracken (Watchlist) | Watchlist-Controls (Subscriptions / Profil-Peek) | track/follow-Toggle (signed request) | — | `pubkey`, `label` |
| Tag abonnieren/abbestellen | TagsView Subscribe-Controls | TagsView subscribe/unsubscribe Buttons | — | `tag` |
| RSS-Feed via Backend-Proxy holen | ImportsView Add-Feed / Refresh | ImportsView feed URL input + fetch | — | `url` |
| Badge-Gates verwalten (admin) | GatesView (requiresRole admin) | GatesView gate rows + edit dialog feature dropdown + role select | — | `key`, `label`, `required_role`, `enabled` |
| Crawler ansehen/triggern (admin) | SystemView (requiresRole admin); refresh / trigger-crawl | `SystemBanner refresh (RotateCw)`; `StatusDot tones`; `SystemTaskCard` | — | — |
| Login-Methode wählen | LoginView Auth-Method-Buttons; OnboardingView | LoginView method buttons; Amber QR (nostrconnect://); nsec input | — | `method` (nip07/amber/nsec), `nsec` |
| Creator-Page teilen | Share-Button auf CreatorPage | `BaseModal`; Copy icons (Copy/Check), ExternalLink, QR image | — | `name`, `url`, `npub` |
| NIP-39 Identities verifizieren | Profilansicht laden / Recheck | profile identities section | — | `pubkey` |

---

## Domäne: Auth (Authentifizierung & Autorisierung)

Drei Login-Backends teilen ein einheitliches Signer-Interface (`signer.service.js`): NIP-07 Browser-Extension (primär), NIP-46 Remote-Signing via Amber ("bunker"), und Developer-Mode raw nsec. `session.store.js` besitzt reaktiven Session-State; Autorisierung über `role.store` + `gate.store`.

### Routen dieser Domäne

| Name | Pfad | Auth |
|------|------|------|
| Login | `/login` (LoginPrompt.vue) | nein |
| Onboarding | `/onboarding` | ja |
| AccessDenied | `/access-denied` | nein |
| Dashboard (root) | `/dashboard` (AppShell.vue) | ja |
| Gates | `/dashboard/gates` | ja (admin) |
| CreatorPage (public) | `/u/:identifier` | nein |

### Aktivitäten

#### Login mit NIP-07 Browser-Extension

- **Beschreibung:** Primärer Login. Nur sichtbar wenn `window.nostr` erkannt (`hasNostrExtension()`). `session.login()` aktiviert nip07-Signer, liest Pubkey, self-registriert via POST `/api/tracked` ('self'), routet zu `/onboarding` (firstLogin) oder `/dashboard/articles`.
- **Trigger:** Primärer oranger Button auf `/login`, "Connect with Nostr".
- **Selector-Hinweise:** `button text 'Connect with Nostr'`; `role=button` mit LogIn lucide icon; `BaseButton variant=primary size=lg class w-full`; i18n `auth.loginWithExtension`; Fallback `auth.noExtension`.
- **Kind:** — | **Parameter:** keine.

#### Erweiterte Login-Optionen öffnen

- **Trigger:** Text-Button "More login options" unter Primär-Button.
- **Selector-Hinweise:** `button text 'More login options' (auth.moreOptions)`; ChevronDown/ChevronUp; `class text-xs text-gray-400`.
- **Kind:** — | **Parameter:** keine.

#### Login mit Amber (NIP-46 Remote-Signer)

- **Beschreibung:** Öffnet AmberConnectModal. `prepareAmberConnect()` generiert ephemeren secp256k1-Keypair + 16-Byte-Secret und baut `nostrconnect://`-URI (220×220 QR). `completeAmberConnect()` awaitet `BunkerSigner.fromURI` (90s Timeout). Persistiert Reconnect-Record nach `nostr-amber-session`. **Ein Playwright-Bot kann KEINEN QR scannen.**
- **Trigger:** Oranger Button "Sign in with Amber" (Smartphone-Icon) im erweiterten Bereich. Mobil: "Open Amber" Deep-Link.
- **Selector-Hinweise:** `button text 'Sign in with Amber' (auth.loginWithAmber)`; Smartphone icon; modal title `'Scan with Amber' (auth.amberScanTitle)`; `img alt 'Amber connection QR code'`; deep-link anchor `'Open Amber' (auth.amberOpenApp)` href `nostrconnect://`; `'Waiting for Amber to connect…' (auth.amberWaiting)`; retry `'Try again' (auth.amberRetry)`; Cancel (common.cancel).
- **Kind:** — | **Parameter:**

| Parameter | Typ | Required | Hinweis |
|-----------|-----|----------|---------|
| `connectUri` | string | ja (auto) | `nostrconnect://<localPk>?secret=<16-byte-hex>&metadata=<JSON>&relay=...x3` |
| `handshake relays` | string[] | ja | default `wss://relay.damus.io, wss://relay.nostr.band, wss://nos.lol` (NIP46_HANDSHAKE_RELAYS) |
| `handshake timeout` | number(s) | — | default 90 (NIP46_HANDSHAKE_TIMEOUT_S) |

#### Login mit raw nsec (Developer-Mode)

- **Beschreibung:** Öffnet zweistufiges NsecLoginModal. STEP 1: XSS-Warnung, "I understand — continue". STEP 2: Password-Input für nsec. `session.loginWithNsec()` validiert `nsec1`-Präfix, nip19-dekodiert, baut In-Memory-Signer, speichert raw nsec in `sessionStorage` Key `nostr-nsec-dev`. **EINFACHSTER PFAD FÜR EINEN PLAYWRIGHT-BOT.**
- **Trigger:** Quiet-Text-Button "Developer mode (nsec)" (Terminal-Icon) im erweiterten Bereich.
- **Selector-Hinweise:** `button text 'Developer mode (nsec)' (auth.loginWithNsec)`; STEP1 title `auth.nsecWarningTitle`, advance `'I understand — continue' (auth.nsecAcknowledge) variant=danger`; STEP2 `input id='nsec-input' label (auth.nsecLabel) placeholder 'nsec1…' type=password autocomplete=off spellcheck=false`; eye toggle (auth.nsecShow/nsecHide); submit `'Continue' (auth.nsecContinue) variant=primary`; error `auth.nsecInvalid`.
- **Kind:** — | **Parameter:**

| Parameter | Typ | Required | Hinweis |
|-----------|-----|----------|---------|
| `nsec` | string (bech32 nsec1...) | ja | Muss mit `nsec1` starten und zu type 'nsec' dekodieren. Für Automation: `#nsec-input` füllen → "Continue" klicken |

**Bot-Login-Rezept:** `#/login` → "More login options" → "Developer mode (nsec)" → "I understand — continue" → `#nsec-input` füllen → "Continue".

#### Logout

- **Beschreibung:** `AppShell handleLogout()` → `session.logout()`: tear-down des aktiven Signers, clear Pubkey/Profile/authMethod, entfernt localStorage-Keys + sessionStorage `nostr-nsec-dev`.
- **Trigger:** Text-Button "Logout" oben rechts im Header.
- **Selector-Hinweise:** `button text 'Logout' (auth.logout)`; `class text-sm text-gray-500`; benachbarter Profil-Link → `/dashboard/profile`.
- **Kind:** — | **Parameter:** keine.

#### Restore Session (automatisch)

- **Beschreibung:** Router `beforeEach` awaitet `session.restoreSession()` für `requiresAuth`-Routen. Liest `nostr-pubkey` + `nostr-auth-method`. amber → rebuild bunker signer; nsec → re-read sessionStorage; nip07 → activate. Ungültig → silent logout + Redirect `/login?redirect=<fullPath>`.
- **Trigger:** Automatisch bei Navigation oder App-Boot.
- **Selector-Hinweise:** keine UI; beobachtbar via Redirect zu `/login`.
- **Kind:** — | **Parameter:** keine.

#### Onboarding-Crawl-Wartung

- **Beschreibung:** `OnboardingView` pollt `getCrawlerStatus()` alle 2s, zeigt 4 Schritte. Auto-Navigation zu `/dashboard/articles` bei 'idle' oder nach 60s Hard-Timeout. Skip-Link verfügbar.
- **Trigger:** Automatisch nach First-Login; manueller Skip.
- **Selector-Hinweise:** skip button (onboarding.skipButton); progress bar `div width style`; status line elapsed seconds + onboarding.statusCrawling/statusReady.
- **Kind:** — | **Parameter:** keine.

#### Recheck Access / Login von Access-Denied

- **Beschreibung:** `AccessDeniedView`. Query: `?gate=<feature>&role=<requiredRole>&from=<fullPath>&reason=<code>`. Logged-in: "Recheck access" → `roleStore.refresh({force:true})`. Anonym: "Login" → `/login?redirect=<from>`.
- **Trigger:** Buttons auf `/access-denied`.
- **Selector-Hinweise:** `Recheck (access.recheckAccess)`; `Login (auth.login)`; `Back home (access.backHome) Home icon`; "Become a member" anchor `href='https://verein.einundzwanzig.space/association/profile'`.
- **Kind:** — | **Parameter:** keine.

#### Verifizierte Accounts verwalten (NIP-39)

- **Beschreibung:** VerifiedAccountsModal (geöffnet aus ProfileEditModal). Add/Remove externer Identity-Proofs (GitHub/Mastodon/Telegram). REPUBLISHED kind:0 mit NIP-39 `i`-Tags.
- **Trigger:** Aus Profile-Edit; Platform-Chooser dann "Add & publish".
- **Selector-Hinweise:** modal title (identities.title); platform buttons 'GitHub'/'Mastodon'/'Telegram'; submit `'Add & publish' (identities.addAndPublish) Plus icon`; remove Trash2 per Row; copy (identities.copy).
- **Kind:** 0 (kind:0 mit NIP-39 `i`-Tags) | **Parameter:**

| Parameter | Typ | Required | Optionen/Hinweis |
|-----------|-----|----------|------------------|
| `platform` | enum | ja | github, mastodon, telegram |
| `url` | url | ja | github gist / mastodon post / telegram message |
| `userId` | text (digits) | nein | nur Telegram |

#### Badge-Gate anlegen/bearbeiten/löschen/Audit (admin)

| Aktivität | Trigger | Selector-Hinweise | Kind | Parameter |
|-----------|---------|-------------------|------|-----------|
| Gate anlegen | "Add gate" Button auf `/dashboard/gates` oder per-row "Set role" | `gates.addGate` Plus icon; modal `gates.createTitle`; feature select (gates.fieldFeaturePick); role select (roles.*); enabled BaseToggle; Create (common.create) | — | `key` (enum), `required_role` (free/member/manager/admin, default member), `enabled` (bool, default false) |
| Gate bearbeiten | per-row "Edit" | modal `gates.editTitle`; locked feature (gates.fieldFeatureLocked); role select; enabled toggle; Save (common.save). Sendet `ifUnmodifiedSince = gate.updated_at` (409 bei Konflikt) | — | `required_role` (enum), `enabled` (bool) |
| Gate löschen | per-row "Delete" / Trash2 | red hover bg-red-50; confirm gates.deleteMessage | — | — |
| Gate-Audit-Log | per-row "Audit"/history | modal `gates.audit.title`; Clock empty state; RefreshCw retry. Signed (NIP-98) `getGateAudit(key,{limit:50})` | — | — |

**Dateien:** `stores/session.store.js`, `services/signer.service.js`, `services/auth.service.js`, `components/auth/LoginPrompt.vue`, `components/auth/AmberConnectModal.vue`, `components/auth/NsecLoginModal.vue`, `stores/role.store.js`, `stores/gate.store.js`, `composables/useBadgeGate.js`, `router/index.js`, `components/gates/GateEditDialog.vue`, `components/gates/GateAuditDialog.vue`.

---

## Domäne: Editor & Artikel (Longform Editor)

NIP-23 Longform-Editor (kind 30023) im Milkdown-Markdown-Editor mit Metadaten-Sidebar. Inhalt speicherbar als Local-Draft (localStorage), Shared-Draft (kind 30024), Encrypted-Draft (kind 31234/NIP-37) oder finaler Artikel (kind 30023). Drei Formate: Article, Gallery, Interview. Alle Write-Pfade backend-first.

### Routen

| Name | Pfad | Auth |
|------|------|------|
| Editor (new) | `/dashboard/editor` | ja |
| EditorWithArticle | `/dashboard/editor/:articleKey` | ja |
| Drafts | `/dashboard/drafts` | ja |
| Articles | `/dashboard/articles` | ja |

### Aktivitäten

| Aktivität | UI-Trigger | Selector-Hinweise | Kind | Parameter |
|-----------|-----------|-------------------|------|-----------|
| Editor öffnen (neu) | Sidebar-Nav "Write/Editor" → `/dashboard/editor` | `nav link href='/dashboard/editor'` PenLine icon, `nav.editor` | — | — |
| Draft/Artikel fortsetzen | Drafts-Liste "Resume" → `/dashboard/editor/<dTag>` | `drafts.resume` PenLine; Draft-Row clickable; route param `:articleKey` | — | `articleKey` (string) |
| Titel bearbeiten | Großes Titel-Input oben in EditorMetadata | `input placeholder editor.articleTitlePlaceholder`; `text-2xl font-bold` | — | `title` (string) |
| Summary bearbeiten | Textarea unter Titel | `textarea placeholder editor.summaryPlaceholder rows=2` | — | `summary` (string) |
| Cover-Image-URL setzen (manuell) | BaseInput Featured Image | `BaseInput placeholder editor.featuredImage` | — | `image` (URL) |
| Cover via Blossom hochladen | "Upload" Button → MediaPicker (`featured`) | `BaseButton editor.uploadImage`; MediaPicker; `@pick-image` | 24242 (Blossom) | `aspectRatio=1.91`, `outputWidth=1200`, `outputHeight=630` |
| Hashtag hinzufügen | Tag-Input, Enter | `BaseInput placeholder editor.addTag`; `@keydown.enter.prevent`; BaseChip color=orange | — | `tag` (lowercased, `#` gestrippt, dedupe) |
| Hashtag entfernen | X auf BaseChip | `BaseChip removable @remove` | — | `tag` |
| Author-Pubkey setzen | BaseInput Author-Section | `placeholder editor.authorPubkey`; hint editor.authorPubkeyHint; resolved pill green; errors editor.authorNip05NotFound/authorInvalid | — | `authorPubkey` (npub/hex/nip05, → hex) |
| Markdown schreiben (Milkdown) | Klick in Editor-Bereich (Write-Tab) | `div.milkdown-editor .ProseMirror`; placeholder 'Start writing your article...'; Write-Tab `editor.writeMode` | — | `content` (markdown) |
| Format-Toolbar nutzen | EditorFormatToolbar-Buttons | titles editor.bold/italic/strikethrough/inlineCode/heading1-3/bulletList/orderedList/blockquote/codeBlock/horizontalRule/link/insertImage/table/undo/redo; lucide icons | — | — |
| Link einfügen | Link-Button (`window.prompt`) | toolbar Link title `editor.link`; native prompt `editor.linkUrl` | — | `href` (URL) |
| Inline-Bild einfügen | Image-Button → MediaPicker (`inline`, NO crop) | toolbar Image title `editor.insertImage` | 24242 | `aspectRatio=0` |
| Paste/Drag-Drop Bild-Upload | Paste/Drop ins Editor | `EditorImageUpload @paste/@drop`; Loader2 spinner `media.uploading` | 24242 | `file` (image File) |
| Preview umschalten | Write/Preview-Tab | `editor.writeMode` (PenLine), `editor.previewMode` (Eye) | — | — |
| Content-Format wechseln | Format-Selector-Cards (3 Buttons) | labels editor.formatArticle/Gallery/Interview; icons PenLine/Images/MessageSquare; confirm `editor.switchFormatTitle` (CLEARS content) | — | `format` (article/gallery/interview, default article) |
| **Draft speichern — Local only** | Save-Draft-Split-Button → "Save locally"; auch Autosave | `editor.saveDraft` HardDrive ChevronDown; item `editor.saveLocal`; `@save-draft`. **DRY-RUN STOP — kein Event signiert** | — (nur localStorage) | `type=local` |
| Draft speichern — Shared (Relays) | Dropdown → "Save to relays" | item `editor.saveToRelays` Cloud icon; `@save-shared` | 30024 | `type=shared` |
| Draft speichern — Encrypted (NIP-37) | Dropdown → "Save encrypted" | item `editor.saveEncrypted` Lock icon; `@save-encrypted`. **THROWS wenn weder NIP-44 noch NIP-04** | 31234 (wrappt 30024) | `type=encrypted` |
| **Artikel publizieren** | Primär-Button "Publish" | `BaseButton primary editor.publish`; `@publish`; PublishingOverlay (role=status, editor.publishing); toast publishSuccess/publishError | 30023 | siehe unten |
| Drafts durchsuchen/filtern | Drafts-Nav | search `drafts.searchDrafts`; filter-pills common.all/drafts.localOnly/onRelays/private/filterImported; source select `drafts.filterBySource`; view toggle | — | `filter` (all/local/relay/encrypted/imported) |
| Einzelnen Draft löschen | Trash-Icon auf Row | `drafts.deleteDraft` Trash2; confirm.deleteDraft | 5 (für relay/encrypted) | — |
| Bulk-Delete Drafts | Checkboxen → Bulk-Bar → "Delete selected" | checkboxes; drafts.selectAllFiltered/deselectAll/deleteSelected; confirm.deleteDrafts; toast drafts.bulkDeleted | 5 (eine pro Kind) | — |
| Article-Inspector öffnen | Klick auf Artikel in Liste | `BaseDrawer articles.inspect`; ArticleInspector | — | — |
| Artikel Site zuweisen/entfernen | Site-Rows in Inspector | heading `articles.assignSites` (Globe); per-site toggle Check/Loader2 | 30004 (via siteStore) | `articleARef` |
| Artikel-Löschung (owner) | "Request deletion" (nur owner) | `articles.requestDeletion` Trash2; confirm.deleteArticle; toast deletionSuccess/Failed | 5 (target 30023) | — |
| Artikel auf Nostr ansehen | "View on Nostr" Link | anchor `articles.viewOnNostr` → `https://njump.me/<naddr>` | — | — |

**Publish-Parameter (kind 30023):**

| Parameter | Typ | Required | Hinweis |
|-----------|-----|----------|---------|
| `dTag` | string | ja | auto `draft-<ts>` oder existierender Key; NICHT user-editierbar |
| `title` | string | nein | UI-Fallback "Untitled" |
| `content` | markdown | nein | |
| `summary` | string | nein | nur bei non-empty als Tag |
| `image` | URL | nein | |
| `hashtags` | string[] | nein | |
| `authorPubkey` | npub/hex | nein | `['p',author,'','author']` |
| `published_at` | number (epoch s) | — | immer `now`; KEINE Scheduling-UI |

**Editor-Gotchas:** Editor liegt unter `/dashboard/editor` (NICHT CreatorPage). dTag/Slug nicht user-editierbar. Kein Scheduling, keine Sprache/Canonical/Visibility-Felder im Editor. Cover erzwingt 1.91:1 (1200×630). Save-Draft ist ein Split-Button mit `@mousedown.prevent` — Playwright sollte mousedown nutzen (Menü schließt bei blur nach 150ms). Milkdown ist contenteditable, keine textarea. Format-Switch mit Content zeigt Confirm und LÖSCHT Content.

**Dateien:** `views/dashboard/EditorView.vue`, `composables/useEditor.js`, `components/editor/*`, `components/articles/ArticleInspector.vue`, `stores/article.store.js`, `stores/draft.store.js`, `services/event-builder.service.js`, `composables/useBlossom.js`.

---

## Domäne: Sites (Blogs/Wikis)

Erstellen/Verwalten öffentlicher Nostr-"Sites", jede gestützt auf ein kind 30004 Curation-Set. Drei Workspaces: Overview, Organize, Settings/Design (SiteConfigurator → kind 30078). Öffentliche Sites rendern unter `/s/:dTag`. Keine Badge-/Role-Gate (jeder logged-in User).

### Routen

| Name | Pfad | Auth |
|------|------|------|
| Sites | `/dashboard/sites` | ja |
| SiteOrganizeLanding | `/dashboard/sites/organize` | ja |
| SiteDetail | `/dashboard/sites/:siteId` | ja |
| SiteOrganize | `/dashboard/sites/:siteId/organize` | ja |
| SiteConfig | `/dashboard/sites/:siteId/config` | ja |
| PublicSite | `/s/:dTag` (Flask) | nein |

### Aktivitäten

| Aktivität | UI-Trigger | Selector-Hinweise | Kind | Parameter |
|-----------|-----------|-------------------|------|-----------|
| Create-Site-Modal öffnen | "Create site" Button im Header/Empty-State | `button:has-text("Create site")` text=sites.createSite; BasePageHeader #actions | — | — |
| Site erstellen | Name eingeben → "Create" / Enter | `BaseModal[title="Create site"]`; `input[placeholder=sites.createNamePlaceholder]`; Create (sites.createAction); Cancel | 30004 | `newSiteTitle` (string, ja; dTag auto-derived `trim().toLowerCase().replace(/\s+/g,'-').replace(/[^a-z0-9-]/g,'')`), `description`/`image` (leer) |
| Sites-Liste refreshen | FetchStatusBar refresh / "Retry" | FetchStatusBar @refresh; `button:has-text("Retry")` | — | — |
| Site öffnen (Overview) | Klick auf SiteCard-Body | SiteCard root @click; `h3:has-text(site.title)` | — | `site.dTag` |
| Public Site ansehen | "View site"/"View public" | `button:has-text("View site")`/`"View public")`; ExternalLink; `window.open('/s/'+dTag)` | — | `dTag` |
| Site konfigurieren | Gear-Icon / SiteSubnav "settings" | `button[title=sites.settings] Settings icon`; SiteSubnav router-link `.../config` | — | `dTag` |
| Site löschen | Roter Trash → Confirm | `button[title=sites.deleteSite] Trash2`; BaseConfirmDialog confirm.deleteSite | 5 (`e`, `a=30004:<pubkey>:<dTag>`, `k=30004`) | `siteDTag` |
| Artikel aus Site entfernen (Overview) | "Remove" → Confirm | `BaseButton ghost text=sites.removeArticle`; confirm.removeFromSite | 30004 (debounced 5s) | `articleARef` |
| Zu Articles (Membership-Bridge) | "Go to articles"/"Add pages" | `button:has-text("Go to articles")`/`"Add pages")` Plus; `router.push('/dashboard/articles')` | — | — |
| Artikel Sites zuweisen (SiteAssignPopup) | Aus Artikel "Assign" Modal → Site-Row | `BaseModal[title=articles.assign]`; FuzzySearch; assigned row `bg-orange-50 '✓'` | 30004 (debounced 5s/batched) | `articleARef`, `siteDTag` |
| Site zum Organisieren wählen | `/dashboard/sites/organize` Site-Card | router-link `.../:dTag/organize`; ChevronRight | — | `dTag` |
| Artikel reordern (flat) | Drag per `.order-drag-handle` / "Newest first" | draggable handle `.order-drag-handle`; GripVertical organize.dragToReorder; `organize.sortNewest`; search organize.searchPages | 30004 (debounced 5s) | `orderedRefs` (string[]), `search` |
| Artikel inline entfernen (Organize) | "X" auf Artikel-Row → Confirm | `button[title=sites.removeArticle] X`; confirm.removeFromSite | 30004 (debounced 5s) | `aRef` |
| Newest first sortieren | "Newest first" Button | title organize.sortNewestHint; ArrowDownNarrowWide | 30004 (debounced 5s) | — |
| Wiki: Section hinzufügen | "Add section" / "New section" | `button:has-text('Add section') Plus`; organize.newSection FolderPlus | 30078 (debounced 900ms) | `section {title, refs[]}` |
| Wiki: Pages zu Section zuweisen (bulk) | Pool-Rows multi-select → "Add to section" | pool li @click; "Select all"; `organize.addToSection`; tag-filter pills; search | 30078 (900ms) | `selected` (aRefs), `target` (section/`__new__`), `search`, `activeTag` |
| Wiki: Auto-fill | "Auto-fill" (Wand2) | title organize.autoFillHint Wand2; disabled wenn pool leer | 30078 (900ms) | — |
| Wiki: Sections rename/reorder/delete; Pages move/remove | Section-Title-Input; drag `.section-handle`/Chevrons; Trash2; drag `.page-handle`; X | section title `organize.sectionPlaceholder`; `.section-handle` GripVertical; Trash2 organize.deleteSection; group wiki-pages handle `.page-handle`; X organize.removeFromSection | 30078 (900ms) | `section.title`, reorder |
| SiteConfigurator-Tab wechseln | Tab-Button im Nav-Rail | nav buttons (User/Palette/PanelsTopLeft/Share2/BarChart3); active `bg-orange-50`; labels sites.tabAbout/tabDesign/tabHeaderFooter/tabSharing/tabAnalytics | — | `activeTab` (about/design/headerFooter/sharing/analytics) |
| **Site-Config speichern** | "Save" Button unten | `BaseButton variant=primary :loading=isSaving common.save` | 30078 (+ 30004 wenn coverImage geändert) | siehe unten |
| Bild via MediaPicker wählen (Config) | "Browse media" neben URL-Inputs | `BaseButton secondary ImagePlus media.browseMedia`; MediaPicker | — | `mediaPickerTarget` (logo/coverImage/headerImage/ogImage) |
| Banner-Focal-Point anpassen | "Adjust focal point" (Crosshair) | `BaseButton Crosshair sites.adjustFocalPoint :disabled=!headerImage`; `BaseModal sites.adjustFocalPoint`; stage cursor-crosshair; 3×3 presets; X/Y inputs; Reset | — | `headerImagePosition` ('<x>% <y>%', default 50% 50%) |
| Nav-/Footer-Links bearbeiten | LinkListEditor unter Header/Footer | LinkListEditor sites.linkLabel/linkUrl | — | `navLinks`/`footerLinks` ([{label,url}]) |
| Social-Links bearbeiten | SocialLinkEditor unter About | SocialLinkEditor v-model=config.socialLinks | — | `socialLinks` (array) |
| Site-Subnavigation | Overview/Organize/Settings Tabs | router-links; exact-active-class `!border-orange !text-orange`; sites.tab_overview/tab_organize/tab_settings | — | `siteDTag` |
| Site-Group erstellen (legacy) | Name → "+"/Enter | `BaseInput placeholder=board.createGroup`; "+" addGroup | — (localStorage `site-groups`) | `name` |

**Site-Config-Save-Parameter (Auswahl):** `slug` (default site.dTag), `title`, `subtitle`, `about` (textarea), `socialLinks`, `theme` (clean/ivory/mint/lavender/sky/midnight/charcoal/ember, default clean), `colorAccent` (default #F7931A), `fontFamily` (serif/sans/system, default system), `layout` (magazine/grid/list/photoblog/minimal/timeline/wiki, default magazine), Wiki-Felder (`wikiSidebarPosition`, `wikiSidebarDrawer`, `wikiDrawerStyle`, `wikiShowSearch`, `wikiDefaultExpanded`, `wikiNav`), `logo` (1:1 512×512), `headerImage` (1500×500), `headerImagePosition`, `navLinks`, `footerText`, `footerLinks`, `metaDescription`, `coverImage` (1.91:1 1200×630, Change → extra 30004), `ogImage`, `analyticsProvider` (''/google/plausible/umami), `analyticsId`, `actionButton`.

**Publish-Modell:** 5000ms-Debounce (PUBLISH_DEBOUNCE_MS) für assign/unassign/reorder; Wiki-Configs separate 900ms; `flushPendingPublishes()` bei unload/logout; Draft-Mode batcht ohne Publish bis Commit.

**Dateien:** `stores/site.store.js`, `services/site.service.js`, `views/dashboard/Site*.vue`, `components/sites/*`, `themes/index.js`.

---

## Domäne: Magazine

Magazines und Issues sind BEIDE kind 30004. Magazin-Config ist kind 30078. **Alle vier Magazin-Routen erfordern Auth UND `meta.requiresBadge:'magazines'`** — Playwright muss einen Account mit ausreichender Rolle nutzen oder das Gate muss free/disabled sein.

### Routen

| Name | Pfad | Auth | Gate |
|------|------|------|------|
| Magazines | `/dashboard/magazines` | ja | badge magazines |
| MagazineDetail | `/dashboard/magazines/:magId` | ja | badge magazines |
| MagazineConfig | `/dashboard/magazines/:magId/config` | ja | badge magazines |
| IssueEditor | `/dashboard/magazines/:magId/issues/:issueId` | ja | badge magazines |

### Konstanten

`MAGAZINE_PREFIX='mag:'`, `MAGAZINE_CONFIG_PREFIX='einundzwanzig:magazine-config:'`. Magazin-Event: `#t magazine` + `d=mag:<slug>` + `a`-Tags pro Issue. Issue-Event: `d=<mag:slug>:issue-N`, content JSON `{sections, coverArticle, coverImage, coverSubtitle}`. **Issue-Drafts liegen im Backend-DB** (nicht Nostr) bis zum Publish.

### Aktivitäten

| Aktivität | UI-Trigger | Selector-Hinweise | Kind | Parameter |
|-----------|-----------|-------------------|------|-----------|
| Magazin erstellen | "Create magazine" Header/Empty-State → Modal "Create"/Enter | `magazine.createMagazine`; `BaseModal title magazine.createMagazine`; BaseInput `magazine.createNamePlaceholder`; confirm `magazine.createAction` :disabled=!newTitle.trim() | 30004 (#t magazine) | `title` (ja; → slug/d-tag) |
| Magazin-Liste / Empty-State | `/dashboard/magazines` (Gate magazines) | BasePageHeader magazine.title; FetchStatusBar; Retry; onboarding magazine.onboarding.title | — | — |
| Public Magazin öffnen (Card) | MagazineCard "View magazine" | `magazine.viewMagazine` @click.stop; `window.open('/m/<slug>')` | — | — |
| Magazin auswählen (Detail) | Klick MagazineCard-Body | MagazineCard root (oranger Top-Bar) | — | — |
| Magazin konfigurieren (Card) | Gear-Icon | title `magazine.configure` Settings | — | — |
| Magazin-Detail (Issues-Liste) | Route `:magId` | breadcrumb magazine.title; public url pill `magazine.copyPublicUrl`; magazine.configure/viewPublic/createIssue; amber banner magazine.privateBannerTitle; IssueCard | — | — |
| Public-URL kopieren | Mono-Pill im Header | `button title magazine.copyPublicUrl` `/m/<slug>` | — | — |
| Public Magazin ansehen (Detail) | "View public" | `magazine.viewPublic`; `window.open(path,'_blank','noopener')` | — | — |
| Issue erstellen (Draft) | "Create issue" → Modal "Create" | `BaseModal magazine.createIssue`; BaseInput magazine.issueTitle; confirm common.create. Draft-id `<magDTag>:issue-<N>` | — (Backend-Draft) | `title` (optional, default "Issue <N>") |
| Issue auswählen/bearbeiten | Klick IssueCard-Row | IssueCard cursor-pointer; draft/published BaseBadge | — | — |
| Issue-Setup bearbeiten (Titel/Desc/Cover) | Collapsible "Issue setup" Panel | collapse toggle magazine.issueTitle Chevron; inputs magazine.issueTitle/description/coverImage/coverSubtitle; MediaPicker media.browseMedia; select coverArticle. **Autosave 2s debounce** | — | `issueTitle`, `issueDescription`, `coverImage` (1.91 1200×630), `coverArticle` (aRef select), `coverSubtitle` |
| Section hinzufügen | Plus-Icon im Sections-Header / "Add section" | title `magazine.addSection` Plus; ghost magazine.addSection | — | — |
| Sections reordern (drag) | `.section-drag-handle` (GripVertical) | `.section-drag-handle`; common.dragToReorder | — | — |
| Aktive Section wählen | Klick Section-Row | clickable section row (name + count badge) | — | — |
| Section entfernen | Trash → Confirm | trash title magazine.removeSection; confirm.removeSection | — | — |
| Aktive Section umbenennen | BaseInput im Active-Section-Header | BaseInput (active section name) | — | — |
| Section-Description bearbeiten | Textarea | `placeholder magazine.sectionDescPlaceholder` | — | — |
| Section-Layout setzen | 3-Button-Selector | label magazine.sectionLayout; magazine.layoutGrid/layoutHero/layoutTwoUp | — | `layout` (grid/hero/two-up, default grid) |
| Artikel-Library-Drawer öffnen | "Open library" | `magazine.openLibrary` Library; drawer magazine.articleLibrary; search common.search; close common.close | — | — |
| Artikel in Library suchen | Drawer-Search | `BaseInput placeholder common.search` | — | `search` |
| Artikel (multi-)selektieren | Tile/Checkbox; Shift+click Range | article tiles (checkbox+thumb+title); magazine.librarySelected | — | — |
| Selektierte Artikel hinzufügen | Drawer-Footer "Add to section" | `magazine.addToSection` (interpoliert name); Clear (common.clear) | — | — |
| Artikel per Drag in Section | Library-Tile in Section ziehen | GripVertical handle; group 'articles' clone; empty dropzone magazine.onboarding.emptyArticles | — | — |
| Artikel in Section reordern | `.article-drag-handle` (GripVertical) | `.article-drag-handle` | — | — |
| Artikel featured togglen | Star/StarOff-Button | title magazine.toggleFeatured | — | — |
| Artikel aus Section entfernen | Trash auf Artikel-Card | Trash2 (red hover) | — | — |
| Issue-Cover via MediaPicker | "Browse media" in Issue-Setup | media.browseMedia ImagePlus; MediaPicker (1.91 1200×630) | — | — |
| Issue-Draft Autosave | Automatisch (2s deep watch) | header `magazine.autosaving`/`magazine.saved` | — (Backend) | — |
| **Issue publizieren** | "Publish issue" (:disabled=!canPublish) | `magazine.publishIssue`; checklist magazine.checklistReady/NotReady; items checklistTitleSet/Section/Articles/Cover/Featured. **Hard-Gate:** title non-empty, ≥1 section, jede section ≥1 article | 30004 (Issue) + 30004 (Magazin re-publish) | (Editor-State) |
| Public-URL kopieren (post-publish toast) | Toast-Action | `magazine.copyPublicUrl` | — | — |
| **Magazin-Config speichern** | MagazineConfigurator (5 Tabs) → "Save" | tabs magazine.tabAbout/tabDesign/tabHeaderFooter/tabSharing/tabAnalytics; Save common.save :loading=isSaving | 30078 (`d=einundzwanzig:magazine-config:<slug>`) | siehe unten |
| Media für Config wählen | "Browse media" je Image-Field | media.browseMedia ImagePlus; MediaPicker | — | `mediaPickerTarget` (logo 1×512 / headerImage 3×1500×500 / ogImage 1.91×1200×630) |

**Magazin-Config-Parameter:** `slug`, `title`, `subtitle`, `about`, `socialLinks`, `theme` (default clean), `colorAccent` (#F7931A), `fontFamily` (default sans), `coverStyle` (full/card/minimal), `headerImage` (3×1500×500), `logo` (1×512×512), `navLinks`, `footerText`, `footerLinks`, `metaDescription`, `ogImage` (1.91×1200×630), `analyticsProvider` (''/google/plausible/umami), `analyticsId`.

**Gotcha:** `section.articles`-Items können legacy strings oder `{aRef,featured}` sein (defensive `_migrateSection`). `coverArticle`-Select bietet nur bereits zugewiesene Artikel. Public-Pages `/m/:slug` sind Flask-gerendert.

**Dateien:** `components/magazine/*`, `stores/magazine.store.js`, `services/magazine.service.js`, `views/dashboard/Magazine*.vue`, `views/dashboard/IssueEditorView.vue`.

---

## Domäne: Engagement / Social

Reader-Interaktionen: Liken (7), Reposten (6/16), Bookmarken (10003), Kommentieren (1111), Lightning-Zappen (9734); Pinnwand-Wall (1111 mit client-seitigem Muting); Board (Drag-and-Drop Artikel→Sites); Activity-Timeline. Artikel-Engagement ist aRef-scoped (`useEngagement`), Note/Wall-Engagement event-id-scoped (`useNoteEngagement`).

### Routen

| Name | Pfad | Auth |
|------|------|------|
| Subscriptions (Feed + Wall) | `/dashboard/subscriptions` (`?tab=feed\|wall`) | ja |
| Board | `/dashboard/board` | ja |
| Activity | `/dashboard/activity` | ja |
| CreatorPage (Wall + top-level compose) | `/u/:identifier` | nein |

### Artikel-Engagement (EngagementBar, aRef-scoped)

| Aktivität | Trigger | Selector-Hinweise | Kind | Parameter |
|-----------|---------|-------------------|------|-----------|
| Artikel liken | Heart-Button (1.) in EngagementBar | aria-label `engagement.actions.react`; lucide Heart (fill-current aktiv); disabled while eng.isReacting | 7 | — |
| Artikel reposten | Repeat2-Button (2.) | `engagement.actions.repost`; Repeat2; disabled eng.isReposting | 16 | — |
| Artikel bookmarken | Bookmark-Button (3.) | `engagement.actions.bookmark`; Bookmark (fill aktiv); disabled bookmarks.isPublishing | 10003 (NIP-51) | — |
| Artikel kommentieren | MessageCircle-Button (4.) toggelt Composer; "Send" | `engagement.actions.comment`; textarea `engagement.comment.placeholder` maxlength=2000; send `engagement.comment.send` Send icon; modal title `engagement.comment.title` | 1111 | `content` (≤2000, non-empty) |
| Auf Kommentar antworten (Thread) | Reply-Button per CommentRow | reply `engagement.comment.reply`/common.cancel Reply icon; textarea `engagement.comment.replyPlaceholder` maxlength=2000; max indent depth 6 | 1111 (threaded) | `content`, `parent {event_id, pubkey}` |
| **Artikel zappen** | Zap-Button (5.) → ZapDialog | `engagement.actions.zap` Zap icon; dialog `engagement.zap.title`; 4 presets (21/100/500/1000); custom BaseInput number; comment maxlength=280; submit `engagement.zap.send`; pay screen QR `lightning:<invoice>` + copy | 9734 (receipt 9735 vom Provider) | `amount` (sats, default 100, presets [21,100,500,1000], custom >0), `comment` (≤280) |

### Note/Wall-Engagement (NoteEngagementBar, event-id-scoped)

| Aktivität | Trigger | Selector-Hinweise | Kind | Parameter |
|-----------|---------|-------------------|------|-----------|
| Note/Wall liken | Heart (1.) in NoteEngagementBar | `engagement.actions.react`; @click.stop | 7 (e-tagged) | — |
| Note/Wall reposten | Repeat2 (2.) | `engagement.actions.repost` | 6 (kind-1 target) / 16 (sonst) | — |
| Note/Wall kommentieren | MessageCircle (3.) | `engagement.actions.comment`; textarea `engagement.comment.placeholder`. **Kein Bookmark in NoteEngagementBar** | 1111 (e-scoped) | `content` (≤2000), `parent` (optional `{id,pubkey}`) |
| Note/Wall zappen | Zap (4.) → ZapDialog | identisch zu Artikel-Zap | 9734 (e-scoped) | `amount`, `comment` (≤280) |

### Pinnwand-Wall

| Aktivität | Trigger | Selector-Hinweise | Kind | Parameter |
|-----------|---------|-------------------|------|-----------|
| Top-Level Wall-Post | **Nur CreatorPage** (`allowTopLevelCompose=true`): compose prompt → textarea → "Send" | `wall.composePrompt`; textarea `wall.composePlaceholder` rows=3; send `wall.send` Send :disabled unless session.pubkey && text; cancel; sign-in hint `wall.composeSignInHint` | 1111 (profile-anchored, root `0:<ownerPubkey>:`, k='0') | `content`, `ownerPubkey` |
| Auf Wall-Post antworten | Reply-Button per WallPostCard | reply `wall.reply`/`wall.cancelReply` Reply; textarea `wall.replyPlaceholder` rows=2; send `wall.send` | 1111 (comment-scoped) | `content`, `parentId`, `parentPubkey`, `ownerPubkey` |
| React/Repost/Comment/Zap auf Wall-Post | NoteEngagementBar in WallPostCard (target kind=1111) | NoteEngagementBar-Buttons; justify-between, Reply rechts | 7/16/1111/9734 | — |
| Wall-Author muten/unmuten | "…" Menü → "Mute author"; reply EyeOff; Undo-Toast | menu `wall.menu` MoreHorizontal; mute `wall.muteAuthor` EyeOff; reply mute EyeOff; `wall.mutedCount`; undo `wall.undo` | — (localStorage `wall-muted:<pubkey>`) | `pubkey` (`/^[0-9a-f]{64}$/i`) |
| Wall refreshen | RefreshCw-Button im Header | `wall.refresh` RefreshCw (animate-spin); `wall.countLine` | — (read) | — |
| Author-Profil aus Wall öffnen | Avatar-Klick | avatar button title=displayName; focus-visible:ring-orange-200 | — | `pubkey` |

### Board

| Aktivität | Trigger | Selector-Hinweise | Kind | Parameter |
|-----------|---------|-------------------|------|-----------|
| Panel-Quelle wählen | 2 BaseDropdown (Left/Right) | left `board.leftPanel`, right `board.rightPanel`; items `board.inbox` + sites | — | `source` (inbox / `<site dTag>`) |
| Artikel zwischen Collections draggen | HTML5 Drag-Drop BoardCard | `div[draggable=true]` cursor-grab; column drop highlight border-orange; pending pill role=status `board.publishingIn`/`board.publishingNow` Loader2 | — (site.store 30004 ~5s debounce) | `aRef`, `fromColumn`, `targetSource` |
| Artikel aus Site-Column entfernen | "X" auf BoardCard | remove title='Remove' X hover:text-red-500 | — (site.store) | `aRef`, `sourceId` |
| Nach Site-Group filtern / Column collapsen / Show more | BaseChip-Gruppen; Column-Header; "Show more" | group chips `board.groups`; collapse Chevron + count; `board.showMore` | — | `activeGroup` |

### Activity-Log

| Aktivität | Trigger | Selector-Hinweise | Kind | Parameter |
|-----------|---------|-------------------|------|-----------|
| Activity ansehen/filtern/clearen | `/dashboard/activity`; Filter-Dropdown; "Clear" → Confirm; "Show all" | filter button + ChevronDown, `activity.filterSites`/`filterMagazines`/`filterAll`; clear `activity.clear` Trash2; confirm.clearActivity; empty `activity.noActivity`. **Nur Anzeige — Entries von anderen Domänen geschrieben** | — (localStorage `activity-log`) | `activeFilter` ({type:'site'\|'magazine', key} \| null) |

**Engagement-Gates:** Alle Publish-Actions erfordern `session.pubkey` UND `isSignerActive()` (sonst Toast `engagement.errNotLoggedIn`). Zap erfordert zusätzlich `lud16`/`lud06` beim Author (sonst `engagement.errNoLightning`) und NIP-57-fähiges LNURL-Endpoint. Payment-Precedence: NWC > WebLN > QR.

**Kind-Konstanten:** KIND_REACTION=7, KIND_GENERIC_REPOST=16, KIND_NOTE=1, KIND_COMMENT=1111, KIND_ZAP_REQUEST=9734, KIND_ZAP_RECEIPT=9735, KIND_PROFILE=0; bookmark 10003 (hardcoded). Comment maxlength=2000, zap comment 280, zap presets [21,100,500,1000] default 100.

**Dateien:** `components/engagement/*`, `components/wall/*`, `components/board/*`, `components/activity/*`, `composables/useEngagement.js`, `composables/useNoteEngagement.js`, `stores/event-engagement.store.js`, `stores/wall.store.js`, `stores/comment.store.js`, `stores/bookmark.store.js`, `stores/activity.store.js`, `services/zap.service.js`.

---

## Domäne: Profile & Settings

Eigenes Nostr-Profil (kind 0, NIP-24), NIP-39 Identity-Claims, NIP-58 Badges (read-only), Relays (custom + NIP-65 kind 10002), Blossom-Server (kind 10063). Globales Profile-Peek-Modal (subscribe/unsubscribe) bei Avatar-Klicks.

### Routen

| Name | Pfad | Auth |
|------|------|------|
| Settings | `/dashboard/settings` | ja |
| Profile | `/dashboard/profile` | ja |

### Aktivitäten

| Aktivität | UI-Trigger | Selector-Hinweise | Kind | Parameter |
|-----------|-----------|-------------------|------|-----------|
| Profile-Edit-Modal öffnen | "Edit Profile" (Pencil) auf Banner | `button text 'Edit Profile'`; Pencil; BaseModal `profile.editProfile`. Fetcht latest kind:0 als Merge-Base | — | — |
| **Profil-Metadaten editieren & publizieren** | Felder füllen → "Save Profile" | labels profile.displayName; placeholder 'satoshi'; textarea profile.aboutLabel; type=url; NIP-05 'name@domain.com'; 'name@walletofsatoshi.com'; 'lnurl1...'; checkbox profile.botFlag; type=date; save `profile.saveProfile`. **Leeres Feld LÖSCHT kind:0 Key** | 0 | `display_name`, `name`, `about`, `picture`, `banner`, `website`, `nip05`, `lud16`, `lud06`, `bot` (bool), `birthday` (YYYY-MM-DD), `pronouns`, `location` |
| Profil-Bild via Blossom hochladen | Preview/"Upload" klicken oder Drag-Drop | "Upload"/"Library"; hidden `input[type=file][accept='image/*']`; max 100 MiB | 24242 (BUD-02 auth) | `file` (image/*) |
| Bild aus Media-Library wählen | "Library" → MediaGrid | "Library"; BaseModal media.title; MediaGrid tiles | — | — |
| Profil-Bild löschen | X-Badge auf Preview | X icon absolute -top-1 -right-1 | — | — |
| Identity-Manager öffnen (NIP-39) | "Manage identities" Row | `profile.identitiesManage`; BadgeCheck+ChevronRight; VerifiedAccountsModal identities.title | — | — |
| Identity-Claim hinzufügen (NIP-39) | Platform-Tile → Proof → "Add & publish" | tiles GitHub/Mastodon/Telegram; inputs gist/toot/tg URLs; Copy identities.copy; `identities.addAndPublish` Plus; back identities.back | 0 (mit `i`-Tag) | `platform` (github/mastodon/telegram), `url`, `userId` (TG, numeric) |
| Identity-Claim entfernen (NIP-39) | Trash auf Identity-Row | Trash2 per row; title identities.remove | 0 (`i`-Tag entfernt) | `item` |
| NIP-39 Verification-Text kopieren | "Copy" am Code-Block | Copy/Check; identities.copy/'Copied' | — | — |
| Eigene Badges ansehen (NIP-58) | `/dashboard/profile` → "All Badges" | heading 'All Badges'; search 'Search by name...'; badge tiles; 'Show all N badges'; Award/Search | — (read 30008/30009/0) | — |
| Badge-Detail-Modal | Klick Badge-Tile | BaseModal=badge name; 'Show technical details' Code; copy buttons; issuer row | — | — |
| Badges auf Creator-Page (ProfileBadges) | ProfileBadges-Strip; Badge-Chip; "Show all N" | 'Badges (N)' Award; badge chips; 'Show all N badges' | — | — |
| Relays suchen/filtern | "Search relays..." Input | placeholder 'Search relays...' Search; empty settings.relayNoMatch | — | — |
| Relay-Role-Section expandieren | Section-Header klicken | header aria-expanded; ChevronRight/Down; `settings.relayGroup.<key>` | — | — |
| Relay NIP-11-Info ansehen | Relay-Row klicken | relay row cursor-pointer; Info; 'Fetching relay info...'; status dot | — | — |
| Relay-URL kopieren | Copy-Icon | Copy/Check; common.copy | — | — |
| Custom-Relay hinzufügen | URL eingeben → "Add"/Enter | settings.addRelayHeading; BaseInput settings.addRelay; role pills `settings.relayGroup.<role>`; Add common.add; error relayMustBeSecure/relayPickGroup. **localStorage, kein Event** | — | `url` (wss:// erzwungen), `roles` (profiles/longform/discovery/general/fallback, default ['general']) |
| Custom-Relay-Rollen editieren | Info-Panel → "Edit groups" | settings.editGroups Pencil; role pills; Save/Cancel | — | `roles` (array) |
| Relay entfernen/verstecken | X auf Relay-Row → Confirm | X icon; settings.removeRelay/hideRelay; confirm.removeRelay/hideRelay | — | `url` |
| Degraded Relays reconnecten | Reconnect-Button im Header | RefreshCw animate-spin; settings.reconnect/reconnecting; 'N/M connected' | — | — |
| NIP-65 Relay-Liste-Editor öffnen | "Edit relay list" in yourRelays | settings.relayListEdit Pencil; RelayListEditor settings.relayListEditTitle | — | — |
| **NIP-65 Relay-Liste editieren & publizieren** | Entries konfigurieren → "Publish" | per-row read `settings.relayRead`/write `settings.relayWrite`; X delete; add settings.addRelay Plus; Publish settings.relayListPublish/Publishing | 10002 | `entries` ([{url,read,write}], je read OR write), `newUrl`, `read`, `write` |
| Blossom-Server hinzufügen | URL → "Add"/Enter | BaseInput settings.blossomAddPlaceholder; Add common.add; error blossomDuplicate. **localStorage** | — | `url` (https) |
| Recommended Blossom-Addon hinzufügen | "Recommended" expandieren → "+ Add" | settings.blossomRecommendedTitle Chevron; addon row free/paid; '+ Add' settings.blossomAddonAdd Plus | — | — |
| Blossom-Server primary machen | Star-Icon auf non-primary | Star title settings.blossomMakePrimary; filled Star=primary; 'Primary' badge | — | — |
| Blossom-Server entfernen | X auf custom Row → Confirm | X opacity-0 group-hover settings.blossomRemove; confirm blossomConfirmRemove | — | — |
| **Blossom-Liste publizieren (10063)** | "Publish to Nostr" | `BaseButton w-full Upload settings.blossomPublishToNostr`; toast blossomPublished/Error. Nur wenn session.pubkey | 10063 (BUD-03) | `servers` (url[]) |
| Profile-Peek-Modal öffnen | Avatar-Klick irgendwo | BaseModal profileModal.title; 'Loading...'; njump.me link. Braucht 64-hex pubkey | — | — |
| User subscriben (aus Modal) | "Subscribe" Button | `BaseButton primary profileModal.subscribe` Plus; self profileModal.self | 30000 (via subscription.store) | — |
| User unsubscriben (aus Modal) | "Subscribed" Button | `BaseButton secondary` green Check profileModal.subscribedButton; undo profileModal.undo | 30000 | — |
| npub kopieren / njump öffnen | npub-Chip / "View on Nostr" | npub chip Copy/Check; 'View on Nostr' profileModal.viewOnNostr ExternalLink `https://njump.me/<npub>` | — | — |

**Gotchas:** ProfileEditModal merged Edits auf latest raw kind:0 (unbekannte Felder/Tags überleben); leere Felder LÖSCHEN Keys. Custom-Relays/Blossom-Server sind rein localStorage bis 10002/10063 publiziert. `relayService.publish` gibt je Relay 8s Timeout; Success braucht ≥1 Relay OR Backend-Import OK. Blossom: primary=Upload-Target, andere=Mirror; Default-Server nicht entfernbar. 100 MiB Hard-Ceiling.

**Dateien:** `components/profile/*`, `components/badges/*`, `components/settings/*`, `views/dashboard/SettingsView.vue`, `views/dashboard/ProfileView.vue`, `stores/settings.store.js`, `stores/relay.store.js`, `stores/badge.store.js`, `services/blossom.service.js`, `services/relay.service.js`, `services/nip98.service.js`.

---

## Domäne: Media / Imports / Subscriptions / Matrix

Vier Dashboard-Workspaces: Imports (RSS/Atom/JSON → encrypted Drafts 31234/30024), Subscriptions (Follow-Set 30000 + Feed + Wall), Media (Blossom-Library, 24242), Matrix (Artikel→Sites über 30004). Alle Routen unter `/dashboard` (auth), keine extra Badge/Role-Gate.

### Routen

| Name | Pfad | Auth |
|------|------|------|
| Imports | `/dashboard/imports` | ja |
| Subscriptions | `/dashboard/subscriptions` | ja |
| Media | `/dashboard/media` | ja |
| Matrix | `/dashboard/matrix` | ja |

### Imports

| Aktivität | Trigger | Selector-Hinweise | Kind | Parameter |
|-----------|---------|-------------------|------|-----------|
| Add-feed-Dialog öffnen | "Add feed" Header/Empty-State | `imports.addSource` Plus; BasePageHeader #actions | — | — |
| Feed abonnieren (URL-Modus) | "Add feed" Footer / Enter | `input#imports-add-source-input`; placeholder imports.addSourcePlaceholder; footer imports.addSourceAction | 30078 (feed.store, indirekt) | `url` (Feed/Homepage/Article URL) |
| Paste-XML-Fallback | "Paste XML" → "Subscribe" | `imports.pasteXml`; `textarea#imports-paste-xml`; imports.useUrlInstead | — | `pastedXml`, `url` (optional) |
| Feed refreshen | FeedSourceRow / "Refresh" | `div[role=button][tabindex=0]` aria-label=imports.refresh; RefreshCw; Loader2 imports.refreshing | — | `feedUrl` |
| Kebab-Menü öffnen | MoreHorizontal | `button[aria-haspopup=true]` MoreHorizontal; role=menu teleported | — | — |
| Original-Site öffnen | Kebab "Open original" | role=menuitem imports.openOriginal ExternalLink | — | — |
| Feed abbestellen | Kebab "Unsubscribe" → Confirm | menuitem imports.unsubscribe BookmarkX; confirm imports.unsubscribeConfirm | — | `feedUrl` |
| Import-Scope wählen | Scope-Chips | scope chips imports.scopeNewest10/25/50/SinceVisit; 'recommended' badge | — | `scopeKey` (newest10/25/50/sinceVisit, default newest25) |
| Feed-Item-Selektion togglen | Checkbox/Label | `input[type=checkbox]#feed-item-<guid>`; pill imports.itemAlreadyImported | — | `guid` |
| Select/Deselect all | Header-Checkbox | header checkbox (indeterminate); imports.selectAll/deselectAll | — | — |
| Item-Excerpt previewen | "Preview"/"Hide preview" | imports.itemPreview/itemHidePreview ChevronDown/Up | — | — |
| Original aus Preview öffnen | ExternalLink-Icon | `a[target=_blank]` imports.openOriginal | — | — |
| Rehost-Images togglen | "Rehost images" Toggle | BaseToggle imports.rehostImages; hint imports.rehostImagesHint | — | `rehostImagesToggle` (bool, default true) |
| Image-Review öffnen | "Review images (kept/total)" | imports.imageReviewOpen; modal imports.imageReviewTitle | — | — |
| Images zum Mirroren wählen | Tiles; "All"/"None"; Confirm | tile buttons ImageThumb; imports.imageReviewSelectAll/SelectNone; confirm imports.imageReviewConfirm | — | `skipUrls` (Set) |
| **Selektierte Items importieren** | "Import selected (N)" | `BaseButton primary imports.importSelected`; ImportProgressList. Braucht Signer NIP-44/NIP-04 | 31234 (wrappt 30024) + 24242 (Bilder) | `items`, `feedUrl`, `rehostImages`, `skipImageUrls`, `scope/limit` (≤500) |
| Laufenden Import abbrechen | "Cancel import" (StopCircle) | imports.cancelImport StopCircle (nur active) | — | — |
| Import-Error/Mirror inspizieren | "Why?"; Mirror-Chevron; Mirror-Tile | imports.errorWhy Info; mirror done/total; copy imports.errorCopyDetails | — | — |
| Import-Workspace schließen | "Close"/"Cancel" | imports.closeProgress; imports.addSourceCancel | — | — |
| Importierten Draft im Editor öffnen | Recent-Import-Row-Title | router push EditorWithArticle; ImportedDraftBadge Rss | — | `dTag` |
| Importierten Draft verwerfen | "Discard" → Confirm | imports.discardImport; confirm imports.discardImportConfirm | — | `dTag` |
| Alle Imports in Drafts ansehen | "View all in Drafts" | imports.viewAllInDrafts → `/dashboard/drafts?filter=imported` | — | — |
| "What can I add?" Tooltip | Hover/Focus HelpCircle | `button[aria-label=imports.sourcesTooltipTitle]` HelpCircle; BaseTooltip | — | — |

### Subscriptions

| Aktivität | Trigger | Selector-Hinweise | Kind | Parameter |
|-----------|---------|-------------------|------|-----------|
| Add-Subscription-Modal öffnen | "Add" Header / FeedPanel-Empty | `BaseButton primary subscriptions.add` Plus; modal subscriptions.addModal.title | — | — |
| Creator abonnieren | "Subscribe" / Enter | `input#subscription-add-input`; placeholder subscriptions.addModal.placeholder; subscriptions.addModal.subscribe | 30000 (d=subscriptions) | `inputValue` (npub/NIP-05/hex) |
| Manage-Subscriptions-Modal | "Manage" im FeedPanel-Header | subscriptions.manage; modal subscriptions.manageModal.title | — | — |
| Creator abbestellen | "Unsubscribe" per Row | subscriptions.manageModal.unsubscribe; undo subscriptions.manageModal.undo (5s) | 30000 (republish) | `pubkey` (hex) |
| Subscriptions durchsuchen | Search-Input (>10) | placeholder subscriptions.manageModal.searchPlaceholder Search | — | `search` |
| Subscriber-Profil öffnen | Avatar-Klick | row avatar button title=name; User fallback | — | `pubkey` |
| Tab wechseln (Feed/Pinnwand) | CreatorTabs | subscriptions.tabs.feed/wall (Users/MessageSquare); `?tab=` | — | `tab` (feed/wall) |
| Feed filtern (All/Notes/Longform) | Filter-Chips | role=group subscriptions.feed.filter.label; chips all/notes/longform | — | `filter` (all/notes/longform) |
| Feed refreshen | "Refresh" / "Retry" | subscriptions.feed.refresh RefreshCw; retry subscriptions.feed.retry | — (read) | — |
| Mehr Feed-Items laden | "Load more" | subscriptions.feed.loadMore/loadingMore; end subscriptions.feed.endOfFeed | — | — |
| Feed-Artikel/Note extern öffnen | ArticleListItem/NoteCard | njump naddr/nevent; avatar→profile modal | — | — |
| Creator Public-Page öffnen / Share-Link | "Open public page" / Copy | subscriptions.openPublicPage ExternalLink; copy subscriptions.copyShareLink | — | — |

### Media

| Aktivität | Trigger | Selector-Hinweise | Kind | Parameter |
|-----------|---------|-------------------|------|-----------|
| Media hochladen | Drag-Drop / Klick MediaUploader | dropzone media.dropOrClick/dragActive; hidden `input[type=file][multiple][accept='image/*,video/*,audio/*']`; queue Loader2/CheckCircle2/XCircle | 24242 (BUD-02/04) | `files` (image/video/audio) |
| Nach Typ filtern | "Filter by type" Select | select mediaStore.filterType; media.filterAll/Images/Video/Audio | — | `filterType` (all/image/video/audio) |
| Sortieren | "Sort by" Select | select mediaStore.sortBy; media.sortNewest/Oldest/Largest/Smallest | — | `sortBy` |
| File selektieren | Checkbox auf MediaItem | `input[type=checkbox]` top-left; selected ring | — | `hash` (sha256) |
| Bulk-Delete | "Bulk delete" (≥1 selected) → Confirm | `BaseButton danger media.bulkDelete`; media.selected; confirm.deleteFiles | 24242 (delete auth) | — |
| Einzelne File löschen | Hover → "Delete" → Confirm | hover common.delete (red); confirm.deleteFile | 24242 | `hash` |
| Media-URL kopieren | "Copy URL" / Server-Dropdown | media.copyUrl; multi-server dropdown; media.mirroredServers; MediaPreview Copy | — | — |
| Media-Lightbox | Thumbnail-Klick | MediaPreview teleported; ChevronLeft/Right; Download; X; Arrow/Escape keys | — | — |
| MediaPicker (Editor/Forms) | programmatisch; Library/Upload-Tabs | BaseModal editor.insertImage; tabs media.title/media.upload; MediaGrid; media.checkingImage/uploading | — | `aspectRatio` (default 0; 1.91 OG), `outputWidth` (1200), `outputHeight` (630) |
| Bild croppen (ImageCropDialog) | von MediaPicker bei Aspect-Mismatch → "Apply" | BaseModal imageCrop.title; stage pointer/wheel; ZoomIn/Out; range; reset imageCrop.reset; Apply imageCrop.apply | — | `aspectRatio` (1.91), `outputWidth` (1200), `outputHeight` (630), `outputType` (image/webp), `outputQuality` (0.9) |

### Matrix

| Aktivität | Trigger | Selector-Hinweise | Kind | Parameter |
|-----------|---------|-------------------|------|-----------|
| Artikel suchen/filtern | Search-Input | placeholder articles.search Search; clear X | — | `search` |
| Nach Tags filtern | Tag-Dropdown | Tag icon articles.tags; `div[data-dropdown]` '#tag'; active chips X | — | `tag` |
| Nach Author filtern | Author-Dropdown | Users icon articles.authors; author rows; active avatar chips X | — | `pubkey` |
| Nach Site-Assignment filtern | Assignment-Dropdown (Globe) | Globe assignmentLabel; articles.allAssignments/unassigned/per-site | — | `assignmentFilter` (all/unassigned/`<site.dTag>`) |
| Sortieren | Sort-Dropdown (ArrowUpDown) | currentSortLabel; articles.sortNewest/Oldest/TitleAZ/TitleZA | — | `sortField` (date/title), `sortDir` (desc/asc) |
| Filter zurücksetzen | "Clear filters" | articles.clearFilters (nur bei hasActiveFilters) | — | — |
| **Artikel↔Site-Assignment togglen (Cell)** | Cell-Checkbox in MatrixRow | `td input[type=checkbox]` :checked=siteStore.isAssigned; @change toggle-assign | 30004 (Site republish) | `siteDTag`, `articleARef` (30023:pubkey:dTag) |
| Rows selektieren + Bulk-Assign/Unassign | Row-Checkboxen → MatrixBulkBar | MatrixRow checkbox (frozen left); MatrixBulkBar matrix.articlesSelected; matrix.selectAll/deselectAll; matrix.bulkAssign select | 30004 (je Site) | `siteDTag` |
| Matrix-Daten refreshen | FetchStatusBar / "Retry" | FetchStatusBar @refresh; error common.retry | — | — |

**Notes:** Imports speichern kind 31234 (NIP-37) wrappend kind 30024 — NICHT öffentlich publiziert bis User publiziert; Signer braucht NIP-44 oder NIP-04 (sonst fail-fast). Subscriptions = kind 30000 (d='subscriptions'), separat von kind 3 contacts. Feed-Source-Liste = kind 30078 d='einundzwanzig:feed-sources' (feed.store). Debounce: subscription.store + site.store 5s mit Undo-Window. RSS-Limits: newest10/25/50 + sinceVisit (RSS_MAX_LIMIT 500); RSS_DEFAULT_LIMIT=25; Batches >5 paced 250ms.

**Dateien:** `views/dashboard/{Imports,Subscriptions,Media,Matrix}View.vue`, `components/imports/*`, `components/subscriptions/*`, `components/media/*`, `components/matrix/*`, `stores/media.store.js`, `stores/subscription.store.js`, `services/rss.service.js`, `services/blossom.service.js`, `stores/site.store.js`.

---

## Domäne: Wallet & Zaps

NWC (NIP-47) Wallet-Integration + Lightning-Zap-Orchestrierung. Ein Wallet pro Browser-Profil via NWC-URI (localStorage `nwc-connection`, überlebt Reload/Login/Logout). Zaps (kind 9734) via Precedence: NWC > WebLN > QR. **Das Wallet signiert NIE den Zap-Request — ein Nostr-Session-Signer tut das.** Alle sechs Wallet-Komponenten sind EINMAL in `PublicShell.vue` gemountet.

### Routen

| Name | Pfad | Auth |
|------|------|------|
| Public Creator-Page (Wallet-Surface-Host) | `/u/:identifier` (PublicShell → CreatorPage) | nein |

### Aktivitäten

| Aktivität | UI-Trigger | Selector-Hinweise | Kind | Parameter |
|-----------|-----------|-------------------|------|-----------|
| Wallet-Connect-Modal öffnen | Brand-bar Wallet-Icon (nur wenn !isConnected) | `button[title=Connect wallet]` wallet.connect; Wallet lucide in w-9 h-9 rounded-lg | — | — |
| **Wallet via NWC-URI verbinden** | "Connect" (Plug) | `textarea#wallet-connect-uri` (autofocus); label wallet.connectLabel; Connect wallet.connect :disabled bis looksValid; Cancel; amber AlertTriangle; NIP-47 link. **URI = Spending-Secret** | — | `uri` (NIP-47 `nostr+walletconnect://...`, NWC.parseConnectionString) |
| Wallet auto-restore | Automatisch (PublicShell onMounted) | kein Selector; Effekt = WalletStatusBar erscheint | — | — |
| Wallet-Detail-Hub öffnen | Status-Bar-Body klicken | `div[role=status]` wallet.statusAria; `button[title=wallet.openDetail]` Wallet+alias+balance+wallet.sats; '+N sats' chip aria-live | — | — |
| Balance & Transactions refreshen | Refresh (RefreshCw) | wallet.refresh RefreshCw animate-spin; balance p.text-4xl + wallet.sats | — | — |
| Transaction-History paginieren | Prev/Next | `button[title=wallet.txPagePrev]` ChevronLeft; `txPageNext` ChevronRight; wallet.txPageIndicator; ArrowDownLeft/UpRight; empty wallet.activityEmpty | — | `page` (default 0, size 6) |
| Wallet trennen | Status-Bar Unplug / Detail-Footer | status `button[title=wallet.disconnect]` Unplug @click.stop; footer Unplug | — | — |
| Send-Modal öffnen | Detail "Send" | `BaseButton primary ArrowUpRight wallet.send` | — | — |
| **BOLT-11-Invoice zahlen** | Send-Input → "Continue" | `textarea#wallet-send-input` (autofocus); chip wallet.kindInvoice FileText; Continue wallet.sendContinue ArrowUpRight; preview wallet.sendPreviewAmount; expired wallet.errExpired | (→ requestPayment) | `userInput` (BOLT-11, lightning: prefix gestrippt) |
| **Lightning-Address / LNURL-pay zahlen** | "Continue" → Amount → "Request invoice" | `input#wallet-send-amount` (number); wallet.sendAmountRange/Min; comment (wenn commentLimit>0); wallet.sendPayingTo; Back common.back; wallet.sendRequestInvoice | (→ requestPayment) | `userInput` (LUD-16/LNURL/LUD-17), `amountInput` (sats, [min,max]), `commentInput` (LUD-12) |
| **Invoice bestätigen & zahlen (WalletPaymentConfirm)** | Auto bei queuedInvoice; Pay/Cancel/Done | modal wallet.payTitle/paidTitle; Pay wallet.payNow/pay Zap; Cancel common.cancel; Done common.done; paying Loader2 wallet.paying; success CheckCircle2 wallet.paidSuccessTitle; decode error wallet.errInvoice | — | `invoice` (BOLT-11), `hint` (Recipient-Name) |
| Receive-Modal öffnen | Detail "Receive" | `BaseButton secondary ArrowDownLeft wallet.receive` | — | — |
| **BOLT-11-Invoice erstellen** | Create-Tab → Preset/Custom → "Generate" | tab role=tab wallet.tabCreate ArrowDownLeft; presets 21/100/500/1000; `input#wallet-receive-amount`; description wallet.receiveDescriptionLabel; Generate wallet.receiveGenerate; QR img wallet.receiveQrAlt; copy Copy→Check wallet.copied; open-in-wallet; waiting wallet.receiveWaiting; settled CheckCircle2 | — | `presetAmount` (default 100), `customAmount`, `description` |
| **LNURL-withdraw redeemen (LUD-03)** | Redeem-Tab → "Continue" → Amount → "Submit" | tab wallet.tabRedeem Link2; `textarea#wallet-redeem-input`; Continue wallet.redeemContinue; `input#wallet-redeem-amount`; Submit wallet.redeemSubmit ArrowDownLeft; Back common.back; settled CheckCircle2. **Lightning-Addresses abgelehnt** | — | `redeemInput` (LNURL/LUD-17), `redeemAmount` (sats [min,max]) |
| **Artikel zappen** | Article-EngagementBar Zap → ZapDialog | Zap lucide; ZapDialog amount + comment. Braucht Session+Signer (_requireSession) | 9734 | `amount` (sats >0, LNURL-bounded), `comment` |
| **Note/Wall-Post zappen** | Note-EngagementBar Zap | Note-Zap-Button | 9734 (e-scoped) | `amount`, `comment` |
| **Creator-Profil zappen** | CreatorPage Zap → ZapDialog | `button[title=creatorPage.zap]` Zap amber (nur canBeZapped && !isSelf); ZapDialog submit({amount,comment}); no-lightning creatorPage.zapNoLightning. **Session REQUIRED auch mit Wallet** | 9734 (p-tag only) | `amount`, `comment` |

**Auth/Permission-Gates:** (1) Das Wallet braucht KEINEN Standup-Login — per-browser-profile. (2) ZAPS brauchen BEIDES: nutzbaren Lightning-Pfad UND logged-in Nostr-Session mit aktivem Signer (kind 9734 wird vom Visitor signiert). `CreatorPage.openZap` redirected zu `/login` bei `!session.pubkey` auch mit Wallet.

**Gotchas:** `connectionUri` nicht im Store exponiert (Secret). Store-Locks: `isPaying`, `isMakingInvoice`. Receive-Settlement push-based via `payment_received` → `lastSettledPaymentHash` (kein Polling). Transactions page size = 6. Payment-Precedence überall: NWC > WebLN > QR/copy.

**Dateien:** `stores/wallet.store.js`, `services/{zap,lnurl,invoice,nwc}.service.js`, `components/wallet/*`, `components/public/PublicShell.vue`, `composables/useEngagement.js`, `views/CreatorPage.vue`, `utils/lnInput.js`.

---

## Anhang: Domänen-Abhängigkeiten

- **Auth** → profile (VerifiedAccountsModal), draft (scheduleConvergingRefresh), settings (hydrate), onboarding (crawler).
- **Editor** → relay + session + api; Blossom (media/settings).
- **Sites** → article (SiteAssignPopup), media (MediaPicker), relay, session, toast, activityLogger.
- **Magazine** → articleStore, mediaStore, magazine-config.
- **Engagement** → article (EngagementBar-Hosts), subscriptions (NoteCard), wall, site.store (Board), zap.service.
- **Profile/Settings** → subscription.store (kind 30000), blossom, relay.
- **Media/Imports/Subs/Matrix** → feed.store, draft.store, relay.store, settings.store, session.store, subscription-feed.store, wall.store, site.store.
- **Wallet/Zaps** → apiService.getProfile, session.store, relay.store + event-builder + auth.service.signEvent, toast.store.
- **Core** → session.store, gate.store, role.store, relay.store/service, wallet.store, comment.store, zap.service, auth.service.

**RELAY_GROUPS** (constants/nostr.js): profiles, longform, discovery, general, fallback. Visitor-Actions publizieren zu `RELAY_GROUPS.general`, Hint = general[0]. Amber NIP-46 Handshake-Relays sind ein fixes separates Set (damus, nostr.band, nos.lol).
