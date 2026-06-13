// Autobot — HEADLESS Quick-Edit (reines Node, KEIN Browser).
//
//   node tools/quick-edit-node.cjs            # Preview (kein Signieren)
//   node tools/quick-edit-node.cjs --go       # tatsächlich publizieren (LIVE!)
//
// Funktionsgleicher Zwilling zu tools/quick-edit.run.js für Umgebungen, in denen
// die Playwright-MCP-Runner nicht laufen. Liest DENSELBEN Job
// (tools/jobs/quick-edit-job.inject.js aus gen-quick-edit-job.cjs) und macht:
//   Relay-Fetch (kind 30023, #d) → Patch → Gates → signEvent(NIP-46-Bunker)
//   → Backend-POST (<baseUrl>/api/events) + Relay-Broadcast → Relay-Verifikation.
//
// Die Gates (mustContain/mustNotContain/Schrumpf-Schutz) laufen ZWINGEND vor dem
// Signieren — Preview ist der eingebaute Dry-Run. `job.publish` muss true sein
// UND `--go` gesetzt (doppelte Sicherung gegen versehentliches Live-Publish).
//
// Voraussetzung bei Publish: NOSTR_BUNKER_URL + NOSTR_CLIENT_SK in .env, Amber online.
const fs = require('fs')
const path = require('path')
const ROOT = path.join(__dirname, '..')
const { SimplePool, useWebSocketImplementation } = require('nostr-tools/pool')
const { BunkerSigner, parseBunkerInput } = require('nostr-tools/nip46')
const nip19 = require('nostr-tools/nip19')
const recordPublish = require('./lib/record-publish.cjs')
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

const GO = process.argv.includes('--go')
const argGet = (flag) => { const i = process.argv.indexOf(flag); return i >= 0 ? process.argv[i + 1] : undefined }
const sessionDir = argGet('--session')
const siteSlug = argGet('--site') || null
const cfg = require('./lib/load-config.cjs')(ROOT)
const BASE = cfg.baseUrl

// Job lesen (window.__quickEditJob = {...};) — single source of truth bleibt gen-quick-edit-job.cjs.
const jobPath = path.join(__dirname, 'jobs', 'quick-edit-job.inject.js')
if (!fs.existsSync(jobPath)) { console.error('jobs/quick-edit-job.inject.js fehlt — erst: node tools/gen-quick-edit-job.cjs …'); process.exit(1) }
const job = (new Function('window', fs.readFileSync(jobPath, 'utf8') + '; return window.__quickEditJob;'))({})
if (!job || !job.dTag) { console.error('Job ungültig/leer'); process.exit(1) }
const WANT_PUBLISH = !!job.publish && GO

