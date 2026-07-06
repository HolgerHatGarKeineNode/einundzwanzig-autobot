// Autobot — Site-Config-Bilder (kind 30078) auf neuen Blossom-Host umstellen.
//
//   node tools/site-config-republish.cjs            # Preview (kein Signieren)
//   node tools/site-config-republish.cjs --go        # LIVE
//
// Holt das Live-Config-Event (kind 30078, d=einundzwanzig:site-config:<site>),
// ersetzt die Bildfelder (logo/coverImage/headerImage/ogImage) gemäss url-map,
// erhält ALLE übrigen Felder + Tags, signiert via NIP-46-Bunker, POSTet an
// <baseUrl>/api/events und broadcastet auf die longform-Relays, dann Verifikation.
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
const SITE = 'cypherpunk-anarchie'
const DTAG = 'einundzwanzig:site-config:' + SITE
const GO = process.argv.includes('--go')

// Feld -> neue URL (nur Felder, die aktuell auf cdn.satellite.earth zeigen).
const NEW = {
  logo: 'https://blossom.einundzwanzig.space/083db7accae2b21964d516f4d995ea0c43c15bb3c90bc48b0f4d2d57d8e79548.webp',
  headerImage: 'https://blossom.einundzwanzig.space/8d30cd05fb6ab5d2398fc3511146c2679957e3639e59215ee2d8381227bab587.webp',
  coverImage: 'https://blossom.einundzwanzig.space/eba89c23899e92135b2bb68f0f64385ba4228edb9fecf021677965aaa26e92f7.png',
  ogImage: 'https://blossom.einundzwanzig.space/eba89c23899e92135b2bb68f0f64385ba4228edb9fecf021677965aaa26e92f7.png',
}

function loadEnv() {
  const p = path.join(ROOT, '.env'); const out = {}
  if (!fs.existsSync(p)) return out
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    if (line.trim().startsWith('#')) continue
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  return out
}
const hexToBytes = (hex) => { const c = String(hex).trim(); const o = new Uint8Array(c.length / 2); for (let i = 0; i < o.length; i++) o[i] = parseInt(c.slice(i * 2, i * 2 + 2), 16); return o }

;(async () => {
  const pool = new SimplePool()
  const evs = await pool.querySync(relays, { kinds: [30078], authors: [PK], '#d': [DTAG] }, { maxWait: 8000 })
  if (!evs.length) { console.error('FEHLER: kein Config-Event für ' + DTAG); process.exit(1) }
  const baseEv = evs.sort((a, b) => b.created_at - a.created_at)[0]
  const config = JSON.parse(baseEv.content)

  // Bildfelder ersetzen (nur wenn aktuell satellite.earth).
  const changes = []
  for (const [k, url] of Object.entries(NEW)) {
    const old = config[k]
    if (old && /cdn\.satellite\.earth/.test(old)) { config[k] = url; changes.push({ field: k, from: old, to: url }) }
    else changes.push({ field: k, skipped: true, current: old || '(leer)' })
  }
  const leftover = Object.entries(config).filter(([, v]) => typeof v === 'string' && /cdn\.satellite\.earth/.test(v)).map(([k]) => k)
  const newContent = JSON.stringify(config)

  console.log('Config-Event:', baseEv.id.slice(0, 16), '| Änderungen:')
  for (const c of changes) console.log('  ' + (c.skipped ? `· ${c.field} unverändert (${c.current.slice(0, 50)})` : `✓ ${c.field}: …${c.from.slice(-22)} → …${c.to.slice(-30)}`))
  if (leftover.length) console.log('  ! Rest-satellite-URLs in:', leftover.join(', '))

  if (!GO) {
    console.log('\nPREVIEW (kein Publish). Mit --go live ausspielen.')
    pool.close(relays); setTimeout(() => process.exit(0), 200); return
  }
  if (leftover.length) { console.error('Abbruch: noch satellite-URLs in Config-Feldern ' + leftover.join(',')); process.exit(1) }
  if (!changes.some(c => !c.skipped)) { console.error('Abbruch: nichts zu ändern.'); process.exit(1) }

  // Signieren (Tags 1:1 erhalten, created_at=now).
  const env = loadEnv()
  const bp = await parseBunkerInput(process.env.NOSTR_BUNKER_URL || env.NOSTR_BUNKER_URL)
  const signer = BunkerSigner.fromBunker(hexToBytes(process.env.NOSTR_CLIENT_SK || env.NOSTR_CLIENT_SK), bp, { pool, onauth: (u) => console.error('⚠ Amber: ' + u) })
  console.error('▶ Verbinde mit Bunker…')
  await Promise.race([signer.connect(), new Promise((_, r) => setTimeout(() => r(new Error('connect timeout')), 60000))])
  await signer.getPublicKey()
  const now = Math.floor(Date.now() / 1000)
  const signed = await signer.signEvent({ kind: 30078, created_at: now, tags: baseEv.tags.map(t => [...t]), content: newContent })

  let backend = null
  try { const r = await fetch(BASE.replace(/\/+$/, '') + '/api/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(signed) }); backend = { status: r.status, ok: r.ok } }
  catch (e) { backend = { ok: false, error: String(e.message || e) } }

  const sends = await Promise.allSettled(pool.publish(relays, signed))
  const accepted = []; sends.forEach((s, i) => { if (s.status === 'fulfilled') accepted.push(relays[i]) })

  await new Promise(r => setTimeout(r, 800))
  const verify = await pool.querySync((accepted.length ? accepted : relays).slice(0, 4), { kinds: [30078], authors: [PK], '#d': [DTAG] }, { maxWait: 5000 })
  const ok = verify.some(e => e.id === signed.id)
  console.log(JSON.stringify({ ok, eventId: signed.id, backend, relaysAccepted: accepted.length }, null, 2))
  pool.close(relays)
  setTimeout(() => process.exit(ok ? 0 : 1), 200)
})().catch(e => { console.error('FEHLER', e); process.exit(1) })
