'use client';

import { useEffect, useRef } from 'react';
import type QRCodeStyling from 'qr-code-styling';

import { createQRCode, type QRDesignConfig } from '@/lib/qr/generator';
import { useDebounce } from './use-debounce';

export function useQRCode(config: QRDesignConfig, previewSize = 280) {
  const ref = useRef<HTMLDivElement>(null);
  const qrRef = useRef<QRCodeStyling | null>(null);
  const debouncedConfig = useDebounce(config, 150);

  useEffect(() => {
    const container = ref.current;
    if (!container) return;

    container.innerHTML = '';

    if (!debouncedConfig.data) {
      qrRef.current = null;
      return;
    }

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
  }, [debouncedConfig, previewSize]);

  return { ref, qrInstance: qrRef };
}
