'use client';

import { useEffect, useId, useRef } from 'react';
import type QRCodeStyling from 'qr-code-styling';

import { createQRCode, type QRDesignConfig } from '@/lib/qr/generator';
import { framedSvgFor, hasFrame } from '@/lib/qr/frames/framed-image';
import { useDebounce } from './use-debounce';

/** The code is drawn this wide inside a frame; the picture is scaled to its box afterwards (it is a vector). */
const FRAMED_QR_PIXELS = 512;

/**
 * Draws the code into `ref`. With a frame in the design, the box holds the framed picture
 * (an inline SVG) scaled to fit `previewSize` square; otherwise the plain code.
 */
export function useQRCode(config: QRDesignConfig, previewSize = 280) {
  const ref = useRef<HTMLDivElement>(null);
  const qrRef = useRef<QRCodeStyling | null>(null);
  const debouncedConfig = useDebounce(config, 150);
  const idPrefix = `mqf-${useId().replace(/[^a-z0-9]/gi, '')}`;

  useEffect(() => {
    const container = ref.current;
    if (!container) return;

    if (!debouncedConfig.data) {
      container.innerHTML = '';
      qrRef.current = null;
      return;
    }

    if (hasFrame(debouncedConfig)) {
      let cancelled = false;
      const qr = createQRCode({ ...debouncedConfig, width: FRAMED_QR_PIXELS, height: FRAMED_QR_PIXELS, type: 'svg' });
      qrRef.current = qr;

      // The old picture stays until the new one is ready, so typing a caption does not flicker.
      framedSvgFor(qr, debouncedConfig, { width: 1000, idPrefix })
        .then((framed) => {
          if (cancelled || !framed) return;
          container.innerHTML = framed.svg;
          const svg = container.firstElementChild;
          if (!svg) return;
          const fit = Math.min(1, framed.width / framed.height);
          svg.setAttribute('width', String(Math.round(previewSize * fit)));
          svg.setAttribute('height', String(Math.round((previewSize * fit * framed.height) / framed.width)));
          svg.setAttribute('data-testid', 'qr-frame-preview');
        })
        .catch((error: unknown) => console.error('Framed QR preview error:', error));

      return () => {
        cancelled = true;
        qrRef.current = null;
      };
    }

    container.innerHTML = '';
    const qr = createQRCode({
      ...debouncedConfig,
      width: previewSize,
      height: previewSize,
    });

    qr.append(container);
    qrRef.current = qr;

    // Without this, switching between preview layouts (which swaps out the
    // container element) can leave a stale QR rendered in a detached node
    // while a new one renders into the fresh container, briefly showing
    // both at once.
    return () => {
      container.innerHTML = '';
      qrRef.current = null;
    };
  }, [debouncedConfig, previewSize, idPrefix]);

  return { ref, qrInstance: qrRef };
}
