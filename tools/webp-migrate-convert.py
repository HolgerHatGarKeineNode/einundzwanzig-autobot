#!/usr/bin/env python
"""Autobot WebP-Migration, Schritt 1: bestehende Artikel-Bilder herunterladen
und web-optimiert nach WebP konvertieren.

Liest sessions/longform-inventory.json (allUrls je Artikel), lädt jede eindeutige
Bild-URL herunter, konvertiert zu WebP (quality 90, method 6) und schreibt eine
Mapping-Datei {altUrl: localWebpPath}. KEIN Upload, KEIN Publish — rein lokal.

  python tools/webp-migrate-convert.py
"""
from __future__ import annotations
import json, sys, urllib.request, hashlib
from pathlib import Path
from io import BytesIO
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
INV = ROOT / "sessions" / "longform-inventory.json"
OUT = ROOT / "sessions" / "webp-migration"
OUT.mkdir(parents=True, exist_ok=True)

QUALITY, METHOD = 90, 6

def main():
    inv = json.loads(INV.read_text())
    urls = []
    for a in inv:
        for u in a["allUrls"]:
            if u not in urls:
                urls.append(u)
    print(f"{len(urls)} eindeutige Bild-URLs ueber {len(inv)} Artikel")
    mapping = {}
    total_png, total_webp = 0, 0
    for i, u in enumerate(urls, 1):
        try:
            req = urllib.request.Request(u, headers={"User-Agent": "autobot-webp-migrate"})
            data = urllib.request.urlopen(req, timeout=60).read()
        except Exception as e:
            print(f"  ! FEHLER download {u}: {e}")
            continue
        png_kb = len(data) / 1024
        img = Image.open(BytesIO(data))
        if img.mode in ("P", "LA"):
            img = img.convert("RGBA")
        elif img.mode not in ("RGB", "RGBA"):
            img = img.convert("RGB")
        # Dateiname = sha-kurz des Originals, Endung .webp
        stem = hashlib.sha256(u.encode()).hexdigest()[:16]
        out_path = OUT / f"{stem}.webp"
        img.save(out_path, format="WEBP", quality=QUALITY, method=METHOD)
        webp_kb = out_path.stat().st_size / 1024
        total_png += png_kb
        total_webp += webp_kb
        mapping[u] = {"local": str(out_path), "pngKB": round(png_kb, 1), "webpKB": round(webp_kb, 1)}
        print(f"  [{i}/{len(urls)}] {png_kb:6.0f} KB -> {webp_kb:5.0f} KB  ({stem}.webp)")
    (OUT / "convert-mapping.json").write_text(json.dumps(mapping, indent=2))
    print(f"\nGesamt: {total_png/1024:.1f} MB PNG -> {total_webp/1024:.1f} MB WebP "
          f"({100*(1-total_webp/total_png):.0f}% kleiner)")
    print(f"Mapping: {OUT / 'convert-mapping.json'}")

if __name__ == "__main__":
    main()
