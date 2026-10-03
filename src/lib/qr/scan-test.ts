import jsQR from 'jsqr';

import { hasFrame, renderFramedRaster } from './frames/framed-image';
import { createQRCode, type QRDesignConfig } from './generator';

export interface DecodeResult {
  /** True when a reader found a code in the rendered image. */
  found: boolean;
  /** What the reader decoded (compare with the intended content). */
  text: string | null;
  /** QR version (1 to 40), used to work out how many dots the code has. */
  version: number | null;
}

/** A rendered picture, plus (for a framed code) the same picture cropped to the code. */
interface RenderedScan {
  image: ImageData;
  aimed: ImageData | null;
}

/**
 * Sizes the code is shown at when it is tried, largest first; the first size a reader manages wins.
 * One size is not enough: the software reader (jsQR) is erratic with a logo in the middle, reading a
 * code at one pixel size and missing the very same code at the next (a stronger reader, ZXing, reads
 * every one of them). Real people hold a phone at many distances, so reading it at a typical size counts.
 */
const FULL_SIZES = [600, 420, 300];
/** Simulates a plain phone camera: the code shown small and softly, not the crisp export. */
const SMALL_SIZES = [180, 150];

/** Draws a framed code (the code itself `size` pixels wide) with a little paper round it, or null when the design has no frame. */
async function renderFramedToImageData(config: QRDesignConfig, size: number): Promise<RenderedScan | null> {
  if (!hasFrame(config)) return null;
  const qr = createQRCode({ ...config, width: size, height: size, type: 'svg' });
  const framed = await renderFramedRaster(qr, config, size);
  if (!framed) return null;

  const margin = Math.round(framed.canvas.width * 0.04);
  const canvas = document.createElement('canvas');
  canvas.width = framed.canvas.width + margin * 2;
  canvas.height = framed.canvas.height + margin * 2;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Canvas is not supported in this browser');
  context.fillStyle = '#FFFFFF';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(framed.canvas, margin, margin);

  // What a camera aimed at the code itself sees: the plate (code and quiet zone) with a little around it.
  const { plateRect } = framed;
  const around = Math.round(framed.canvas.width * 0.01);
  const left = Math.max(0, margin + Math.floor(plateRect.x) - around);
  const top = Math.max(0, margin + Math.floor(plateRect.y) - around);
  const right = Math.min(canvas.width, margin + Math.ceil(plateRect.x + plateRect.width) + around);
  const bottom = Math.min(canvas.height, margin + Math.ceil(plateRect.y + plateRect.height) + around);

  return {
    image: context.getImageData(0, 0, canvas.width, canvas.height),
    aimed: context.getImageData(left, top, right - left, bottom - top),
  };
}

async function renderToImageData(config: QRDesignConfig, size: number): Promise<RenderedScan> {
  // A frame is part of what a phone sees, so a framed code is tested framed.
  const framed = await renderFramedToImageData(config, size);
  if (framed) return framed;

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
    return { image: context.getImageData(0, 0, canvas.width, canvas.height), aimed: null };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * A framed code is first read from the whole picture. A software reader can be thrown by busy
 * decoration round the code, which a phone (that locks onto the code itself) is not, so if that
 * fails the picture is read again cropped to the code and its clear margin, as if aimed at it.
 */
function decode(scan: RenderedScan): DecodeResult {
  const first = jsQR(scan.image.data, scan.image.width, scan.image.height);
  const result =
    first ?? (scan.aimed ? jsQR(scan.aimed.data, scan.aimed.width, scan.aimed.height) : null);
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
  const [full, small] = await Promise.all([decodeAtAnySize(config, FULL_SIZES), decodeAtAnySize(config, SMALL_SIZES)]);

  return { full, small };
}

/** Tries the sizes in turn and returns the first successful read (or the failure when none reads). */
async function decodeAtAnySize(config: QRDesignConfig, sizes: number[]): Promise<DecodeResult> {
  let failure: DecodeResult = { found: false, text: null, version: null };
  for (const size of sizes) {
    const result = decode(await renderToImageData(config, size));
    if (result.found) return result;
    failure = result;
  }
  return failure;
}
