// Autobot — HEADLESS Blossom uploader (Playwright MCP: browser_run_code, filename).
//
// PARAMETRISIERT: Dateiliste + Server kommen aus tools/jobs/upload-job.inject.js
// (window.__uploadJob), erzeugt via `node autobot/tools/gen-upload-job.cjs --files …`.
//
// Lädt lokale Dateien aus JEDER Seite nach Blossom hoch — kein Navigieren zu
// /dashboard/media. Spiegelt den BUD-02-Flow der App (kind-24242-Auth via
// window.nostr, PUT <server>/upload). Datei-Bytes kommen über ein temporäres
// verstecktes <input type=file> + page.setInputFiles in die Seite.
// Voraussetzung: eingeloggte Session (tools/setup-session.run.js).
// Rückgabe: [{ file, ok, url, hash, size, status?, error? }].
// NOTE: Datei MUSS genau EIN `async (page) => {...}`-Ausdruck bleiben.
async (page) => {
  await page.addScriptTag({ path: '/home/user/Code/einundzwanzig-autobot/tools/jobs/upload-job.inject.js' })
  const job = await page.evaluate(() => window.__uploadJob)
  if (!job || !job.files || !job.files.length) return { ok: false, stage: 'params', error: 'upload-job.inject.js fehlt/leer — erst gen-upload-job.cjs ausführen' }
  const hasSigner = await page.evaluate(() => !!window.nostr)
  if (!hasSigner) return { ok: false, stage: 'signer', error: 'window.nostr fehlt — erst tools/setup-session.run.js ausführen' }

  await page.evaluate(() => {
    let i = document.getElementById('__autobot_file')
    if (!i) {
      i = document.createElement('input')
      i.type = 'file'; i.id = '__autobot_file'; i.style.display = 'none'
      document.body.appendChild(i)
    }
  })

  const results = []
  for (const path of job.files) {
    await page.setInputFiles('#__autobot_file', path)
    const r = await page.evaluate(async (server) => {
      const file = document.getElementById('__autobot_file').files[0]
      if (!file) return { ok: false, error: 'input had no file' }
      const buf = await file.arrayBuffer()
      const digest = await crypto.subtle.digest('SHA-256', buf)
      const hash = Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('')
      const now = Math.floor(Date.now() / 1000)
      const evt = {
        kind: 24242, created_at: now,
        tags: [['t', 'upload'], ['expiration', String(now + 300)], ['x', hash], ['server', server]],
        content: 'Authorize upload',
      }
      const signed = await window.nostr.signEvent(evt)
      const auth = 'Nostr ' + btoa(JSON.stringify(signed))
      let res
      try {
        res = await fetch(server + '/upload', { method: 'PUT', headers: { Authorization: auth }, body: file })
      } catch (e) { return { ok: false, error: 'fetch failed: ' + (e && e.message) } }
      if (!res.ok) return { ok: false, status: res.status, error: (await res.text().catch(() => '')).slice(0, 200) }
      const blob = await res.json().catch(() => null)
      if (!blob || !blob.url) return { ok: false, error: 'no url in response' }
      return { ok: true, url: blob.url, hash, size: file.size, type: blob.type }
    }, job.server)
    results.push({ file: path.split('/').pop(), ...r })
  }
  await page.evaluate(() => { document.getElementById('__autobot_file')?.remove() })
  return results
}
