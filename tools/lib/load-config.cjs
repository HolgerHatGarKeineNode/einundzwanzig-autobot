// autobot.config.json laden + autobot.config.local.json (gitignored, optional)
// drüber-mergen. Shallow: ein lokaler Schlüssel ersetzt den Basis-Schlüssel als
// GANZES (auch verschachtelte wie "relays"). Nur für tools/*.cjs — die
// tools/*.run.js bleiben per Design self-contained und inlinen das Muster.
const fs = require('fs')
const path = require('path')

module.exports = (rootDir) => {
  const cfg = JSON.parse(fs.readFileSync(path.join(rootDir, 'autobot.config.json'), 'utf8'))
  const local = path.join(rootDir, 'autobot.config.local.json')
  if (fs.existsSync(local)) Object.assign(cfg, JSON.parse(fs.readFileSync(local, 'utf8')))
  return cfg
}
