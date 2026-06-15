// Autobot — listet alle Longform-Artikel (kind 30023) eines Autors von den
// longform-Relays (autobot.config.json). READ-ONLY. Sammelt pro Artikel:
// dTag, Titel, Cover-Image (image-Tag), alle Bild-URLs im Content (![](url)),
// und markiert nicht-WebP-Bilder (zur Migration).
//
//   node tools/list-longform.cjs [--pubkey <hex>] [--json <out>]
const fs = require('fs')
const path = require('path')
const { SimplePool, useWebSocketImplementation } = require('nostr-tools/pool')
if (typeof WebSocket !== 'undefined') useWebSocketImplementation(WebSocket)

const ROOT = path.join(__dirname, '..')
const cfg = require('./lib/load-config.cjs')(ROOT)
const args = process.argv.slice(2)
const get = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined }
const pubkey = get('--pubkey') || '0adf67475ccc5ca456fd3022e46f5d526eb0af6284bf85494c0dd7847f3e5033'
const relays = (cfg.relays && cfg.relays.longform) || []

const IMG_RE = /!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/g

;(async () => {
  const pool = new SimplePool()
  const events = await pool.querySync(relays, { kinds: [30023], authors: [pubkey] }, { maxWait: 8000 })
  // Pro dTag nur das neueste Event (Replaceable).
  const byD = new Map()
  for (const e of events) {
    const d = (e.tags.find(t => t[0] === 'd') || [])[1] || ''
    const prev = byD.get(d)
    if (!prev || e.created_at > prev.created_at) byD.set(d, e)
  }
  const out = []
  for (const [d, e] of byD) {
    const title = (e.tags.find(t => t[0] === 'title') || [])[1] || ''
    const cover = (e.tags.find(t => t[0] === 'image') || [])[1] || ''
    const inline = [...e.content.matchAll(IMG_RE)].map(m => m[1])
    const allUrls = [...new Set([cover, ...inline].filter(Boolean))]
    const nonWebp = allUrls.filter(u => !/\.webp(\?|$)/i.test(u))
    out.push({
      dTag: d, title, id: e.id, created_at: e.created_at,
      cover, inlineCount: inline.length, totalImages: allUrls.length,
      nonWebpCount: nonWebp.length, allUrls,
    })
  }
  out.sort((a, b) => b.created_at - a.created_at)
  pool.close(relays)
  const jsonOut = get('--json')
  if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(out, null, 2))
  console.log(`\n${out.length} Artikel (kind 30023) für ${pubkey.slice(0, 12)}…\n`)
  for (const a of out) {
    console.log(`• ${a.dTag}`)
    console.log(`    "${a.title}"  — ${a.totalImages} Bilder (${a.nonWebpCount} nicht-webp), Cover: ${a.cover ? 'ja' : 'NEIN'}`)
  }
  const totalImgs = out.reduce((s, a) => s + a.totalImages, 0)
  const totalNonWebp = out.reduce((s, a) => s + a.nonWebpCount, 0)
  console.log(`\nSUMME: ${out.length} Artikel, ${totalImgs} Bilder, davon ${totalNonWebp} nicht-webp (zu migrieren).`)
})().catch(e => { console.error('FEHLER', e); process.exit(1) })
