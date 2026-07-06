// Autobot satellite.earth-Mirror, Schritt 2: lokale Quelldateien nach
// blossom.einundzwanzig.space hochladen und URL-Map (satUrl -> neueUrl) bauen.
//
//   node tools/satellite-mirror-upload.cjs
//
// Liest sessions/satellite-mirror/plan.json, lädt JEDE eindeutige lokale Datei per
// BUD-02 zum Ziel-Server (kind-24242-Auth via NIP-46-Bunker, wie blossom-upload-node),
// verifiziert danach GET 200, und schreibt sessions/satellite-mirror/url-map.json
// = { satelliteUrl: neueBlossomUrl } (Join über den Dateipfad). Idempotent: bereits
// gemappte Dateien werden übersprungen.
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { SimplePool, useWebSocketImplementation } = require('nostr-tools/pool')
const { BunkerSigner, parseBunkerInput } = require('nostr-tools/nip46')
if (typeof WebSocket !== 'undefined') useWebSocketImplementation(WebSocket)

const ROOT = path.join(__dirname, '..')
const TARGET = 'https://blossom.einundzwanzig.space'
const OUT = path.join(ROOT, 'sessions', 'satellite-mirror')
const plan = JSON.parse(fs.readFileSync(path.join(OUT, 'plan.json'), 'utf8'))

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
const mimeFor = (f) => ({ '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.ogg': 'audio/ogg', '.opus': 'audio/opus', '.wav': 'audio/wav', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' })[path.extname(f).toLowerCase()] || 'application/octet-stream'

const env = loadEnv()
const bunkerUrl = process.env.NOSTR_BUNKER_URL || env.NOSTR_BUNKER_URL
const clientSk = process.env.NOSTR_CLIENT_SK || env.NOSTR_CLIENT_SK
if (!bunkerUrl || !clientSk) { console.error('NOSTR_BUNKER_URL/NOSTR_CLIENT_SK fehlen (.env)'); process.exit(1) }

;(async () => {
  // path -> newUrl (Cache aus früherem Lauf zusammensetzen)
  const mapPath = path.join(OUT, 'path-to-url.json')
  const pathToUrl = fs.existsSync(mapPath) ? JSON.parse(fs.readFileSync(mapPath, 'utf8')) : {}

  const pool = new SimplePool()
  const bp = await parseBunkerInput(bunkerUrl)
  const signer = BunkerSigner.fromBunker(hexToBytes(clientSk), bp, { pool, onauth: (u) => console.error('⚠ Amber-Freigabe nötig:\n  ' + u) })
  console.error('▶ Verbinde mit Bunker (Amber)…')
  await Promise.race([signer.connect(), new Promise((_, r) => setTimeout(() => r(new Error('Connect-Timeout 60s')), 60000))])
  await signer.getPublicKey()
  console.error('✓ Signer bereit')

  const base = TARGET.replace(/\/+$/, '')
  const locals = plan.uniqueLocals
  let i = 0
  for (const file of locals) {
    i++
    if (pathToUrl[file]) { console.error(`[${i}/${locals.length}] skip (gemappt) ${path.basename(file)}`); continue }
    const buf = fs.readFileSync(file)
    const hash = crypto.createHash('sha256').update(buf).digest('hex')
    const now = Math.floor(Date.now() / 1000)
    const evt = { kind: 24242, created_at: now, tags: [['t', 'upload'], ['expiration', String(now + 300)], ['x', hash], ['server', base]], content: 'Authorize upload' }
    const signed = await signer.signEvent(evt)
    const auth = 'Nostr ' + Buffer.from(JSON.stringify(signed)).toString('base64')
    let res
    try { res = await fetch(base + '/upload', { method: 'PUT', headers: { Authorization: auth, 'Content-Type': mimeFor(file) }, body: buf }) }
    catch (e) { console.error(`✗ [${i}] fetch ${path.basename(file)}: ${e.message}`); continue }
    if (!res.ok) { console.error(`✗ [${i}] ${res.status} ${path.basename(file)}: ${(await res.text().catch(() => '')).slice(0, 160)}`); continue }
    const blob = await res.json().catch(() => null)
    if (!blob || !blob.url) { console.error(`✗ [${i}] keine url ${path.basename(file)}`); continue }
    if (!blob.url.startsWith(base)) { console.error(`✗ [${i}] FREMDER host: ${blob.url}`); continue }
    pathToUrl[file] = blob.url
    fs.writeFileSync(mapPath, JSON.stringify(pathToUrl, null, 2)) // inkrementell sichern
    console.error(`✓ [${i}/${locals.length}] ${path.basename(file)} → ${blob.url}`)
  }
  try { pool.close(bp.relays || []) } catch (e) {}

  // GET-Verifikation + url-map bauen (satUrl -> neueUrl) via Pfad-Join.
  const satByPath = {}
  for (const a of plan.articles) for (const u of a.urls) if (!u.miss) satByPath[u.local] = u.url
  const urlMap = {}
  let verified = 0, failed = 0
  for (const [file, newUrl] of Object.entries(pathToUrl)) {
    const sat = satByPath[file]
    if (!sat) continue
    const r = await fetch(newUrl, { method: 'GET' }).catch(() => null)
    const ok = r && r.ok
    if (ok) verified++; else failed++
    if (!ok) console.error(`! GET FEHLER ${newUrl} (${r ? r.status : 'no-response'})`)
    urlMap[sat] = newUrl
  }
  fs.writeFileSync(path.join(OUT, 'url-map.json'), JSON.stringify(urlMap, null, 2))
  console.log(`\n${Object.keys(urlMap).length} URLs gemappt, ${verified} per GET 200 verifiziert${failed ? `, ${failed} FEHLER` : ''}.`)
  console.log(`url-map: ${path.join(OUT, 'url-map.json')}`)
  setTimeout(() => process.exit(failed ? 1 : 0), 200)
})().catch(e => { console.error('FEHLER', e); process.exit(1) })
