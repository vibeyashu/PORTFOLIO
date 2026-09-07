import QRCode from 'qrcode';

export async function renderQrToCanvas(
  canvas: HTMLCanvasElement,
  text: string,
  size: number,
  errorCorrectionLevel: 'L' | 'M' | 'Q' | 'H',
): Promise<void> {
  await QRCode.toCanvas(canvas, text, {
    width: size,
    margin: 3,
    errorCorrectionLevel,
    color: { dark: '#000000', light: '#ffffff' },
  });
}

export async function renderQrToDataUrl(
  text: string,
  size: number,
  errorCorrectionLevel: 'L' | 'M' | 'Q' | 'H',
): Promise<string> {
  return QRCode.toDataURL(text, {
    width: size,
    margin: 3,
    errorCorrectionLevel,
    color: { dark: '#000000', light: '#ffffff' },
  });
}

/** Maximum practical payload length (chars) for a given error-correction level, alphanumeric/byte mode, version 40. */
export function maxPracticalPayloadChars(errorCorrectionLevel: 'L' | 'M' | 'Q' | 'H'): number {
  // Conservative practical caps (not the theoretical max) chosen so codes stay
  // reliably scannable on a phone camera rather than technically valid but unreadable.
  switch (errorCorrectionLevel) {
    case 'L':
      return 1200;
    case 'M':
      return 900;
    case 'Q':
      return 650;
    case 'H':
      return 500;
  }
}
