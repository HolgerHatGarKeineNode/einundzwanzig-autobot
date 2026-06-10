# Autobot Imagegen — Generierung mit Qualitäts-Gate & Re-Generierung

Wiederverwendbarer Baustein für **jedes** Autobot-Script, das Bilder via FLUX.2 erzeugt.
Kernidee: Bilder werden nach der Generierung von **Claude (Vision) selbst geprüft** und bei
Defekten (Artefakte, Anatomie, Fake-Text/Logos, unsinnige Symbolik wie *Dollar-Schein mit
Bitcoin-Logo*, off-prompt) **automatisch re-generiert**, bis sie bestehen.

## Dateien

| Datei | Zweck |
|---|---|
| `generate.py` | Batch-Generator (Modell 1× laden), Manifest-gesteuert, **Seed-Kontrolle**, `--only <ids>` für gezielte Re-Rolls, schreibt `results.json`. |
| `QA_RUBRIC.md` | Die Defekt-Rubrik + Verdikt-Format + Prompt-Hygiene. **Quelle der Wahrheit** für den Selbstcheck. |
| `NEGATIVE_PROMPTS.md` | Kuratierte „in-the-wild"-Negatives (kategorisiert) + **FLUX-Hinweis**: kein echtes Negative-Feld (CFG=1), daher als `avoid`-Klausel im Positiv-Prompt. Empfohlene Baseline für `defaults.avoid`. |
| `sessions/<s>/images/manifest.json` | Job-Liste `{id, prompt, width, height, seed?}` + `output_dir` + `defaults`. |
| `<output_dir>/<id>.png` (output_dir → `sessions/<s>/images`) | Ergebnis je Job (id-basiert → in-place re-rollbar). |
| `<output_dir>/results.json` | `[{id, path, seed, width, height, prompt}]` — reproduzierbar. |

## Der QA-Loop (Protokoll, das Claude befolgt)

```
1. GENERATE   python generate.py --manifest M.json
2. VERIFY     für jedes Bild in results.json:
                Read(path)  →  gegen Job-Prompt + QA_RUBRIC.md prüfen  →  Verdikt {PASS|FAIL, defects, promptFix}
3. REGEN      fails = [id für id mit FAIL]
              wenn fails und attempt < 3:
                (optional) promptFix in den Manifest-Job einarbeiten
                python generate.py --manifest M.json --only <fails>     # NEUER Seed je Fail
                → zurück zu VERIFY (nur fails)
4. DONE       alle PASS  ODER  attempt==3 → bestes behalten + im Report kennzeichnen
```

- **Gate-Regel:** FAIL bei ≥1 `block`-Defekt oder ≥2 `minor` (siehe `QA_RUBRIC.md`).
- **Seeds:** `--only` ohne `--seed` erzwingt einen frischen Zufalls-Seed (Re-Roll unterscheidet sich
  garantiert). Mit `--seed N` reproduzierbar. Bestehende `results.json`-Einträge bleiben erhalten,
  nur die re-gerollten werden überschrieben.
- **Prompt-Schärfung:** Wiederkehrende Fehlerklassen über die Prompt-Hygiene in `QA_RUBRIC.md`
  abstellen (z. B. Finanz-Metaphern objekthaft statt über Banknoten/Text).

## Verdikt-Beispiel

7/8 PASS beim ersten Durchgang. `sec3` (Gegenparteirisiko) FAIL: Dollar-Schein mit ₿-Logo +
Fake-Banknoten-Text → `promptFix`: objekthafte Metapher (zerberstendes Kettenglied im Tresor),
Negatives `no banknotes/currency/text`. Re-Roll via `--only sec3` → erneuter Vision-Check.

## Maße (AAA-Blog-Standards)

- Hero/Featured: **1.91:1** (1216×640, OG-Card).
- In-Article/Sektionen: **16:9** (1280×720).
- FLUX.2 klein: 4 Steps, guidance 1.0 (distilled). Dimensionen durch 16 teilbar halten.

## Neues Bild-Script anlegen

1. Manifest schreiben (`output_dir`, `jobs` mit prägnanten, objekthaften Prompts + einheitlichem
   Stil-Suffix; Negatives aus der Hygiene-Liste anhängen).
2. `generate.py --manifest` ausführen.
3. QA-Loop (oben) durchlaufen — **immer**, kein Bild ungeprüft in einen Artikel/Upload geben.
4. Erst nach „alle PASS" hochladen/einbauen.

> **Konvention seit Juni 2026:** Manifeste + Outputs liegen IM SESSION-ORDNER
> (`sessions/<s>/images/manifest.json`, output_dir ebenda) — imagegen/ enthält nur das Toolkit.
