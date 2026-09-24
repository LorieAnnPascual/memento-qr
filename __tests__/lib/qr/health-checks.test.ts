import { describe, it, expect } from 'vitest';

import { checkDesign, checkPrintSize, contrastRatio, modulesForVersion } from '@/lib/qr/design-checks';
import { buildVerdict } from '@/lib/qr/health-verdict';
import { evaluateHealth } from '@/lib/monitoring/evaluate-health';
import type { QrStatus } from '@/lib/qr/status';

const OK_STATUS: QrStatus = { health: 'ok', label: 'Working', detail: 'ok', destination: 'https://example.com' };
const REACHABLE = { result: 'reachable', message: 'answered' } as const;
const READ = { found: true, text: 'https://x.co/q/abc', version: 3 };

describe('contrastRatio', () => {
  it('is 21 for black on white and 1 for identical colors', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 0);
    expect(contrastRatio('#777777', '#777777')).toBeCloseTo(1, 5);
  });

  it('accepts 3-digit hex and ignores case', () => {
    expect(contrastRatio('#000', '#fff')).toBeCloseTo(21, 0);
  });

  it('returns null for anything that is not a plain hex color', () => {
    expect(contrastRatio('red', '#FFFFFF')).toBeNull();
    expect(contrastRatio(undefined, '#FFFFFF')).toBeNull();
  });
});

describe('checkDesign', () => {
  const base = { data: 'https://x.co' };

  it('finds nothing wrong with a dark code on white', () => {
    expect(checkDesign({ ...base, dotColor: '#000000', backgroundColor: '#FFFFFF' })).toEqual([]);
  });

  it('treats the defaults as fine', () => {
    expect(checkDesign(base)).toEqual([]);
  });

  it('flags very low contrast as a problem, and modest contrast as a warning', () => {
    const bad = checkDesign({ ...base, dotColor: '#DDDDDD', backgroundColor: '#FFFFFF' });
    expect(bad[0].severity).toBe('problem');
    expect(bad[0].fix).toMatch(/darker/i);

    const modest = checkDesign({ ...base, dotColor: '#888888', backgroundColor: '#FFFFFF' });
    expect(modest.some((i) => i.severity === 'warning' && /modest/.test(i.text))).toBe(true);
  });

  it('judges a gradient by its weakest stop', () => {
    const issues = checkDesign({
      ...base,
      backgroundColor: '#FFFFFF',
      dotGradient: { type: 'linear', colorStops: [{ offset: 0, color: '#000000' }, { offset: 1, color: '#EEEEEE' }] },
    });

    expect(issues.some((i) => i.severity === 'problem')).toBe(true);
  });

  it('warns about an inverted (light on dark) code', () => {
    const issues = checkDesign({ ...base, dotColor: '#FFFFFF', backgroundColor: '#000000' });

    expect(issues.some((i) => /inverted/.test(i.text))).toBe(true);
  });

  it('warns about a see-through background', () => {
    expect(checkDesign({ ...base, backgroundOpacity: 50 }).some((i) => /see-through/.test(i.text))).toBe(true);
    expect(checkDesign({ ...base, backgroundOpacity: 100 })).toEqual([]);
  });

  it('flags a big logo as a problem, a fairly big one as a warning, a small one as fine', () => {
    const logo = { ...base, logoUrl: 'https://x.co/l.png', errorCorrectionLevel: 'H' as const };

    expect(checkDesign({ ...logo, logoSize: 0.5 })[0].severity).toBe('problem');
    expect(checkDesign({ ...logo, logoSize: 0.35 })[0].severity).toBe('warning');
    expect(checkDesign({ ...logo, logoSize: 0.25 })).toEqual([]);
  });

  it('warns when a logo sits on low error correction', () => {
    const issues = checkDesign({ ...base, logoUrl: 'https://x.co/l.png', logoSize: 0.2, errorCorrectionLevel: 'L' });

    expect(issues.some((i) => /error correction/.test(i.text))).toBe(true);
  });

  it('warns about a lot of text and suggests a dynamic code', () => {
    const issues = checkDesign({ ...base, data: 'x'.repeat(500) });

    expect(issues[0].fix).toMatch(/dynamic/);
  });
});

