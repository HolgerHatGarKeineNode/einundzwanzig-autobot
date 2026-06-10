# FLUX.2 einrichten (optional — lokale Bildgenerierung)

Der Autobot illustriert Artikel mit **FLUX.2 [klein] 4B** (Apache-2.0, läuft auf
Consumer-GPUs). `generate.py` ist self-contained und nutzt nur die
Diffusers-Pipeline — du brauchst **kein** separates FLUX-Repo, nur eine
Python-Umgebung mit `torch` + `diffusers`.

**Ohne FLUX2 funktioniert alles andere trotzdem:** Artikel schreiben, eigene
Bilder per Blossom hochladen, publizieren. Bei fehlender Einrichtung überspringt
der Workflow die Generierung einfach (eigene Bilder in den Session-Ordner legen).

## Voraussetzungen

- NVIDIA-GPU mit **≥ 8 GB VRAM** (16 GB komfortabel; CPU-Offload wird genutzt)
- CUDA-fähiger Treiber
- Python 3.10–3.12
- ~12 GB Platz: Modell-Download (~9 GB, einmalig nach `~/.cache/huggingface`) + venv

## Installation

```bash
cd imagegen
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

Falls `Flux2KleinPipeline` in deiner diffusers-Version fehlt (Import-Fehler):

```bash
.venv/bin/pip install git+https://github.com/huggingface/diffusers
```

**Schon ein FLUX2-/Diffusers-Setup vorhanden?** Kein zweites venv nötig — trage
deinen Interpreter in `autobot.config.json` ein (Schlüssel `flux2Python`,
absoluter Pfad) oder verlinke ihn: `ln -s /pfad/zu/deinem/.venv imagegen/.venv`.

## Smoke-Test

```bash
cat > /tmp/flux-test.json <<'EOF'
{
  "output_dir": "/tmp/flux-test",
  "defaults": { "width": 1280, "height": 720, "num_steps": 4, "guidance": 1.0 },
  "jobs": [ { "id": "test", "prompt": "a single orange umbrella on an empty beach, overcast sky, photorealistic" } ]
}
EOF
.venv/bin/python generate.py --manifest /tmp/flux-test.json
```

Beim ersten Lauf lädt Hugging Face das Modell (~9 GB) — danach startet die
Generierung in Sekunden. Ergebnis: `/tmp/flux-test/test.png`.

- **VRAM-Probleme (OOM):** `--offload sequential` anhängen (langsamer, minimaler VRAM).
- **Viel VRAM (≥ 24 GB):** `--offload none` (alles auf der GPU, am schnellsten).

## Verwendung im Workflow

Manifest + Outputs liegen immer im Session-Ordner
(`sessions/<s>/images/manifest.json`); Aufruf, QA-Loop und Re-Rolls: `README.md`
in diesem Ordner.
