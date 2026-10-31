import { describe, it, expect, vi } from 'vitest';

import { changedFields, describeChange, restoreValues, snapshotOf, type QrSnapshot } from '@/lib/qr/versions';
import type { QRCode } from '@/lib/db/schema';

vi.mock('@/lib/db', () => ({ db: {} }));

const ROW = {
  id: 'qr-1',
  name: 'Memorial',
  qrType: 'url',
  payload: 'http://localhost:3000/q/abc123',
  payloadFields: { url: 'https://canva.example/old' },
  isDynamic: true,
  shortCode: 'abc123',
  targetUrl: 'https://canva.example/old',
  styleConfig: { dotColor: '#000000' },
  isPaused: false,
  expiresAt: null,
  scanLimit: null,
  tags: null,
  notes: null,
  folderId: null,
} as unknown as QRCode;

describe('snapshotOf', () => {
  it('keeps what can be edited and leaves out the link name and the dynamic switch', () => {
    const snapshot = snapshotOf(ROW);

    expect(snapshot).toMatchObject({ name: 'Memorial', qrType: 'url', targetUrl: 'https://canva.example/old' });
    expect(snapshot).not.toHaveProperty('shortCode');
    expect(snapshot).not.toHaveProperty('isDynamic');
  });

  it('writes the expiry as an ISO string', () => {
    const snapshot = snapshotOf({ ...ROW, expiresAt: new Date('2026-12-01T00:00:00Z') });
    expect(snapshot.expiresAt).toBe('2026-12-01T00:00:00.000Z');
  });
});

describe('changedFields', () => {
  const before = snapshotOf(ROW);

  it('is empty when nothing differs', () => {
    expect(changedFields(before, snapshotOf(ROW))).toEqual([]);
  });

  it('names each changed thing once, in a stable order', () => {
    const after: QrSnapshot = {
      ...before,
      qrType: 'video',
      targetUrl: 'http://localhost:3000/media/p/new.mp4',
      payloadFields: { videoUrl: 'x' },
      styleConfig: { dotColor: '#ff0000' },
    };

    expect(changedFields(before, after)).toEqual(['type', 'destination', 'content', 'design']);
  });

  it('treats null and undefined alike', () => {
    expect(changedFields({ ...before, notes: null }, { ...before, notes: undefined as unknown as null })).toEqual([]);
  });
});

describe('describeChange', () => {
  it('lists what changed', () => {
    expect(describeChange(['name', 'design'])).toBe('Changed name, design');
  });

  it('says so when a save changed nothing', () => {
    expect(describeChange([])).toBe('Saved without changes');
  });
});

describe('restoreValues', () => {
  const snapshot = snapshotOf({ ...ROW, payload: 'static content' });

  it('leaves a dynamic code its short link', () => {
    expect(restoreValues(snapshot, true)).not.toHaveProperty('payload');
  });

  it('restores the content of a static code', () => {
    expect(restoreValues(snapshot, false)).toMatchObject({ payload: 'static content' });
  });

  it('never touches the link name or the dynamic switch', () => {
    const values = restoreValues(snapshot, true);
    expect(values).not.toHaveProperty('shortCode');
    expect(values).not.toHaveProperty('isDynamic');
  });

  it('turns the stored expiry back into a date', () => {
    const values = restoreValues({ ...snapshot, expiresAt: '2026-12-01T00:00:00.000Z' }, true);
    expect(values.expiresAt).toEqual(new Date('2026-12-01T00:00:00.000Z'));
  });
});
