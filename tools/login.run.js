// Autobot login driver — invoked via Playwright MCP browser_run_code (Node side).
// Reads the bunker URL from .env (keeps the secret out of the chat/tool args),
// injects the bunker→window.nostr bridge, and fires the NIP-46 connect.
// Returns immediately after the connect request is published — the actual
// Amber approval happens on the user's device and is polled separately.
async (page) => {
  const fs = require('fs')
  const ENV = '/home/user/Code/einundzwanzig-autobot/.env'
  const BRIDGE = '/home/user/Code/einundzwanzig-autobot/bridge/bunker-bridge.iife.js'

  const env = fs.readFileSync(ENV, 'utf8')
  const m = env.match(/^NOSTR_BUNKER_URL=(.+)$/m)
  if (!m || !m[1].trim()) throw new Error('NOSTR_BUNKER_URL missing in autobot/.env')
  const bunkerUrl = m[1].trim()

  // Inject the self-contained bridge (CSP allows inline scripts).
  await page.addScriptTag({ path: BRIDGE })
  const injected = await page.evaluate(() => typeof window.__autobot?.connect === 'function')
  if (!injected) throw new Error('bridge did not initialise window.__autobot')

  // Fire-and-forget: this publishes the NIP-46 connect request to the
  // bunker relays, which makes Amber prompt the user. Do NOT await the
  // approval here — it is polled via window.__autobot.status.
  await page.evaluate((u) => { window.__autobot.connect(u).catch(() => {}) }, bunkerUrl)
  await page.waitForTimeout(1000)

  return await page.evaluate(() => ({
    status: window.__autobot.status,
    error: window.__autobot.error,
    authUrl: window.__autobot.authUrl,
  }))
}
