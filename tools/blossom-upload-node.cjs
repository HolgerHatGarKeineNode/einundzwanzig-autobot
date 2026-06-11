// Autobot — HEADLESS Blossom-Uploader (reines Node, KEIN Browser).
//
//   node tools/blossom-upload-node.cjs --files <pfad[,pfad…]> [--server <url>]
//
// Spiegelt den BUD-02-Flow von tools/blossom-upload.run.js, aber ohne Playwright:
// signiert das kind-24242-Auth-Event direkt über den NIP-46-Bunker (Amber) mit
// demselben persistenten Client-Key wie die Browser-Bridge (NOSTR_CLIENT_SK in
// .env) — Amber kennt den Client bereits → stille Freigabe. PUT <server>/upload.
//
// Voraussetzung: NOSTR_BUNKER_URL + NOSTR_CLIENT_SK in .env, Bunker (Amber) online.
// Rückgabe (stdout JSON): [{ file, ok, url, hash, size, type?, server, error? }].
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const ROOT = path.join(__dirname, '..')
const { SimplePool, useWebSocketImplementation } = require('nostr-tools/pool')
const { BunkerSigner, parseBunkerInput } = require('nostr-tools/nip46')

// Node 22+ hat globales WebSocket/fetch — nostr-tools braucht eine WS-Impl.
if (typeof WebSocket !== 'undefined') useWebSocketImplementation(WebSocket)

function loadEnv() {
  const p = path.join(ROOT, '.env')
  const out = {}
  if (!fs.existsSync(p)) return out
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    if (line.trim().startsWith('#')) continue
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  return out
}
function hexToBytes(hex) {
  const clean = String(hex || '').trim()
  const out = new Uint8Array(clean.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16)
  return out
}

const args = process.argv.slice(2)
const get = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined }
const filesArg = get('--files')
if (!filesArg) { console.error('usage: node tools/blossom-upload-node.cjs --files <pfad[,pfad…]> [--server url]'); process.exit(1) }

const files = filesArg.split(',').map(s => s.trim()).filter(Boolean).map(p => path.resolve(p))
for (const f of files) if (!fs.existsSync(f)) { console.error('Datei fehlt: ' + f); process.exit(1) }

const cfg = require('./lib/load-config.cjs')(ROOT)
const env = loadEnv()
const bunkerUrl = process.env.NOSTR_BUNKER_URL || env.NOSTR_BUNKER_URL
const clientSk = process.env.NOSTR_CLIENT_SK || env.NOSTR_CLIENT_SK
if (!bunkerUrl) { console.error('NOSTR_BUNKER_URL fehlt (.env)'); process.exit(1) }
if (!clientSk) { console.error('NOSTR_CLIENT_SK fehlt (.env) — persistenter Client-Key nötig für stille Freigabe'); process.exit(1) }

const serverArg = get('--server')
const servers = serverArg ? [serverArg, ...cfg.blossomServers.filter(s => s !== serverArg)] : cfg.blossomServers.slice()

function mimeFor(file) {
  const ext = path.extname(file).toLowerCase()
  return ({ '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.ogg': 'audio/ogg', '.opus': 'audio/opus',
    '.wav': 'audio/wav', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' })[ext] || 'application/octet-stream'
}

;(async () => {
  const pool = new SimplePool()
  const bp = await parseBunkerInput(bunkerUrl)
  if (!bp) { console.error('parseBunkerInput: ungültige bunker://-URL'); process.exit(1) }

  const signer = BunkerSigner.fromBunker(hexToBytes(clientSk), bp, {
    pool,
    onauth: (url) => console.error('⚠ Amber verlangt Web-Freigabe (auth_url):\n  ' + url + '\n  → im Browser/Amber bestätigen, dann läuft es weiter.'),
  })

  console.error('▶ Verbinde mit Bunker (Amber)… (bei erster Verbindung ggf. auf dem Handy freigeben)')
  const connectTimeout = new Promise((_, rej) => setTimeout(() => rej(new Error('Bunker-Connect Timeout (60s) — Amber online & erreichbar?')), 60000))
  try { await Promise.race([signer.connect(), connectTimeout]) }
  catch (e) { console.error('FEHLER connect: ' + e.message); process.exit(1) }
  const pubkey = await signer.getPublicKey()
  console.error('✓ Signer bereit, pubkey ' + pubkey.slice(0, 12) + '…')

  const results = []
  for (const file of files) {
    const buf = fs.readFileSync(file)
    const hash = crypto.createHash('sha256').update(buf).digest('hex')
    const type = mimeFor(file)
    let placed = null
    for (const server of servers) {
      const base = server.replace(/\/+$/, '')
      const now = Math.floor(Date.now() / 1000)
      const evt = {
        kind: 24242, created_at: now,
        tags: [['t', 'upload'], ['expiration', String(now + 300)], ['x', hash], ['server', base]],
        content: 'Authorize upload',
      }
      let signed
      try { signed = await signer.signEvent(evt) }
      catch (e) { placed = { ok: false, server: base, error: 'signEvent: ' + e.message }; break }
      const auth = 'Nostr ' + Buffer.from(JSON.stringify(signed)).toString('base64')
      try {
        const res = await fetch(base + '/upload', {
          method: 'PUT',
          headers: { Authorization: auth, 'Content-Type': type },
          body: buf,
        })
        if (!res.ok) { placed = { ok: false, server: base, status: res.status, error: (await res.text().catch(() => '')).slice(0, 200) }; continue }
        const blob = await res.json().catch(() => null)
        if (!blob || !blob.url) { placed = { ok: false, server: base, error: 'keine url in Antwort' }; continue }
        placed = { ok: true, server: base, url: blob.url, hash, size: buf.length, type: blob.type || type }
        break
      } catch (e) { placed = { ok: false, server: base, error: 'fetch: ' + (e && e.message) }; continue }
    }
    results.push({ file: path.basename(file), ...placed })
    console.error((placed && placed.ok ? '✓ ' : '✗ ') + path.basename(file) + (placed && placed.ok ? ' → ' + placed.url : ' — ' + (placed && placed.error)))
  }

  try { pool.close(bp.relays || []) } catch (e) { /* ignore */ }
  console.log(JSON.stringify(results, null, 2))
  // BunkerSigner hält evtl. offene Sockets/Subscriptions → sauber beenden.
  setTimeout(() => process.exit(results.every(r => r.ok) ? 0 : 1), 200)
})()
