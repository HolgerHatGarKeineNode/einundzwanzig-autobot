// Autobot — GENERISCHER Builder: Artikel + Bilder → article-spec/inject/illustrated.
//
//   node autobot/tools/gen-illustrated.cjs <sessionDir>
//   z. B.: node autobot/tools/gen-illustrated.cjs autobot/sessions/2026-06-09-petition
//
// Liest aus dem Session-Ordner:
//   article.md         — Markdown-Body (H2-Sektionen)
//   article-meta.json  — { title, summary, hashtags[], cover, sections[] }
//                        cover/sections sind SCHLÜSSEL in image-urls.json;
//                        sections[i] wird unter der i-ten H2 eingefügt.
//   image-urls.json    — { <key>: <blossom-url>, ... }
// Schreibt dorthin: article-spec.json, article-illustrated.md
// (article-inject.js entfällt — kein Konsument mehr; edit-article.run.js liest die Spec via gen-edit-job)
const fs = require('fs')
const path = require('path')

const dir = process.argv[2]
if (!dir) { console.error('usage: gen-illustrated.cjs <sessionDir>'); process.exit(1) }
const read = (f) => fs.readFileSync(path.join(dir, f), 'utf8')

const meta = JSON.parse(read('article-meta.json'))
const urls = JSON.parse(read('image-urls.json'))
const lines = read('article.md').split('\n')

const sectionUrls = (meta.sections || []).map((key) => {
  if (!urls[key]) { console.error(`image-urls.json: Schlüssel "${key}" fehlt`); process.exit(1) }
  return urls[key]
})

const out = []
let h2 = 0
for (const line of lines) {
  out.push(line)
  const m = line.match(/^##\s+(.*)$/)
  if (m && h2 < sectionUrls.length) {
    const alt = m[1].replace(/[\[\]]/g, '').trim()
    out.push('', `![${alt}](${sectionUrls[h2]})`)
    h2++
  }
}
if (h2 !== sectionUrls.length) {
  console.error(`WARNUNG: ${sectionUrls.length} Sektionsbilder definiert, aber nur ${h2} H2-Überschriften gefunden`)
}
const content = out.join('\n')

const spec = {
  format: meta.format || 'article',
  title: meta.title,
  summary: meta.summary,
  image: urls[meta.cover || 'cover'] || '',
  hashtags: meta.hashtags || [],
  authorPubkey: meta.authorPubkey || '',
  content,
  saveType: 'local',
}

fs.writeFileSync(path.join(dir, 'article-spec.json'), JSON.stringify(spec, null, 2))
fs.writeFileSync(path.join(dir, 'article-illustrated.md'), content)
console.log(`inserted ${h2} section images; cover = ${String(spec.image).slice(0, 48)}…`)
console.log(`content ${content.length} chars; wrote article-spec.json + article-illustrated.md in ${dir}`)
