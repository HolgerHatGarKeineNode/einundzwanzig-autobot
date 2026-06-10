// Autobot — Generator für tools/jobs/edit-job.inject.js (Parameter für edit-article.run.js).
//
//   node autobot/tools/gen-edit-job.cjs [--dtag <dTag>] --spec <article-spec.json> \
//        [--publish] [--must "Begriff1,Begriff2"] \
//        [--must-not "Quellautor,Etikett"] [--h2 6]
//
// dTag = der ÖFFENTLICHE URL-SLUG des Artikels (/s/<site>/<dTag>) — nach dem ersten
// Teilen unveränderlich! NEUE Artikel: --dtag WEGLASSEN → es wird automatisch ein
// schöner Slug aus spec.title erzeugt (nie den App-Fallback draft-<timestamp>
// übernehmen). BESTEHENDE Artikel: --dtag <ihr bisheriger dTag> (Replace via d-Tag).
//
// Schreibt autobot/tools/jobs/edit-job.inject.js (window.__editJob). Danach:
//   1. browser_run_code filename=autobot/tools/setup-session.run.js   (falls Session frisch)
//   2. browser_run_code filename=autobot/tools/edit-article.run.js
const fs = require('fs')
const path = require('path')

const args = process.argv.slice(2)
const get = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined }
const specPath = get('--spec')
if (!specPath) { console.error('usage: [--dtag <dTag>] --spec <article-spec.json> [--publish] [--must csv] [--must-not csv] [--h2 n]'); process.exit(1) }

const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'))

// Titel → URL-Slug (Umlaute/ß transliteriert, lowercase, a-z0-9 + '-', max ~60
// Zeichen an Wortgrenze gekappt).
const slugify = (title) => {
  let s = String(title || '').toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  if (s.length > 60) s = s.slice(0, 60).replace(/-[^-]*$/, '')
  return s
}

let dTag = get('--dtag')
if (!dTag) {
  dTag = slugify(spec.title)
  if (!dTag) { console.error('Kein --dtag und kein brauchbarer spec.title zum Sluggen'); process.exit(1) }
  console.log('dTag aus Titel erzeugt:', dTag, '\n⚠️  Vor dem Publish prüfen, dass der Slug nicht schon von einem ANDEREN Artikel belegt ist (kind 30023, #d-Filter).')
}
if (/^draft-\d+$/.test(dTag) && args.includes('--publish')) {
  console.warn('⚠️  dTag "' + dTag + '" ist ein App-generierter Timestamp — wird als hässlicher URL-Slug veröffentlicht. Für NEUE Artikel --dtag weglassen (Titel-Slug); für bestehende Artikel ok (Slug ist bereits öffentlich).')
}
const cfg = require('./lib/load-config.cjs')(path.join(__dirname, '..'))
const job = {
  dTag,
  title: spec.title,
  summary: spec.summary,
  image: spec.image || '',
  hashtags: spec.hashtags || [],
  content: spec.content,
  publish: args.includes('--publish'),
  mustContain: (get('--must') || '').split(',').map(s => s.trim()).filter(Boolean),
  // Tabu-Gate: --must-not gewinnt, sonst mustNotDefault aus der Config
  // (persönliche Tabus + Quell-Autoren — siehe WRITING_RULES.md §4)
  mustNotContain: (mn => mn
    ? mn.split(',').map(s => s.trim()).filter(Boolean)
    : (cfg.mustNotDefault || [])
  )(get('--must-not')),
  expectH2: (h2 => h2 ? Number(h2) : null)(get('--h2')),
}
const out = path.join(__dirname, 'jobs', 'edit-job.inject.js')
fs.writeFileSync(out, 'window.__editJob = ' + JSON.stringify(job) + ';\n')
console.log('wrote', out, '— dTag:', dTag, '| publish:', job.publish, '| content:', job.content.length, 'chars')
