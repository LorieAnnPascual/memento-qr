import { describe, it, expect } from 'vitest';

import { MAX_RESTORE_ROWS, parseBackup } from '@/lib/export/parse-backup';

const QR = { name: 'Menu', qrType: 'url', payload: 'https://example.com', styleConfig: { dotStyle: 'dots' } };
const file = (extra: Record<string, unknown> = {}) => ({ app: 'memento-qr', formatVersion: 1, ...extra });

describe('parseBackup', () => {
  it('rejects things that are not a backup', () => {
    for (const input of [null, 'text', 42, {}, { app: 'other', formatVersion: 1 }]) {
      expect(parseBackup(input).ok).toBe(false);
    }
  });

  it('rejects a backup from another format version', () => {
    const result = parseBackup({ app: 'memento-qr', formatVersion: 99 });

    expect(result).toMatchObject({ ok: false });
  });

  it('accepts an empty backup', () => {
    expect(parseBackup(file())).toMatchObject({ ok: true, backup: { qrCodes: [], pages: [], invalid: 0 } });
  });

  it('keeps valid rows and counts malformed ones', () => {
    const result = parseBackup(
      file({ qrCodes: [QR, { name: '', qrType: 'url', payload: 'x', styleConfig: {} }, { qrType: 'nope' }] }),
    );

    expect(result.ok && result.backup.qrCodes).toHaveLength(1);
    expect(result.ok && result.backup.invalid).toBe(2);
  });

  it('turns dates into Date objects and ignores unreadable ones', () => {
    const good = parseBackup(file({ qrCodes: [{ ...QR, expiresAt: '2030-01-01T00:00:00.000Z' }] }));
    const bad = parseBackup(file({ qrCodes: [{ ...QR, expiresAt: 'not a date' }] }));

    expect(good.ok && good.backup.qrCodes[0].expiresAt).toBeInstanceOf(Date);
    expect(bad.ok && bad.backup.qrCodes[0].expiresAt).toBeNull();
  });

  it('refuses short links that could break out of the /q/ path', () => {
    const result = parseBackup(file({ qrCodes: [{ ...QR, isDynamic: true, shortCode: '../admin' }] }));

    expect(result.ok && result.backup.qrCodes).toHaveLength(0);
  });

  it('refuses more rows than one restore allows', () => {
    const rows = Array.from({ length: MAX_RESTORE_ROWS + 1 }, () => QR);

    expect(parseBackup(file({ qrCodes: rows })).ok).toBe(false);
  });

  it('refuses oversized design data', () => {
    const big = { junk: 'x'.repeat(600_000) };

    expect(parseBackup(file({ qrTemplates: [{ name: 'T', styleConfig: big }] }))).toMatchObject({
      ok: true,
      backup: { qrTemplates: [], invalid: 1 },
    });
  });

  it('ignores scan history and activity in the file', () => {
    const result = parseBackup(file({ scanEvents: [{ a: 1 }], activity: [{ b: 2 }] }));

    expect(result.ok && Object.keys(result.backup)).not.toContain('scanEvents');
  });
});
