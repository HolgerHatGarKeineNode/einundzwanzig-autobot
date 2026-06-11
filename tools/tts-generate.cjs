// Autobot — Artikel-Vertonung via OpenRouter (Gemini TTS) → komprimiertes mobiles MP3.
//
//   node tools/tts-generate.cjs --in <article.md> --out <audio.mp3> [optionen]
//
// Optionen:
//   --in <pfad>        Markdown-Artikel (Pflicht, außer --text)
//   --text "<...>"     Direkter Text statt Datei (für schnelle Proben)
//   --out <pfad>       Ziel-MP3 (Pflicht)
//   --voice <name>     Gemini-Stimme (Default: Charon = ruhig, professionell, männlich)
//   --title "<...>"    Wird als erster Satz vorangestellt (Artikeltitel)
//   --model <id>       Default: google/gemini-3.1-flash-tts-preview
//   --sample [n]       Nur die ersten ~n Zeichen vertonen (Default 600) — für Hörproben
//   --bitrate <k>      MP3-Bitrate, Default 48k (mono, mobil-freundlich)
//   --pcm-rate <hz>    Sample-Rate der PCM-Antwort, Default 24000 (Gemini nativ)
//   --chunk <n>        Max. Zeichen pro API-Request, Default 2000
//   --dry              Nur den aufbereiteten Vorlese-Text ausgeben (kein API-Call)
//
// Voraussetzung: OPENROUTER_API_KEY in .env. Braucht ffmpeg im PATH.
// Reines Node-Tool (kein Browser/MCP). Rückgabe: schreibt MP3 + druckt JSON-Report.
const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const ROOT = path.join(__dirname, '..')

// ---- .env laden (manuell, wie gen-inject.cjs — Secrets bleiben file->memory) ----
function loadEnv() {
  const p = path.join(ROOT, '.env')
  const out = {}
  if (!fs.existsSync(p)) return out
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !line.trim().startsWith('#')) out[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  return out
}

// ---- CLI ----
const args = process.argv.slice(2)
const get = (flag, def) => { const i = args.indexOf(flag); return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true) : def }
const has = (flag) => args.includes(flag)

const inFile = get('--in')
const rawText = get('--text')
const outFile = get('--out')
const voice = get('--voice', 'Charon')
const title = get('--title')
const model = get('--model', 'google/gemini-3.1-flash-tts-preview')
const sampleFlag = has('--sample') ? (typeof get('--sample') === 'string' ? parseInt(get('--sample'), 10) : 600) : 0
const bitrate = get('--bitrate', '48k')
const pcmRate = parseInt(get('--pcm-rate', '24000'), 10)
const chunkMax = parseInt(get('--chunk', '2000'), 10)

if ((!inFile && !rawText) || !outFile) {
  console.error('usage: node tools/tts-generate.cjs --in <article.md> --out <audio.mp3> [--voice Charon] [--sample] …')
  process.exit(1)
}

const env = loadEnv()
const apiKey = process.env.OPENROUTER_API_KEY || env.OPENROUTER_API_KEY
if (!apiKey) { console.error('OPENROUTER_API_KEY fehlt (.env)'); process.exit(1) }

