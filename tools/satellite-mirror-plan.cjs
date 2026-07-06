// Autobot satellite.earth-Mirror, Schritt 1: Plan bauen (READ-ONLY).
//
//   node tools/satellite-mirror-plan.cjs
//
// satellite.earth ist down (502). Diese Migration holt jedes Live-Event (kind 30023),
// sammelt JEDE cdn.satellite.earth-URL (Cover-image-Tag + Inline-Bilder + Audio-Links)
// und findet pro URL die lokale Quelldatei per INHALTS-Hash: der Hex-Token in der
// satellite-URL ist md5 (32) oder sha256 (64) des Dateiinhalts. Wir indizieren alle
// lokalen sessions/-Dateien nach md5+sha256 und matchen darüber — keine fragile
// Mapping-Rekonstruktion.
//
// Schreibt sessions/satellite-mirror/plan.json:
//   { articles:[{dTag,eventId,cover,urls:[{url,local,hash,algo}|{url,miss:true}]}],
//     uniqueLocals:[path...], misses:[url...] }
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { SimplePool, useWebSocketImplementation } = require('nostr-tools/pool')
if (typeof WebSocket !== 'undefined') useWebSocketImplementation(WebSocket)

const ROOT = path.join(__dirname, '..')
const cfg = require('./lib/load-config.cjs')(ROOT)
const relays = cfg.relays.longform
const PK = '0adf67475ccc5ca456fd3022e46f5d526eb0af6284bf85494c0dd7847f3e5033'
const OUT = path.join(ROOT, 'sessions', 'satellite-mirror')
const SAT_RE = /https?:\/\/cdn\.satellite\.earth\/[^\s"')\]]+/g

// Lokale Dateien indizieren: hex(md5|sha256) -> erster Pfad.
function buildIndex() {
  const exts = new Set(['.webp', '.png', '.jpg', '.jpeg', '.mp3', '.m4a', '.ogg', '.opus', '.wav'])
  const idx = {}
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else if (exts.has(path.extname(e.name).toLowerCase())) {
        const buf = fs.readFileSync(p)
        for (const algo of ['md5', 'sha256']) {
          const h = crypto.createHash(algo).update(buf).digest('hex')
          if (!idx[h]) idx[h] = { path: p, algo }
        }
      }
    }
  }
  walk(path.join(ROOT, 'sessions'))
  return idx
}

;(async () => {
  fs.mkdirSync(OUT, { recursive: true })
  const idx = buildIndex()
  console.error(`Lokaler Hash-Index: ${Object.keys(idx).length} Hashes`)

  const pool = new SimplePool()
  const events = await pool.querySync(relays, { kinds: [30023], authors: [PK] }, { maxWait: 8000 })
  const byD = new Map()
  for (const e of events) {
    const d = (e.tags.find(t => t[0] === 'd') || [])[1] || ''
    const prev = byD.get(d)
    if (!prev || e.created_at > prev.created_at) byD.set(d, e)
  }
  pool.close(relays)

  const articles = []
  const uniqueLocals = new Set()
  const misses = new Set()
  for (const [d, e] of byD) {
    const cover = (e.tags.find(t => t[0] === 'image') || [])[1] || ''
    const found = new Set([...(cover.match(SAT_RE) || []), ...(e.content.match(SAT_RE) || [])])
    const urls = []
    for (const url of found) {
      const token = url.split('/').pop().split('?')[0]
      const hex = token.replace(/\.[a-z0-9]+$/i, '')
      const hit = idx[hex]
      if (hit) { urls.push({ url, local: hit.path, hash: hex, algo: hit.algo }); uniqueLocals.add(hit.path) }
      else { urls.push({ url, miss: true }); misses.add(url) }
    }
    articles.push({ dTag: d, eventId: e.id, cover, urls })
  }

  const plan = { articles, uniqueLocals: [...uniqueLocals], misses: [...misses] }
  fs.writeFileSync(path.join(OUT, 'plan.json'), JSON.stringify(plan, null, 2))

  console.log(`\n${articles.length} Artikel:`)
  for (const a of articles) {
    const ok = a.urls.filter(u => !u.miss).length
    const miss = a.urls.filter(u => u.miss).length
    console.log(`• ${a.dTag}: ${a.urls.length} satellite-URLs (${ok} lokal gefunden${miss ? `, ${miss} FEHLEN` : ''})`)
    for (const u of a.urls.filter(x => x.miss)) console.log(`    MISS ${u.url}`)
  }
  console.log(`\nGesamt: ${[...uniqueLocals].length} eindeutige lokale Dateien hochzuladen, ${[...misses].length} URLs ohne lokale Quelle.`)
})().catch(e => { console.error('FEHLER', e); process.exit(1) })
