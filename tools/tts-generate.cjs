// Autobot — Artikel-Vertonung via OpenRouter (Gemini TTS) → komprimiertes mobiles MP3.
//
//   node tools/tts-generate.cjs --in <article.md> --out <audio.mp3> [optionen]
//
// Optionen:
//   --in <pfad>        Markdown-Artikel (Pflicht, außer --text)
//   --text "<...>"     Direkter Text statt Datei (für schnelle Proben)
//   --out <pfad>       Ziel-MP3 (Pflicht)
//   --voice <name>     Stimme (Default: rex = ruhig, professionell, männlich — Grok)
//   --title "<...>"    Wird als erster Satz vorangestellt (Artikeltitel)
//   --model <id>       Default: x-ai/grok-voice-tts-1.0 (bis 15k Zeichen in EINEM Request →
//                      keine Stimmwechsel; Alternativen: google/gemini-3.1-flash-tts-preview
//                      [ausdrucksstark, aber Voice-Drift pro Request — Konsistenz-Gate nötig],
//                      microsoft/mai-voice-2 [Azure-Stimmen, z. B. de-DE-ConradNeural])
//   --sample [n]       Nur die ersten ~n Zeichen vertonen (Default 600) — für Hörproben
//   --bitrate <k>      MP3-Bitrate, Default 48k (mono, mobil-freundlich)
//   --pcm-rate <hz>    Sample-Rate der PCM-Antwort, Default 24000 (Gemini nativ)
//   --chunk <n>        Max. Zeichen pro API-Request (Default: 14000 bei Grok, sonst 2000)
//   --voice-retries <n> Max. Neuversuche pro Chunk bei abweichender Stimme (Default 5)
//   --ref-f0 <hz>      Erwartete Grundfrequenz der Stimme (pinnt Chunk 1; z. B. 125 für Algieba)
//   --ref-rate <s>     Erwartete Sekunden Audio pro Zeichen (pinnt das Tempo von Chunk 1; ~0.061 für Algieba)
//   --dry              Nur den aufbereiteten Vorlese-Text ausgeben (kein API-Call)
//
// Stimm-Konsistenz-Gate: Die Gemini-TTS-Preview-Modelle halten die gewählte Stimme
// nicht zuverlässig über mehrere Requests (dokumentierter Voice-Drift). Darum wird
// jeder Chunk akustisch gegen den ersten verglichen (Langzeitspektrum, Grundfrequenz,
// Sprechtempo) und bei Abweichung automatisch neu generiert.
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
const voice = get('--voice', 'rex')
const title = get('--title')
const model = get('--model', 'x-ai/grok-voice-tts-1.0')
const sampleFlag = has('--sample') ? (typeof get('--sample') === 'string' ? parseInt(get('--sample'), 10) : 600) : 0
const bitrate = get('--bitrate', '48k')
const pcmRate = parseInt(get('--pcm-rate', '24000'), 10)
// Grok schafft 15k Zeichen pro Request (→ Artikel in EINEM Take, keine Übergänge);
// Gemini liefert nur ~95–110 s Audio pro Request → kleine Chunks nötig.
const chunkMax = parseInt(get('--chunk', model.includes('grok') ? '14000' : '2000'), 10)
const voiceTries = parseInt(get('--voice-retries', '5'), 10)
const refF0Arg = parseFloat(get('--ref-f0', '0')) || 0
const refRateArg = parseFloat(get('--ref-rate', '0')) || 0 // erwartete Sekunden Audio pro Zeichen (z. B. 0.061 für Algieba)

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
    if (/^\s*>.*🎧/.test(raw)) continue // Hör-Boxen (AUDIO_EMBED) nicht mitvertonen
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

// ---- Stimm-Fingerprint (Langzeitspektrum + Grundfrequenz) für das Konsistenz-Gate ----
function fft(re, im) {
  const n = re.length
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) { const tr = re[i]; re[i] = re[j]; re[j] = tr; const ti = im[i]; im[i] = im[j]; im[j] = ti }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len
    const wr = Math.cos(ang), wi = Math.sin(ang)
    const half = len >> 1
    for (let i = 0; i < n; i += len) {
      let cwr = 1, cwi = 0
      for (let k = 0; k < half; k++) {
        const a = i + k, b = a + half
        const vr = re[b] * cwr - im[b] * cwi
        const vi = re[b] * cwi + im[b] * cwr
        re[b] = re[a] - vr; im[b] = im[a] - vi
        re[a] += vr; im[a] += vi
        const nwr = cwr * wr - cwi * wi; cwi = cwr * wi + cwi * wr; cwr = nwr
      }
    }
  }
}

