import { describe, it, expect, vi } from 'vitest';
import QRCodeStyling from 'qr-code-styling';

import { createPrintQR, createQRCode, downloadQR, hexToRgba, DEFAULT_QR_STYLE } from '@/lib/qr/generator';

describe('createQRCode', () => {
  it('returns a QRCodeStyling instance', () => {
    const qr = createQRCode({ data: 'https://example.com' });
    expect(qr).toBeInstanceOf(QRCodeStyling);
  });

  it('applies default values when no style options are given', () => {
    const qr = createQRCode({ data: 'https://example.com' });
    const options = qr._options;

    expect(options.width).toBe(1024);
    expect(options.height).toBe(1024);
    expect(options.type).toBe('svg');
    expect(options.dotsOptions.type).toBe('rounded');
    expect(options.dotsOptions.color).toBe('#000000');
    expect(options.backgroundOptions.color).toBe('#FFFFFF');
    expect(options.qrOptions.errorCorrectionLevel).toBe('M');
  });

  it('applies custom dot style, colors, and corner options', () => {
    const qr = createQRCode({
      data: 'https://example.com',
      dotStyle: 'classy',
      dotColor: '#123456',
      cornerSquareStyle: 'dot',
      cornerSquareColor: '#abcdef',
      cornerDotStyle: 'square',
      cornerDotColor: '#654321',
      backgroundColor: '#eeeeee',
    });
    const options = qr._options;

    expect(options.dotsOptions.type).toBe('classy');
    expect(options.dotsOptions.color).toBe('#123456');
    expect(options.cornersSquareOptions?.type).toBe('dot');
    expect(options.cornersSquareOptions?.color).toBe('#abcdef');
    expect(options.cornersDotOptions?.type).toBe('square');
    expect(options.cornersDotOptions?.color).toBe('#654321');
    expect(options.backgroundOptions.color).toBe('#eeeeee');
  });

  it('applies a dot gradient when provided', () => {
    const qr = createQRCode({
      data: 'https://example.com',
      dotGradient: {
        type: 'linear',
        rotation: 45,
        colorStops: [
          { offset: 0, color: '#000000' },
          { offset: 1, color: '#ffffff' },
        ],
      },
    });

    expect(qr._options.dotsOptions.gradient).toEqual({
      type: 'linear',
      rotation: 45,
      colorStops: [
        { offset: 0, color: '#000000' },
        { offset: 1, color: '#ffffff' },
      ],
    });
  });

  it('applies a background gradient when provided', () => {
    const qr = createQRCode({
      data: 'https://example.com',
      backgroundGradient: {
        type: 'radial',
        colorStops: [
          { offset: 0, color: '#ffffff' },
          { offset: 1, color: '#cccccc' },
        ],
      },
    });

    expect(qr._options.backgroundOptions.gradient).toEqual(
      expect.objectContaining({
        type: 'radial',
        colorStops: [
          { offset: 0, color: '#ffffff' },
          { offset: 1, color: '#cccccc' },
        ],
      }),
    );
  });

  it('sets image options and bumps error correction to H when a logo is provided', () => {
    const qr = createQRCode({ data: 'https://example.com', logoUrl: 'https://example.com/logo.png' });
    const options = qr._options;

    expect(options.image).toBe('https://example.com/logo.png');
    expect(options.imageOptions.imageSize).toBe(0.4);
    expect(options.imageOptions.margin).toBe(5);
    expect(options.qrOptions.errorCorrectionLevel).toBe('H');
  });

  it('respects an explicit error correction level even with a logo', () => {
    const qr = createQRCode({
      data: 'https://example.com',
      logoUrl: 'https://example.com/logo.png',
      errorCorrectionLevel: 'L',
    });

    expect(qr._options.qrOptions.errorCorrectionLevel).toBe('L');
  });

  it('respects custom logo size and margin', () => {
    const qr = createQRCode({
      data: 'https://example.com',
      logoUrl: 'https://example.com/logo.png',
      logoSize: 0.25,
      logoMargin: 10,
    });

    expect(qr._options.imageOptions.imageSize).toBe(0.25);
    expect(qr._options.imageOptions.margin).toBe(10);
  });

  it('applies backgroundOpacity to a solid backgroundColor', () => {
    const qr = createQRCode({
      data: 'https://example.com',
      backgroundColor: '#FF0000',
      backgroundOpacity: 50,
    });

    expect(qr._options.backgroundOptions.color).toBe('rgba(255, 0, 0, 0.5)');
  });

  it('ignores backgroundOpacity when a background gradient is set', () => {
    const qr = createQRCode({
      data: 'https://example.com',
      backgroundColor: '#FF0000',
      backgroundOpacity: 50,
      backgroundGradient: {
        type: 'linear',
        colorStops: [
          { offset: 0, color: '#ffffff' },
          { offset: 1, color: '#000000' },
        ],
      },
    });

    expect(qr._options.backgroundOptions.color).toBe('#FF0000');
  });
});

describe('createPrintQR', () => {
  it('produces a high-resolution SVG with maximum error correction', () => {
    const qr = createPrintQR({ data: 'https://example.com' });
    const options = qr._options;

    expect(options.width).toBe(2048);
    expect(options.height).toBe(2048);
    expect(options.type).toBe('svg');
    expect(options.qrOptions.errorCorrectionLevel).toBe('H');
  });

  it('still applies custom styling on top of the print defaults', () => {
    const qr = createPrintQR({ data: 'https://example.com', dotColor: '#ff0000' });
    expect(qr._options.dotsOptions.color).toBe('#ff0000');
  });
});

describe('downloadQR', () => {
  it('calls download on the QR instance with the given name and extension', async () => {
    const download = vi.fn().mockResolvedValue(undefined);
    const qr = { download } as unknown as QRCodeStyling;

    await downloadQR(qr, 'png', 'my-qr-code');

    expect(download).toHaveBeenCalledWith({ name: 'my-qr-code', extension: 'png' });
  });
});

describe('hexToRgba', () => {
  it('converts a 6-digit hex color at full opacity', () => {
    expect(hexToRgba('#000000', 100)).toBe('rgba(0, 0, 0, 1)');
  });

  it('converts a 3-digit hex color', () => {
    expect(hexToRgba('#f00', 50)).toBe('rgba(255, 0, 0, 0.5)');
  });

  it('clamps opacity to the 0-100 range', () => {
    expect(hexToRgba('#ffffff', 150)).toBe('rgba(255, 255, 255, 1)');
    expect(hexToRgba('#ffffff', -10)).toBe('rgba(255, 255, 255, 0)');
  });

  it('returns non-hex colors unchanged', () => {
    expect(hexToRgba('rgba(1, 2, 3, 0.5)', 50)).toBe('rgba(1, 2, 3, 0.5)');
  });
});

describe('DEFAULT_QR_STYLE', () => {
  it('defaults to no card layout', () => {
    expect(DEFAULT_QR_STYLE.cardLayout).toBe('none');
  });
});
