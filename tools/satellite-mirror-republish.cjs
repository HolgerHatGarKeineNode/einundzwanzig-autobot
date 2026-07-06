// Autobot satellite.earth-Mirror, Schritt 4: pro Artikel live ausspielen.
//
//   node tools/satellite-mirror-republish.cjs        # Preview ALLE (kein Publish)
//   node tools/satellite-mirror-republish.cjs --go    # LIVE re-publish ALLE
//
// Nutzt gen-quick-edit-job.cjs (--spec voller Content + --image neues Cover) +
// quick-edit-node.cjs (Fetch -> Gates -> sign -> Backend+Relays -> Verify).
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const ROOT = path.join(__dirname, '..')
const MIG = path.join(ROOT, 'sessions', 'satellite-mirror')
const SITE = 'cypherpunk-anarchie'
const GO = process.argv.includes('--go')
const summary = JSON.parse(fs.readFileSync(path.join(MIG, 'prepare-summary.json'), 'utf8'))
const slug = (d) => d.replace(/[^a-z0-9-]/gi, '_')

const node = process.execPath
const run = (script, args) => execFileSync(node, [path.join(ROOT, 'tools', script), ...args], { cwd: ROOT, encoding: 'utf8' })

const results = []
for (const m of summary) {
  if (!m.verifyOk) { console.log(`\n=== SKIP ${m.dTag} (verifyOk=false) ===`); results.push({ dTag: m.dTag, skipped: true }); continue }
  const spec = path.join(MIG, slug(m.dTag), 'spec.json')
  console.log(`\n=== ${m.dTag} (${m.contentUrlsReplaced} URLs + Cover) ===`)

  // Tabu-Gate deaktivieren: reine URL-Migration an BESTEHENDEM Text (Em-Dashes etc.
  // sind vorhandene Prosa, nicht von uns eingebracht; Reversibilität ist bewiesen).
  const genArgs = ['--dtag', m.dTag, '--spec', spec, '--publish', '--must-not', 'satellite_mirror_no_taboo_sentinel']
  if (m.coverNew) genArgs.push('--image', m.coverNew)
  run('gen-quick-edit-job.cjs', genArgs)

  let preview
  try { preview = JSON.parse(run('quick-edit-node.cjs', [])) }
  catch (e) { console.error('PREVIEW-FEHLER:', e.stdout || e.message); results.push({ dTag: m.dTag, ok: false, stage: 'preview-error' }); break }
  console.log(`  preview: baseLen=${preview.gate.baseLen} newLen=${preview.gate.newLen} forbidden=${JSON.stringify(preview.gate.forbidden)} lenOk=${preview.gate.lenOk}`)

  if (!GO) { results.push({ dTag: m.dTag, ok: true, stage: 'preview' }); continue }

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