describe('checkPrintSize', () => {
  it('computes dots per side from the QR version', () => {
    expect(modulesForVersion(1)).toBe(21);
    expect(modulesForVersion(3)).toBe(29);
  });

  it('passes a comfortably sized code', () => {
    expect(checkPrintSize(30, 3).issue).toBeNull();
  });

  it('warns when dots are small, and flags a problem when they are tiny', () => {
    expect(checkPrintSize(11, 3).issue?.severity).toBe('warning'); // 11mm / 29 dots = 0.38mm
  });

  it('flags tiny dots as a problem', () => {
    const check = checkPrintSize(10, 10);

    expect(check.issue?.severity).toBe('problem');
    expect(check.moduleMm).toBeCloseTo(10 / 57, 4);
  });

  it('warns about a small overall size even when the version is unknown', () => {
    expect(checkPrintSize(15, null).issue?.severity).toBe('warning');
    expect(checkPrintSize(25, null).issue).toBeNull();
  });
});

describe('buildVerdict', () => {
  const clean = { status: OK_STATUS, destination: REACHABLE, expectedContent: READ.text, scan: { full: READ, small: READ }, designIssues: [] };

  it('says Looks good when everything checks out', () => {
    expect(buildVerdict(clean)).toMatchObject({ level: 'good', headline: 'Looks good', issues: [] });
  });

  it('says Not working for a paused code, with a fix', () => {
    const verdict = buildVerdict({ ...clean, status: { ...OK_STATUS, health: 'problem', label: 'Paused', detail: 'x' } });

    expect(verdict.level).toBe('broken');
    expect(verdict.headline).toBe('Not working');
    expect(verdict.issues[0].fix).toMatch(/Resume/);
  });

  it('says Not working when the destination is unreachable', () => {
    const verdict = buildVerdict({ ...clean, destination: { result: 'unreachable', message: 'HTTP 404' } });

    expect(verdict.level).toBe('broken');
  });

  it('says Not working when the reader finds no code or the wrong content', () => {
    const none = { found: false, text: null, version: null };
    expect(buildVerdict({ ...clean, scan: { full: none, small: none } }).level).toBe('broken');
    expect(buildVerdict({ ...clean, scan: { full: { ...READ, text: 'other' }, small: READ } }).level).toBe('broken');
  });

  it('says Needs attention when it reads large but not small', () => {
    const none = { found: false, text: null, version: null };
    const verdict = buildVerdict({ ...clean, scan: { full: READ, small: none } });

    expect(verdict.level).toBe('attention');
  });

  it('says Needs attention for warnings only', () => {
    const verdict = buildVerdict({ ...clean, status: { ...OK_STATUS, health: 'warning', label: 'Working, expires soon', detail: 'x' } });

    expect(verdict.level).toBe('attention');
  });

  it('skips the scan check when the test could not run', () => {
    expect(buildVerdict({ ...clean, scan: null }).level).toBe('good');
  });

  it('lists the most serious issue first', () => {
    const verdict = buildVerdict({
      ...clean,
      designIssues: [
        { severity: 'warning', text: 'minor', fix: 'x' },
        { severity: 'problem', text: 'major', fix: 'y' },
      ],
    });

    expect(verdict.issues.map((i) => i.text)).toEqual(['major', 'minor']);
    expect(verdict.level).toBe('broken');
  });
});

describe('evaluateHealth', () => {
  it('is broken for a problem status, using its label', () => {
    expect(evaluateHealth({ ...OK_STATUS, health: 'problem', label: 'Expired', detail: 'x' }, REACHABLE)).toEqual({ status: 'broken', message: 'Expired' });
  });

  it('is broken for an unreachable destination', () => {
    expect(evaluateHealth(OK_STATUS, { result: 'unreachable', message: 'HTTP 500' })).toEqual({ status: 'broken', message: 'HTTP 500' });
  });

  it('is a warning when close to a limit', () => {
    expect(evaluateHealth({ ...OK_STATUS, health: 'warning', label: 'Working, expires soon', detail: 'x' }, REACHABLE).status).toBe('warning');
  });

  it('is ok otherwise, including when the destination could not be checked', () => {
    expect(evaluateHealth(OK_STATUS, REACHABLE).status).toBe('ok');
    expect(evaluateHealth(OK_STATUS, { result: 'unchecked', message: 'x' }).status).toBe('ok');
  });
});
