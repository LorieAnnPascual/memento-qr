import { describe, it, expect } from 'vitest';

import { CreateQRSchema, CreateTemplateSchema, UpdateQRSchema } from '@/lib/qr/schemas';

const valid = { name: 'Menu', qrType: 'url', payload: 'https://example.com', styleConfig: { dotColor: '#000000' } };

describe('CreateQRSchema', () => {
  it('accepts a normal QR code', () => {
    expect(CreateQRSchema.safeParse(valid).success).toBe(true);
  });

  it('trims the name and rejects an empty or overlong one', () => {
    expect(CreateQRSchema.parse({ ...valid, name: '  Menu  ' }).name).toBe('Menu');
    expect(CreateQRSchema.safeParse({ ...valid, name: '   ' }).success).toBe(false);
    expect(CreateQRSchema.safeParse({ ...valid, name: 'n'.repeat(201) }).success).toBe(false);
  });

  it('rejects unknown types and missing fields', () => {
    expect(CreateQRSchema.safeParse({ ...valid, qrType: 'nope' }).success).toBe(false);
    expect(CreateQRSchema.safeParse({ name: 'x', qrType: 'url' }).success).toBe(false);
  });

  it('caps the payload at 4096 characters', () => {
    expect(CreateQRSchema.safeParse({ ...valid, payload: 'a'.repeat(4096) }).success).toBe(true);
    expect(CreateQRSchema.safeParse({ ...valid, payload: 'a'.repeat(4097) }).success).toBe(false);
  });

  it('accepts a large but realistic design and rejects an absurd one', () => {
    const realistic = { junk: 'x'.repeat(200_000) };
    const absurd = { junk: 'x'.repeat(600_000) };

    expect(CreateQRSchema.safeParse({ ...valid, styleConfig: realistic }).success).toBe(true);
    expect(CreateQRSchema.safeParse({ ...valid, styleConfig: absurd }).success).toBe(false);
  });

  it('caps payloadFields too', () => {
    expect(CreateQRSchema.safeParse({ ...valid, payloadFields: { note: 'x'.repeat(150_000) } }).success).toBe(false);
  });

  it('caps a template design the same way', () => {
    const template = { name: 'T', styleConfig: { junk: 'x'.repeat(600_000) } };

    expect(CreateTemplateSchema.safeParse(template).success).toBe(false);
  });
});

describe('UpdateQRSchema', () => {
  it('lets a partial update leave isDynamic alone (no silent default)', () => {
    expect(UpdateQRSchema.parse({ name: 'Renamed' })).toEqual({ name: 'Renamed' });
  });

  it('accepts pausing on its own', () => {
    expect(UpdateQRSchema.parse({ isPaused: true })).toEqual({ isPaused: true });
  });
});
