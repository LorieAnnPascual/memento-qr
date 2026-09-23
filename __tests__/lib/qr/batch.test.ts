import { describe, it, expect } from 'vitest';

import {
  BATCH_CSV_TEMPLATE,
  type BatchRowInput,
  buildBatchPayload,
  MAX_BATCH_ROWS,
  parseBatchCsv,
  parseCsv,
  validateBatchRow,
} from '@/lib/qr/batch';

describe('parseCsv', () => {
  it('splits simple rows and cells', () => {
    expect(parseCsv('a,b\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('handles quoted cells with commas, quotes and newlines', () => {
    expect(parseCsv('name,note\n"Smith, J","She said ""hi""\nthere"')).toEqual([
      ['name', 'note'],
      ['Smith, J', 'She said "hi"\nthere'],
    ]);
  });

  it('handles Windows line endings and a byte-order mark', () => {
    expect(parseCsv('﻿a,b\r\n1,2\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('skips completely blank lines', () => {
    expect(parseCsv('a,b\n\n,\n1,2\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('keeps a final row that has no trailing newline', () => {
    expect(parseCsv('a\nb')).toEqual([['a'], ['b']]);
  });
});

describe('parseBatchCsv', () => {
  it('reads name and url columns, defaulting to static url codes', () => {
    const { rows, fileError } = parseBatchCsv('name,url\nSite,example.com');

    expect(fileError).toBeUndefined();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ line: 2, name: 'Site', qrType: 'url', isDynamic: false, tags: [] });
    expect(rows[0].error).toBeUndefined();
  });

  it('accepts header aliases in any case', () => {
    const { rows } = parseBatchCsv('Title,LINK,Tag\nA,https://a.com,x;y');

    expect(rows[0]).toMatchObject({ name: 'A', content: 'https://a.com', tags: ['x', 'y'] });
  });

  it('reads type, dynamic and tags', () => {
    const { rows } = parseBatchCsv('name,type,content,dynamic,tags\nDesk,phone,+1 555 010 2000,yes,office;front');

    expect(rows[0]).toMatchObject({ qrType: 'phone', isDynamic: true, tags: ['office', 'front'] });
    expect(rows[0].error).toBeUndefined();
  });

  it('parses the downloadable template without errors', () => {
    const { rows, fileError } = parseBatchCsv(BATCH_CSV_TEMPLATE);

    expect(fileError).toBeUndefined();
    expect(rows).toHaveLength(4);
    expect(rows.filter((row) => row.error)).toEqual([]);
  });

  it('rejects a file without the required columns', () => {
    expect(parseBatchCsv('foo,bar\n1,2').fileError).toMatch(/header/);
  });

  it('rejects an empty file and a header-only file', () => {
    expect(parseBatchCsv('').fileError).toMatch(/empty/);
    expect(parseBatchCsv('name,url').fileError).toMatch(/no rows/);
  });

  it('rejects files over the row limit', () => {
    const lines = ['name,url', ...Array.from({ length: MAX_BATCH_ROWS + 1 }, (_, i) => `R${i},example.com`)];

    expect(parseBatchCsv(lines.join('\n')).fileError).toMatch(/at most/);
  });

  it('flags bad rows individually and keeps the good ones', () => {
    const { rows } = parseBatchCsv('name,url\nGood,example.com\n,example.com\nBad,not a url\nNone,');

    expect(rows.map((row) => row.error === undefined)).toEqual([true, false, false, false]);
    expect(rows[1].error).toMatch(/Name/);
    expect(rows[2].error).toMatch(/web address/);
    expect(rows[3].error).toMatch(/Content/);
  });

  it('flags unsupported types', () => {
    const { rows } = parseBatchCsv('name,type,content\nWifi,wifi,abc');

    expect(rows[0].error).toMatch(/Unsupported type/);
  });

  it('numbers rows by their line in the file', () => {
    const { rows } = parseBatchCsv('name,url\nA,a.com\nB,b.com');

    expect(rows.map((row) => row.line)).toEqual([2, 3]);
  });
});

describe('validateBatchRow', () => {
  const base: BatchRowInput = { name: 'X', qrType: 'url', content: 'example.com', isDynamic: false, tags: [] };

  it('accepts a normal url row', () => {
    expect(validateBatchRow({ ...base })).toBeNull();
  });

  it('rejects dynamic plain text (nothing to redirect to)', () => {
    expect(validateBatchRow({ ...base, qrType: 'text', content: 'hello', isDynamic: true })).toMatch(/dynamic/i);
  });

  it('validates emails and phone numbers', () => {
    expect(validateBatchRow({ ...base, qrType: 'email', content: 'a@b.co' })).toBeNull();
    expect(validateBatchRow({ ...base, qrType: 'email', content: 'nope' })).toMatch(/email/);
    expect(validateBatchRow({ ...base, qrType: 'phone', content: '+63 917 123 4567' })).toBeNull();
    expect(validateBatchRow({ ...base, qrType: 'phone', content: 'call me' })).toMatch(/phone/);
  });

  it('rejects overlong names and content', () => {
    expect(validateBatchRow({ ...base, name: 'n'.repeat(201) })).toMatch(/Name/);
    expect(validateBatchRow({ ...base, qrType: 'text', content: 'c'.repeat(2001) })).toMatch(/Content/);
  });

  it('does not treat script-like input as a url', () => {
    expect(validateBatchRow({ ...base, content: 'javascript:alert(1)' })).not.toBeNull();
  });
});

describe('buildBatchPayload', () => {
  it('builds each type the same way the designer does', () => {
    const row = { name: 'X', isDynamic: false, tags: [] };

    expect(buildBatchPayload({ ...row, qrType: 'url', content: 'example.com' })).toEqual({
      payload: 'https://example.com',
      payloadFields: { url: 'example.com' },
    });
    expect(buildBatchPayload({ ...row, qrType: 'text', content: 'hi' }).payload).toBe('hi');
    expect(buildBatchPayload({ ...row, qrType: 'phone', content: '+1 555' }).payload).toBe('tel:+1 555');
    expect(buildBatchPayload({ ...row, qrType: 'email', content: 'a@b.co' })).toEqual({
      payload: 'mailto:a@b.co',
      payloadFields: { address: 'a@b.co', subject: '', body: '' },
    });
  });
});
