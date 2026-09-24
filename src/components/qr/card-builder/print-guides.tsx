import type { CSSProperties, ReactNode } from 'react';

import { computePrintLayout } from '@/lib/qr/print-layout';

/** Keep text and the QR at least this far inside the cut line. */
export const SAFE_MARGIN_MM = 3;

interface PrintGuidesProps {
  widthMm: number;
  heightMm: number;
  bleedMm: number;
  /** Editor pixels for the card's width, so millimetres can be turned into pixels. */
  canvasWidthPx: number;
  canvasHeightPx: number;
  /** How the card is painted, so the bleed can show the same colour or picture. */
  backgroundStyle: CSSProperties;
  /** The card itself, drawn on top of the bleed area. */
  children: ReactNode;
}

/**
 * Wraps the editing canvas with print guides: the bleed area painted in the
 * card's background, the cut line, the safe area, and crop marks outside.
 * Everything is drawn around the canvas, so dragging on the canvas is unchanged.
 */
export function PrintGuides({ widthMm, heightMm, bleedMm, canvasWidthPx, canvasHeightPx, backgroundStyle, children }: PrintGuidesProps) {
  const layout = computePrintLayout({ widthMm, heightMm, bleedMm, cropMarks: true });
  const pxPerMm = canvasWidthPx / widthMm;
  const px = (mm: number): number => mm * pxPerMm;

  return (
    <div
      data-testid="print-guides"
      className="relative shrink-0"
      style={{ width: px(layout.pageWidthMm), height: px(layout.pageHeightMm) }}
    >
      {bleedMm > 0 && (
        <div
          aria-hidden
          data-testid="print-guides-bleed"
          className="absolute"
          style={{
            left: px(layout.bleed.x),
            top: px(layout.bleed.y),
            width: px(layout.bleed.width),
            height: px(layout.bleed.height),
            ...backgroundStyle,
            opacity: 0.55,
          }}
        />
      )}

      <div className="absolute" style={{ left: px(layout.trim.x), top: px(layout.trim.y), width: canvasWidthPx, height: canvasHeightPx }}>
        {children}
      </div>

      <svg
        aria-hidden
        data-testid="print-guides-lines"
        className="pointer-events-none absolute inset-0"
        width={px(layout.pageWidthMm)}
        height={px(layout.pageHeightMm)}
      >
        {bleedMm > 0 && (
          <rect
            x={px(layout.bleed.x)}
            y={px(layout.bleed.y)}
            width={px(layout.bleed.width)}
            height={px(layout.bleed.height)}
            fill="none"
            stroke="#ef4444"
            strokeWidth={1}
            strokeDasharray="4 3"
          />
        )}
        <rect
          x={px(layout.trim.x)}
          y={px(layout.trim.y)}
          width={canvasWidthPx}
          height={canvasHeightPx}
          fill="none"
          stroke="#d946ef"
          strokeWidth={1.5}
        />
        <rect
          x={px(layout.trim.x + SAFE_MARGIN_MM)}
          y={px(layout.trim.y + SAFE_MARGIN_MM)}
          width={Math.max(0, canvasWidthPx - px(SAFE_MARGIN_MM) * 2)}
          height={Math.max(0, canvasHeightPx - px(SAFE_MARGIN_MM) * 2)}
          fill="none"
          stroke="#22c55e"
          strokeWidth={1}
          strokeDasharray="3 3"
        />
        {layout.cropMarks.map((mark, index) => (
          <line key={index} x1={px(mark.x1)} y1={px(mark.y1)} x2={px(mark.x2)} y2={px(mark.y2)} stroke="currentColor" strokeWidth={1} />
        ))}
      </svg>
    </div>
  );
}

/** What the guide colours mean, shown under the canvas. */
export function PrintGuidesLegend({ bleedMm }: { bleedMm: number }) {
  return (
    <ul className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Print guides key">
      <li>
        <span className="mr-1 inline-block h-0.5 w-4 bg-fuchsia-500 align-middle" aria-hidden />
        Cut line
      </li>
      <li>
        <span className="mr-1 inline-block h-0.5 w-4 border-t border-dashed border-green-500 align-middle" aria-hidden />
        Safe area ({SAFE_MARGIN_MM} mm in): keep text and the QR inside
      </li>
      {bleedMm > 0 && (
        <li>
          <span className="mr-1 inline-block h-0.5 w-4 border-t border-dashed border-red-500 align-middle" aria-hidden />
          Bleed ({bleedMm} mm): the background runs out to here
        </li>
      )}
      <li>Crop marks are drawn at the corners</li>
    </ul>
  );
}
