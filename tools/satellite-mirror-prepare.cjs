// Autobot satellite.earth-Mirror, Schritt 3: pro Artikel den neuen Content bauen
// (alle satellite-URLs -> blossom.einundzwanzig.space) + STRENG verifizieren.
//
//   node tools/satellite-mirror-prepare.cjs
//
// Liest sessions/satellite-mirror/url-map.json, holt jedes Live-Event frisch und
// schreibt sessions/satellite-mirror/<dTag>/spec.json ({content}) + meta.json.
// Voller Content-Replace (kein count===1-Problem mit doppelt vorkommenden Audio-URLs).
// Garantie: Rück-Tausch aller neuen URLs == Original-Content, sonst verifyOk=false.
const fs = require('fs')
const path = require('path')
const { SimplePool, useWebSocketImplementation } = require('nostr-tools/pool')
if (typeof WebSocket !== 'undefined') useWebSocketImplementation(WebSocket)

const ROOT = path.join(__dirname, '..')
const cfg = require('./lib/load-config.cjs')(ROOT)
const relays = cfg.relays.longform
const PK = '0adf67475ccc5ca456fd3022e46f5d526eb0af6284bf85494c0dd7847f3e5033'
const MIG = path.join(ROOT, 'sessions', 'satellite-mirror')
const urlMap = JSON.parse(fs.readFileSync(path.join(MIG, 'url-map.json'), 'utf8'))
const SAT_RE = /https?:\/\/cdn\.satellite\.earth\/[^\s"')\]]+/g
const slug = (d) => d.replace(/[^a-z0-9-]/gi, '_')

;(async () => {
  const pool = new SimplePool()
  const events = await pool.querySync(relays, { kinds: [30023], authors: [PK] }, { maxWait: 8000 })
  const byD = new Map()
  for (const e of events) {
    const d = (e.tags.find(t => t[0] === 'd') || [])[1] || ''
    const prev = byD.get(d)
    if (!prev || e.created_at > prev.created_at) byD.set(d, e)
  }
  pool.close(relays)

  const summary = []
  for (const [d, ev] of byD) {
    const content = ev.content
    const coverOld = (ev.tags.find(t => t[0] === 'image') || [])[1] || ''
    const inSat = [...new Set(content.match(SAT_RE) || [])]
    const missMap = inSat.filter(u => !urlMap[u])

    // Voller Replace, längste URL zuerst (verhindert Präfix-Kollisionen 32 vs 64 hex).
    let newContent = content
    for (const u of inSat.filter(x => urlMap[x]).sort((a, b) => b.length - a.length)) {
      newContent = newContent.split(u).join(urlMap[u])
    }
    // Reversibilität: alle neuen URLs zurück -> Original.
    let back = newContent
    for (const u of inSat.filter(x => urlMap[x]).sort((a, b) => b.length - a.length)) {
      back = back.split(urlMap[u]).join(u)
    }
    const reversible = back === content
    // Es darf keine satellite-URL im neuen Content übrig sein (außer ungemappte).
    const leftover = [...new Set(newContent.match(SAT_RE) || [])]
    const coverNew = coverOld ? (urlMap[coverOld] || (coverOld.match(SAT_RE) ? null : coverOld)) : ''
    const coverOk = !coverOld || !coverOld.match(SAT_RE) || !!urlMap[coverOld]
    const verifyOk = reversible && !missMap.length && coverOk && leftover.length === 0

    const dir = path.join(MIG, slug(d))
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'spec.json'), JSON.stringify({ content: newContent }, null, 2))
    const meta = {
      dTag: d, eventId: ev.id, coverOld, coverNew, coverChanged: coverNew !== coverOld,
      contentUrlsReplaced: inSat.filter(x => urlMap[x]).length,
      delta: newContent.length - content.length, verifyOk, reversible, coverOk, missMap, leftover,
    }
    fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 2))
    summary.push(meta)
    console.log(`${verifyOk ? '✓' : '✗'} ${d}: ${meta.contentUrlsReplaced} URLs im Text, Cover ${meta.coverChanged ? 'neu' : 'unverändert'}, Δ${meta.delta >= 0 ? '+' : ''}${meta.delta}, reversibel=${reversible}${missMap.length ? ' MISS=' + missMap.length : ''}${leftover.length ? ' LEFTOVER=' + leftover.length : ''}`)
  }
  fs.writeFileSync(path.join(MIG, 'prepare-summary.json'), JSON.stringify(summary, null, 2))
  const ok = summary.filter(s => s.verifyOk).length
  console.log(`\n${ok}/${summary.length} Artikel verifiziert & bereit (nur URL-Strings geändert).`)
})().catch(e => { console.error('FEHLER', e); process.exit(1) })
