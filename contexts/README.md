# Contexts — austauschbare Wissens-Groundings für Artikel

Jeder Artikel wird inhaltlich auf einen **Kontext** geerdet (Begriffe, Prinzipien,
Argumentationslinien eines Quellwerks). Kontexte sind austauschbar; welcher gilt,
steht in der Datei **`active`** (eine Zeile, Ordnername).

> **Default: `kryptooekonomie`** — bleibt für alle neuen Sessions fest, bis der
> Nutzer ausdrücklich wechselt.

> ⚠️ Das Grounding ist IMMER **still** (siehe `../WRITING_RULES.md`): Quelle,
> Autor und Titel werden im Artikel niemals genannt.

## Struktur

```
contexts/
├── active                 # Name des aktiven Kontexts (z. B. "kryptooekonomie")
├── README.md              # diese Datei
└── <name>/
    ├── source.pdf         # Original
    ├── raw.txt            # Roh-Extraktion (pdftotext -enc UTF-8)
    ├── grounding.md       # BEREINIGTER Volltext — die eigentliche Grounding-Quelle
    └── README.md          # Kontext-Notizen: Tonalität, Begriffswelt, Lese-Protokoll
```

## Session-Protokoll (jede neue Session)

1. `cat contexts/active` → aktiver Kontext `<name>`
2. `contexts/<name>/grounding.md` VOLLSTÄNDIG laden, BEVOR geschrieben wird
   (Read cappt bei ~25k Tokens/Call → in Chunks à ~1000–1300 Zeilen lesen)
3. Kontext-README beachten (Ton, Begriffe, Tabus)

## Neuen Kontext aus einem PDF anlegen

```bash
N=<name>   # kebab-case, ascii
mkdir -p contexts/$N
cp <quelle>.pdf contexts/$N/source.pdf
pdftotext -enc UTF-8 contexts/$N/source.pdf contexts/$N/raw.txt
# raw.txt bereinigen → grounding.md:
#  - Seitenzahlen/Kopfzeilen/Silbentrennung entfernen
#  - Front-Matter/Vorwort/Bios raus, Volltext ab inhaltlichem Beginn
#  - oben einen kurzen GROUNDING-KONTEXT-Header ergänzen (siehe kryptooekonomie/grounding.md)
# contexts/$N/README.md schreiben: Tonalität, zentrale Begriffe, Lese-Hinweise
```

## Kontext wechseln (nur auf Nutzer-Anweisung)

```bash
echo <name> > contexts/active
```
