import type { PayloadKind, TransferManifest } from '../../../types/transfer';
import { bytesToBase64Url, base64UrlToBytes } from '../../../utils/bytes';
import { crc32Base36, crc32BaseFromString } from './Checksum';
import { PROTOCOL_VERSION } from '../../../types/transfer';

// ---------------------------------------------------------------------------
// Wire format
//
// A deliberately compact, non-JSON, pipe-delimited format. JSON's quoted
// keys ({"sessionId":"...", "packetIndex":...}) waste dozens of bytes per
// frame that would otherwise buy us bigger data chunks (=fewer QR frames =
// faster transfers). Every field is positional and single-letter; base64url
// never contains "|" so no escaping is needed.
//
//   DATA / PARITY PACKET
//   Q1|<sid>|<kind>|D|<index>|<total>|<groupSize>|<comp>|<enc>|<crc>|<data>
//   Q1|<sid>|<kind>|P|<groupIndex>|<total>|<groupSize>|<comp>|<enc>|<crc>|<data>
//
//   MANIFEST PACKET (re-broadcast periodically so late scanners can join)
//   Q1|<sid>|M|<jsonManifestBase64Url>|<crc>
// ---------------------------------------------------------------------------

const MAGIC = `Q${PROTOCOL_VERSION}`;

export type WireDataPacket = {
  type: 'data' | 'parity';
  sessionId: string;
  kind: PayloadKind;
  index: number; // packet index (data) or group index (parity)
  total: number; // total data packet count
  groupSize: number;
  compression: 'd' | 'n';
  encryption: 'a' | 'n';
  data: Uint8Array;
};

export type WireManifestPacket = {
  type: 'manifest';
  sessionId: string;
  manifest: TransferManifest;
};

export type WirePacket = WireDataPacket | WireManifestPacket;

const KIND_CODE: Record<PayloadKind, string> = {
  text: 't',
  image: 'i',
  pdf: 'd',
  audio: 'a',
  file: 'f',
};
const CODE_KIND: Record<string, PayloadKind> = Object.fromEntries(
  Object.entries(KIND_CODE).map(([k, v]) => [v, k as PayloadKind]),
) as Record<string, PayloadKind>;

export function encodeDataPacket(p: Omit<WireDataPacket, 'type'> & { isParity: boolean }): string {
  const b64 = bytesToBase64Url(p.data);
  const typeFlag = p.isParity ? 'P' : 'D';
  const body = [
    MAGIC,
    p.sessionId,
    KIND_CODE[p.kind],
    typeFlag,
    p.index,
    p.total,
    p.groupSize,
    p.compression,
    p.encryption,
  ].join('|');
  const crc = crc32Base36(p.data);
  return `${body}|${crc}|${b64}`;
}

export function encodeManifestPacket(sessionId: string, manifest: TransferManifest): string {
  const json = JSON.stringify(manifest);
  const b64 = bytesToBase64Url(new TextEncoder().encode(json));
  const crc = crc32BaseFromString(json);
  return [MAGIC, sessionId, 'M', b64, crc].join('|');
}

export class PacketDecodeError extends Error {}

export function decodePacket(raw: string): WirePacket {
  try {
    const parts = raw.split('|');
    if (parts.length < 5 || parts[0] !== MAGIC) {
      throw new PacketDecodeError('Not a QRMesh packet or unsupported version');
    }
    const sessionId = parts[1];
    const kindOrType = parts[2];

    if (kindOrType === 'M') {
      const [, , , b64, crc] = parts;
      const jsonBytes = base64UrlToBytes(b64);
      const json = new TextDecoder().decode(jsonBytes);
      if (crc32BaseFromString(json) !== crc) {
        throw new PacketDecodeError('Manifest packet failed checksum');
      }
      const manifest = JSON.parse(json) as TransferManifest;
      return { type: 'manifest', sessionId, manifest };
    }

    const kind = CODE_KIND[kindOrType];
    if (!kind) throw new PacketDecodeError('Unknown payload kind');
    const typeFlag = parts[3];
    const [indexS, totalS, groupSizeS, compression, encryption, crc, b64] = parts.slice(4);
    const data = base64UrlToBytes(b64);
    if (crc32Base36(data) !== crc) {
      throw new PacketDecodeError('Packet failed CRC32 checksum (corrupted scan)');
    }
    return {
      type: typeFlag === 'P' ? 'parity' : 'data',
      sessionId,
      kind,
      index: Number(indexS),
      total: Number(totalS),
      groupSize: Number(groupSizeS),
      compression: compression as 'd' | 'n',
      encryption: encryption as 'a' | 'n',
      data,
    };
  } catch (err) {
    if (err instanceof PacketDecodeError) throw err;
    throw new PacketDecodeError(err instanceof Error ? err.message : 'Corrupted or unreadable packet');
  }
}

/** Cheap pre-check so the scanner can decide "is this even a QRMesh frame" without full parsing. */
export function looksLikeQrMeshPacket(raw: string): boolean {
  return raw.startsWith(`${MAGIC}|`);
}
