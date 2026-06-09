# Schreibregeln — verbindlich für ALLE Autobot-Artikel

Vom Nutzer festgelegt (Juni 2026). Gelten dauerhaft, für jede Session und jede
künftige Generation von Artikeln. Bei Konflikt schlagen diese Regeln Templates
und ältere Beispiele (der Self-Custody-Artikel entstand VOR diesen Regeln).

## 1. Stilles Grounding — Quellen niemals nennen

- Artikel werden weiterhin inhaltlich auf den AKTIVEN Kontext geerdet:
  `contexts/$(cat contexts/active)/grounding.md` (Begriffe, Prinzipien,
  Argumentationslinien — Protokoll: `contexts/README.md`).
- Aber: **Das Buch, sein Autor und jede andere Quelle tauchen im Artikel nie auf.**
  Kein „laut…", kein „X zeigt/nennt/behandelt", keine Kapitelverweise, kein
  Buchtitel in Titel/Summary/Tags.
- Buchspezifische Eigenbegriffe (z. B. „Hearn-Fehler", „Etatimus") nicht als
  Zitat verwenden — den Gedanken unattribuiert in eigenen Worten führen.
  Generische Begriffe (Axiom, Seigniorage, Schwarzmarkt) sind frei.

## 2. Haltung zeigen, nie etikettieren

- Wörter wie „stoisch", „Stoizismus" (und vergleichbare Selbst-Labels für die
  eigene Haltung) stehen **nicht im Text** — auch nicht in Überschriften.
- Die Haltung trägt der Ton: nüchtern, gelassen, ohne Empörung, ohne Hype.

## 3. Humanisieren (beste bekannte Standards)

- **Burstiness:** Satzlängen stark variieren (kurz–lang–kurz). Nie drei ähnlich
  lange Sätze hintereinander. Einzelne Ein-Wort-/Drei-Wort-Sätze sind erwünscht.
- **Perplexity:** überraschende, präzise Wortwahl und frische Bilder statt
  formelhafter Übergänge („Daher ist die Theorie ungültig", „Die Frage lautet").
- **Persönliche Note:** sparsame Ich-Einschübe, kleine Abschweifungen,
  Idiome/Umgangston in Maßen — ohne den nüchternen Grundton zu verlieren.
- **Konkreter Einstieg:** Szene oder Zahl statt Meta-Ankündigung
  („Dieser Artikel will…" ist verboten).
- Keine Auflistungs-Stakkatos, keine identisch gebauten Absatzanfänge.

## Pflicht-Check vor jedem Editor-Dry-Run

```bash
grep -inE 'voskuil|buch|stoi|kapitel|quelle|laut ' sessions/<session>/article.md
```

False Positives beachten („Dreh**buch**"). Zusätzlich greift das `--must-not`-Gate
in `tools/gen-edit-job.cjs` + `tools/edit-article.run.js` (Draft-Verifikation
vor jedem Save/Publish).
