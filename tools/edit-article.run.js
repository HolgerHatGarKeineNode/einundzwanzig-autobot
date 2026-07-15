// Autobot — GENERISCHER Artikel-Editor (browser_run_code, filename).
// Wiederverwendbar & parametrisiert: Parameter kommen aus edit-job.inject.js
// (window.__editJob), erzeugt via `node autobot/tools/gen-edit-job.cjs --dtag … --spec …`.
//
// Ablauf: Edit-Route #/dashboard/editor/<dTag> (lädt publizierten Artikel ODER
// lokalen Draft mit diesem dTag) → Titel/Summary setzen → Milkdown-Inhalt
// KOMPLETT ersetzen → Checks (mustContain/mustNotContain/expectH2) →
// Save locally → optional Publish (kind 30023, gleicher d-Tag ⇒ Replace).
//
// ⚠️ job.publish=true ist eine LIVE-AKTION — nur mit ausdrücklicher Nutzer-
// Freigabe generieren. Ohne --publish endet der Lauf sicher beim lokalen Draft.
//
// GOTCHAS (gelernt):
// - ProseMirror hat eine EIGENE Selektion: programmatische DOM-Selektion greift
//   nicht. Ersetzen NUR via echtem Klick + Ctrl/Cmd+A, dann synthetischer Paste.
// - ignoreNextUpdate-RACE (ArticleEditor.vue): Im Edit-Modus kann der nachträg-
//   liche Artikel-Sync das Flag armieren — das ERSTE markdownUpdated nach dem
//   Paste wird geschluckt, content.value bleibt ALT, obwohl der DOM neu aussieht
//   (so wurde einmal alter Inhalt publiziert!). Darum nach dem Paste ein echter
//   Tipp-Nudge (Space+Backspace) UND Verifikation gegen den GESPEICHERTEN Draft
//   in localStorage — erst dann Publish.
// - window.nostr ist ein Laufzeit-Shim: nach Reload/Idle weg → vorher
//   setup-session.run.js ausführen. Dieser Runner prüft das und bricht sauber ab.
// - TAG-FELD: nur echte Tastatur erzeugt Chips (setNative + synthetisches keydown
//   NICHT). Placeholder wandert ("Add tag..." → "Add tag (or comma-separated
//   list)...") → Präfix-Selektor. Bricht das, meldet das Gate tagsOk:false und es
//   sieht wie ein Content-Fehler aus, ist aber ein Selektor-Bruch.
// - localStorage-Draft wird erst ~1s nach "Save locally" geschrieben → vorher
//   gelesen liefert den ALTEN Stand (Phantom-Fehler in der Verifikation).
// - Datei MUSS genau EIN `async (page) => {…}`-Ausdruck bleiben.
async (page) => {
  const fs = require('fs')
  const DIR = [process.env.AUTOBOT_DIR, process.cwd()].find(d => d && fs.existsSync(d + '/autobot.config.json'))
  if (!DIR) return { ok: false, stage: 'config', error: 'autobot.config.json nicht gefunden — Claude im Projektordner starten oder AUTOBOT_DIR setzen' }
  await page.addScriptTag({ path: DIR + '/tools/jobs/edit-job.inject.js' })

  const pre = await page.evaluate(() => ({
    job: !!window.__editJob, nostr: !!window.nostr,
    publish: window.__editJob && window.__editJob.publish,
  }))
  if (!pre.job) return { ok: false, stage: 'params', error: 'edit-job.inject.js fehlt — erst gen-edit-job.cjs ausführen' }
  if (pre.publish && !pre.nostr) return { ok: false, stage: 'signer', error: 'window.nostr fehlt — erst setup-session.run.js ausführen' }

  // 1) Edit-Route laden (SPA-Hashwechsel, kein Reload).
  await page.evaluate(() => { location.hash = '#/dashboard/editor/' + window.__editJob.dTag })
  await page.waitForTimeout(2200)

  // 2) Titel/Summary überschreiben (Vue-native Setter + input-Event).
  const fill = await page.evaluate(() => {
    const job = window.__editJob
    const setNative = (el, value) => {
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value)
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }
    const title = document.querySelector('input[placeholder="Enter article title..."]')
    const summary = document.querySelector('textarea[placeholder="Brief summary of your article..."]')
    const image = document.querySelector('input[placeholder="Featured Image"]')
    if (!title) return { ok: false, error: 'Editor nicht geladen (Titel-Feld fehlt)' }
    if (job.title) setNative(title, job.title)
    if (job.summary && summary) setNative(summary, job.summary)
    // PFLICHT: Bild + Tags IMMER mitsetzen — der Editor kann leer geladen sein
    // (Draft nach Publish gelöscht, articleStore-Miss) → sonst publiziert man
    // ohne Cover/Hashtags (genau so ist einmal das Featured Image verschwunden).
    if (job.image && image) setNative(image, job.image)
    return { ok: true, loadedTitle: title.value }
  })
  if (!fill.ok) return { ok: false, stage: 'load', ...fill }

  // 2b) Tags: NUR mit echter Tastatur — setNative + synthetisches keydown erzeugt
  // keine Chips (Juli 2026: Draft lief bis ans verify-draft-Gate, Tags leer).
  // Placeholder-Präfix statt exaktem Text: hieß erst "Add tag...", jetzt
  // "Add tag (or comma-separated list)..." — das Feld nimmt die Liste in einem Rutsch.
  const TAG_SEL = 'input[placeholder^="Add tag"]'
  const hashtags = await page.evaluate(() => window.__editJob.hashtags || [])
  if (hashtags.length) {
    if (!(await page.$(TAG_SEL))) return { ok: false, stage: 'tags', error: 'Tag-Feld nicht gefunden (Placeholder geändert?) — Selektor: ' + TAG_SEL }
    await page.click(TAG_SEL)
    await page.fill(TAG_SEL, hashtags.join(','))
    await page.waitForTimeout(200)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(500)
  }

  // 3) Inhalt ersetzen (echte Selektion, dann Paste).
  await page.click('.milkdown-editor .ProseMirror', { position: { x: 200, y: 100 } })
  await page.keyboard.press('ControlOrMeta+a')
  await page.waitForTimeout(300)
  await page.evaluate(() => {
    const pm = document.querySelector('.milkdown-editor .ProseMirror')
    const dt = new DataTransfer()
    dt.setData('text/plain', window.__editJob.content)
    pm.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
  })
  await page.waitForTimeout(2500)

  // 3b) Sync-Nudge: echte Tastatur-Transaktion, damit markdownUpdated sicher
  // emittiert (das Flag schluckt höchstens EIN Update — siehe GOTCHAS).
  await page.keyboard.press('End')
  await page.keyboard.type(' ')
  await page.keyboard.press('Backspace')
  await page.waitForTimeout(800)

  // 4) Checks.
  const check = await page.evaluate(() => {
    const job = window.__editJob
    const pm = document.querySelector('.milkdown-editor .ProseMirror')
    const text = pm.textContent
    const missing = (job.mustContain || []).filter(s => !text.includes(s))
    const forbidden = (job.mustNotContain || []).filter(s => text.toLowerCase().includes(s.toLowerCase()))
    const h2 = pm.querySelectorAll('h2').length
    return { len: text.length, h2, missing, forbidden, h2Ok: job.expectH2 == null || h2 === job.expectH2 }
  })
  if (check.missing.length || check.forbidden.length || !check.h2Ok || check.len < 500) {
    return { ok: false, stage: 'verify', check }
  }

  // 5) Save locally (immer — sichert den Stand unabhängig vom Publish).
  await page.getByRole('button', { name: 'Save Draft' }).click({ timeout: 8000 })
  await page.waitForTimeout(400)
  const saved = await page.evaluate(() => {
    const items = Array.from(document.querySelectorAll('button, [role="menuitem"], li, div'))
    const el = items.find(e => e.textContent.trim().startsWith('Save locally') && e.querySelectorAll('*').length < 8)
    if (!el) return { ok: false, error: 'Save-locally-Item nicht gefunden' }
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }))
    el.click()
    return { ok: true }
  })
  // Die App schreibt den Draft erst ~1s nach dem Klick in localStorage — früher
  // gelesen liefert 5b den ALTEN Stand (meldet dann z. B. tagsOk:false).
  await page.waitForTimeout(1800)

  // 5b) MASSGEBLICHE Verifikation: der GESPEICHERTE Draft (das ist der Stand,
  // den content.value hatte — also genau das, was Publish signieren würde).
  const draftCheck = await page.evaluate(() => {
    const job = window.__editJob
    const key = Object.keys(localStorage).find(k => k.startsWith('editor-drafts'))
    if (!key) return { ok: false, error: 'kein editor-drafts key' }
    const arr = JSON.parse(localStorage.getItem(key))
    const list = Array.isArray(arr) ? arr : Object.values(arr || {})
    const d = list.find(x => x.dTag === job.dTag)
    if (!d) return { ok: false, error: 'Draft mit dTag nicht gefunden' }
    const c = d.content || ''
    const missing = (job.mustContain || []).filter(s => !c.includes(s))
    const forbidden = (job.mustNotContain || []).filter(s => c.toLowerCase().includes(s.toLowerCase()))
    const imageOk = !job.image || d.image === job.image
    const tagsOk = !(job.hashtags || []).length || (job.hashtags || []).every(t => (d.tags || []).includes(t))
    return { ok: !missing.length && !forbidden.length && imageOk && tagsOk, len: c.length, missing, forbidden, imageOk, tagsOk, draftImage: (d.image || '').slice(0, 50), draftTags: d.tags }
  })
  if (!draftCheck.ok) return { ok: false, stage: 'verify-draft', draftCheck }

  // 6) Optional: LIVE-Publish (nur wenn der Job es ausdrücklich sagt).
  let published = null
  if (pre.publish) {
    await page.getByRole('button', { name: 'Publish', exact: true }).click({ timeout: 8000 })
    for (let i = 0; i < 40; i++) {
      await page.waitForTimeout(500)
      const busy = await page.evaluate(() => !!document.querySelector('[role="status"]'))
      if (!busy) break
    }
    await page.waitForTimeout(1500)
    // Indirekte Publish-Heuristik: finale Route + Signer-Präsenz; das App-Log wird nicht ausgelesen —
    // maßgeblich ist IMMER die anschließende Relay-Verifikation durch den Aufrufer.
    published = await page.evaluate(() => ({
      hash: location.hash,
      nostrStillThere: !!window.nostr,
    }))
  }

  return { ok: true, stage: published ? 'published' : 'draft-only', check, draftCheck, saved, published }
}
