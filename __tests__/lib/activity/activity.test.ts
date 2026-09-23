import { describe, it, expect, vi, beforeEach } from 'vitest';

import { chainable } from '../../helpers/db-mock';

const dbMock = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}));
vi.mock('@/lib/db', () => ({ db: dbMock }));

import { describeActivity } from '@/lib/activity/describe';
import { ACTIVITY_ACTIONS } from '@/lib/activity/actions';
import { parseActivityFilter } from '@/lib/activity/queries';
import { formatRelativeTime } from '@/lib/utils/format-relative-time';

describe('describeActivity', () => {
  const entry = (action: string, entityName: string | null = 'Menu', details: unknown = null) => ({
    action,
    entityName,
    details,
  });

  it('describes every known action with a readable sentence', () => {
    for (const action of ACTIVITY_ACTIONS) {
      const text = describeActivity(entry(action, 'Thing', { count: 3, from: 'Old' }));
      expect(text.length).toBeGreaterThan(5);
      expect(text).not.toContain('undefined');
    }
  });

  it('names the item involved', () => {
    expect(describeActivity(entry('qr.created', 'Menu'))).toBe('created the QR code "Menu"');
    expect(describeActivity(entry('page.published', 'Home'))).toBe('published the page "Home"');
  });

  it('distinguishes pausing, resuming and editing', () => {
    expect(describeActivity(entry('qr.updated', 'A', { isPaused: true }))).toMatch(/paused/);
    expect(describeActivity(entry('qr.updated', 'A', { isPaused: false }))).toMatch(/resumed/);
    expect(describeActivity(entry('qr.updated', 'A'))).toMatch(/edited/);
  });

  it('pluralises batch imports and moves', () => {
    expect(describeActivity(entry('qr.batch_created', 'x', { count: 1 }))).toBe('imported 1 QR code from a spreadsheet');
    expect(describeActivity(entry('qr.moved', 'Work', { count: 5 }))).toBe('moved 5 QR codes to "Work"');
  });

  it('tells set and removed page expiry apart', () => {
    expect(describeActivity(entry('page.expiry_changed', 'P', { expiresAt: '2030-01-01' }))).toMatch(/set an expiry/);
    expect(describeActivity(entry('page.expiry_changed', 'P', { expiresAt: null }))).toMatch(/removed the expiry/);
  });

  it('copes with a missing name', () => {
    expect(describeActivity(entry('qr.deleted', null))).toBe('deleted the QR code an item');
  });

  it('does not throw on an action it has never heard of', () => {
    expect(describeActivity(entry('legacy.thing'))).toBe('legacy thing');
  });
});

describe('parseActivityFilter', () => {
  it('accepts known filters and falls back to all', () => {
    expect(parseActivityFilter('qr')).toBe('qr');
    expect(parseActivityFilter('page')).toBe('page');
    expect(parseActivityFilter('nope')).toBe('all');
    expect(parseActivityFilter(undefined)).toBe('all');
  });
});

describe('formatRelativeTime', () => {
  const now = new Date('2026-06-10T12:00:00Z');
  const ago = (ms: number) => new Date(now.getTime() - ms);
  const MIN = 60_000;

  it('uses friendly units', () => {
    expect(formatRelativeTime(ago(10_000), now)).toBe('just now');
    expect(formatRelativeTime(ago(MIN), now)).toBe('1 minute ago');
    expect(formatRelativeTime(ago(5 * MIN), now)).toBe('5 minutes ago');
    expect(formatRelativeTime(ago(60 * MIN), now)).toBe('1 hour ago');
    expect(formatRelativeTime(ago(3 * 60 * MIN), now)).toBe('3 hours ago');
    expect(formatRelativeTime(ago(30 * 60 * MIN), now)).toBe('yesterday');
    expect(formatRelativeTime(ago(4 * 24 * 60 * MIN), now)).toBe('4 days ago');
  });

  it('falls back to a date after a week', () => {
    expect(formatRelativeTime(ago(10 * 24 * 60 * MIN), now)).toBe(new Date('2026-05-31T12:00:00Z').toLocaleDateString());
  });
});

describe('logActivity (real module)', () => {
  beforeEach(() => {
    dbMock.insert.mockReset();
    dbMock.select.mockReset();
    dbMock.update.mockReset();
  });

  async function load() {
    return vi.importActual<typeof import('@/lib/activity/log-activity')>('@/lib/activity/log-activity');
  }

  it('inserts an entry', async () => {
    const values = vi.fn().mockResolvedValue(undefined);
    dbMock.insert.mockReturnValue({ values });
    const { logActivity } = await load();

    await logActivity({ userId: 'u1', action: 'qr.created', entityType: 'qr', entityId: 'q1', entityName: 'Menu' });

    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1', action: 'qr.created', entityType: 'qr', entityName: 'Menu' }),
    );
  });

  it('never throws when the database fails', async () => {
    dbMock.insert.mockReturnValue({ values: vi.fn().mockRejectedValue(new Error('db down')) });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { logActivity } = await load();

    await expect(
      logActivity({ userId: 'u1', action: 'qr.created', entityType: 'qr' }),
    ).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('folds a repeat within the window into the existing entry', async () => {
    dbMock.select.mockReturnValue(chainable([{ id: 'existing' }]));
    const set = vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) }));
    dbMock.update.mockReturnValue({ set });
    const { logActivity } = await load();

    await logActivity({
      userId: 'u1',
      action: 'page.updated',
      entityType: 'page',
      entityId: 'p1',
      entityName: 'Home',
      collapseWithinMs: 600_000,
    });

    expect(set).toHaveBeenCalled();
    expect(dbMock.insert).not.toHaveBeenCalled();
  });

  it('inserts a new entry when nothing recent matches', async () => {
    dbMock.select.mockReturnValue(chainable([]));
    const values = vi.fn().mockResolvedValue(undefined);
    dbMock.insert.mockReturnValue({ values });
    const { logActivity } = await load();

    await logActivity({
      userId: 'u1',
      action: 'page.updated',
      entityType: 'page',
      entityId: 'p1',
      collapseWithinMs: 600_000,
    });

    expect(values).toHaveBeenCalled();
  });
});
