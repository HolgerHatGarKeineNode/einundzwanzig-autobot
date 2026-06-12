// Autobot — HEADLESS Artikel-Ankündigung als Nostr-Note (kind 1, reines Node).
//
//   node tools/announce-node.cjs --dtag <dTag> --site <siteSlug> --text-file <datei>   # Preview
//   node tools/announce-node.cjs --dtag … --site … --text-file … --go                  # LIVE!
//
// Relay-Strategie (Gossip/NIP-65):
//   Beim Publish wird kind 10002 des Artikel-Autors von Bootstrap-Relays geladen.
//   Outbox-Relays (r-Tags ohne Marker oder marker="write") werden als Broadcast-Ziel
//   verwendet. Fallback: cfg.relays.longform, falls kein kind 10002 vorhanden.
//   Longform-Relays werden weiterhin für Relay-Gates (Artikel-Nachweis) genutzt.
//
// Baut einen kurzen Ankündigungs-Post für einen BESTEHENDEN Longform-Artikel:
//   <Text aus --text-file>
//   <Leerzeile>
//   <baseUrl>/s/<site>/<dTag>
//   [<Leerzeile>🎧 Wer lieber hört: <audio-url>]   ← optional, via --audio-url
// Kein a-Tag — a-Tags auf kind 30023 lassen Clients den Post als Kommentar anzeigen.
// Der Artikel-URL im content ist die einzige Referenz. KEINE Hashtags — bewusst schlicht.
//
// Gates (laufen IMMER, vor jedem Signieren):
//   - Artikel existiert auf den Relays (kind 30023, #d) → Titel + Autor-Pubkey
//   - öffentliche URL antwortet mit HTTP 200
//   - Tabu-Gate (mustNotDefault aus autobot.config[.local].json)
//   - Text nicht leer, ≤ 600 Zeichen, enthält selbst KEINE URL (Link kommt ans Ende)
//   - --audio-url muss https?://-URL sein (wird nicht auf Erreichbarkeit geprüft)
// Preview ist der eingebaute Dry-Run: ohne --go wird NICHTS signiert/gesendet.
// Bei --go zusätzlich: Signer-Pubkey muss dem Artikel-Autor entsprechen (nur
// eigene Artikel ankündigen), danach Relay-Verifikation über die Event-ID.
//
// Voraussetzung bei Publish: NOSTR_BUNKER_URL + NOSTR_CLIENT_SK in .env, Amber online.
const fs = require('fs')
const path = require('path')
const ROOT = path.join(__dirname, '..')
const { SimplePool, useWebSocketImplementation } = require('nostr-tools/pool')
const { BunkerSigner, parseBunkerInput } = require('nostr-tools/nip46')
if (typeof WebSocket !== 'undefined') useWebSocketImplementation(WebSocket)

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
function hexToBytes(hex) {
  const clean = String(hex || '').trim(); const out = new Uint8Array(clean.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16)
  return out
}

const args = process.argv.slice(2)
const get = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined }
const GO = args.includes('--go')
const dTag = get('--dtag')
const site = get('--site')
const textFile = get('--text-file')
const audioUrl = get('--audio-url')
if (!dTag || !site || !textFile) {
  console.error('usage: --dtag <dTag> --site <siteSlug> --text-file <datei> [--audio-url <url>] [--go]')
  process.exit(1)
}
if (audioUrl && !/^https?:\/\//i.test(audioUrl)) {
  console.error('GATE FAIL: --audio-url muss eine https?://-URL sein')
  process.exit(1)
}

const cfg = require('./lib/load-config.cjs')(ROOT)
const BASE = cfg.baseUrl.replace(/\/+$/, '')
const relays = cfg.relays.longform
const mustNot = cfg.mustNotDefault || []

