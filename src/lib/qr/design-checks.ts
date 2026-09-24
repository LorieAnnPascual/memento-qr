import type { QRDesignConfig } from './generator';

export type IssueSeverity = 'problem' | 'warning';

export interface DesignIssue {
  severity: IssueSeverity;
  text: string;
  fix: string;
}

const MIN_QR_WIDTH_MM = 20;
/** Below this a module (one dot) is smaller than most phone cameras can resolve reliably. */
const MIN_MODULE_MM = 0.25;
const COMFORTABLE_MODULE_MM = 0.4;
const QUIET_ZONE_MODULES = 4;

function parseHex(color: string | undefined): [number, number, number] | null {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec((color ?? '').trim());
  if (!match) return null;
  const full = match[1].length === 3 ? match[1].replace(/./g, '$&$&') : match[1];
  return [0, 2, 4].map((i) => Number.parseInt(full.slice(i, i + 2), 16)) as [number, number, number];
}

function luminance([r, g, b]: [number, number, number]): number {
  const channel = (v: number): number => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio between two hex colors (1 to 21), or null if either is not a plain hex color. */
export function contrastRatio(a: string | undefined, b: string | undefined): number | null {
  const first = parseHex(a);
  const second = parseHex(b);
  if (!first || !second) return null;
  const [light, dark] = [luminance(first), luminance(second)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

/** Number of modules along one side of a QR code of the given version (1 to 40). */
export function modulesForVersion(version: number): number {
  return 17 + 4 * version;
}

export interface PrintSizeCheck {
  qrWidthMm: number;
  moduleMm: number | null;
  issue: DesignIssue | null;
}

/** Whether the code is big enough when printed at `qrWidthMm` wide (the QR itself, quiet zone excluded). */
export function checkPrintSize(qrWidthMm: number, version: number | null): PrintSizeCheck {
  const moduleMm = version ? qrWidthMm / modulesForVersion(version) : null;

  if (moduleMm !== null && moduleMm < MIN_MODULE_MM) {
    return {
      qrWidthMm,
      moduleMm,
      issue: {
        severity: 'problem',
        text: `At ${qrWidthMm.toFixed(0)} mm wide, each dot is only ${moduleMm.toFixed(2)} mm, too small for phones to read reliably.`,
        fix: 'Make the QR bigger on the card, or shorten the content so the code has fewer dots.',
      },
    };
  }
  if (moduleMm !== null && moduleMm < COMFORTABLE_MODULE_MM) {
    return {
      qrWidthMm,
      moduleMm,
      issue: {
        severity: 'warning',
        text: `At ${qrWidthMm.toFixed(0)} mm wide, each dot is ${moduleMm.toFixed(2)} mm. It may be hard to scan on some phones or rough paper.`,
        fix: 'Print a test copy at 100% and scan it, or make the QR a little bigger.',
      },
    };
  }
  if (qrWidthMm < MIN_QR_WIDTH_MM) {
    return {
      qrWidthMm,
      moduleMm,
      issue: {
        severity: 'warning',
        text: `The QR is ${qrWidthMm.toFixed(0)} mm wide. About ${MIN_QR_WIDTH_MM} mm is the usual minimum.`,
        fix: 'Make the QR bigger, or test a printed copy first.',
      },
    };
  }
  return { qrWidthMm, moduleMm, issue: null };
}

export { QUIET_ZONE_MODULES };

/** Design problems that make a code hard to scan, judged from its style alone (no image needed). */
export function checkDesign(config: QRDesignConfig): DesignIssue[] {
  const issues: DesignIssue[] = [];

  const stops = config.dotGradient?.colorStops.map((stop) => stop.color) ?? [config.dotColor ?? '#000000'];
  const background = config.backgroundColor ?? '#FFFFFF';
  const ratios = stops.map((color) => contrastRatio(color, background)).filter((r): r is number => r !== null);
  const worst = ratios.length ? Math.min(...ratios) : null;

  if (worst !== null && worst < 3) {
    issues.push({
      severity: 'problem',
      text: `The dots and background are too similar in brightness (contrast ${worst.toFixed(1)}:1).`,
      fix: 'Use much darker dots on a lighter background.',
    });
  } else if (worst !== null && worst < 4.5) {
    issues.push({
      severity: 'warning',
      text: `Contrast between the dots and background is modest (${worst.toFixed(1)}:1).`,
      fix: 'Darken the dots or lighten the background for reliable scanning.',
    });
  }

  const dotColor = parseHex(config.dotColor);
  const bgColor = parseHex(background);
  if (!config.dotGradient && dotColor && bgColor && luminance(dotColor) > luminance(bgColor)) {
    issues.push({
      severity: 'warning',
      text: 'The dots are lighter than the background (an inverted code). Many scanners cannot read these.',
      fix: 'Use dark dots on a light background.',
    });
  }

  if (config.backgroundOpacity !== undefined && config.backgroundOpacity < 100 && !config.backgroundGradient) {
    issues.push({
      severity: 'warning',
      text: 'The QR background is see-through, so whatever is behind it affects scanning.',
      fix: 'Set the QR background opacity to 100%, or place the code on a plain area.',
    });
  }

  if (config.logoUrl) {
    const size = config.logoSize ?? 0.4;
    if (size > 0.4) {
      issues.push({
        severity: 'problem',
        text: `The logo covers a large part of the code (${Math.round(size * 100)}%).`,
        fix: 'Shrink the logo to 30% or less.',
      });
    } else if (size > 0.3) {
      issues.push({
        severity: 'warning',
        text: `The logo is fairly large (${Math.round(size * 100)}%) and hides part of the code.`,
        fix: 'Shrink the logo to about 25 to 30%, and use High error correction.',
      });
    }
    if (config.errorCorrectionLevel && config.errorCorrectionLevel !== 'H' && config.errorCorrectionLevel !== 'Q') {
      issues.push({
        severity: 'warning',
        text: 'A logo is placed on a code with low error correction.',
        fix: 'Switch error correction to High so the code survives the logo.',
      });
    }
  }

  if (config.data.length > 400) {
    issues.push({
      severity: 'warning',
      text: `The code holds a lot of text (${config.data.length} characters), so it is dense and needs to be printed larger.`,
      fix: 'Shorten the content, or use a dynamic code so the code holds only a short link.',
    });
  }

  return issues;
}
