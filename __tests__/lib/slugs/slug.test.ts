import { describe, it, expect } from 'vitest';

import {
  cleanSlugWhileTyping,
  isValidSlug,
  normalizeSlug,
  parseSlugInput,
  slugProblem,
  SLUG_MAX_LENGTH,
} from '@/lib/slugs/slug';

describe('normalizeSlug', () => {
  it('lowercases and turns spaces into hyphens', () => {
    expect(normalizeSlug('Ana Memorial')).toBe('ana-memorial');
    expect(normalizeSlug('ana_memorial')).toBe('ana-memorial');
  });

  it('drops punctuation and accents', () => {
    expect(normalizeSlug("Ana's Café 2026!")).toBe('anas-cafe-2026');
  });

  it('collapses repeated hyphens and trims the edges', () => {
    expect(normalizeSlug('--ana---memorial--')).toBe('ana-memorial');
    expect(normalizeSlug('  spaced   out  ')).toBe('spaced-out');
  });

  it('removes anything that could escape the path', () => {
    expect(normalizeSlug('../admin')).toBe('admin');
    expect(normalizeSlug('a/b?c=d#e')).toBe('abcde');
    expect(normalizeSlug('<script>alert(1)</script>')).toBe('scriptalert1script');
  });

  it('returns an empty string when nothing usable is left', () => {
    expect(normalizeSlug('!!!')).toBe('');
    expect(normalizeSlug('')).toBe('');
  });
});

describe('slugProblem', () => {
  it('accepts normal names', () => {
    for (const slug of ['ana-memorial', 'abc', 'event-2026-june', 'k7x2mq']) {
      expect(slugProblem(slug)).toBeNull();
      expect(isValidSlug(slug)).toBe(true);
    }
  });

  it('refuses names that are too short or too long', () => {
    expect(slugProblem('ab')).toMatch(/at least 3/);
    expect(slugProblem('a'.repeat(SLUG_MAX_LENGTH))).toBeNull();
    expect(slugProblem('a'.repeat(SLUG_MAX_LENGTH + 1))).toMatch(/at most 30/);
  });

  it('refuses anything but lowercase letters, numbers and single hyphens', () => {
    for (const slug of ['Ana', 'ana memorial', 'ana_memorial', '-ana', 'ana-', 'ana--memorial', 'ana.memorial', 'ana/x']) {
      expect(slugProblem(slug)).toMatch(/lowercase letters/);
    }
  });
});

describe('parseSlugInput', () => {
  it('treats blank input as "no name given"', () => {
    for (const blank of [undefined, null, '', '   ']) {
      expect(parseSlugInput(blank)).toEqual({ ok: true, slug: null });
    }
  });

  it('cleans up and accepts a good name', () => {
    expect(parseSlugInput('  Ana Memorial ')).toEqual({ ok: true, slug: 'ana-memorial' });
  });

  it('explains why a name is not allowed', () => {
    expect(parseSlugInput('ab')).toMatchObject({ ok: false });
    expect(parseSlugInput('!!!')).toMatchObject({ ok: false });
    expect(parseSlugInput('x'.repeat(80))).toMatchObject({ ok: false, error: expect.stringMatching(/at most/) });
  });
});

describe('cleanSlugWhileTyping', () => {
  it('keeps a trailing hyphen so the next word can be typed', () => {
    expect(cleanSlugWhileTyping('ana-')).toBe('ana-');
    expect(cleanSlugWhileTyping('ana ')).toBe('ana-');
  });

  it('still removes characters that can never be part of a name', () => {
    expect(cleanSlugWhileTyping('Ana/Memorial!')).toBe('anamemorial');
    expect(cleanSlugWhileTyping('-ana--x')).toBe('ana-x');
  });
});
