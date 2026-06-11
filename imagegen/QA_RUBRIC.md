# Bild-QA-Rubrik (Claude-Vision-Selbstcheck)

Wird auf **jedes** mit `generate.py` erzeugte Bild angewandt. Claude öffnet das Bild
(Read-Tool, Vision) und prüft es gegen (a) seinen **Prompt/seine Bildidee** und (b) die
folgenden Defekt-Kategorien. Ein Bild ist **FAIL**, sobald **eine** Kategorie mit
Severity `block` zutrifft (oder ≥2 `minor`). FAIL → re-generieren (neuer Seed, ggf.
geschärfter Prompt), dann erneut prüfen. Max. Versuche pro Bild: **3** (danach das beste
behalten und melden).

## Pflicht-Zählschritt: Hände & Finger

Bevor das Verdikt gefällt wird, bei JEDEM Bild mit sichtbaren Händen (auch
Teilansichten!) **explizit zählen**: Wie viele Hände? Wie viele Finger pro
Hand? Das Ergebnis gehört als Satz in die QA-Notiz (z. B. „2 Hände sichtbar,
links 5 Finger, rechts 5 Finger"). >5 Finger, verschmolzene oder geknickte
Finger = Kategorie 1, block. Wer nicht zählt, übersieht den sechsten Finger —
passiert selbst bei aufmerksamem Hinsehen (Juni 2026: 6 Finger erst vom
Nutzer entdeckt, nachdem das Bild QA „bestanden" hatte).

## Defekt-Kategorien

| # | Kategorie | Beispiele | Severity |
|---|---|---|---|
| 1 | **Anatomie** | verformte/zusätzliche Finger, Hände, Gesichter, Gliedmaßen; falsche Augenzahl | block |
| 2 | **Text/Logos** | unleserlicher Fake-Text, erfundene Schrift, Wasserzeichen, fremde Logos — obwohl „no text/logos" gefordert | block |
| 3 | **Falsche Symbolik** | inhaltlich unsinnige Kombination: **US-Dollar-Schein mit Bitcoin-Logo**, falsche Währung, sachfremde Objekte, widersprüchliche Metaphern | block |
| 4 | **Artefakte** | Schmieren, Warping, geschmolzene Geometrie, duplizierte/verschmolzene Objekte, Glitch-Flächen | block bei prominent, sonst minor |
| 5 | **Off-Prompt** | zeigt nicht die geforderte Bildidee/Kernaussage | block |
| 6 | **Stil/Palette** | bricht den definierten AAA-Stil (Look, Farbwelt, Lichtstimmung) deutlich | minor |
| 7 | **Komposition/Technik** | unscharf, schlechter Bildausschnitt, abgeschnittenes Hauptmotiv, flau | minor |

## Verdikt-Format (pro Bild)

```json
{ "id": "sec3", "verdict": "FAIL", "defects": [
    { "category": 3, "severity": "block", "note": "Dollar-Schein mit ₿-Logo statt IOU/Schuldschein" },
    { "category": 2, "severity": "block", "note": "erfundener Banknoten-Text '100', garbled" }
  ],
  "promptFix": "Banknoten/Währung/Text vermeiden; Metapher: zerberstendes Kettenglied im Tresor" }
```

`promptFix` ist optional und fließt bei der Re-Generierung in den Prompt ein.

## Prompt-Hygiene (vermeidet wiederkehrende Fehlerklassen)

- **Finanz-/Vertrauens-Metaphern** nicht über Banknoten/Schrift bauen. Wörter wie
  *note, IOU, promissory, bill, banknote, currency, dollar* rufen Fake-Geld + Text hervor.
  Stattdessen **objekthafte** Metaphern: zerberstendes **Kettenglied**, splitterndes **Glas**,
  leerer **Tresor**, brüchige **Brücke**.
- Immer anhängen: `no text, no numbers, no banknotes, no currency, no logos, no watermark`.
- Bei Personen/Händen Nahaufnahmen sparsam; eher Silhouetten/Teilansichten → weniger Anatomie-Risiko.
- Einheitlicher Stil-Suffix für Kohärenz (Look, Palette, Licht) in ALLEN Jobs identisch.
