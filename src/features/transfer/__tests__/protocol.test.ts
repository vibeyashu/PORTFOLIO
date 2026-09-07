import { describe, it, expect } from 'vitest';
import { encodeDataPacket, encodeManifestPacket, decodePacket, looksLikeQrMeshPacket } from '../protocol/Encoding';
import { chunkBytes, generateParityChunks, recoverMissingChunks } from '../protocol/Fec';
import { sha256Hex, crc32Base36 } from '../protocol/Checksum';
import { generateSessionId, isValidSessionId } from '../protocol/Session';
import { compressIfBeneficial, decompress } from '../compression/Compression';
import { encryptWithPassword, decryptWithPassword, DecryptionError } from '../encryption/Encryption';
import { buildTransfer } from '../protocol/PacketBuilder';
import { PacketScheduler } from '../sender/PacketScheduler';
import { PacketCollector } from '../receiver/PacketCollector';
import { reconstructFile } from '../receiver/FileReconstructor';
import type { TransferManifest } from '../../../types/transfer';

const enc = new TextEncoder();

describe('Session', () => {
  it('generates valid, distinguishable session ids', () => {
    const a = generateSessionId();
    const b = generateSessionId();
    expect(isValidSessionId(a)).toBe(true);
    expect(a.length).toBe(5);
    // extremely unlikely to collide, not a hard guarantee but a good smoke test
    expect(a).not.toBe(b);
  });
});

describe('Encoding: packet round-trip', () => {
  it('encodes and decodes a data packet losslessly', () => {
    const data = enc.encode('hello qrmesh');
    const wire = encodeDataPacket({
      sessionId: 'ABCDE',
      kind: 'text',
      index: 3,
      total: 10,
      groupSize: 8,
      compression: 'n',
      encryption: 'n',
      data,
      isParity: false,
    });
    expect(looksLikeQrMeshPacket(wire)).toBe(true);
    const decoded = decodePacket(wire);
    expect(decoded.type).toBe('data');
    if (decoded.type === 'data') {
      expect(decoded.sessionId).toBe('ABCDE');
      expect(decoded.index).toBe(3);
      expect(decoded.total).toBe(10);
      expect(new TextDecoder().decode(decoded.data)).toBe('hello qrmesh');
    }
  });

  it('marks parity packets distinctly from data packets', () => {
    const wire = encodeDataPacket({
      sessionId: 'ABCDE',
      kind: 'file',
      index: 1,
      total: 10,
      groupSize: 8,
      compression: 'n',
      encryption: 'n',
      data: enc.encode('parity-bytes'),
      isParity: true,
    });
    const decoded = decodePacket(wire);
    expect(decoded.type).toBe('parity');
  });

  it('round-trips a manifest packet', () => {
    const manifest: TransferManifest = {
      version: 1,
      sessionId: 'ABCDE',
      kind: 'text',
      fileName: 'message.txt',
      mimeType: 'text/plain',
      originalSize: 12,
      processedSize: 12,
      totalPackets: 1,
      parityPackets: 1,
      compression: 'none',
      encryption: 'none',
      sha256: 'deadbeef',
      createdAt: Date.now(),
    };
    const wire = encodeManifestPacket('ABCDE', manifest);
    const decoded = decodePacket(wire);
    expect(decoded.type).toBe('manifest');
    if (decoded.type === 'manifest') {
      expect(decoded.manifest.fileName).toBe('message.txt');
    }
  });

  it('rejects a packet with a corrupted CRC (simulating a bad scan)', () => {
    const wire = encodeDataPacket({
      sessionId: 'ABCDE',
      kind: 'text',
      index: 0,
      total: 1,
      groupSize: 8,
      compression: 'n',
      encryption: 'n',
      data: enc.encode('integrity matters'),
      isParity: false,
    });
    // Flip a character in the base64url payload to simulate scan corruption
    const parts = wire.split('|');
    const last = parts[parts.length - 1];
    parts[parts.length - 1] = (last[0] === 'a' ? 'b' : 'a') + last.slice(1);
    const corrupted = parts.join('|');
    expect(() => decodePacket(corrupted)).toThrow();
  });

  it('rejects frames that are not QRMesh packets at all', () => {
    expect(looksLikeQrMeshPacket('https://example.com')).toBe(false);
    expect(() => decodePacket('not-a-qrmesh-packet')).toThrow();
  });
});

