// Autobot — NIP-46 (Amber bunker://) → window.nostr (NIP-07) bridge.
//
// Built to a self-contained IIFE (esbuild) and injected into the live
// media.einundzwanzig.space page. The page CSP allows `connect-src wss:`
// and `script-src 'unsafe-inline'`, so this inline bundle may open the
// bunker relays directly and run without an external import.
//
// Flow:
//   window.__autobot.connect(bunkerUrl)
//     → parse bunker:// (pubkey + relays + secret)
//     → BunkerSigner.fromBunker(ephemeralKey, bp)
//     → signer.connect()        ← AMBER PROMPTS THE USER HERE
//     → install window.nostr (NIP-07) backed by the remote signer
//
// Status is mirrored on window.__autobot.status for polling from the
// driver (browser_evaluate), because the connect() await can block for
// as long as the user takes to approve in Amber.

import { SimplePool, generateSecretKey } from 'nostr-tools'
import { BunkerSigner, parseBunkerInput } from 'nostr-tools/nip46'

const A = (window.__autobot = window.__autobot || {})
A.status = 'idle'      // idle | parsing | awaiting-approval | auth-url | ready | error
A.pubkey = null
A.error = null
A.authUrl = null       // set if Amber returns a NIP-46 auth_url instead of an in-app prompt

function hexToBytes(hex) {
  const clean = String(hex || '').trim()
  const out = new Uint8Array(clean.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.substr(i * 2, 2), 16)
  return out
}

// connect(bunkerUrl, clientSkHex?)
//   clientSkHex — a PERSISTENT client secret key (hex). Passing the same key
//   across sessions makes Amber recognise the bot after the first approval,
//   so closing/reopening the browser does not require a fresh bunker URL.
//   If omitted, an ephemeral key is used (single session only).
A.connect = async function connect(bunkerUrl, clientSkHex) {
  try {
    A.status = 'parsing'
    A.error = null
    A.authUrl = null

    const bp = await parseBunkerInput(bunkerUrl)
    if (!bp) throw new Error('parseBunkerInput returned null — invalid bunker:// URL')

    const localSk = clientSkHex ? hexToBytes(clientSkHex) : generateSecretKey()
    const pool = new SimplePool()
    const signer = BunkerSigner.fromBunker(localSk, bp, {
      pool,
      // If Amber asks the user to approve via a web auth_url instead of an
      // in-app push, surface it so the driver can show it to the user.
      onauth: (url) => { A.authUrl = url; A.status = 'auth-url' },
    })
    A._signer = signer

    // From here a NIP-46 `connect` request is published to the bunker
    // relays; Amber shows the approval prompt on the user's device.
    A.status = 'awaiting-approval'
    await signer.connect()

    const pubkey = await signer.getPublicKey()
    A.pubkey = pubkey

    // Install a NIP-07 provider the app can detect via hasNostrExtension().
    window.nostr = {
      _autobot: true,
      getPublicKey: () => signer.getPublicKey(),
      signEvent: (event) => signer.signEvent(event),
      getRelays: async () => ({}),
      nip04: {
        encrypt: (pk, pt) => signer.nip04Encrypt(pk, pt),
        decrypt: (pk, ct) => signer.nip04Decrypt(pk, ct),
      },
      nip44: {
        encrypt: (pk, pt) => signer.nip44Encrypt(pk, pt),
        decrypt: (pk, ct) => signer.nip44Decrypt(pk, ct),
      },
    }

    A.status = 'ready'
    return pubkey
  } catch (err) {
    A.error = String((err && err.message) || err)
    A.status = 'error'
    throw err
  }
}
