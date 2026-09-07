# QRMesh Advanced

Offline peer-to-peer optical data transfer, browser-to-browser. One device
streams data as an animated sequence of QR codes; the other reads it back
with a camera. No internet, Wi-Fi, Bluetooth, mobile data, server, or
account is ever involved — the entire transfer happens through light and
glass.

```
Phone A (sender)                          Phone B (receiver)
     │                                            │
     ▼                                            │
Compress → Encrypt (optional) → Packetize         │
     │                                            │
     ▼                                            │
Animated QR stream on screen  ──────────────▶  Camera scans frames
                                                    │
                                                    ▼
                                     Collect packets, dedupe, recover
                                     missing packets via FEC parity
                                                    │
                                                    ▼
                                     Reassemble → Decrypt → Decompress
                                                    │
                                                    ▼
                                     SHA-256 checksum verification
                                                    │
                                                    ▼
                                          Original file, verified
```

This is a rebuild of an earlier QRMesh prototype, redesigned around a real
transfer protocol (session IDs, per-packet CRC32, whole-file SHA-256,
XOR-parity forward error correction) instead of the original's bare
`index|total|type|data` format, plus adaptive image/audio compression,
optional AES-256-GCM encryption, and a mobile-first UI.

---

## Running it

Requires Node 18+.

```bash
npm install
npm run dev       # start the dev server
npm run build     # production build, output in dist/
npm run preview   # preview the production build locally
npm run test      # run the protocol test suite (vitest)
```

The dev server prints a local network URL (e.g. `http://192.168.x.x:5173`)
— open that on your phone (same Wi-Fi network, used only to *load the app*,
not for the transfer itself) to test sender/receiver on two real devices.
Camera access requires HTTPS or `localhost`; the network URL Vite prints
in dev mode is treated as a secure context on Chrome/Android automatically.

---

## How the transfer protocol works

### Session isolation

Every transfer generates a random 5-character session ID
(`QRMesh-7F92A`). The receiver locks onto the session ID of the very first
packet it decodes and silently ignores any packet carrying a different
session ID — so two nearby transfers never get mixed together.

### Wire format

Packets are pipe-delimited, not JSON. JSON's quoted keys
(`{"sessionId":"...","packetIndex":...}`) waste dozens of bytes per frame
that could otherwise go toward bigger data chunks (fewer frames = a faster
transfer). Every field is positional; payload bytes are base64url-encoded,
which never contains `|`, so nothing needs escaping.

```
Data / parity packet:
Q1|<sessionId>|<kind>|<D|P>|<index>|<total>|<groupSize>|<compression>|<encryption>|<crc32>|<base64url data>

Manifest packet (re-broadcast periodically):
Q1|<sessionId>|M|<base64url JSON manifest>|<crc32>
```

The manifest carries file name, MIME type, original/processed size, total
packet count, compression/encryption flags, and the SHA-256 of the
processed payload. It's re-sent every N frames so a scanner that joins
mid-stream can still learn what it's receiving.

### Integrity verification

1. **Per-packet**: each packet carries a CRC32 of its own data chunk. A
   packet that fails its CRC (a bad scan, motion blur, glare) is dropped
   silently rather than corrupting the reassembled file.
2. **Whole-file**: before transmission, SHA-256 is computed over the fully
   processed (compressed + encrypted) payload and stored in the manifest.
   After reassembly, the receiver recomputes SHA-256 over the same bytes
   and compares. The app will never claim "Transfer complete" without
   showing whether this check passed — a mismatch is shown as
   **"Integrity Failed"**, not hidden.

### Forward error correction

Data chunks are grouped (8 per group) and one XOR parity chunk is
generated per group: `parity = chunk0 ⊕ chunk1 ⊕ ... ⊕ chunk7`. If a
receiver is missing exactly one chunk from a group but has the rest plus
that group's parity chunk, it recovers the missing chunk by XOR-ing
everything else together — no rescan needed.

This is a deliberately simple scheme (not a full Raptor/LT fountain
code — that's a lot of math for marginal gain in a browser optical link)
but it captures the same idea: a single missed frame doesn't require
waiting for that *exact* frame to loop back around.

**Known limitation**: because this is a one-way optical link (screen →
camera, no return channel), the sender has no way to know which packets a
given receiver is actually missing. The scheduler compensates by cycling
every data and parity packet with equal frequency, plus rebroadcasting the
manifest often, rather than attempting true "prioritize likely-missing
packets" (which needs a feedback channel this app deliberately doesn't
have — reintroducing Wi-Fi/Bluetooth would defeat the point).

