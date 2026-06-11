# Audio-Einbettung — Layouts & Platzierung (gespeicherte Vorlage)

Verbindliche Vorlage für das Einbetten der Artikel-Vertonung (MP3) als Hör-Link.
Gilt für **jeden** vertonten Artikel. Erzeugung der MP3: `tools/tts-generate.cjs`,
Upload: `tools/blossom-upload-node.cjs` (→ Blossom-URL). Siehe README §Audio-Vertonung.

## Warum Blockquote-Box (kein roher HTML/`<audio>`)

Der Artikel-Body wird auf dem Board mit `marked` (GFM) gerendert und als Nostr
kind 30023 von vielen Clients gelesen. Ein **Blockquote** (`>`) rendert überall als
abgesetzte Hinweis-Box; ein roher `<audio>`-Tag erscheint nur auf dem Board als
Player, auf manchen Clients aber als sichtbarer Quelltext. Darum: **Markdown-Link in
einer Blockquote-Box** — robust auf Board UND allen Clients.

## Zwei feste Platzierungen

1. **Ganz oben**, als allererster Block VOR dem ersten Textsatz (Hinweis-Box).
2. **Ganz unten**, nach einer Trennlinie `---` als Abschluss-Box.

## Templates (Platzhalter ersetzen)

`{{URL}}` = Blossom-MP3-URL · `{{MMSS}}` = Dauer `m:ss` (aus tts-Report `seconds`) ·
`{{MB}}` = Dateigröße in MB (aus tts-Report `sizeMB`, gerundet).

**Oben (Hinweis-Box):**

```markdown
> 🎧 **Audioversion** — Lieber zuhören? Diesen Artikel gibt es auch zum Anhören: **[Audio starten · {{MMSS}} min]({{URL}})** _(MP3, ≈ {{MB}} MB)_
```

**Unten (Abschluss-Box, nach Trennlinie):**

```markdown
---

> 🎧 **Lieber hören als lesen?** Die vollständige Vertonung dieses Artikels gibt es als **[Audioversion · {{MMSS}} min]({{URL}})**.
```

## Einbauen

- **Neuer Artikel** (vor Erst-Publish): Boxen direkt in `article-spec.json` → `content`
  (oben vorne, unten hinten) einsetzen, dann normal `gen-edit-job.cjs` → `edit-article`.
- **Bestehender Live-Artikel** (Replace): per Quick-Edit-Patch einfügen — zwei
  `{search, replace}`-Patches in einer `audio-patches.json` (oben: erster Satz als
  Anker; unten: letzter Satz als Anker), dann `gen-quick-edit-job.cjs --patch …`
  → `quick-edit.run.js` bzw. headless `quick-edit-node.cjs`. Beispiel:
  `sessions/2026-06-10-number-go-up/audio-patches.json`.

Die `must-not`-Gates laufen auch hier vor dem Signieren über den GESAMTEN Content.