// ---- Markdown → reiner Vorlese-Text ----
// Überschriften werden zu eigenständigen Sätzen mit Punkt (saubere Pause),
// Bilder/Links/Formatierung entfernt — nur der gesprochene Inhalt bleibt.
function mdToSpeech(md) {
  let t = md.replace(/^---\n[\s\S]*?\n---\n/, '')
  const blocks = []
  for (let raw of t.split('\n')) {
    if (/^!\[.*?\]\(.*?\)\s*$/.test(raw)) continue
    const h = raw.match(/^(#{1,6})\s+(.*)$/)
    if (h) { blocks.push(h[2].replace(/[*_`]/g, '').trim().replace(/[.:!?]?$/, '.')); continue }
    let line = raw
      .replace(/^\s*>\s?/, '')
      .replace(/^\s*[-*+]\s+/, '')
      .replace(/^\s*\d+\.\s+/, '')
      .replace(/!\[.*?\]\(.*?\)/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/__([^_]+)__/g, '$1')
      .replace(/_([^_]+)_/g, '$1')
      .replace(/^[-*_]{3,}\s*$/, '')
    blocks.push(line)
  }
  return blocks.join('\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

// ---- Text in Chunks an Absatz-/Satzgrenzen ----
function chunkText(text, max) {
  const paras = text.split(/\n{2,}/)
  const chunks = []
  let cur = ''
  const push = () => { if (cur.trim()) chunks.push(cur.trim()); cur = '' }
  for (const p of paras) {
    if ((cur + '\n\n' + p).length <= max) { cur = cur ? cur + '\n\n' + p : p; continue }
    push()
    if (p.length <= max) { cur = p; continue }
    // Absatz selbst zu lang → an Satzgrenzen splitten
    const sents = p.match(/[^.!?]+[.!?]+[\s]*|[^.!?]+$/g) || [p]
    for (const s of sents) {
      if ((cur + ' ' + s).length <= max) { cur = cur ? cur + ' ' + s : s }
      else { push(); cur = s }
    }
  }
  push()
  return chunks
}

// ---- OpenRouter TTS → PCM-Buffer ----
async function ttsChunk(text) {
  const res = await fetch('https://openrouter.ai/api/v1/audio/speech', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + apiKey,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://media.einundzwanzig.space',
      'X-Title': 'einundzwanzig-autobot',
    },
    body: JSON.stringify({ model, input: text, voice, response_format: 'pcm' }),
  })
  if (!res.ok) {
    const err = await res.text().catch(() => '')
    throw new Error(`HTTP ${res.status}: ${err.slice(0, 300)}`)
  }
  const ct = res.headers.get('content-type') || ''
  const buf = Buffer.from(await res.arrayBuffer())
  if (ct.includes('application/json')) {
    throw new Error('JSON statt Audio: ' + buf.toString('utf8').slice(0, 300))
  }
  return buf
}

(async () => {
  let text = rawText === true ? '' : (rawText || mdToSpeech(fs.readFileSync(inFile, 'utf8')))
  if (title) text = String(title).replace(/[.:!?]?$/, '.') + '\n\n' + text
  if (sampleFlag) {
    // an der letzten Satzgrenze vor n abschneiden (saubere Probe)
    const cut = text.slice(0, sampleFlag)
    text = (cut.match(/[\s\S]*[.!?]/) || [cut])[0].trim()
  }
  if (!text.trim()) { console.error('Leerer Text nach Aufbereitung.'); process.exit(1) }

  if (has('--dry')) {
    process.stdout.write(text + '\n')
    console.error(`\n--- ${text.length} Zeichen, ${chunkText(text, chunkMax).length} Chunk(s) (kein API-Call) ---`)
    return
  }

  const chunks = chunkText(text, chunkMax)
  console.error(`▶ ${chunks.length} Chunk(s), Stimme "${voice}", Modell ${model}${sampleFlag ? ' (PROBE)' : ''}`)

  const pcmParts = []
  for (let i = 0; i < chunks.length; i++) {
    process.stderr.write(`  [${i + 1}/${chunks.length}] ${chunks[i].length} Zeichen … `)
    let tries = 0
    while (true) {
      try { const b = await ttsChunk(chunks[i]); pcmParts.push(b); process.stderr.write(`ok (${(b.length / 1024 / 1024).toFixed(2)} MB pcm)\n`); break }
      catch (e) {
        tries++
        if (tries >= 3) { console.error(`\nFEHLER Chunk ${i + 1}: ${e.message}`); process.exit(1) }
        process.stderr.write(`retry(${tries}) `)
        await new Promise(r => setTimeout(r, 1500 * tries))
      }
    }
  }
  const pcm = Buffer.concat(pcmParts)

  // ---- ffmpeg: rohes s16le mono PCM → komprimiertes mobiles MP3 + Loudness-Normalisierung ----
  fs.mkdirSync(path.dirname(path.resolve(outFile)), { recursive: true })
  const ff = spawnSync('ffmpeg', [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-f', 's16le', '-ar', String(pcmRate), '-ac', '1', '-i', 'pipe:0',
    '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11',
    '-c:a', 'libmp3lame', '-b:a', bitrate, '-ac', '1',
    path.resolve(outFile),
  ], { input: pcm, maxBuffer: 1024 * 1024 * 512 })
  if (ff.status !== 0) { console.error('ffmpeg-Fehler:\n' + (ff.stderr || '').toString()); process.exit(1) }

  // ---- Report ----
  const stat = fs.statSync(outFile)
  const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', path.resolve(outFile)])
  const dur = parseFloat((probe.stdout || '').toString().trim()) || 0
  const report = {
    ok: true, out: outFile, voice, model,
    chars: text.length, chunks: chunks.length,
    seconds: Math.round(dur), minutes: +(dur / 60).toFixed(1),
    sizeMB: +(stat.size / 1024 / 1024).toFixed(2), bitrate,
  }
  console.log(JSON.stringify(report, null, 2))
})()