---

## Feature overview

- **Send**: file upload, drag-and-drop, or typed text; Reliable / Balanced
  / Fast presets (QR error-correction level, density, and FPS); live size
  and time estimate before you commit; pause/resume/stop during
  transmission.
- **Receive**: rear-camera-first with a camera switch button, live
  packet/duplicate/missing/recovered counters, automatic reconstruction
  and verification, and format-appropriate output (text with copy/share,
  image preview, audio player, file download).
- **Image processing**: adaptive canvas resize + JPEG quality, entirely
  in-browser (Maximum / Balanced / Fast presets) — not a fixed 150×150
  thumbnail regardless of source size.
- **Audio processing**: resample + mono-convert to WAV via
  `OfflineAudioContext` (Original / Compressed / Voice presets).
- **Optional encryption**: AES-256-GCM via the native Web Crypto API
  (`crypto.subtle`), key derived from a password with PBKDF2
  (250,000 iterations). No custom cryptography. The password is shared
  out-of-band (spoken, typed) — it is never part of the QR payload.
- **Transfer history**: stored locally in IndexedDB (file name, kind,
  size, direction, status, timestamp only — not the file contents).
- **Multi-QR (2×2 grid) mode**: the "Fast" preset shows four QR codes at
  once, each carrying a different packet, for higher throughput on larger
  screens and better cameras.

---

## Architecture

```
src/
  app/                     (reserved for app-level routing/providers)
  components/              UI screens and shared primitives
  features/
    transfer/
      sender/              SenderEngine, PacketScheduler, FileProcessor
      receiver/             ReceiverEngine, PacketCollector, FileReconstructor
      protocol/             Packet encoding, Session, Checksum, Fec, Estimator
      compression/          Compression.ts (pako deflate)
      encryption/           Encryption.ts (AES-GCM via Web Crypto)
      qr/                   QRGenerator.ts, QRScanner.ts
      __tests__/            protocol.test.ts (18 tests, vitest)
  hooks/                    useSenderEngine, useReceiverEngine (React bindings)
  services/                 historyStore.ts (IndexedDB via idb)
  types/                    transfer.ts (shared domain types)
  utils/                    bytes.ts, cn.ts
```

Transmission/reception logic lives entirely in framework-agnostic
TypeScript classes (`SenderEngine`, `ReceiverEngine`) with a
publish/subscribe snapshot API; the React hooks are a thin binding layer.
The protocol test suite (`npm run test`) exercises packet encode/decode,
CRC corruption detection, session isolation, duplicate/missing packet
handling, FEC recovery, compression round-trips, encryption round-trips,
and full builder → collector → reconstructor integration — all
independent of the UI.

---

## Known limitations

- **No feedback channel**: as noted above, the sender can't know what a
  specific receiver is missing; recovery relies on looping + FEC parity
  rather than targeted retransmission.
- **Large files are genuinely slow.** QR codes hold a few hundred bytes
  each. This is well suited to text, small images (tens of KB), and short
  audio clips — not multi-megabyte files. The app is upfront about this in
  the UI and the size/time estimate before you start.
- **2×2 grid mode** needs a reasonably large, high-resolution screen and a
  decent camera to stay reliable; the app defaults to single-QR "Reliable"
  or "Balanced" presets unless you pick "Fast."
- **Audio is re-encoded to WAV**, not a compressed codec like Opus/MP3 —
  browsers don't expose a simple built-in encoder for those, and WAV kept
  the implementation dependency-free. Voice mode's 8kHz mono setting keeps
  file sizes down despite the uncompressed format.
- **No parity-of-parity**: if two or more chunks in the same group of 8
  are missing simultaneously, that group won't self-heal on the current
  scan pass; the stream loop will bring the missing frames back around.

---

## Browser compatibility

Requires:
- `navigator.mediaDevices.getUserMedia` (camera access)
- `crypto.subtle` (Web Crypto API, for SHA-256 and optional AES-GCM)
- `OfflineAudioContext` (only needed for the audio send flow)
- Canvas 2D context

Tested against current Chrome and Edge (desktop + Android). Safari and
Firefox should work for the core flow; Safari's `getUserMedia` behavior on
older iOS versions can be stricter about requiring a user gesture before
the camera stream can start — if the camera doesn't start automatically,
tapping the screen once should trigger the permission prompt.

The app is not a PWA and doesn't work offline itself in the sense of "no
network to load it" — the *transfer* is what's offline. You still need to
load the page once (dev server, or a static host) before pairing devices.
#   P O R T F O L I O  
 