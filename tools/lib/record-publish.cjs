// Autobot — Publish-Log pro Session.
// Hängt einen Eintrag an <sessionDir>/published.json an (JSON-Array, append-only).
// Zweck: nach jedem Publish die Nostr-Event-IDs + Identifier (dTag, site, naddr,
// url, audioUrl) festhalten, damit spätere Schritte (z. B. Ankündigung) die
// Artikel-Referenzen NICHT erneut auf den Relays suchen müssen.
//
// Best-effort: schlägt nie hart fehl (Publish ist da schon passiert) — Fehler
// landen nur als Warnung auf stderr.
const fs = require('fs')
const path = require('path')

module.exports = function recordPublish(sessionDir, entry) {
  if (!sessionDir) return null
  try {
    const dir = path.resolve(sessionDir)
    if (!fs.existsSync(dir)) { console.error('⚠ --session-Ordner existiert nicht: ' + dir); return null }
    const file = path.join(dir, 'published.json')
    let arr = []
    if (fs.existsSync(file)) {
      try { arr = JSON.parse(fs.readFileSync(file, 'utf8')) } catch (e) { arr = [] }
    }
    if (!Array.isArray(arr)) arr = []
    arr.push(entry)
    fs.writeFileSync(file, JSON.stringify(arr, null, 2) + '\n')
    console.error('✓ published.json aktualisiert: ' + file)
    return file
  } catch (e) {
    console.error('⚠ konnte published.json nicht schreiben: ' + (e && e.message || e))
    return null
  }
}