function fingerprint(pcm) {
  const n = Math.floor(pcm.length / 2)
  const x = new Float32Array(n)
  let gsum = 0
  for (let i = 0; i < n; i++) { const v = pcm.readInt16LE(2 * i) / 32768; x[i] = v; gsum += v * v }
  const grms = Math.sqrt(gsum / n)
  const W = 1024, H = 512
  const hann = new Float32Array(W)
  for (let i = 0; i < W; i++) hann[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (W - 1))
  const spec = new Float64Array(W / 2)
  let frames = 0
  const re = new Float64Array(W), im = new Float64Array(W)
  for (let s = 0; s + W <= n; s += H) {
    let e = 0
    for (let i = 0; i < W; i++) e += x[s + i] * x[s + i]
    if (Math.sqrt(e / W) < 0.5 * grms) continue
    for (let i = 0; i < W; i++) { re[i] = x[s + i] * hann[i]; im[i] = 0 }
    fft(re, im)
    for (let k = 0; k < W / 2; k++) spec[k] += re[k] * re[k] + im[k] * im[k]
    frames++
  }
  const BANDS = 40, fLo = 100, fHi = 8000
  const bands = new Float64Array(BANDS)
  for (let b = 0; b < BANDS; b++) {
    const f0 = fLo * Math.pow(fHi / fLo, b / BANDS)
    const f1 = fLo * Math.pow(fHi / fLo, (b + 1) / BANDS)
    const k0 = Math.max(1, Math.floor(f0 * W / pcmRate)), k1 = Math.max(k0 + 1, Math.ceil(f1 * W / pcmRate))
    let acc = 0
    for (let k = k0; k < Math.min(k1, W / 2); k++) acc += spec[k]
    bands[b] = Math.log10(acc / Math.max(1, frames) / (k1 - k0) + 1e-12)
  }
  const mean = bands.reduce((a, c) => a + c, 0) / BANDS
  for (let b = 0; b < BANDS; b++) bands[b] -= mean
  const W2 = 2048, lagLo = Math.floor(pcmRate / 320), lagHi = Math.ceil(pcmRate / 70)
  const f0s = []
  for (let s = 0; s + W2 + lagHi <= n; s += W2) {
    let e = 0
    for (let i = 0; i < W2; i++) e += x[s + i] * x[s + i]
    if (Math.sqrt(e / W2) < 0.5 * grms) continue
    let bestLag = 0, bestV = 0
    for (let lag = lagLo; lag <= lagHi; lag++) {
      let num = 0, e2 = 0
      for (let i = 0; i < W2; i++) { num += x[s + i] * x[s + i + lag]; e2 += x[s + i + lag] * x[s + i + lag] }
      const v = num / Math.sqrt(e * e2 + 1e-12)
      if (v > bestV) { bestV = v; bestLag = lag }
    }
    if (bestV > 0.55 && bestLag) f0s.push(pcmRate / bestLag)
  }
  f0s.sort((a, b) => a - b)
  const f0 = f0s.length ? f0s[Math.floor(f0s.length / 2)] : 0
  return { bands, f0, activeSec: frames * H / pcmRate }
}

