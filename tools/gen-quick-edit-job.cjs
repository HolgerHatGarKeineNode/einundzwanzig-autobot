// Autobot — Generator für tools/jobs/quick-edit-job.inject.js (Parameter für quick-edit.run.js).
//
// SCHNELLER Text-Update-Pfad für BESTEHENDE Artikel: patcht das Live-Event
// (kind 30023) direkt — ohne Editor-UI, ohne separaten Dry-Run-Lauf.
//
//   node tools/gen-quick-edit-job.cjs --dtag <dTag> \
//        ( --patch <patches.json> | --spec <article-spec.json> ) \
//        [--publish] [--must csv] [--must-not csv] \
//        [--title "…"] [--summary "…"] [--image url]
//
// patches.json = Array von { "search": "…", "replace": "…" } — jede search
// muss im Live-Content GENAU EINMAL vorkommen (sonst bricht der Runner ab).
// --spec ersetzt stattdessen den kompletten content (Feld "content").
// --title/--summary/--image NUR für Metadaten-Korrekturen — ohne sie bleiben
// alle Tags des Live-Events unverändert erhalten.
// Ohne --publish: Preview-Modus — holt, patcht, prüft, signiert NICHTS.
// Relays kommen aus tools/config/relays.json (Sync-Hinweis dort).
const fs = require('fs')
const path = require('path')

const args = process.argv.slice(2)
const get = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined }
const dTag = get('--dtag')
const patchPath = get('--patch')
const specPath = get('--spec')
if (!dTag || (!patchPath && !specPath)) {
  console.error('usage: --dtag <dTag> (--patch <patches.json> | --spec <spec.json>) [--publish] [--must csv] [--must-not csv] [--title t] [--summary s] [--image url]')
  process.exit(1)
}

const job = {
  dTag,
  relays: JSON.parse(fs.readFileSync(path.join(__dirname, 'config', 'relays.json'), 'utf8')).longform,
  replacements: patchPath ? JSON.parse(fs.readFileSync(patchPath, 'utf8')) : null,
  content: specPath ? JSON.parse(fs.readFileSync(specPath, 'utf8')).content : null,
  title: get('--title') || null,
  summary: get('--summary') || null,
  image: get('--image') || null,
  publish: args.includes('--publish'),
  mustContain: (get('--must') || '').split(',').map(s => s.trim()).filter(Boolean),
  mustNotContain: (get('--must-not') || 'Voskuil,stoisch,Stoizismus').split(',').map(s => s.trim()).filter(Boolean),
}
if (job.replacements && (!Array.isArray(job.replacements) || job.replacements.some(r => !r.search || typeof r.replace !== 'string'))) {
  console.error('patches.json: Array von {search, replace} erwartet'); process.exit(1)
}

const out = path.join(__dirname, 'jobs', 'quick-edit-job.inject.js')
fs.writeFileSync(out, 'window.__quickEditJob = ' + JSON.stringify(job) + ';\n')
console.log('wrote', out, '— dTag:', dTag, '| publish:', job.publish,
  '|', job.replacements ? job.replacements.length + ' patches' : 'full content (' + job.content.length + ' chars)')
