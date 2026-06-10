# Schreibregeln — verbindlich für ALLE Autobot-Artikel

Gelten für jede Session und jede Generation von Artikeln. Bei Konflikt schlagen
diese Regeln Templates und ältere Beispiele. **Persönliche Entscheidungen**
(eigene Tabu-Wörter, Stil-Vorlieben) gehören nicht hierher, sondern in die
gitignorte `WRITING_RULES.local.md` — siehe letzter Abschnitt.

## 1. Stilles Grounding — Quellen niemals nennen

- Artikel werden inhaltlich auf die AKTIVEN Kontexte geerdet
  (`contexts/active`, Protokoll: `contexts/README.md`).
- Aber: **Das Buch, sein Autor und jede andere Quelle tauchen im Artikel nie auf.**
  Kein „laut…", kein „X zeigt/nennt/behandelt", keine Kapitelverweise, kein
  Buchtitel in Titel/Summary/Tags.
- Buchspezifische Eigenbegriffe der Groundings nicht als Zitat verwenden —
  den Gedanken unattribuiert in eigenen Worten führen. Generische Fachbegriffe
  (Axiom, Seigniorage, Schwarzmarkt) sind frei.
- Die Autorennamen der eigenen Kontexte gehören ins `mustNotDefault`-Gate
  (`autobot.config.local.json`), damit das maschinell abgesichert ist.

## 2. Haltung zeigen, nie etikettieren

- Selbst-Labels für die eigene Haltung stehen **nicht im Text** — auch nicht
  in Überschriften. Die Haltung trägt der Ton: nüchtern, gelassen, ohne
  Empörung, ohne Hype.

## 3. Humanisieren (beste bekannte Standards)

- **Burstiness:** Satzlängen stark variieren (kurz–lang–kurz). Nie drei ähnlich
  lange Sätze hintereinander. Einzelne Ein-Wort-/Drei-Wort-Sätze sind erwünscht.
- **Perplexity:** überraschende, präzise Wortwahl und frische Bilder statt
  formelhafter Übergänge („Daher ist die Theorie ungültig", „Die Frage lautet").
- **Persönliche Note:** kleine Abschweifungen, Idiome/Umgangston in Maßen —
  ohne den nüchternen Grundton zu verlieren. (Ob Ich-Einschübe des Autors
  erlaubt sind, ist eine persönliche Entscheidung → `WRITING_RULES.local.md`.)
- **Konkreter Einstieg:** Szene oder Zahl statt Meta-Ankündigung
  („Dieser Artikel will…" ist verboten).
- Keine Auflistungs-Stakkatos, keine identisch gebauten Absatzanfänge.

## 4. Eigene Tabu-Wörter

Wörter, die aus persönlichen/redaktionellen Gründen NIE im Text stehen sollen:
als `mustNotDefault` in `autobot.config.local.json` pflegen (maschinelles Gate,
läuft zwingend vor jedem Signieren) und in `WRITING_RULES.local.md` begründen —
samt Ersatzvokabular, damit der Gedanke trotzdem geführt werden kann.

## Pflicht-Check vor jedem Editor-Dry-Run

```bash
grep -inE 'buch|kapitel|quelle|laut ' sessions/<session>/article.md
```

Eigene Tabu-Wörter und die Autorennamen der aktiven Groundings ins Muster
aufnehmen (Liste: `mustNotDefault`). False Positives beachten („Dreh**buch**").
Zusätzlich greift das `--must-not`-Gate in `tools/gen-edit-job.cjs` +
`tools/edit-article.run.js` (Draft-Verifikation vor jedem Save/Publish).

## Persönliche Regeln: `WRITING_RULES.local.md`

Optionale, **gitignorte** Datei mit **gleicher Verbindlichkeit** wie diese —
falls vorhanden, lädt Claude sie in jeder Session ZUSÄTZLICH (verankert in
`CLAUDE.md`, Regel 2); bei Konflikt gewinnt die lokale Datei. Dort gehören hin: verbotene Wörter samt Begründung
und Ersatzvokabular, Stil-Entscheidungen (z. B. Ich-Einschübe ja/nein),
kontextspezifische Tabus (Autorennamen, Schul-Labels).
