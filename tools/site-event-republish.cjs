// Autobot — Site-Event (kind 30004 Curation-Set) image-Tag auf neuen Blossom-Host.
//
//   node tools/site-event-republish.cjs <siteDTag>            # Preview
//   node tools/site-event-republish.cjs <siteDTag> --go        # LIVE
//
// Holt das Live-Site-Event, ersetzt einen cdn.satellite.earth-image-Tag durch den
// gleichen Hash auf blossom.einundzwanzig.space (nur wenn dort per GET 200 vorhanden),
// erhält ALLE übrigen Tags (inkl. der Artikel-'a'-Refs) + Content, signiert via
// Bunker, POST /api/events + Relay-Broadcast, Verifikation.
const fs = require('fs')
const path = require('path')
const { SimplePool, useWebSocketImplementation } = require('nostr-tools/pool')
const { BunkerSigner, parseBunkerInput } = require('nostr-tools/nip46')
if (typeof WebSocket !== 'undefined') useWebSocketImplementation(WebSocket)

const ROOT = path.join(__dirname, '..')
const cfg = require('./lib/load-config.cjs')(ROOT)
const BASE = cfg.baseUrl
const relays = cfg.relays.longform
const PK = '0adf67475ccc5ca456fd3022e46f5d526eb0af6284bf85494c0dd7847f3e5033'
const TARGET_HOST = 'https://blossom.einundzwanzig.space'
const DTAG = process.argv[2]
const GO = process.argv.includes('--go')
if (!DTAG || DTAG.startsWith('--')) { console.error('usage: node tools/site-event-republish.cjs <siteDTag> [--go]'); process.exit(1) }

function loadEnv() {
  const p = path.join(ROOT, '.env'); const out = {}
  if (!fs.existsSync(p)) return out
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) { if (line.trim().startsWith('#')) continue; const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '') }
  return out
}
const hexToBytes = (hex) => { const c = String(hex).trim(); const o = new Uint8Array(c.length / 2); for (let i = 0; i < o.length; i++) o[i] = parseInt(c.slice(i * 2, i * 2 + 2), 16); return o }
const SAT_RE = /^https?:\/\/cdn\.satellite\.earth\/([0-9a-f]+)(\.[a-z0-9]+)?/i

;(async () => {
  const pool = new SimplePool()
  const evs = await pool.querySync(relays, { kinds: [30004], authors: [PK], '#d': [DTAG] }, { maxWait: 8000 })
  if (!evs.length) { console.error('FEHLER: kein kind-30004 für d=' + DTAG); process.exit(1) }
  const baseEv = evs.sort((a, b) => b.created_at - a.created_at)[0]
  const tags = baseEv.tags.map(t => [...t])

  // image-Tags mit satellite-URL finden + auf Ziel-Host umbiegen (gleicher Hash, GET 200 Pflicht).
  const changes = []
  for (const t of tags) {
    if (t[0] !== 'image' || !t[1]) continue
    const m = t[1].match(SAT_RE)
    if (!m) continue
    const newUrl = `${TARGET_HOST}/${m[1]}${m[2] || ''}`
    const r = await fetch(newUrl, { method: 'GET' }).catch(() => null)
    if (!r || !r.ok) { console.error(`! Mirror fehlt (${r ? r.status : 'no-resp'}): ${newUrl}`); continue }
    changes.push({ from: t[1], to: newUrl, tag: t }); t[1] = newUrl
  }
  const leftover = tags.filter(t => /cdn\.satellite\.earth/.test(JSON.stringify(t))).length
    || (/cdn\.satellite\.earth/.test(baseEv.content) ? 1 : 0)

  console.log(`kind 30004 d="${DTAG}" id=${baseEv.id.slice(0, 12)} | ${changes.length} image-Tag(s):`)
  for (const c of changes) console.log(`  ✓ …${c.from.slice(-22)} → ${c.to}`)
  if (!changes.length) { console.log('  (nichts zu ändern)'); pool.close(relays); setTimeout(() => process.exit(0), 200); return }

  if (!GO) { console.log('\nPREVIEW (kein Publish). Mit --go live.'); pool.close(relays); setTimeout(() => process.exit(0), 200); return }
  if (leftover) console.error(`Warnung: ${leftover} weitere satellite-Referenz(en) bleiben (Content/andere Tags).`)

  const env = loadEnv()
  const bp = await parseBunkerInput(process.env.NOSTR_BUNKER_URL || env.NOSTR_BUNKER_URL)
  const signer = BunkerSigner.fromBunker(hexToBytes(process.env.NOSTR_CLIENT_SK || env.NOSTR_CLIENT_SK), bp, { pool, onauth: (u) => console.error('⚠ Amber: ' + u) })
  console.error('▶ Verbinde mit Bunker…')
  await Promise.race([signer.connect(), new Promise((_, r) => setTimeout(() => r(new Error('connect timeout')), 60000))])
  await signer.getPublicKey()
  const now = Math.floor(Date.now() / 1000)
  const signed = await signer.signEvent({ kind: 30004, created_at: now, tags, content: baseEv.content })

  let backend = null
  try { const r = await fetch(BASE.replace(/\/+$/, '') + '/api/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(signed) }); backend = { status: r.status, ok: r.ok } }
  catch (e) { backend = { ok: false, error: String(e.message || e) } }
  const sends = await Promise.allSettled(pool.publish(relays, signed))
  const accepted = sends.filter(s => s.status === 'fulfilled').length
  await new Promise(r => setTimeout(r, 800))
  const verify = await pool.querySync(relays.slice(0, 4), { kinds: [30004], authors: [PK], '#d': [DTAG] }, { maxWait: 5000 })
  const ok = verify.some(e => e.id === signed.id)
  console.log(JSON.stringify({ ok, eventId: signed.id, backend, relaysAccepted: accepted }, null, 2))
  pool.close(relays)
  setTimeout(() => process.exit(ok ? 0 : 1), 200)
})().catch(e => { console.error('FEHLER', e); process.exit(1) })
