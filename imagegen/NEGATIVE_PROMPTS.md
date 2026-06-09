# Negative-Prompts — kuratierte „in-the-wild"-Liste + FLUX-korrekte Nutzung

## ⚠️ Wichtig für FLUX.2 klein (unsere Pipeline)

FLUX-Modelle sind **guidance-distilled** und laufen mit **CFG = 1.0** → ein klassischer
`negative_prompt` (wie bei Stable Diffusion) **wirkt nicht**. `true_cfg_scale` zum Erzwingen
von Negatives liefert laut Community unzuverlässige Ergebnisse.

**Aber:** FLUX.2 nutzt einen **LLM-Text-Encoder (Qwen3-4B)**, der natürliche Sprache inkl.
**Verneinung** versteht (anders als SDs CLIP, wo „no X" das Token X teils sogar verstärkt).
→ Vermeidungen daher als **natürlichsprachliche Klausel im Positiv-Prompt** formulieren, nicht
als SD-Tag-Liste in einem Negative-Feld. `generate.py` macht das via `avoid`-Feld automatisch.

**Faustregeln (Modelle 2025/26):** lieber **5–15** gezielte Vermeidungen als 30+ (zu viele
flachen das Bild ab). Wo möglich **positiv umformulieren** (wirkt bei FLUX am besten):
- statt „no extra fingers" → „hands with exactly five fingers, natural anatomy"
- statt „no cluttered background" → „clean, uncluttered background"
- statt „no blur" → „sharp focus, crisp detail"

## Kuratierte Standard-Negatives (die am häufigsten genutzten, kategorisiert)

Aggregiert aus den gängigen Community-Listen (Quellen unten). Als Referenz für (a) das
`avoid`-Feld und (b) die QA-Defekt-Erkennung (`QA_RUBRIC.md`).

**Qualität / Technik**
`lowres, low quality, worst quality, normal quality, blurry, out of focus, jpeg artifacts,
compression artifacts, grainy, noisy, pixelated, low contrast, underexposed, overexposed,
oversaturated, washed out, draft`

**Anatomie (bei Personen/Händen)**
`bad anatomy, deformed, disfigured, mutated, mutation, extra limbs, extra arms, extra legs,
extra fingers, missing fingers, fused fingers, too many fingers, mutated hands,
poorly drawn hands, poorly drawn face, malformed limbs, long neck, extra eyes, cloned face,
fused face, gross proportions, bad proportions`

**Komposition / Rahmen**
`cropped, out of frame, cut off, body out of frame, tiling, duplicate, cloned objects,
disconnected limbs`

**Artefakte / Trainingsdaten-Kontamination** (sehr häufig & relevant für uns)
`text, words, letters, numbers, captions, subtitles, signature, watermark, username, logo,
brand, trademark, stamp, frame, border, UI elements, error`

**Unerwünschter Stil** (wenn Foto gewünscht)
`cartoon, anime, 3d render, CGI, illustration, painting, sketch, ugly, amateur, beginner`

**Domänenspezifisch — Finanz/Bitcoin** (verhindert die „Dollar-Schein + ₿"-Fehlerklasse)
`banknotes, paper money, dollar bills, fiat currency, currency symbols, fake money,
nonsensical text on objects, garbled symbols, mismatched logos`

## Globaler Default (in `generate.py` gebacken)

Diese Baseline ist als **`DEFAULT_AVOID`** fest in `generate.py` hinterlegt und greift
**automatisch für jeden Job** — auch ohne Manifest-Eintrag. Vorrang-Kette:

`job["avoid"]`  >  `manifest defaults["avoid"]`  >  **`DEFAULT_AVOID`**

Opt-out für einen Job/ein Manifest mit explizit leerer Liste: `"avoid": []`.
Natürlichsprachlich gerendert von `generate.py` (kein wirkungsloses Negative-Feld):

```json
"avoid": [
  "text", "letters", "numbers", "captions", "watermark", "signature", "logo", "brand marks",
  "deformed hands", "extra fingers", "bad anatomy", "blurry", "low quality",
  "jpeg artifacts", "warped geometry", "duplicated objects"
]
```

Finanz-Artikel zusätzlich:
```json
["banknotes", "paper money", "dollar bills", "currency symbols", "fake money"]
```

`generate.py` hängt daraus an: *„Important: the image must NOT contain: text, letters, …"* —
LLM-Encoder-freundlich, ohne ein (wirkungsloses) Negative-Feld zu benutzen.

## Quellen
- [Aiarty — 200+ Stable Diffusion Negative Prompts](https://www.aiarty.com/stable-diffusion-prompts/stable-diffusion-negative-prompt.htm)
- [ZSky AI — 200+ AI Negative Prompts: Hands, Faces, Anatomy](https://zsky.ai/blog/ai-negative-prompts-complete-list)
- [Novita — List of Negative Prompts for Stable Diffusion](https://blogs.novita.ai/list-of-negative-prompts-for-stable-diffusion/)
- [GitHub mikhail-bot/stable-diffusion-negative-prompts](https://github.com/mikhail-bot/stable-diffusion-negative-prompts)
- [AI Photo Generator — Negative Prompts Explained (2026)](https://www.aiphotogenerator.net/blog/2026/02/negative-prompts-stable-diffusion-guide)
- [ClickUp — 120+ Stable Diffusion Negative Prompts (2026)](https://clickup.com/blog/stable-diffusion-negative-prompts/)
- [Towards AGI — How to Write Negative Prompts in FLUX](https://medium.com/towards-agi/how-to-write-negative-prompts-in-flux-e4305c9e7333)
- [HF: Negative prompt does not work with stock FluxPipeline](https://huggingface.co/spaces/akhaliq/SRPO/discussions/1)
