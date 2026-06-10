#!/usr/bin/env node
// Autobot — Erst-Einrichtung & Gesundheitscheck. Idempotent, jederzeit erneut ausführbar:
//   npm install && npm run setup
//
// Macht: .env anlegen (aus .env.example), Client-Key erzeugen, Bridge bauen,
// connect.inject.js generieren (falls Bunker-URL vorhanden), contexts/active
// anlegen — und prüft alle optionalen Abhängigkeiten mit klaren nächsten Schritten.
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { execSync, spawnSync } = require('child_process')

const ROOT = path.join(__dirname, '..')
const ok = (msg) => console.log('  ✓ ' + msg)
const todo = (msg) => console.log('  → ' + msg)
const warn = (msg) => console.log('  ⚠ ' + msg)
const nextSteps = []

console.log('\nEinundzwanzig Autobot — Setup\n')

// 1) .env aus Vorlage anlegen
const envPath = path.join(ROOT, '.env')
if (!fs.existsSync(envPath)) {
  fs.copyFileSync(path.join(ROOT, '.env.example'), envPath)
  ok('.env angelegt (aus .env.example)')
} else {
  ok('.env vorhanden')
}

// 2) Persistenten NIP-46-Client-Key erzeugen, falls noch keiner gesetzt ist.
//    Derselbe Key über alle Sessions ⇒ Amber fragt nur beim allerersten Connect.
let env = fs.readFileSync(envPath, 'utf8')
const pick = (k) => {
  const m = env.match(new RegExp('^' + k + '=(.+)$', 'm'))
  return m && m[1].trim()
}
if (!pick('NOSTR_CLIENT_SK')) {
  const sk = crypto.randomBytes(32).toString('hex')
  env = env.replace(/^NOSTR_CLIENT_SK=.*$/m, 'NOSTR_CLIENT_SK=' + sk)
  if (!/^NOSTR_CLIENT_SK=/m.test(env)) env += '\nNOSTR_CLIENT_SK=' + sk + '\n'
  fs.writeFileSync(envPath, env)
  ok('NOSTR_CLIENT_SK erzeugt (persistenter Client-Key — Amber fragt nur einmal)')
} else {
  ok('NOSTR_CLIENT_SK gesetzt')
}

// 3) Bridge bauen (braucht npm install vorher)
const iife = path.join(ROOT, 'bridge', 'bunker-bridge.iife.js')
if (fs.existsSync(path.join(ROOT, 'node_modules', 'esbuild'))) {
  try {
    execSync('npm run -s build:bridge', { cwd: ROOT, stdio: 'pipe' })
    ok('bridge/bunker-bridge.iife.js gebaut')
  } catch (e) {
    warn('Bridge-Build fehlgeschlagen: ' + String(e.message).split('\n')[0])
    nextSteps.push('Bridge-Build prüfen: npm run build:bridge')
  }
} else if (!fs.existsSync(iife)) {
  warn('node_modules fehlt — Bridge nicht gebaut')
  nextSteps.push('npm install && npm run setup  (erneut ausführen)')
}

// 4) connect.inject.js generieren — nur möglich, wenn die Bunker-URL schon da ist
if (pick('NOSTR_BUNKER_URL')) {
  execSync('node tools/gen-inject.cjs', { cwd: ROOT, stdio: 'pipe' })
  ok('bridge/connect.inject.js generiert')
} else {
  todo('NOSTR_BUNKER_URL fehlt in .env')
  nextSteps.push('bunker://-URL aus Amber in .env eintragen (INSTALL.md, Abschnitt „Nostr-Login"), dann: npm run gen:inject')
}

// 5) Kontexte — der Bot schreibt NICHTS ohne mindestens ein Wissens-Grounding
const activePath = path.join(ROOT, 'contexts', 'active')
if (!fs.existsSync(activePath)) {
  fs.writeFileSync(activePath, '')
  ok('contexts/active angelegt (leer)')
}
const active = fs.readFileSync(activePath, 'utf8').split('\n').map(s => s.trim()).filter(Boolean)
const missing = active.filter(n => !fs.existsSync(path.join(ROOT, 'contexts', n, 'grounding.md')))
if (!active.length) {
  todo('Noch kein aktiver Kontext')
  nextSteps.push('Mindestens EINEN Wissens-Kontext anlegen (z. B. aus einem Buch-PDF) und in contexts/active eintragen — Rezept: contexts/README.md')
} else if (missing.length) {
  warn('contexts/active verweist auf fehlende Groundings: ' + missing.join(', '))
  nextSteps.push('Fehlende Kontexte anlegen oder aus contexts/active entfernen')
} else {
  ok('Aktive Kontexte: ' + active.join(', '))
}

// 6) Optionale Werkzeuge
const has = (cmd) => spawnSync('sh', ['-c', 'command -v ' + cmd], { stdio: 'pipe' }).status === 0
if (has('pdftotext')) ok('pdftotext vorhanden (PDF → Kontext)')
else { warn('pdftotext fehlt (nur nötig, um Kontexte aus PDFs zu bauen)'); nextSteps.push('poppler-utils installieren (siehe INSTALL.md) — optional') }

const cfg = require('./lib/load-config.cjs')(ROOT)
const fluxPy = path.isAbsolute(cfg.flux2Python) ? cfg.flux2Python : path.join(ROOT, cfg.flux2Python)
if (fs.existsSync(fluxPy)) ok('FLUX2-Python gefunden: ' + cfg.flux2Python)
else { warn('FLUX2 nicht eingerichtet (optional — lokale Bildgenerierung)'); nextSteps.push('Für Bildgenerierung: imagegen/INSTALL.md — oder eigene Bilder verwenden') }

// 7) Persönliche Overlays (optional, gitignored — eigene Tabu-Wörter & Schreibregeln)
const overlays = ['autobot.config.local.json', 'WRITING_RULES.local.md'].filter(f => fs.existsSync(path.join(ROOT, f)))
if (overlays.length) ok('Persönliche Overlays aktiv: ' + overlays.join(', '))
else todo('Keine persönlichen Overlays (optional): autobot.config.local.json (Tabu-Wörter fürs Gate), WRITING_RULES.local.md (eigene Schreibregeln) — siehe WRITING_RULES.md §4')

// Fazit
console.log('')
if (nextSteps.length) {
  console.log('Nächste Schritte:')
  nextSteps.forEach((s, i) => console.log('  ' + (i + 1) + '. ' + s))
} else {
  console.log('Alles bereit. Claude Code in DIESEM Ordner starten und loslegen (README.md, „Loslegen").')
}
console.log('')
