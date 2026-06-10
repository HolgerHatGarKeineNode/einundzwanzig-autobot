// Autobot — SCHNELLER Artikel-Text-Update (browser_run_code, filename).
// Patcht das Live-Event (kind 30023) DIREKT: Relay-Fetch → String-Patch →
// Gates → signEvent(window.nostr) → Backend-POST (/api/events, same-origin)
// + Relay-Broadcast → Relay-Verifikation. ALLES IN EINEM LAUF — kein Editor,
// keine ProseMirror-/ignoreNextUpdate-Gotchas, kein separater Dry-Run-Lauf
// (die Gates laufen hier zwingend VOR dem Signieren; publish=false = Preview).
//
// Event-Nachbau ist verifiziert gegen standup: eventBuilder.article()
// (d/title/summary/image/published_at/t*/p-author/client-Tag, published_at=now
// bei jedem Publish — App-Verhalten) und draftService.publish() (Backend-first,
// dann Relays, reportRelayStatus). Tags werden vom Live-Event KOPIERT, damit
// auch Tags überleben, die dieses Tool nicht modelliert.
//
// Parameter: tools/jobs/quick-edit-job.inject.js (gen-quick-edit-job.cjs).
// Voraussetzung bei --publish: Signer (setup-session.run.js) — der Runner
// injiziert die Bridge selbst nach, wenn window.nostr fehlt.
// ⚠️ job.publish=true ist eine LIVE-AKTION — nur mit ausdrücklicher Freigabe.
async (page) => {
  const fs = require('fs')
  const DIR = [process.env.AUTOBOT_DIR, process.cwd()].find(d => d && fs.existsSync(d + '/autobot.config.json'))
  if (!DIR) return { ok: false, stage: 'config', error: 'autobot.config.json nicht gefunden — Claude im Projektordner starten oder AUTOBOT_DIR setzen' }
  const CFG = JSON.parse(fs.readFileSync(DIR + '/autobot.config.json', 'utf8'))
  if (fs.existsSync(DIR + '/autobot.config.local.json')) Object.assign(CFG, JSON.parse(fs.readFileSync(DIR + '/autobot.config.local.json', 'utf8')))
  const BASE = CFG.baseUrl

  // 0) Auf der Plattform-Origin sein (same-origin API + Relay-CSP). Die App
  // selbst wird nicht gebraucht — DOM-Ready genügt für fetch/WebSocket.
  if (!page.url().startsWith(BASE)) {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  }
  await page.addScriptTag({ path: DIR + '/tools/jobs/quick-edit-job.inject.js' })

  // 1) Signer sicherstellen (nur für publish nötig) — Bridge ggf. nachinjizieren.
  const job = await page.evaluate(() => window.__quickEditJob)
  if (!job) return { ok: false, stage: 'params', error: 'quick-edit-job.inject.js fehlt — erst gen-quick-edit-job.cjs' }
  if (job.publish) {
    const hasNostr = await page.evaluate(() => !!window.nostr)
    if (!hasNostr) {
      await page.addScriptTag({ path: DIR + '/bridge/bunker-bridge.iife.js' })
      await page.addScriptTag({ path: DIR + '/bridge/connect.inject.js' })
      let status = ''
      for (let i = 0; i < 120; i++) {
        await page.waitForTimeout(500)
        status = await page.evaluate(() => window.__autobot && window.__autobot.status)
        if (status === 'ready' || status === 'error' || status === 'auth-url') break
      }
      if (status !== 'ready') return { ok: false, stage: 'signer', status, error: 'Bridge nicht ready' }
    }
  }

  // 2) Alles Weitere im Seitenkontext (WebSocket + fetch + window.nostr).
  return await page.evaluate(async (job) => {
    const RELAYS = job.relays

    // Lebende Relays liefern EOSE in <1s; der Timeout begrenzt nur, wie lange
    // tote Relays den Promise.all-Lauf aufhalten dürfen.
    const relayReq = (url, filter, timeoutMs) => new Promise((resolve) => {
      const events = []
      let ws
      const done = () => { try { ws && ws.close() } catch (e) {} resolve(events) }
      const timer = setTimeout(done, timeoutMs || 3500)
      try { ws = new WebSocket(url) } catch (e) { clearTimeout(timer); return resolve(events) }
      ws.onopen = () => ws.send(JSON.stringify(['REQ', 'qe', filter]))
      ws.onmessage = (m) => {
        try {
          const d = JSON.parse(m.data)
          if (d[0] === 'EVENT') events.push(d[2])
          if (d[0] === 'EOSE') { clearTimeout(timer); done() }
        } catch (e) {}
      }
      ws.onerror = () => { clearTimeout(timer); done() }
    })

    const relaySend = (url, signed) => new Promise((resolve) => {
      let ws
      const done = (ok, msg) => { try { ws && ws.close() } catch (e) {} resolve({ url, ok, msg }) }
      const timer = setTimeout(() => done(false, 'timeout'), 7000)
      try { ws = new WebSocket(url) } catch (e) { clearTimeout(timer); return resolve({ url, ok: false, msg: String(e) }) }
      ws.onopen = () => ws.send(JSON.stringify(['EVENT', signed]))
      ws.onmessage = (m) => {
        try {
          const d = JSON.parse(m.data)
          if (d[0] === 'OK' && d[1] === signed.id) { clearTimeout(timer); done(!!d[2], d[3] || '') }
        } catch (e) {}
      }
      ws.onerror = () => { clearTimeout(timer); done(false, 'ws-error') }
    })

    // 2a) Aktuelles Live-Event holen (neuestes über alle Relays).
    const filter = { kinds: [30023], '#d': [job.dTag], limit: 2 }
    const batches = await Promise.all(RELAYS.slice(0, 6).map(u => relayReq(u, filter)))
    const all = batches.flat()
    if (!all.length) return { ok: false, stage: 'fetch', error: 'kein Live-Event für dTag gefunden', dTag: job.dTag }
    const base = all.sort((a, b) => b.created_at - a.created_at)[0]

    // 2b) Patchen.
    let content = base.content
    const applied = []
    if (job.content) {
      content = job.content
      applied.push({ mode: 'full-replace', newLen: content.length })
    } else {
      for (const r of job.replacements) {
        const count = content.split(r.search).length - 1
        if (count !== 1) return { ok: false, stage: 'patch', error: 'search-String ' + (count === 0 ? 'nicht gefunden' : count + '× gefunden (muss genau 1× sein)'), search: r.search.slice(0, 80) }
        content = content.replace(r.search, r.replace)
        applied.push({ search: r.search.slice(0, 60), delta: r.replace.length - r.search.length })
      }
    }

    // 2c) Gates — laufen IMMER vor dem Signieren (integrierter Dry-Run).
    const missing = (job.mustContain || []).filter(s => !content.includes(s))
    const forbidden = (job.mustNotContain || []).filter(s => content.toLowerCase().includes(s.toLowerCase()))
    // Schrumpf-Schutz (kaputter Patch/leeres Event): mind. 60 % der alten Länge;
    // die 500er-Untergrenze hält das Gate für sehr kurze Artikel passierbar.
    const lenOk = content.length >= Math.min(500, base.content.length * 0.6)
    const gate = { baseLen: base.content.length, newLen: content.length, missing, forbidden, lenOk, baseCreatedAt: base.created_at, baseId: base.id.slice(0, 16) }
    if (missing.length || forbidden.length || !lenOk) return { ok: false, stage: 'gates', gate, applied }

    // 2d) Tags vom Live-Event kopieren; title/summary/image optional ersetzen,
    // published_at = now (App-Verhalten bei jedem Publish).
    const now = Math.floor(Date.now() / 1000)
    const setTag = (tags, name, value) => {
      const i = tags.findIndex(t => t[0] === name)
      if (i >= 0) tags[i] = [name, value]; else tags.push([name, value])
    }
    const tags = base.tags.map(t => [...t])
    setTag(tags, 'published_at', String(now))
    if (job.title) setTag(tags, 'title', job.title)
    if (job.summary) setTag(tags, 'summary', job.summary)
    if (job.image) setTag(tags, 'image', job.image)
    if (!tags.some(t => t[0] === 'client')) tags.push(['client', 'EINUNDZWANZIG HUB'])

    if (!job.publish) {
      return { ok: true, stage: 'preview', gate, applied, preview: content.slice(0, 300), tags }
    }

    // 2e) Signieren + publizieren (Backend-first wie die App, dann Relays).
    if (!window.nostr) return { ok: false, stage: 'signer', error: 'window.nostr fehlt' }
    const signed = await window.nostr.signEvent({ kind: 30023, created_at: now, tags, content })

    let backend = null
    try {
      const res = await fetch('/api/events', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(signed),
      })
      backend = { status: res.status, ok: res.ok }
    } catch (e) { backend = { ok: false, error: String(e) } }

    // Broadcast an ALLE Relays (maximale Verbreitung); der Fetch oben braucht
    // dagegen nur genug Relays, um das neueste Event sicher zu erwischen.
    const sends = await Promise.all(RELAYS.map(u => relaySend(u, signed)))
    const accepted = sends.filter(s => s.ok).map(s => s.url)
    if (!backend.ok && !accepted.length) return { ok: false, stage: 'publish', backend, sends }

    try {
      await fetch('/api/events/' + encodeURIComponent(signed.id) + '/relays', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ relays: accepted }),
      })
    } catch (e) { /* Status-Report ist best-effort */ }

    // 2f) Relay-Verifikation: frisches Event mit unserer id muss abrufbar sein.
    // Akzeptierende Relays haben per OK bestätigt — kurze Pause genügt.
    await new Promise(r => setTimeout(r, 500))
    const verifyBatches = await Promise.all((accepted.length ? accepted : RELAYS).slice(0, 4).map(u => relayReq(u, filter)))
    const verified = verifyBatches.flat().some(e => e.id === signed.id)

    return {
      ok: verified, stage: verified ? 'published+verified' : 'published-unverified',
      eventId: signed.id, createdAt: now, gate, applied, backend,
      relaysAccepted: accepted, relaysFailed: sends.filter(s => !s.ok).map(s => s.url + ':' + s.msg),
    }
  }, job)
}
