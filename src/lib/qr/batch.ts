import {
  buildEmailPayload,
  buildPhonePayload,
  buildTextPayload,
  buildUrlPayload,
} from '@/lib/qr/payloads';
import type { QRType } from '@/types/qr';

/** Types that a single "content" column can describe. */
export const BATCH_QR_TYPES = ['url', 'text', 'phone', 'email'] as const satisfies readonly QRType[];
export type BatchQRType = (typeof BATCH_QR_TYPES)[number];

export const MAX_BATCH_ROWS = 200;
const MAX_NAME_LENGTH = 200;
const MAX_CONTENT_LENGTH = 2000;

export interface BatchRowInput {
  name: string;
  qrType: BatchQRType;
  content: string;
  isDynamic: boolean;
  tags: string[];
}

export interface BatchRow extends BatchRowInput {
  /** 1-based row number in the file (the header is row 1). */
  line: number;
  /** Set when the row cannot be created. */
  error?: string;
}

export interface ValidBatchRow extends BatchRowInput {
  payload: string;
  payloadFields: Record<string, string>;
}

/** Splits CSV text into rows of cells. Handles quotes, escaped quotes, CRLF and a BOM. */
export function parseCsv(text: string): string[][] {
  const input = text.replace(/^﻿/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    if (inQuotes) {
      if (char === '"' && input[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') inQuotes = true;
    else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && input[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }

  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows.filter((cells) => cells.some((value) => value.trim() !== ''));
}

const HEADER_ALIASES: Record<string, 'name' | 'content' | 'type' | 'dynamic' | 'tags'> = {
  name: 'name',
  title: 'name',
  label: 'name',
  content: 'content',
  url: 'content',
  link: 'content',
  value: 'content',
  data: 'content',
  text: 'content',
  type: 'type',
  dynamic: 'dynamic',
  tags: 'tags',
  tag: 'tags',
};

const TRUTHY = new Set(['yes', 'y', 'true', '1', 'dynamic']);

/**
 * Turns CSV text into batch rows, marking any that cannot be created.
 * Returns a file-level error (instead of rows) when the file is unusable.
 */
export function parseBatchCsv(text: string): { rows: BatchRow[]; fileError?: string } {
  const table = parseCsv(text);

  if (table.length === 0) return { rows: [], fileError: 'The file is empty.' };

  const headers = table[0].map((header) => HEADER_ALIASES[header.trim().toLowerCase()]);
  if (!headers.includes('name') || !headers.includes('content')) {
    return {
      rows: [],
      fileError: 'The first row must be a header with at least "name" and "content" (or "url") columns.',
    };
  }

  const body = table.slice(1);
  if (body.length === 0) return { rows: [], fileError: 'The file has a header but no rows.' };
  if (body.length > MAX_BATCH_ROWS) {
    return { rows: [], fileError: `A file can have at most ${MAX_BATCH_ROWS} rows (this one has ${body.length}).` };
  }

  const rows = body.map((cells, index): BatchRow => {
    const get = (field: string): string => {
      const at = headers.indexOf(field as (typeof headers)[number]);
      return at === -1 ? '' : (cells[at] ?? '').trim();
    };

    const typeText = get('type').toLowerCase();
    const known = BATCH_QR_TYPES.find((type) => type === typeText);
    const row: BatchRow = {
      line: index + 2,
      name: get('name'),
      qrType: known ?? 'url',
      content: get('content'),
      isDynamic: TRUTHY.has(get('dynamic').toLowerCase()),
      tags: get('tags')
        .split(/[;|]/)
        .map((tag) => tag.trim())
        .filter(Boolean),
    };

    if (typeText && !known) {
      row.error = `Unsupported type "${typeText}" (use ${BATCH_QR_TYPES.join(', ')}).`;
      return row;
    }

    const problem = validateBatchRow(row);
    if (problem) row.error = problem;
    return row;
  });

  return { rows };
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^\+?[\d\s().-]{5,25}$/;

/** Returns a human-readable problem with the row, or null when it is fine. */
export function validateBatchRow(row: BatchRowInput): string | null {
  if (!row.name.trim()) return 'Name is missing.';
  if (row.name.length > MAX_NAME_LENGTH) return `Name is longer than ${MAX_NAME_LENGTH} characters.`;
  if (!row.content.trim()) return 'Content is missing.';
  if (row.content.length > MAX_CONTENT_LENGTH) return `Content is longer than ${MAX_CONTENT_LENGTH} characters.`;

  switch (row.qrType) {
    case 'url': {
      try {
        const url = new URL(buildUrlPayload(row.content.trim()));
        if (!url.hostname.includes('.') && url.hostname !== 'localhost') return 'That does not look like a web address.';
      } catch {
        return 'That does not look like a web address.';
      }
      return null;
    }
    case 'email':
      return EMAIL.test(row.content.trim()) ? null : 'That is not a valid email address.';
    case 'phone':
      return PHONE.test(row.content.trim()) ? null : 'That is not a valid phone number.';
    case 'text':
      return row.isDynamic ? 'Plain text cannot be a dynamic QR (it has no link to redirect to).' : null;
    default: {
      const _exhaustive: never = row.qrType;
      return `Unsupported type ${String(_exhaustive)}.`;
    }
  }
}

/** Builds the encoded payload and the form fields the editor needs to reopen the QR. */
export function buildBatchPayload(row: BatchRowInput): { payload: string; payloadFields: Record<string, string> } {
  const content = row.content.trim();

  switch (row.qrType) {
    case 'url':
      return { payload: buildUrlPayload(content), payloadFields: { url: content } };
    case 'text':
      return { payload: buildTextPayload(content), payloadFields: { text: content } };
    case 'phone':
      return { payload: buildPhonePayload(content), payloadFields: { phone: content } };
    case 'email':
      return { payload: buildEmailPayload(content), payloadFields: { address: content, subject: '', body: '' } };
    default: {
      const _exhaustive: never = row.qrType;
      throw new Error(`Unsupported batch type: ${String(_exhaustive)}`);
    }
  }
}

/** A spreadsheet-ready template people can download and fill in. */
export const BATCH_CSV_TEMPLATE = [
  'name,type,content,dynamic,tags',
  'Company website,url,https://example.com,yes,marketing;web',
  'Front desk phone,phone,+1 555 010 2000,no,office',
  'Support email,email,help@example.com,no,',
  'Welcome note,text,Thanks for visiting!,no,',
].join('\n');
