import { createQRCode } from '../generator';
import { qrModuleCount } from './framed-image';

export interface SampleQr {
  svg: string;
  modules: number | null;
}

let cached: Promise<SampleQr> | null = null;

/**
 * A small real code used to show what each frame looks like in the picker. It is made once per page
 * visit and shared by every thumbnail (the frames are then drawn round it by the same function the
 * preview and the exports use).
 */
export function getSampleQr(): Promise<SampleQr> {
  cached ??= (async () => {
    const qr = createQRCode({
      data: 'https://memento-qr.app/sample',
      width: 200,
      height: 200,
      type: 'svg',
      dotStyle: 'rounded',
      cornerSquareStyle: 'extra-rounded',
      cornerDotStyle: 'dot',
      errorCorrectionLevel: 'M',
    });
    const blob = await qr.getRawData('svg');
    if (!blob || !(blob instanceof Blob)) throw new Error('Failed to render the sample code');
    return { svg: await blob.text(), modules: qrModuleCount(qr) };
  })().catch((error: unknown) => {
    cached = null;
    throw error;
  });
  return cached;
}