;(async () => {
  const pool = new SimplePool()
  const relays = job.relays

  // Signer NUR für echtes Publish.
  let signer = null, pubkey = null
  if (WANT_PUBLISH) {
    const env = loadEnv()
    const bunkerUrl = process.env.NOSTR_BUNKER_URL || env.NOSTR_BUNKER_URL
    const clientSk = process.env.NOSTR_CLIENT_SK || env.NOSTR_CLIENT_SK
    if (!bunkerUrl || !clientSk) { console.error('NOSTR_BUNKER_URL/NOSTR_CLIENT_SK fehlen (.env)'); process.exit(1) }
    const bp = await parseBunkerInput(bunkerUrl)
    if (!bp) { console.error('ungültige bunker://-URL'); process.exit(1) }
    signer = BunkerSigner.fromBunker(hexToBytes(clientSk), bp, { pool, onauth: (u) => console.error('⚠ Amber auth_url: ' + u) })
    console.error('▶ Verbinde mit Bunker (Amber)…')
    await Promise.race([signer.connect(), new Promise((_, r) => setTimeout(() => r(new Error('connect timeout 60s')), 60000))])
    pubkey = await signer.getPublicKey()
    console.error('✓ Signer bereit: ' + pubkey.slice(0, 12) + '…')
  }

  // 1) Live-Event holen (neuestes über die Relays).
  const filter = { kinds: [30023], '#d': [job.dTag], limit: 5 }
  if (pubkey) filter.authors = [pubkey]
  const evs = await pool.querySync(relays.slice(0, 8), filter, { maxWait: 6000 })
  if (!evs.length) { console.error('FEHLER: kein Live-Event für dTag ' + job.dTag); process.exit(1) }
  const baseEv = evs.sort((a, b) => b.created_at - a.created_at)[0]

  // 2) Patch.
  let content = baseEv.content
  const applied = []
  if (job.content) {
    content = job.content; applied.push({ mode: 'full-replace', newLen: content.length })
  } else {
    for (const r of job.replacements || []) {
      const count = content.split(r.search).length - 1
      if (count !== 1) { console.error('FEHLER Patch: search ' + (count === 0 ? 'nicht gefunden' : count + '× gefunden (muss genau 1×)') + ': ' + JSON.stringify(r.search.slice(0, 80))); process.exit(1) }
      content = content.replace(r.search, r.replace)
      applied.push({ search: r.search.slice(0, 50), delta: r.replace.length - r.search.length })
    }
  }

  // 3) Gates (immer vor dem Signieren).
  const missing = (job.mustContain || []).filter(s => !content.includes(s))
  const forbidden = (job.mustNotContain || []).filter(s => content.toLowerCase().includes(s.toLowerCase()))
  const lenOk = content.length >= Math.min(500, baseEv.content.length * 0.6)
  const gate = { baseLen: baseEv.content.length, newLen: content.length, missing, forbidden, lenOk, baseId: baseEv.id.slice(0, 16) }
  if (missing.length || forbidden.length || !lenOk) {
    console.error('GATE FAIL: ' + JSON.stringify(gate, null, 2)); process.exit(1)
  }

  // 4) Tags kopieren, published_at=now, optionale Meta, client-Tag.
  const now = Math.floor(Date.now() / 1000)
  const setTag = (tags, name, value) => { const i = tags.findIndex(t => t[0] === name); if (i >= 0) tags[i] = [name, value]; else tags.push([name, value]) }
  const tags = baseEv.tags.map(t => [...t])
  setTag(tags, 'published_at', String(now))
  if (job.title) setTag(tags, 'title', job.title)
  if (job.summary) setTag(tags, 'summary', job.summary)
  if (job.image) setTag(tags, 'image', job.image)
  if (!tags.some(t => t[0] === 'client')) tags.push(['client', 'EINUNDZWANZIG HUB'])

  // 5) Preview (kein Signieren).
  if (!WANT_PUBLISH) {
    const reason = !job.publish ? 'job.publish=false' : '--go fehlt'
    console.log(JSON.stringify({
      ok: true, stage: 'preview', reason, dTag: job.dTag, gate, applied,
      previewHead: content.slice(0, 260), previewTail: content.slice(-260),
    }, null, 2))
    pool.close(relays); setTimeout(() => process.exit(0), 200); return
  }

  // 6) Signieren + publizieren (Backend-first wie die App, dann Relays).
  const signed = await signer.signEvent({ kind: 30023, created_at: now, tags, content })

  let backend = null
  try {
    const res = await fetch(BASE.replace(/\/+$/, '') + '/api/events', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(signed),
    })
    backend = { status: res.status, ok: res.ok }
  } catch (e) { backend = { ok: false, error: String(e && e.message || e) } }

  const sends = await Promise.allSettled(pool.publish(relays, signed))
  const accepted = []
  sends.forEach((s, i) => { if (s.status === 'fulfilled') accepted.push(relays[i]) })

  try {
    await fetch(BASE.replace(/\/+$/, '') + '/api/events/' + encodeURIComponent(signed.id) + '/relays', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ relays: accepted }),
    })
  } catch (e) { /* best-effort */ }

  // 7) Relay-Verifikation.
  await new Promise(r => setTimeout(r, 800))
  const verify = await pool.querySync((accepted.length ? accepted : relays).slice(0, 4), filter, { maxWait: 5000 })
  const verified = verify.some(e => e.id === signed.id)

  // Publish-Log der Session: Event-ID + Identifier festhalten (späterer Announce
  // muss dTag/eventId dann nicht erneut auf den Relays suchen).
  let naddr = null
  try { naddr = nip19.naddrEncode({ identifier: job.dTag, pubkey: baseEv.pubkey, kind: 30023, relays: relays.slice(0, 3) }) } catch (e) { /* best-effort */ }
  const url = siteSlug ? BASE.replace(/\/+$/, '') + '/s/' + encodeURIComponent(siteSlug) + '/' + encodeURIComponent(job.dTag) : null
  if (verified) recordPublish(sessionDir, {
    ts: now, type: 'article', kind: 30023,
    eventId: signed.id, naddr, dTag: job.dTag, site: siteSlug, url,
    title: job.title || (tags.find(t => t[0] === 'title') || [])[1] || null,
  })

  console.log(JSON.stringify({
    ok: verified, stage: verified ? 'published+verified' : 'published-unverified',
    eventId: signed.id, naddr, createdAt: now, gate, applied, backend,
    relaysAccepted: accepted, relaysFailed: sends.map((s, i) => s.status === 'rejected' ? relays[i] : null).filter(Boolean),
  }, null, 2))
  pool.close(relays)
  setTimeout(() => process.exit(verified ? 0 : 1), 200)
})()
