import jsQR from 'jsqr';

/** A soft copy (PNG or JPG) is only read in the browser, never uploaded, so this is a generous limit. */
export const MAX_PRINTED_COPY_BYTES = 8 * 1024 * 1024;

const ACCEPTED_TYPES = ['image/png', 'image/jpeg'];

/** The longest side a picture is read at; bigger photos are scaled down (the reader is slow and no better on huge ones). */
const SIZES = [1400, 900, 500];

export class UnreadableImageError extends Error {}

/** Why a file cannot be used, or null when it can. */
export function validatePrintedCopy(file: { type: string; size: number }): string | null {
  if (!ACCEPTED_TYPES.includes(file.type)) return 'Choose a PNG or JPG picture.';
  if (file.size > MAX_PRINTED_COPY_BYTES) return 'That picture is larger than 8 MB. Choose a smaller one.';
  return null;
}

async function loadImage(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new UnreadableImageError('That file could not be opened as a picture.'));
      image.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Reads the QR code in a picture and returns what it holds, or null when no code was found. The picture
 * is drawn on white (a see-through PNG would otherwise read as black) and tried at a few sizes.
 */
export async function readQrFromFile(file: File): Promise<string | null> {
  const image = await loadImage(file);
  const longest = Math.max(image.naturalWidth, image.naturalHeight);

  // Each distinct scale once (a small picture is already at 1 for every size).
  const scales = [...new Set(SIZES.map((size) => Math.min(1, size / longest)))];

  for (const scale of scales) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Canvas is not supported in this browser');

    context.fillStyle = '#FFFFFF';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    const data = context.getImageData(0, 0, canvas.width, canvas.height);
    const result = jsQR(data.data, data.width, data.height);
    if (result) return result.data;
  }
  return null;
}
