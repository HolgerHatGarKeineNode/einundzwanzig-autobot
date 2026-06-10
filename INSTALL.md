# Installation — alle Abhängigkeiten Schritt für Schritt

Der Quickstart steht im [README](README.md). Hier die Details zu jeder Abhängigkeit.

## 1. Claude Code + Playwright-MCP (Pflicht)

Der Autobot **ist** eine Claude-Code-Arbeitsumgebung: Claude steuert die
Plattform über den Playwright-MCP-Server.

1. [Claude Code](https://code.claude.com) installieren.
2. Playwright-MCP hinzufügen (User-Scope, gilt für alle Projekte):

   ```bash
   claude mcp add --scope user playwright -- npx @playwright/mcp@latest
   ```

3. Empfohlene Fenster-Konfiguration (`~/.claude/playwright-mcp.config.json`) —
   Viewport frei lassen, festes Fenster:

   ```json
   {
     "browser": {
       "launchOptions": { "args": ["--window-size=1900,980"] },
       "contextOptions": { "viewport": null }
     }
   }
   ```

   Dann den MCP-Eintrag darauf zeigen lassen:

   ```bash
   claude mcp add --scope user playwright -- npx @playwright/mcp@latest --config ~/.claude/playwright-mcp.config.json
   ```

> **Wichtig:** Claude-Sessions immer **im Projektordner** starten. Die Tools
> finden das Projekt über das Arbeitsverzeichnis, und der Browser darf nur auf
> Dateien unterhalb des Session-Roots zugreifen (Uploads, Screenshots).

## 2. Node.js ≥ 20 (Pflicht)

Für die Job-Generatoren und den Bridge-Build:

```bash
npm install        # nostr-tools + esbuild
npm run setup      # .env, Client-Key, Bridge-Build, Checks
```

## 3. Nostr-Login: bunker:// URL (Pflicht)

Der Autobot signiert **nie selbst** — er nutzt deinen Remote-Signer via NIP-46.
Mit [Amber](https://github.com/greenart7c3/Amber) (Android):

1. Amber → Einstellungen → **Bunker** → neue Verbindung anlegen.
2. Die `bunker://…`-URL kopieren und in `.env` als `NOSTR_BUNKER_URL` eintragen.
3. `npm run gen:inject` (schreibt die gitignorte `bridge/connect.inject.js`).

Beim **ersten** Login fragt Amber einmal um Freigabe; danach verbindet sich der
Bot still — der von `npm run setup` erzeugte `NOSTR_CLIENT_SK` bleibt über alle
Sessions gleich, Amber erkennt ihn wieder.

Jeder andere NIP-46-Bunker (z. B. nsec.app) funktioniert genauso — es braucht
nur eine `bunker://…`-URL.

> Dein Account braucht auf der Ziel-Plattform (`baseUrl` in
> `autobot.config.json`) Schreibrechte — einmal manuell einloggen und prüfen.

## 4. poppler-utils (optional — Kontexte aus PDFs)

Nur nötig, um Wissens-Kontexte aus Buch-PDFs zu extrahieren (`pdftotext`):

```bash
# Arch
sudo pacman -S poppler
# Debian/Ubuntu
sudo apt install poppler-utils
# macOS
brew install poppler
```

Kontexte gehen auch ohne: jede Textdatei lässt sich direkt als `grounding.md`
ablegen (`contexts/README.md`).

## 5. FLUX.2 (optional — lokale Bildgenerierung)

GPU-gestützte Artikel-Illustration. Komplett optional — ohne FLUX2 verwendest du
eigene Bilder. Anleitung: [imagegen/INSTALL.md](imagegen/INSTALL.md).

## Prüfen

`npm run setup` ist idempotent und zeigt jederzeit den Zustand aller
Abhängigkeiten plus die nächsten offenen Schritte an.
