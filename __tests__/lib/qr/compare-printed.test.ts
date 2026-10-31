import { describe, it, expect } from 'vitest';

import { comparePrinted } from '@/lib/qr/compare-printed';
import { validatePrintedCopy } from '@/lib/qr/read-image';

const LINK = 'https://memento.example/q/ana-memorial';

describe('comparePrinted', () => {
  it('says no code was found when nothing could be read', () => {
    const check = comparePrinted({ decoded: null, expectedPayload: LINK, isDynamic: true });
    expect(check.kind).toBe('unreadable');
    expect(check.safeToChangeType).toBe(false);
  });

  it('is safe to change the type when the print is this dynamic code\'s own link', () => {
    const check = comparePrinted({ decoded: LINK, expectedPayload: LINK, isDynamic: true });
    expect(check).toMatchObject({ kind: 'match', safeToChangeType: true });
  });

  it('ignores letter case and a trailing slash in the link name', () => {
    const check = comparePrinted({ decoded: 'https://memento.example/q/Ana-Memorial/', expectedPayload: LINK, isDynamic: true });
    expect(check.safeToChangeType).toBe(true);
  });

  it('matches a static code but says its type cannot change', () => {
    const check = comparePrinted({ decoded: 'https://canva.example/x', expectedPayload: 'https://canva.example/x', isDynamic: false });
    expect(check.kind).toBe('match');
    expect(check.safeToChangeType).toBe(false);
    expect(check.headline).toMatch(/static/i);
  });

  it('flags a Memento link that is not this code\'s current link', () => {
    const check = comparePrinted({ decoded: 'https://memento.example/q/other-code', expectedPayload: LINK, isDynamic: true });
    expect(check.kind).toBe('different-link');
    expect(check.safeToChangeType).toBe(false);
  });

  it('flags the same link name on another website address', () => {
    const check = comparePrinted({ decoded: 'https://old-site.example/q/ana-memorial', expectedPayload: LINK, isDynamic: true });
    expect(check.kind).toBe('other-website');
    expect(check.safeToChangeType).toBe(false);
  });

  it('says a print that holds a Canva address is static and cannot be changed from Memento', () => {
    const check = comparePrinted({ decoded: 'https://www.canva.com/design/abc', expectedPayload: LINK, isDynamic: true });
    expect(check.kind).toBe('not-a-memento-link');
    expect(check.safeToChangeType).toBe(false);
  });

  it('does not treat plain text as a link', () => {
    const check = comparePrinted({ decoded: 'hello world', expectedPayload: LINK, isDynamic: true });
    expect(check.kind).toBe('not-a-memento-link');
  });
});

describe('validatePrintedCopy', () => {
  it('accepts PNG and JPG', () => {
    expect(validatePrintedCopy({ type: 'image/png', size: 1000 })).toBeNull();
    expect(validatePrintedCopy({ type: 'image/jpeg', size: 1000 })).toBeNull();
  });

  it('refuses other kinds of file', () => {
    expect(validatePrintedCopy({ type: 'application/pdf', size: 1000 })).toMatch(/PNG or JPG/);
    expect(validatePrintedCopy({ type: 'image/svg+xml', size: 1000 })).toMatch(/PNG or JPG/);
  });

  it('refuses a picture over 8 MB', () => {
    expect(validatePrintedCopy({ type: 'image/png', size: 9 * 1024 * 1024 })).toMatch(/8 MB/);
  });
});
