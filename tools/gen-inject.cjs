// Regenerate autobot/bridge/connect.inject.js from autobot/.env.
// Embeds NOSTR_BUNKER_URL + NOSTR_CLIENT_SK into a connect() call so the
// secrets stay file->file (never echoed to the chat). Run after changing .env:
//   node autobot/tools/gen-inject.cjs
const fs = require('fs')
const path = require('path')
const ROOT = path.join(__dirname, '..')
const env = fs.readFileSync(path.join(ROOT, '.env'), 'utf8')
const pick = (k) => {
  const m = env.match(new RegExp('^' + k + '=(.+)$', 'm'))
  return m && m[1].trim()
}
const url = pick('NOSTR_BUNKER_URL')
const sk = pick('NOSTR_CLIENT_SK')
if (!url) { console.error('NOSTR_BUNKER_URL missing in .env'); process.exit(1) }
const args = sk ? `${JSON.stringify(url)}, ${JSON.stringify(sk)}` : JSON.stringify(url)
fs.writeFileSync(path.join(ROOT, 'bridge', 'connect.inject.js'),
  `window.__autobot.connect(${args}).catch(function(){});\n`)
console.log('wrote autobot/bridge/connect.inject.js (' + (sk ? 'with persistent client key' : 'ephemeral key') + ')')