function cosSim(a, b) {
  let d = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i] }
  return d / Math.sqrt(na * nb)
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

  // Netzwerk-Retries pro Request (unabhängig vom Stimm-Gate)
  async function ttsChunkRetry(t) {
    let tries = 0
    while (true) {
      try { return await ttsChunk(t) }
      catch (e) {
        tries++
        if (tries >= 3) throw e
        process.stderr.write(`retry(${tries}) `)
        await new Promise(r => setTimeout(r, 1500 * tries))
      }
    }
  }

  const pcmParts = new Array(chunks.length)
  const gateForced = []     // Chunks, bei denen nach allen Versuchen die beste Annäherung blieb
  let gateRetries = 0

  function takeInfo(b, i) {
    const fp = fingerprint(b)
    fp.pcmSec = b.length / 2 / pcmRate
    // Sprechtempo = aktive Sprechzeit pro Zeichen (Pausen zählen nicht mit —
    // sonst wirken Chunks aus langen Absätzen fälschlich „schneller")
    fp.rate = fp.activeSec / chunks[i].length
    return fp
  }
  // Abschneide-Wächter: Gemini liefert max. ~95–110 s Audio pro Request —
  // zu wenig Audio pro Zeichen heißt, der Rest des Textes fehlt im Chunk.
  const truncated = (fp, i) => fp.pcmSec < chunks[i].length * 0.04

  async function genTake(i) {
    let b
    try { b = await ttsChunkRetry(chunks[i]) }
    catch (e) { console.error(`\nFEHLER Chunk ${i + 1}: ${e.message}`); process.exit(1) }
    return { b, fp: takeInfo(b, i) }
  }

  // ---- Runde 1: EIN Take pro Chunk, alle parallel ----
  process.stderr.write(`▶ Runde 1: ${chunks.length} Takes parallel …\n`)
  const takes = await Promise.all(chunks.map((_, i) => genTake(i)))

  // ---- Referenz = Medoid: der Take, der allen anderen am ähnlichsten ist ----
  // (--ref-f0/--ref-rate wirken nur noch als weiche Präferenz bei der Wahl)
  const pairScore = (a, c) => cosSim(a.bands, c.bands)
    - Math.abs(Math.log((a.f0 || 1) / (c.f0 || 1)))
    - 0.5 * Math.abs(Math.log(a.rate / c.rate))
  const valid = takes.map((t, i) => ({ ...t, i })).filter(t => !truncated(t.fp, t.i))
  if (!valid.length) { console.error('FEHLER: alle Takes der ersten Runde abgeschnitten'); process.exit(1) }
  let refTake = valid[0], refBest = -Infinity
  for (const cand of valid) {
    let s = 0
    for (const o of valid) if (o.i !== cand.i) s += pairScore(cand.fp, o.fp)
    if (refF0Arg && cand.fp.f0) s -= 0.5 * valid.length * Math.abs(Math.log(cand.fp.f0 / refF0Arg))
    if (refRateArg) s -= 0.5 * valid.length * Math.abs(Math.log((cand.fp.pcmSec / chunks[cand.i].length) / refRateArg))
    if (s > refBest) { refBest = s; refTake = cand }
  }
  const ref = refTake.fp
  process.stderr.write(`▶ Referenz = Chunk ${refTake.i + 1} (Medoid): F0 ${ref.f0.toFixed(0)} Hz, ${(ref.pcmSec / chunks[refTake.i].length * 1000).toFixed(0)} ms/Zeichen\n`)

  const judge = (fp) => {
    const cos = cosSim(ref.bands, fp.bands)
    const f0r = (fp.f0 && ref.f0) ? fp.f0 / ref.f0 : 1
    const rr = fp.rate / ref.rate
    return { cos, f0r, rr,
      pass: cos >= 0.985 && f0r >= 0.95 && f0r <= 1.055 && rr >= 0.88 && rr <= 1.14,
      score: cos - Math.abs(Math.log(f0r)) - 0.5 * Math.abs(Math.log(rr)) }
  }

  // ---- Runde 2+: nur Ausreißer nachwürfeln, parallel ----
  await Promise.all(chunks.map((text, i) => (async () => {
    let cur = takes[i], best = null
    for (let t = 1; ; t++) {
      const isTrunc = truncated(cur.fp, i)
      const v = isTrunc ? null : judge(cur.fp)
      if (i === refTake.i || (v && v.pass)) {
        if (v && i !== refTake.i) process.stderr.write(`[${i + 1}/${chunks.length}] ok nach ${t} Take(s) (F0 ×${v.f0r.toFixed(2)}, Spektrum ${v.cos.toFixed(3)}, Tempo ×${v.rr.toFixed(2)})\n`)
        pcmParts[i] = cur.b
        return
      }
      if (!isTrunc && (!best || v.score > best.score)) best = { b: cur.b, score: v.score }
      gateRetries++
      process.stderr.write(`[${i + 1}/${chunks.length}] Take ${t} ${isTrunc ? `abgeschnitten (${cur.fp.pcmSec.toFixed(0)}s für ${text.length} Zeichen)` : `weicht ab (F0 ×${v.f0r.toFixed(2)}, Spektrum ${v.cos.toFixed(3)}, Tempo ×${v.rr.toFixed(2)})`} → neu\n`)
      if (t >= voiceTries) {
        if (!best) best = { b: cur.b }
        gateForced.push(i + 1)
        process.stderr.write(`[${i + 1}/${chunks.length}] ⚠ keine passende Stimme in ${voiceTries} Takes — beste Annäherung übernommen\n`)
        pcmParts[i] = best.b
        return
      }
      cur = await genTake(i)
    }
  })()))
  gateForced.sort((a, b) => a - b)
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
    voiceGate: { refF0: +(ref && ref.f0 || 0).toFixed(1), retries: gateRetries, forced: gateForced },
  }
  console.log(JSON.stringify(report, null, 2))
})()
