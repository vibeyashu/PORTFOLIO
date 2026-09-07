// Every transfer gets a short, human-glanceable session id so that two
// nearby QRMesh transfers (e.g. two phones at the same desk) never get
// their packets mixed together. The receiver locks onto the session id
// of the first valid packet it sees and ignores everything else.

const SESSION_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const SESSION_ID_LENGTH = 5;

export function generateSessionId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(SESSION_ID_LENGTH));
  let id = '';
  for (let i = 0; i < SESSION_ID_LENGTH; i++) {
    id += SESSION_ALPHABET[bytes[i] % SESSION_ALPHABET.length];
  }
  return id;
}

export function formatSessionLabel(sessionId: string): string {
  return `QRMesh-${sessionId}`;
}

export function isValidSessionId(sessionId: string): boolean {
  return new RegExp(`^[${SESSION_ALPHABET}]{${SESSION_ID_LENGTH}}$`).test(sessionId);
}