;(async () => {
  // 1) Text laden + lokale Gates.
  const text = fs.readFileSync(path.resolve(textFile), 'utf8').trim()
  const forbidden = mustNot.filter(s => text.toLowerCase().includes(s.toLowerCase()))
  const hasUrl = /https?:\/\//i.test(text)
  if (!text || text.length > 600 || hasUrl || forbidden.length) {
    console.error('GATE FAIL (Text): ' + JSON.stringify({ empty: !text, len: text.length, hasUrl, forbidden }))
    process.exit(1)
  }

  // 2) Artikel auf den Relays nachweisen (neuestes Event gewinnt).
  const pool = new SimplePool()
  const evs = await pool.querySync(relays.slice(0, 8), { kinds: [30023], '#d': [dTag], limit: 5 }, { maxWait: 8000 })
  if (!evs.length) { console.error('FEHLER: kein Live-Artikel für dTag ' + dTag); process.exit(1) }
  const article = evs.sort((a, b) => b.created_at - a.created_at)[0]
  const title = (article.tags.find(t => t[0] === 'title') || [])[1] || dTag

  // 3) Öffentliche URL bauen und prüfen.
  const url = BASE + '/s/' + encodeURIComponent(site) + '/' + encodeURIComponent(dTag)
  let http = 0
  try { http = (await fetch(url, { method: 'GET' })).status } catch (e) { /* bleibt 0 */ }
  if (http !== 200) { console.error('GATE FAIL: URL antwortet nicht mit 200: ' + url + ' → ' + http); process.exit(1) }

  // 4) Event bauen (unsigniert).
  // Kein a-Tag: a-Tags auf kind 30023 werden von Clients als Kommentar/Reply interpretiert.
  // Der Artikel-Link im content reicht als Referenz.
  const content = text + '\n\n' + url + (audioUrl ? '\n\n🎧 Wer lieber hört: ' + audioUrl : '')
  const tags = [
    ['client', 'EINUNDZWANZIG HUB'],
  ]

  // 5) Preview (kein Signieren) — eingebauter Dry-Run.
  if (!GO) {
    console.log(JSON.stringify({
      ok: true, stage: 'preview', dTag, articleTitle: title, articleAuthor: article.pubkey.slice(0, 12) + '…',
      url, audioUrl: audioUrl || null, http, gates: { textLen: text.length, forbidden, hasUrl }, kind: 1, tags, content,
    }, null, 2))
    pool.close(relays); setTimeout(() => process.exit(0), 200); return
  }

  // 6) Signieren (nur eigene Artikel) + Broadcast.
  const env = loadEnv()
  const bunkerUrl = process.env.NOSTR_BUNKER_URL || env.NOSTR_BUNKER_URL
  const clientSk = process.env.NOSTR_CLIENT_SK || env.NOSTR_CLIENT_SK
  if (!bunkerUrl || !clientSk) { console.error('NOSTR_BUNKER_URL/NOSTR_CLIENT_SK fehlen (.env)'); process.exit(1) }
  const bp = await parseBunkerInput(bunkerUrl)
  if (!bp) { console.error('ungültige bunker://-URL'); process.exit(1) }
  const signer = BunkerSigner.fromBunker(hexToBytes(clientSk), bp, { pool, onauth: (u) => console.error('⚠ Amber auth_url: ' + u) })
  console.error('▶ Verbinde mit Bunker (Amber)…')
  await Promise.race([signer.connect(), new Promise((_, r) => setTimeout(() => r(new Error('connect timeout 60s')), 60000))])
  const pubkey = await signer.getPublicKey()
  if (pubkey !== article.pubkey) { console.error('GATE FAIL: Signer ' + pubkey.slice(0, 12) + '… ist nicht der Artikel-Autor'); process.exit(1) }

  // NIP-65: Outbox-Relays des Autors laden (Gossip-Strategie).
  const BOOTSTRAP = ['wss://relay.damus.io', 'wss://nos.lol', 'wss://nostr.einundzwanzig.space', 'wss://relay.nostr.band', 'wss://purplepag.es']
  console.error('▶ Lade NIP-65 Outbox-Relays (kind 10002)…')
  const relayListEvs = await pool.querySync(BOOTSTRAP, { kinds: [10002], authors: [pubkey], limit: 1 }, { maxWait: 8000 })
  relayListEvs.sort((a, b) => b.created_at - a.created_at)
  let broadcastRelays
  if (relayListEvs.length) {
    broadcastRelays = relayListEvs[0].tags
      .filter(t => t[0] === 'r' && (!t[2] || t[2] === 'write'))
      .map(t => t[1])
    console.error('Outbox-Relays:', broadcastRelays.join(', '))
  } else {
    console.error('kein kind 10002 gefunden — Fallback auf longform-Relays')
    broadcastRelays = relays
  }

  const signed = await signer.signEvent({ kind: 1, created_at: Math.floor(Date.now() / 1000), tags, content })
  const sends = await Promise.allSettled(pool.publish(broadcastRelays, signed))
  const accepted = []
  sends.forEach((s, i) => { if (s.status === 'fulfilled') accepted.push(broadcastRelays[i]) })

  // 7) Relay-Verifikation über die Event-ID.
  await new Promise(r => setTimeout(r, 800))
  const verify = await pool.querySync((accepted.length ? accepted : broadcastRelays).slice(0, 4), { ids: [signed.id] }, { maxWait: 5000 })
  const verified = verify.some(e => e.id === signed.id)

  console.log(JSON.stringify({
    ok: verified, stage: verified ? 'published+verified' : 'published-unverified',
    eventId: signed.id, url, content,
    outboxRelays: broadcastRelays,
    relaysAccepted: accepted, relaysFailed: sends.map((s, i) => s.status === 'rejected' ? broadcastRelays[i] : null).filter(Boolean),
  }, null, 2))
  pool.close([...relays, ...BOOTSTRAP, ...broadcastRelays])
  setTimeout(() => process.exit(verified ? 0 : 1), 200)
})()
