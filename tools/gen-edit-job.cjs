// Autobot — Generator für tools/jobs/edit-job.inject.js (Parameter für edit-article.run.js).
//
//   node autobot/tools/gen-edit-job.cjs --dtag <dTag> --spec <article-spec.json> \
//        [--publish] [--must "Timechain,Positionspapiere"] \
//        [--must-not "Voskuil,stoisch"] [--h2 6]
//
// Schreibt autobot/tools/jobs/edit-job.inject.js (window.__editJob). Danach:
//   1. browser_run_code filename=autobot/tools/setup-session.run.js   (falls Session frisch)
//   2. browser_run_code filename=autobot/tools/edit-article.run.js
const fs = require('fs')
const path = require('path')

const args = process.argv.slice(2)
const get = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined }
const dTag = get('--dtag')
const specPath = get('--spec')
if (!dTag || !specPath) { console.error('usage: --dtag <dTag> --spec <article-spec.json> [--publish] [--must csv] [--must-not csv] [--h2 n]'); process.exit(1) }

const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'))
const job = {
  dTag,
  title: spec.title,
  summary: spec.summary,
  image: spec.image || '',
  hashtags: spec.hashtags || [],
  content: spec.content,
  publish: args.includes('--publish'),
  mustContain: (get('--must') || '').split(',').map(s => s.trim()).filter(Boolean),
  mustNotContain: (get('--must-not') || '').split(',').map(s => s.trim()).filter(Boolean),
  expectH2: (h2 => h2 ? Number(h2) : null)(get('--h2')),
}
const out = path.join(__dirname, 'jobs', 'edit-job.inject.js')
fs.writeFileSync(out, 'window.__editJob = ' + JSON.stringify(job) + ';\n')
console.log('wrote', out, '— dTag:', dTag, '| publish:', job.publish, '| content:', job.content.length, 'chars')
