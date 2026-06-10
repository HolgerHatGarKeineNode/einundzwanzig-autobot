# Contexts — austauschbare Wissens-Groundings für Artikel

Jeder Artikel wird inhaltlich auf einen oder MEHRERE **Kontexte** geerdet
(Begriffe, Prinzipien, Argumentationslinien der Quellwerke). Welche gelten,
steht in der Datei **`active`** — **ein Ordnername pro Zeile**; ALLE gelisteten
Kontexte werden geladen und gemischt (Artikel entstehen aus der vermischten
Sicht aller aktiven Groundings).

> **Kontexte sind lokal** (gitignored, inkl. `active`) — jeder Nutzer baut und
> wählt seine eigenen aus Büchern/PDFs (Rezept unten). **Ohne mindestens einen
> aktiven Kontext schreibt der Bot keine neuen Artikel.** Einmal gesetzt, bleibt
> `active` über alle Sessions stabil, bis der Nutzer ausdrücklich wechselt.

> ⚠️ Das Grounding ist IMMER **still** (siehe `../WRITING_RULES.md`): Quelle,
> Autor und Titel werden im Artikel niemals genannt.

## Struktur

```
contexts/
├── active                 # aktive Kontexte, ein Ordnername pro Zeile (lokal, gitignored)
├── README.md              # diese Datei
└── <name>/
    ├── source.pdf         # Original
    ├── raw.txt            # Roh-Extraktion (pdftotext -enc UTF-8)
    ├── grounding.md       # BEREINIGTER Volltext — die eigentliche Grounding-Quelle
    └── README.md          # Kontext-Notizen: Tonalität, Begriffswelt, Lese-Protokoll
```

## Session-Protokoll (jede neue Session)

1. `cat contexts/active` → aktive Kontexte (eine Zeile = ein Name)
2. Für JEDEN gelisteten Kontext `contexts/<name>/grounding.md` VOLLSTÄNDIG
   laden, BEVOR geschrieben wird (Read cappt bei ~25k Tokens/Call → in Chunks
   à ~1000 Zeilen lesen). Reihenfolge wie in `active`.
3. Kontext-READMEs beachten (Ton, Begriffe, Tabus)
4. Token-Budget im Blick behalten: Summe aller aktiven Groundings grob schätzen
   (Faustregel: ~1 Token pro 4 Zeichen) — bis ~300k unkritisch.
5. Kompaktierungs-Doktrin: Groundings werden VERLUSTFREI verdichtet
   (Quellen-Apparat/URLs, Laufköpfe, Seitenreste raus — Text bleibt Volltext).
   Inhaltliche Destillate (Outlines/Zusammenfassungen) erst, wenn die Summe
   aller aktiven Kontexte ~600k Tokens übersteigt.

## Neuen Kontext aus einem PDF anlegen

```bash
N=<name>   # kebab-case, ascii
mkdir -p contexts/$N
cp <quelle>.pdf contexts/$N/source.pdf
pdftotext -enc UTF-8 contexts/$N/source.pdf contexts/$N/raw.txt
# raw.txt bereinigen → grounding.md:
#  - Seitenzahlen/Kopfzeilen/Silbentrennung entfernen
#  - Front-Matter/Vorwort/Bios raus, Volltext ab inhaltlichem Beginn
#  - oben einen kurzen GROUNDING-KONTEXT-Header ergänzen (2–5 Zeilen: was ist
#    das Werk, welche Begriffe/Linien sollen Artikel tragen)
# contexts/$N/README.md schreiben: Tonalität, zentrale Begriffe, Lese-Hinweise
```

**Kein PDF / kein pdftotext?** Jede saubere Textdatei funktioniert: direkt als
`contexts/<name>/grounding.md` ablegen (GROUNDING-KONTEXT-Header oben ergänzen),
`raw.txt`/`source.pdf` entfallen dann. Das Bereinigen/Headern übernimmt auf
Wunsch auch Claude — einfach die Datei nennen und „mach daraus einen Kontext".

## Kontexte wechseln/mischen (nur auf Nutzer-Anweisung)

```bash
# einen Kontext exklusiv setzen:
echo <name> > contexts/active
# mehrere mischen (ein Name pro Zeile):
printf '<name1>\n<name2>\n' > contexts/active
```
