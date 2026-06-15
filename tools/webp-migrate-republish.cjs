// Autobot WebP-Migration, Schritt 3: pro Artikel die URL-Patches live ausspielen.
//
//   node tools/webp-migrate-republish.cjs          # Preview ALLE (kein Publish)
//   node tools/webp-migrate-republish.cjs --go      # LIVE re-publish ALLE
//
// Nutzt die getesteten Tools gen-quick-edit-job.cjs + quick-edit-node.cjs
// (Relay-Fetch -> nur URL-Patches -> Gates -> sign -> Backend+Relays -> Verify).
// Cover via --image. Text bleibt unveraendert (nur search/replace der Bild-URLs).
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const ROOT = path.join(__dirname, '..')
const MIG = path.join(ROOT, 'sessions', 'webp-migration')
const SITE = 'cypherpunk-anarchie'
const GO = process.argv.includes('--go')
const summary = JSON.parse(fs.readFileSync(path.join(MIG, 'prepare-summary.json'), 'utf8'))

const node = process.execPath
const run = (script, args) => execFileSync(node, [path.join(ROOT, 'tools', script), ...args], { cwd: ROOT, encoding: 'utf8' })

const results = []
for (const m of summary) {
  if (!m.verifyOk) { console.log(`\n=== SKIP ${m.dTag} (verifyOk=false) ===`); results.push({ dTag: m.dTag, skipped: true }); continue }
  const dir = path.join(MIG, m.dTag.replace(/[^a-z0-9-]/gi, '_'))
  const patches = path.join(dir, 'patches.json')
  console.log(`\n=== ${m.dTag} (${m.inlinePatches} Inline + Cover) ===`)

  // Job erzeugen (mit --publish, damit --go bei quick-edit-node greift).
  const genArgs = ['--dtag', m.dTag, '--patch', patches, '--publish']
  if (m.coverNew) genArgs.push('--image', m.coverNew)
  run('gen-quick-edit-job.cjs', genArgs)

  // Immer zuerst Preview (kein Signieren).
  let preview
  try { preview = JSON.parse(run('quick-edit-node.cjs', [])) }
  catch (e) { console.error('PREVIEW-FEHLER:', e.stdout || e.message); results.push({ dTag: m.dTag, ok: false, stage: 'preview-error' }); break }
  console.log(`  preview: gate.baseLen=${preview.gate.baseLen} newLen=${preview.gate.newLen} applied=${preview.applied.length} patches`)
  const delta = preview.gate.newLen - preview.gate.baseLen
  console.log(`  Laengen-Delta: ${delta >= 0 ? '+' : ''}${delta} Zeichen (nur durch URL-Laengen; Text unveraendert)`)

  if (!GO) { results.push({ dTag: m.dTag, ok: true, stage: 'preview', delta }); continue }

  // LIVE.
  let pub
  try { pub = JSON.parse(run('quick-edit-node.cjs', ['--go', '--session', MIG, '--site', SITE])) }
  catch (e) { console.error('PUBLISH-FEHLER:', e.stdout || e.message); results.push({ dTag: m.dTag, ok: false, stage: 'publish-error' }); break }
  console.log(`  ${pub.ok ? '✓ PUBLISHED+VERIFIED' : '✗ UNVERIFIED'} eventId=${(pub.eventId || '').slice(0, 16)} relays=${(pub.relaysAccepted || []).length}`)
  results.push({ dTag: m.dTag, ok: pub.ok, stage: pub.stage, eventId: pub.eventId, naddr: pub.naddr })
  if (!pub.ok) { console.error('Abbruch: Artikel nicht verifiziert.'); break }
}

fs.writeFileSync(path.join(MIG, GO ? 'republish-result.json' : 'preview-result.json'), JSON.stringify(results, null, 2))
const okN = results.filter(r => r.ok).length
console.log(`\n${GO ? 'LIVE' : 'PREVIEW'}: ${okN}/${results.length} ok.`)
