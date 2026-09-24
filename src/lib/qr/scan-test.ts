import jsQR from 'jsqr';

import { createQRCode, type QRDesignConfig } from './generator';

export interface DecodeResult {
  /** True when a reader found a code in the rendered image. */
  found: boolean;
  /** What the reader decoded (compare with the intended content). */
  text: string | null;
  /** QR version (1 to 40), used to work out how many dots the code has. */
  version: number | null;
}

const RENDER_SIZE = 600;
/** Simulates a plain phone camera: the code shown small and softly, not the crisp export. */
const SMALL_SIZE = 180;

async function renderToImageData(config: QRDesignConfig, size: number): Promise<ImageData> {
  const qr = createQRCode({ ...config, width: size, height: size, type: 'canvas' });
  const blob = await qr.getRawData('png');
  if (!blob || !(blob instanceof Blob)) throw new Error('Failed to render the QR code');

  const url = URL.createObjectURL(blob);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Failed to load the rendered QR code'));
      el.src = url;
    });

    // A white margin (the "quiet zone") like the paper around a printed code.
    const margin = Math.round(size * 0.12);
    const canvas = document.createElement('canvas');
    canvas.width = size + margin * 2;
    canvas.height = size + margin * 2;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Canvas is not supported in this browser');
    context.fillStyle = '#FFFFFF';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, margin, margin, size, size);
    return context.getImageData(0, 0, canvas.width, canvas.height);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function decode(imageData: ImageData): DecodeResult {
  const result = jsQR(imageData.data, imageData.width, imageData.height);
  return result
    ? { found: true, text: result.data, version: result.version }
    : { found: false, text: null, version: null };
}

/**
 * Renders the code the way it is saved and tries to read it back, at full size
 * and again small. Reading back the exact content is the strongest evidence
 * that phones will be able to scan it.
 */
export async function scanTest(config: QRDesignConfig): Promise<{ full: DecodeResult; small: DecodeResult }> {
  const [fullData, smallData] = await Promise.all([
    renderToImageData(config, RENDER_SIZE),
    renderToImageData(config, SMALL_SIZE),
  ]);

  return { full: decode(fullData), small: decode(smallData) };
}
