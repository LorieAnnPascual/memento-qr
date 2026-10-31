import { eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { qrVersions, type QRCode, type qrCodes } from '@/lib/db/schema';

/**
 * Everything about a code that a person can edit. The link name (`short_code`) and whether the code is
 * dynamic are left out on purpose: restoring them would change the printed picture.
 */
export interface QrSnapshot {
  name: string;
  qrType: string;
  /** What a static code encodes. For a dynamic code this is its short link, which a restore never touches. */
  payload: string;
  targetUrl: string | null;
  payloadFields: unknown;
  styleConfig: unknown;
  isPaused: boolean;
  expiresAt: string | null;
  scanLimit: number | null;
  tags: string[] | null;
  notes: string | null;
  folderId: string | null;
}

/** What to call each snapshot field when saying what changed. */
const FIELD_LABELS: ReadonlyArray<[keyof QrSnapshot, string]> = [
  ['name', 'name'],
  ['qrType', 'type'],
  ['targetUrl', 'destination'],
  ['payload', 'content'],
  ['payloadFields', 'content'],
  ['styleConfig', 'design'],
  ['isPaused', 'pause setting'],
  ['expiresAt', 'expiry'],
  ['scanLimit', 'scan limit'],
  ['tags', 'tags'],
  ['notes', 'notes'],
  ['folderId', 'folder'],
];

export function snapshotOf(row: QRCode): QrSnapshot {
  return {
    name: row.name,
    qrType: row.qrType,
    payload: row.payload,
    targetUrl: row.targetUrl,
    payloadFields: row.payloadFields ?? null,
    styleConfig: row.styleConfig,
    isPaused: row.isPaused,
    expiresAt: row.expiresAt ? new Date(row.expiresAt).toISOString() : null,
    scanLimit: row.scanLimit,
    tags: row.tags ?? null,
    notes: row.notes ?? null,
    folderId: row.folderId ?? null,
  };
}

/** The labels of the fields that differ, each once, in a stable order ([] when nothing changed). */
export function changedFields(before: QrSnapshot, after: QrSnapshot): string[] {
  const labels: string[] = [];
  for (const [field, label] of FIELD_LABELS) {
    if (JSON.stringify(before[field] ?? null) !== JSON.stringify(after[field] ?? null) && !labels.includes(label)) {
      labels.push(label);
    }
  }
  return labels;
}

export interface DiffRow {
  label: string;
  /** How it is on the code now. */
  now: string;
  /** How it is in the version being looked at. */
  then: string;
}

const MAX_SHOWN = 160;

function show(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'None';
  const text = Array.isArray(value) ? value.join(', ') : String(value);
  return text.length > MAX_SHOWN ? `${text.slice(0, MAX_SHOWN)}…` : text;
}

/**
 * What would change if a version were used, one row per thing, in words a person can read. Large or
 * structured things (the design, the form values) are only said to differ.
 */
export function diffRows(current: QrSnapshot, version: QrSnapshot): DiffRow[] {
  const rows: DiffRow[] = [];
  const differs = (field: keyof QrSnapshot): boolean =>
    JSON.stringify(current[field] ?? null) !== JSON.stringify(version[field] ?? null);
  const add = (label: string, now: unknown, then: unknown): void => {
    rows.push({ label, now: show(now), then: show(then) });
  };

  if (differs('name')) add('Name', current.name, version.name);
  if (differs('qrType')) add('Type', current.qrType, version.qrType);
  if (differs('targetUrl')) add('Destination', current.targetUrl, version.targetUrl);
  if (differs('payload')) add('Content', current.payload, version.payload);
  if (differs('payloadFields')) rows.push({ label: 'Content details', now: 'As it is now', then: 'Different' });
  if (differs('styleConfig')) rows.push({ label: 'Design', now: 'As it is now', then: 'Different' });
  if (differs('isPaused')) add('Paused', current.isPaused ? 'Yes' : 'No', version.isPaused ? 'Yes' : 'No');
  if (differs('expiresAt')) add('Expires', current.expiresAt, version.expiresAt);
  if (differs('scanLimit')) add('Scan limit', current.scanLimit, version.scanLimit);
  if (differs('tags')) add('Tags', current.tags, version.tags);
  if (differs('notes')) add('Notes', current.notes, version.notes);
  if (differs('folderId')) rows.push({ label: 'Folder', now: 'As it is now', then: 'Different' });
  return rows;
}

export function describeChange(labels: readonly string[]): string {
  return labels.length > 0 ? `Changed ${labels.join(', ')}` : 'Saved without changes';
}

/**
 * The column values a restore writes back. A dynamic code keeps its short link (`payload`); a static
 * code's `payload` is its content, so it is restored with the rest.
 */
export function restoreValues(snapshot: QrSnapshot, isDynamic: boolean): Partial<typeof qrCodes.$inferInsert> {
  return {
    name: snapshot.name,
    qrType: snapshot.qrType,
    ...(!isDynamic && { payload: snapshot.payload }),
    targetUrl: snapshot.targetUrl,
    payloadFields: snapshot.payloadFields,
    styleConfig: snapshot.styleConfig ?? {},
    isPaused: snapshot.isPaused,
    expiresAt: snapshot.expiresAt ? new Date(snapshot.expiresAt) : null,
    scanLimit: snapshot.scanLimit,
    tags: snapshot.tags,
    notes: snapshot.notes,
    folderId: snapshot.folderId,
  };
}

export interface RecordedVersion {
  id: string;
  /** What changed, as `changedFields` names it (empty for a restore). */
  changes: string[];
}

interface RecordInput {
  /** The code as it is now, after the change. */
  row: QRCode;
  /** The code as it was before the change; the version is skipped when nothing differs. */
  previous?: QRCode;
  changedBy: string | null;
  restoredFromId?: string | null;
  summary?: string;
}

/**
 * Remembers what a code looked like after a change. This is bookkeeping: failing to record a version
 * must never fail the edit itself.
 */
export async function recordVersion(input: RecordInput): Promise<RecordedVersion | null> {
  try {
    const after = snapshotOf(input.row);
    const labels = input.previous ? changedFields(snapshotOf(input.previous), after) : [];
    if (input.previous && labels.length === 0) return null;

    // The id is made here (not by the database) so the activity log can point at this version.
    const id = crypto.randomUUID();
    await db.insert(qrVersions).values({
      id,
      qrCodeId: input.row.id,
      snapshot: after,
      summary: input.summary ?? describeChange(labels),
      changedBy: input.changedBy,
      restoredFromId: input.restoredFromId ?? null,
    });
    return { id, changes: labels };
  } catch (error) {
    console.error('QR version error:', error);
    return null;
  }
}

/**
 * Writes the "original" version for a code that has none yet (made before version history existed),
 * dated when the code was made, so its first change can be undone. Never throws.
 */
export async function ensureBaselineVersion(row: QRCode): Promise<void> {
  try {
    const existing = await db
      .select({ id: qrVersions.id })
      .from(qrVersions)
      .where(eq(qrVersions.qrCodeId, row.id))
      .limit(1);
    if (existing.length > 0) return;

    await db.insert(qrVersions).values({
      qrCodeId: row.id,
      snapshot: snapshotOf(row),
      summary: 'Original version',
      changedBy: null,
      createdAt: row.createdAt,
    });
  } catch (error) {
    console.error('QR version baseline error:', error);
  }
}
