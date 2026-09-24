import { z } from 'zod';

import { QR_TYPES } from '@/types/qr';

import { BACKUP_FORMAT_VERSION } from './build-backup';

/** Most rows of one kind a single restore accepts (keeps one request from filling the database). */
export const MAX_RESTORE_ROWS = 1000;

const MAX_JSON_BYTES = 500_000;
const SHORT_CODE = /^[a-z0-9]{4,12}$/i;

function withinBytes(value: unknown): boolean {
  return JSON.stringify(value).length <= MAX_JSON_BYTES;
}

const jsonObject = z.record(z.string(), z.unknown()).refine(withinBytes, 'Too large');
const optionalDate = z
  .union([z.string(), z.null()])
  .optional()
  .transform((value) => {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  });

const folderRow = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(200),
});

const qrRow = z.object({
  id: z.string().min(1).optional(),
  name: z.string().trim().min(1).max(200),
  qrType: z.enum(QR_TYPES),
  payload: z.string().min(1).max(4096),
  payloadFields: jsonObject.nullable().optional(),
  isDynamic: z.boolean().optional().default(false),
  shortCode: z.string().regex(SHORT_CODE).nullable().optional(),
  targetUrl: z.string().max(2000).nullable().optional(),
  styleConfig: jsonObject,
  templateId: z.string().nullable().optional(),
  folderId: z.string().nullable().optional(),
  isPaused: z.boolean().optional().default(false),
  expiresAt: optionalDate,
  scanLimit: z.number().int().positive().nullable().optional(),
  tags: z.array(z.string().max(100)).max(50).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

const templateRow = z.object({
  id: z.string().min(1).optional(),
  name: z.string().trim().min(1).max(200),
  description: z.string().max(500).nullable().optional(),
  category: z.string().min(1).max(50).default('custom'),
  styleConfig: jsonObject,
});

const pageRow = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().max(500).nullable().optional(),
  category: z.string().min(1).max(50).default('custom'),
  puckData: jsonObject,
  isPublished: z.boolean().optional().default(false),
  shortCode: z.string().regex(SHORT_CODE).nullable().optional(),
  expiresAt: optionalDate,
});

export type RestoreFolder = z.infer<typeof folderRow>;
export type RestoreQr = z.infer<typeof qrRow>;
export type RestoreTemplate = z.infer<typeof templateRow>;
export type RestorePage = z.infer<typeof pageRow>;

export interface ParsedBackup {
  folders: RestoreFolder[];
  qrCodes: RestoreQr[];
  qrTemplates: RestoreTemplate[];
  pages: RestorePage[];
  /** Rows that were dropped because they were malformed. */
  invalid: number;
}

export type ParseResult = { ok: true; backup: ParsedBackup } | { ok: false; error: string };

function parseRows<T>(rows: unknown, schema: z.ZodType<T>): { rows: T[]; invalid: number } | null {
  if (rows === undefined) return { rows: [], invalid: 0 };
  if (!Array.isArray(rows) || rows.length > MAX_RESTORE_ROWS) return null;

  const valid: T[] = [];
  let invalid = 0;
  for (const row of rows) {
    const result = schema.safeParse(row);
    if (result.success) valid.push(result.data);
    else invalid += 1;
  }
  return { rows: valid, invalid };
}

/** Checks that a value is a Memento QR backup and keeps only the rows that are safe to restore. */
export function parseBackup(input: unknown): ParseResult {
  if (typeof input !== 'object' || input === null) {
    return { ok: false, error: 'This is not a Memento QR backup file.' };
  }
  const file = input as Record<string, unknown>;

  if (file.app !== 'memento-qr') {
    return { ok: false, error: 'This is not a Memento QR backup file.' };
  }
  if (file.formatVersion !== BACKUP_FORMAT_VERSION) {
    return { ok: false, error: 'This backup was made by an incompatible version of the app.' };
  }

  const folders = parseRows(file.folders, folderRow);
  const qrCodes = parseRows(file.qrCodes, qrRow);
  const qrTemplates = parseRows(file.qrTemplates, templateRow);
  const pages = parseRows(file.pages, pageRow);

  if (!folders || !qrCodes || !qrTemplates || !pages) {
    return { ok: false, error: `The backup is malformed or has more than ${MAX_RESTORE_ROWS} items of one kind.` };
  }

  return {
    ok: true,
    backup: {
      folders: folders.rows,
      qrCodes: qrCodes.rows,
      qrTemplates: qrTemplates.rows,
      pages: pages.rows,
      invalid: folders.invalid + qrCodes.invalid + qrTemplates.invalid + pages.invalid,
    },
  };
}
