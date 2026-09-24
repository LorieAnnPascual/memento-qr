import { describe, it, expect, vi, beforeEach } from 'vitest';

import { chainable } from '../../helpers/db-mock';

const dbMock = vi.hoisted(() => ({ select: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn() }));
vi.mock('@/lib/db', () => ({ db: dbMock }));

import {
  countResults,
  isSearchable,
  MAX_QUERY_LENGTH,
  searchWorkspace,
  toLikePattern,
} from '@/lib/search/search';

beforeEach(() => {
  for (const fn of Object.values(dbMock)) fn.mockReset();
});

describe('toLikePattern', () => {
  it('wraps the text so it matches anywhere', () => {
    expect(toLikePattern('menu')).toBe('%menu%');
  });

  it('trims the text', () => {
    expect(toLikePattern('  menu  ')).toBe('%menu%');
  });

  it('makes wildcard characters match themselves', () => {
    expect(toLikePattern('100%')).toBe('%100\\%%');
    expect(toLikePattern('a_b')).toBe('%a\\_b%');
    expect(toLikePattern('back\\slash')).toBe('%back\\\\slash%');
  });

  it('caps very long input', () => {
    expect(toLikePattern('x'.repeat(500)).length).toBe(MAX_QUERY_LENGTH + 2);
  });
});

describe('isSearchable', () => {
  it('needs at least two visible characters', () => {
    expect(isSearchable('')).toBe(false);
    expect(isSearchable('a')).toBe(false);
    expect(isSearchable('  a  ')).toBe(false);
    expect(isSearchable('ab')).toBe(true);
  });
});

describe('searchWorkspace', () => {
  it('does not touch the database for a query that is too short', async () => {
    const results = await searchWorkspace(' a ');

    expect(dbMock.select).not.toHaveBeenCalled();
    expect(countResults(results)).toBe(0);
  });

  it('searches QR codes, pages, folders and both kinds of template at once', async () => {
    dbMock.select
      .mockReturnValueOnce(chainable([{ id: 'q1', name: 'Menu QR' }]))
      .mockReturnValueOnce(chainable([{ id: 'p1', name: 'Menu page' }]))
      .mockReturnValueOnce(chainable([{ id: 'f1', name: 'Menus' }]))
      .mockReturnValueOnce(chainable([{ id: 't1', name: 'Menu style', category: 'business', isSystem: true }]))
      .mockReturnValueOnce(chainable([{ id: 't2', name: 'Menu layout', category: 'restaurant', isSystem: true }]));

    const results = await searchWorkspace('  menu ');

    expect(dbMock.select).toHaveBeenCalledTimes(5);
    expect(results.query).toBe('menu');
    expect(results.qrCodes).toHaveLength(1);
    expect(results.pages).toHaveLength(1);
    expect(results.folders).toHaveLength(1);
    expect(results.templates.map((t) => t.kind)).toEqual(['qr', 'page']);
    expect(countResults(results)).toBe(5);
  });

  it('returns empty groups when nothing matches', async () => {
    for (let i = 0; i < 5; i++) dbMock.select.mockReturnValueOnce(chainable([]));

    expect(countResults(await searchWorkspace('zzzz'))).toBe(0);
  });
});
