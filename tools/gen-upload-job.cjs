// Autobot — Generator für tools/jobs/upload-job.inject.js (Parameter für blossom-upload.run.js).
//
//   node autobot/tools/gen-upload-job.cjs --files <pfad[,pfad…]> [--server <url>]
//
// Ein Pfad darf auch ein ORDNER sein → alle *.png/*.jpg/*.jpeg/*.webp darin (sortiert).
// Danach: browser_run_code filename=autobot/tools/blossom-upload.run.js
const fs = require('fs')
const path = require('path')

const args = process.argv.slice(2)
const get = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined }
const filesArg = get('--files')
if (!filesArg) { console.error('usage: gen-upload-job.cjs --files <pfad[,pfad…]> [--server url]'); process.exit(1) }

const IMG = /\.(png|jpe?g|webp)$/i
const files = filesArg.split(',').map(s => s.trim()).filter(Boolean).flatMap((p) => {
  const abs = path.resolve(p)
  if (fs.statSync(abs).isDirectory()) {
    return fs.readdirSync(abs).filter(f => IMG.test(f)).sort().map(f => path.join(abs, f))
  }
  return [abs]
})
if (!files.length) { console.error('keine Dateien gefunden'); process.exit(1) }

const cfg = require('./lib/load-config.cjs')(path.join(__dirname, '..'))
const job = { files, server: get('--server') || cfg.blossomServers[0] }
const out = path.join(__dirname, 'jobs', 'upload-job.inject.js')
fs.writeFileSync(out, 'window.__uploadJob = ' + JSON.stringify(job) + ';\n')
console.log('wrote', out, '—', files.length, 'Dateien →', job.server)
files.forEach(f => console.log('  ', path.basename(f)))
