#!/usr/bin/env python
"""Autobot batch image generator (FLUX.2 klein 4B) with seed control + manifest.

Designed for QA/re-generation loops: deterministic id-based filenames so a single
failed image can be re-rolled in place, recorded seeds for reproducibility, and a
``--only`` subset flag so regeneration touches just the images that failed QA.

Manifest (JSON):
  {
    "output_dir": "/abs/path",
    "defaults": { "width": 1280, "height": 720, "num_steps": 4, "guidance": 1.0 },
    "jobs": [
      { "id": "cover", "prompt": "...", "width": 1216, "height": 640 },
      { "id": "sec3",  "prompt": "...", "seed": 12345 }      // pin a seed if desired
    ]
  }

Usage:
  generate.py --manifest m.json                 # generate every job missing/!pinned
  generate.py --manifest m.json --only sec3     # re-roll just sec3 (NEW random seed)
  generate.py --manifest m.json --only sec3 --seed 42   # re-roll sec3 with a fixed seed

Outputs <output_dir>/<id>.webp (web-optimised WebP, always) and merges
<output_dir>/results.json (list of {id, path, seed, width, height, prompt}).

WebP compression runs automatically on every generated image. Tune it via the
manifest's defaults.webp block (all optional):
  "defaults": { "webp": { "quality": 90, "method": 6, "lossless": false } }
quality 1-100 (lossy, default 90 = visually lossless for web), method 0-6
(compression effort, default 6 = smallest file), lossless true for an exact
copy. Per-job override via job["webp"].
"""
from __future__ import annotations
import argparse, json, random, time
from pathlib import Path

import torch
from diffusers import Flux2KleinPipeline

REPO_ID = "black-forest-labs/FLUX.2-klein-4B"

# Global baseline avoidance list, applied to EVERY job unless overridden.
# Precedence: job["avoid"] > manifest defaults["avoid"] > DEFAULT_AVOID.
# Opt out for a job/manifest with an explicit empty list: "avoid": []
# Rendered into the positive prompt as a natural-language clause (FLUX has no
# working negative_prompt at CFG=1 — see NEGATIVE_PROMPTS.md).
DEFAULT_AVOID = [
    "text", "letters", "numbers", "captions", "watermark", "signature", "logo", "brand marks",
    "deformed hands", "extra fingers", "bad anatomy", "blurry", "low quality",
    "jpeg artifacts", "warped geometry", "duplicated objects",
    "banknotes", "paper money", "dollar bills", "currency symbols", "fake money",
]


def load_pipe(offload: str = "model"):
    pipe = Flux2KleinPipeline.from_pretrained(REPO_ID, torch_dtype=torch.bfloat16)
    if offload == "model":
        pipe.enable_model_cpu_offload()
    elif offload == "sequential":
        pipe.enable_sequential_cpu_offload()
    else:
        pipe = pipe.to("cuda")
    return pipe


def build_prompt(prompt: str, avoid) -> str:
    """FLUX has no working negative_prompt (distilled, CFG=1). Its Qwen3 text
    encoder DOES understand natural-language negation, so we fold avoidances into
    the positive prompt as an instruction clause instead. See NEGATIVE_PROMPTS.md."""
    if not avoid:
        return prompt
    items = ", ".join(str(a).strip() for a in avoid if str(a).strip())
    if not items:
        return prompt
    return f"{prompt}. Important: the image must NOT contain: {items}."


def save_webp(img, path, cfg):
    """Always save as web-optimised WebP. cfg = {quality, method, lossless}.
    quality (lossy, default 90) is visually lossless for photographic content
    while shrinking ~4-8x vs PNG; method 6 = maximum compression effort."""
    quality = int(cfg.get("quality", 90))
    method = int(cfg.get("method", 6))
    lossless = bool(cfg.get("lossless", False))
    kwargs = {"format": "WEBP", "method": method}
    if lossless:
        kwargs["lossless"] = True
        kwargs["quality"] = 100
    else:
        kwargs["quality"] = quality
    img.save(path, **kwargs)


def generate_one(pipe, prompt, width, height, seed, steps, guidance):
    gen = torch.Generator(device="cuda").manual_seed(seed)
    return pipe(
        prompt=prompt, width=width, height=height,
        num_inference_steps=steps, guidance_scale=guidance, generator=gen,
    ).images[0]


def main() -> None:
    ap = argparse.ArgumentParser(description="FLUX.2 klein batch generator with seeds")
    ap.add_argument("--manifest", required=True)
    ap.add_argument("--only", default="", help="comma-separated job ids to (re)generate")
    ap.add_argument("--seed", type=int, default=None, help="force this seed for the --only jobs")
    ap.add_argument("--offload", default="model", choices=("model", "sequential", "none"))
    args = ap.parse_args()

    man = json.loads(Path(args.manifest).read_text())
    out_dir = Path(man["output_dir"]).expanduser()
    out_dir.mkdir(parents=True, exist_ok=True)
    defaults = man.get("defaults", {})
    results_path = out_dir / "results.json"
    results: dict[str, dict] = {}
    if results_path.exists():
        for r in json.loads(results_path.read_text()):
            results[r["id"]] = r

    only = {x.strip() for x in args.only.split(",") if x.strip()}
    jobs = [j for j in man["jobs"] if not only or j["id"] in only]
    if not jobs:
        print("no jobs selected"); return

    pipe = load_pipe(args.offload)
    for j in jobs:
        # Seed policy: explicit --seed wins; else a job-pinned seed; else random.
        # On a targeted re-roll (--only) of a non-pinned job we FORCE a fresh random
        # seed so the regenerated image actually differs from the rejected one.
        if args.seed is not None and j["id"] in only:
            seed = args.seed
        elif "seed" in j and j["seed"] is not None and not (only and j["id"] in only):
            seed = j["seed"]
        else:
            seed = random.randrange(2 ** 31)
        w = j.get("width", defaults.get("width", 1024))
        h = j.get("height", defaults.get("height", 1024))
        steps = j.get("num_steps", defaults.get("num_steps", 4))
        guidance = j.get("guidance", defaults.get("guidance", 1.0))
        # job override > manifest defaults > global DEFAULT_AVOID; "avoid": [] opts out.
        avoid = j.get("avoid", defaults.get("avoid", DEFAULT_AVOID))
        effective_prompt = build_prompt(j["prompt"], avoid)
        # WebP config: job override > manifest defaults > built-in (q90/method6 lossy).
        webp_cfg = j.get("webp", defaults.get("webp", {}))
        t0 = time.time()
        img = generate_one(pipe, effective_prompt, w, h, seed, steps, guidance)
        path = out_dir / f'{j["id"]}.webp'
        save_webp(img, path, webp_cfg)
        kb = path.stat().st_size / 1024
        results[j["id"]] = {
            "id": j["id"], "path": str(path), "seed": seed,
            "width": w, "height": h, "prompt": j["prompt"],
            "avoid": avoid or [], "effective_prompt": effective_prompt,
            "format": "webp", "bytes": path.stat().st_size,
        }
        print(f'  ✓ {j["id"]} -> {path}  (seed={seed}, {kb:.0f} KB, {time.time() - t0:.1f}s)')

    ordered = [results[j["id"]] for j in man["jobs"] if j["id"] in results]
    results_path.write_text(json.dumps(ordered, indent=2))
    print(f"wrote {results_path}  ({len(ordered)} images)")


if __name__ == "__main__":
    main()
