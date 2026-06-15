// Autobot WebP-Migration, Schritt 2: pro Artikel die URL-Ersetzungs-Patches
// vorbereiten + STRENG verifizieren, dass NUR Bild-URLs geaendert werden.
//
//   node tools/webp-migrate-prepare.cjs
//
// Liest sessions/longform-inventory.json + sessions/webp-migration/url-map.json,
// holt pro Artikel das Live-Event, und schreibt sessions/webp-migration/<dTag>/
//   patches.json   = [{search: altInlineUrl, replace: neuWebpUrl}]  (nur content-Bilder)
//   meta.json      = { dTag, coverOld, coverNew, inlineCount, verifyOk }
//
// Text-Garantie: nach Anwenden aller Patches werden die NEUEN URLs wieder zu den
// ALTEN zurueckgetauscht; kommt dabei nicht BYTE-genau der Original-Content heraus,
// wurde mehr als nur URLs veraendert -> verifyOk=false (Artikel wird uebersprungen).
const fs = require('fs')
const path = require('path')
const { SimplePool, useWebSocketImplementation } = require('nostr-tools/pool')
if (typeof WebSocket !== 'undefined') useWebSocketImplementation(WebSocket)

const ROOT = path.join(__dirname, '..')
const cfg = require('./lib/load-config.cjs')(ROOT)
const relays = cfg.relays.longform
const pk = '0adf67475ccc5ca456fd3022e46f5d526eb0af6284bf85494c0dd7847f3e5033'
const MIG = path.join(ROOT, 'sessions', 'webp-migration')
const inv = JSON.parse(fs.readFileSync(path.join(ROOT, 'sessions', 'longform-inventory.json'), 'utf8'))
const urlMap = JSON.parse(fs.readFileSync(path.join(MIG, 'url-map.json'), 'utf8'))
const URL_RE = /!\[[^\]]*\]\(\s*(https?:\/\/[^)\s"]+)(?:\s+"[^"]*")?\s*\)/g

;(async () => {
  const pool = new SimplePool()
  const summary = []
  for (const a of inv) {
    const evs = await pool.querySync(relays.slice(0, 8), { kinds: [30023], authors: [pk], '#d': [a.dTag], limit: 5 }, { maxWait: 7000 })
    if (!evs.length) { console.log(`! ${a.dTag}: kein Live-Event`); summary.push({ dTag: a.dTag, verifyOk: false, error: 'no-event' }); continue }
    const ev = evs.sort((x, y) => y.created_at - x.created_at)[0]
    const content = ev.content
    const coverOld = (ev.tags.find(t => t[0] === 'image') || [])[1] || ''
    const inlineUrls = [...content.matchAll(URL_RE)].map(m => m[1])
    const uniqInline = [...new Set(inlineUrls)]

    // Patches nur fuer Inline-Bilder, deren WebP-Pendant existiert.
    const patches = []
    let missMap = []
    for (const u of uniqInline) {
      if (!urlMap[u]) { missMap.push(u); continue }
      patches.push({ search: u, replace: urlMap[u] })
    }

    // STRENGE Verifikation: jede search genau 1x; Rueck-Tausch == Original.
    let sim = content, badCount = null
    for (const p of patches) {
      const c = sim.split(p.search).length - 1
      if (c !== 1) { badCount = { url: p.search.slice(-20), count: c }; break }
      sim = sim.split(p.search).join(p.replace)
    }
    let back = sim
    for (const p of patches) back = back.split(p.replace).join(p.search)
    const reversible = back === content
    const coverNew = coverOld ? (urlMap[coverOld] || null) : null
    const coverOk = !coverOld || !!coverNew
    const verifyOk = !badCount && reversible && coverOk && !missMap.length

    const dir = path.join(MIG, a.dTag.replace(/[^a-z0-9-]/gi, '_'))
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'patches.json'), JSON.stringify(patches, null, 2))
    const meta = { dTag: a.dTag, eventId: ev.id, coverOld, coverNew, inlinePatches: patches.length, verifyOk, badCount, reversible, coverOk, missMap }
    fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 2))
    summary.push(meta)
    console.log(`${verifyOk ? '✓' : '✗'} ${a.dTag}: ${patches.length} Inline-Patches, Cover ${coverNew ? 'webp✓' : (coverOld ? 'FEHLT' : 'keins')}, reversibel=${reversible}${badCount ? ' BADCOUNT=' + JSON.stringify(badCount) : ''}${missMap.length ? ' MISS=' + missMap.length : ''}`)
  }
  pool.close(relays)
  fs.writeFileSync(path.join(MIG, 'prepare-summary.json'), JSON.stringify(summary, null, 2))
  const okCount = summary.filter(s => s.verifyOk).length
  console.log(`\n${okCount}/${summary.length} Artikel verifiziert & bereit. (Text bleibt garantiert unveraendert: nur URL-Strings)`)
})().catch(e => { console.error('FEHLER', e); process.exit(1) })
