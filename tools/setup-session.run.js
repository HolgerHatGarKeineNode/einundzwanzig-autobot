// Autobot — One-call Session-Bootstrap (Playwright MCP: browser_run_code).
//
// Stellt bei JEDEM Start deterministisch den vollständigen Zustand her, egal
// ob das Browser-Profil persistiert oder frisch ist:
//   1. seedet die Blossom-Server-Konfig in localStorage VOR dem App-Boot
//      (Server aus autobot.config.json — erster Eintrag ist Primary)
//   2. injiziert die NIP-46-Bridge + reconnect mit PERSISTENTEM Client-Key
//      (Amber fragt nach der ersten Freigabe nicht mehr → stiller Login)
//   3. mountet die Login-View neu (hasNostrExtension() läuft nur im setup())
//   4. klickt "Connect with Nostr" → Dashboard
//
// Aufruf:  browser_run_code  mit  filename = dieser Datei.
// Voraussetzung: NOSTR_BUNKER_URL + NOSTR_CLIENT_SK in .env, connect.inject.js
// aktuell (node autobot/tools/gen-inject.cjs). Secrets bleiben in Dateien (addScriptTag
// liest sie server-seitig) — nie im Tool-Aufruf.
async (page) => {
  // Projektroot finden: Claude-Session im Projektordner starten (cwd) oder AUTOBOT_DIR setzen.
  const fs = require('fs')
  const DIR = [process.env.AUTOBOT_DIR, process.cwd()].find(d => d && fs.existsSync(d + '/autobot.config.json'))
  if (!DIR) return { ok: false, stage: 'config', error: 'autobot.config.json nicht gefunden — Claude im Projektordner starten oder AUTOBOT_DIR setzen' }
  const CFG = JSON.parse(fs.readFileSync(DIR + '/autobot.config.json', 'utf8'))
  if (fs.existsSync(DIR + '/autobot.config.local.json')) Object.assign(CFG, JSON.parse(fs.readFileSync(DIR + '/autobot.config.local.json', 'utf8')))
  const BASE = CFG.baseUrl
  const BLOSSOM = CFG.blossomServers

  // 1) Settings VOR App-Boot seeden (idempotent, jede Session).
  await page.addInitScript((servers) => {
    try { localStorage.setItem('blossom-servers', JSON.stringify(servers)) } catch (e) { /* ignore */ }
  }, BLOSSOM)

  // 2) App laden (initScript greift), dann Bridge + connect injizieren.
  await page.goto(BASE)
  await page.addScriptTag({ path: DIR + '/bridge/bunker-bridge.iife.js' })
  await page.addScriptTag({ path: DIR + '/bridge/connect.inject.js' })

  // 3) Auf Signer warten (stiller Reconnect dank persistentem Key).
  let status = ''
  for (let i = 0; i < 120; i++) {
    await page.waitForTimeout(500)
    status = await page.evaluate(() => window.__autobot && window.__autobot.status)
    if (status === 'ready' || status === 'error' || status === 'auth-url') break
  }
  if (status !== 'ready') {
    const error = await page.evaluate(() => window.__autobot && window.__autobot.error)
    return { ok: false, stage: 'connect', status, error }
  }

  // 4) Login-View neu mounten (Route-Wechsel, kein Full-Reload → Signer bleibt).
  await page.evaluate(() => { location.hash = '#/u/remount-probe' })
  await page.waitForTimeout(1200)
  await page.evaluate(() => { location.hash = '#/login' })
  await page.waitForTimeout(1300)

  // 5) Einloggen.
  try {
    await page.getByRole('button', { name: 'Connect with Nostr' }).click({ timeout: 8000 })
  } catch (e) {
    return { ok: false, stage: 'login-click', status, error: String((e && e.message) || e) }
  }
  await page.waitForTimeout(1500)

  const url = page.url()
  const loggedInName = await page.evaluate(() =>
    (document.querySelector('a[href="#/dashboard/profile"]') || {}).textContent?.trim() || null)
  const blossomSeeded = await page.evaluate(() => {
    try { return JSON.parse(localStorage.getItem('blossom-servers') || '[]') } catch (e) { return [] }
  })
  return { ok: url.includes('/dashboard'), url, loggedInName, status, blossomSeeded }
}