describe('Checksum', () => {
  it('computes a stable SHA-256 hex digest', async () => {
    const a = await sha256Hex(enc.encode('qrmesh'));
    const b = await sha256Hex(enc.encode('qrmesh'));
    const c = await sha256Hex(enc.encode('qrmesh!'));
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it('computes a compact CRC32 that changes when data changes', () => {
    const a = crc32Base36(enc.encode('packet-a'));
    const b = crc32Base36(enc.encode('packet-b'));
    expect(a).not.toBe(b);
  });
});

describe('FEC (XOR parity recovery)', () => {
  it('recovers a single missing chunk per group using parity', () => {
    const data = new Uint8Array(64);
    for (let i = 0; i < data.length; i++) data[i] = i;
    const chunks = chunkBytes(data, 8); // 8 chunks of 8 bytes
    const parity = generateParityChunks(chunks, 4); // 2 groups of 4

    const dataMap = new Map<number, Uint8Array>();
    chunks.forEach((c, i) => {
      if (i !== 2) dataMap.set(i, c); // drop chunk 2 (in group 0)
    });
    const parityMap = new Map<number, Uint8Array>([[0, parity[0]]]);

    const recovered = recoverMissingChunks(chunks.length, 4, dataMap, parityMap);
    expect(recovered).toHaveLength(1);
    expect(recovered[0].index).toBe(2);
    expect(recovered[0].chunk).toEqual(chunks[2]);
  });

  it('does not attempt recovery when two chunks in a group are missing', () => {
    const data = new Uint8Array(32);
    const chunks = chunkBytes(data, 8);
    const parity = generateParityChunks(chunks, 4);
    const dataMap = new Map<number, Uint8Array>([[0, chunks[0]]]); // missing 1,2,3
    const parityMap = new Map<number, Uint8Array>([[0, parity[0]]]);
    const recovered = recoverMissingChunks(chunks.length, 4, dataMap, parityMap);
    expect(recovered).toHaveLength(0);
  });
});

describe('Compression', () => {
  it('round-trips arbitrary bytes through deflate', () => {
    const original = enc.encode('a'.repeat(500) + 'compressible text data '.repeat(20));
    const { bytes, usedCompression } = compressIfBeneficial(original);
    expect(usedCompression).toBe(true);
    expect(bytes.length).toBeLessThan(original.length);
    const restored = decompress(bytes);
    expect(Array.from(restored)).toEqual(Array.from(original));
  });

  it('skips compression when it would not help (already-dense random bytes)', () => {
    const random = crypto.getRandomValues(new Uint8Array(256));
    const { usedCompression } = compressIfBeneficial(random);
    expect(usedCompression).toBe(false);
  });
});

describe('Encryption (AES-GCM via Web Crypto)', () => {
  it('round-trips data with the correct password', async () => {
    const original = enc.encode('super secret transfer payload');
    const encrypted = await encryptWithPassword(original, 'correct horse battery staple');
    const decrypted = await decryptWithPassword(encrypted, 'correct horse battery staple');
    expect(Array.from(decrypted)).toEqual(Array.from(original));
  });

  it('fails to decrypt with the wrong password', async () => {
    const original = enc.encode('super secret transfer payload');
    const encrypted = await encryptWithPassword(original, 'right-password');
    await expect(decryptWithPassword(encrypted, 'wrong-password')).rejects.toThrow(DecryptionError);
  });
});

describe('End-to-end: PacketBuilder -> PacketCollector -> FileReconstructor', () => {
  it('reconstructs a full transfer with duplicate and out-of-order packets ignored/handled', async () => {
    const message = 'The quick brown fox jumps over the lazy dog. '.repeat(10);
    const bytes = enc.encode(message);
    const { bytes: compressed, usedCompression } = compressIfBeneficial(bytes);

    const built = await buildTransfer({
      processedBytes: compressed,
      kind: 'text',
      fileName: 'message.txt',
      mimeType: 'text/plain',
      originalSize: bytes.length,
      compression: usedCompression ? 'deflate' : 'none',
      encryption: 'none',
      chunkBytes: 40,
    });

    const collector = new PacketCollector();
    collector.ingest(built.manifestFrame);
    // feed data frames out of order, plus a duplicate
    const shuffled = [...built.dataFrames].reverse();
    for (const frame of shuffled) collector.ingest(frame);
    collector.ingest(shuffled[0]); // duplicate

    const stats = collector.getStats();
    expect(stats.isComplete).toBe(true);
    expect(stats.duplicates).toBe(1);

    const assembled = collector.assemble();
    const result = await reconstructFile(built.manifest, assembled);
    expect(result.integrityVerified).toBe(true);
    expect(result.text).toBe(message);
  });

  it('ignores packets from a different session id', async () => {
    const bytes = enc.encode('session isolation test');
    const built = await buildTransfer({
      processedBytes: bytes,
      kind: 'text',
      fileName: 'a.txt',
      mimeType: 'text/plain',
      originalSize: bytes.length,
      compression: 'none',
      encryption: 'none',
      chunkBytes: 10,
    });
    const otherBuilt = await buildTransfer({
      processedBytes: enc.encode('a totally different transfer'),
      kind: 'text',
      fileName: 'b.txt',
      mimeType: 'text/plain',
      originalSize: 10,
      compression: 'none',
      encryption: 'none',
      chunkBytes: 10,
    });

    const collector = new PacketCollector();
    collector.ingest(built.manifestFrame);
    for (const frame of built.dataFrames) collector.ingest(frame);
    for (const frame of otherBuilt.dataFrames) collector.ingest(frame);

    const stats = collector.getStats();
    expect(stats.ignoredOtherSession).toBe(otherBuilt.dataFrames.length);
    expect(stats.sessionId).toBe(built.sessionId);
  });

  it('detects a checksum failure if bytes are tampered with after assembly', async () => {
    const bytes = enc.encode('tamper test payload');
    const built = await buildTransfer({
      processedBytes: bytes,
      kind: 'text',
      fileName: 'a.txt',
      mimeType: 'text/plain',
      originalSize: bytes.length,
      compression: 'none',
      encryption: 'none',
      chunkBytes: 8,
    });
    const tampered = new Uint8Array(bytes);
    tampered[0] ^= 0xff;
    const result = await reconstructFile(built.manifest, tampered);
    expect(result.integrityVerified).toBe(false);
  });

  it('recovers a missing data packet via FEC parity during collection', async () => {
    const bytes = enc.encode('x'.repeat(200));
    const built = await buildTransfer({
      processedBytes: bytes,
      kind: 'file',
      fileName: 'a.bin',
      mimeType: 'application/octet-stream',
      originalSize: bytes.length,
      compression: 'none',
      encryption: 'none',
      chunkBytes: 20, // -> 10 data packets, group size 8 -> 2 parity packets
    });

    const collector = new PacketCollector();
    collector.ingest(built.manifestFrame);
    built.dataFrames.forEach((frame, i) => {
      if (i === 3) return; // drop packet 3
      collector.ingest(frame);
    });
    for (const frame of built.parityFrames) collector.ingest(frame);

    const stats = collector.getStats();
    expect(stats.isComplete).toBe(true);
    expect(stats.recoveredByFec).toBeGreaterThanOrEqual(1);
  });
});

describe('PacketScheduler', () => {
  it('emits manifest at tick 0 and then cycles data frames without skipping', async () => {
    const bytes = enc.encode('1234567890');
    const built = await buildTransfer({
      processedBytes: bytes,
      kind: 'text',
      fileName: 'test.txt',
      mimeType: 'text/plain',
      originalSize: 10,
      compression: 'none',
      encryption: 'none',
      chunkBytes: 2, // 5 data packets
    });

    const scheduler = new PacketScheduler(built, 4); // manifest every 4 ticks
    // Tick 0: Manifest
    const [frame0] = scheduler.next(1);
    expect(frame0).toBe(built.manifestFrame);

    // Tick 1: Data 0
    const [frame1] = scheduler.next(1);
    expect(frame1).toBe(built.dataFrames[0]);

    // Tick 2: Data 1
    const [frame2] = scheduler.next(1);
    expect(frame2).toBe(built.dataFrames[1]);

    // Tick 3: Data 2
    const [frame3] = scheduler.next(1);
    expect(frame3).toBe(built.dataFrames[2]);

    // Tick 4: Manifest (4 % 4 === 0)
    const [frame4] = scheduler.next(1);
    expect(frame4).toBe(built.manifestFrame);

    // Tick 5: Data 3 (no data frame skipped!)
    const [frame5] = scheduler.next(1);
    expect(frame5).toBe(built.dataFrames[3]);
  });
});

