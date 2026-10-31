import { eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { qrDestinationHistory } from '@/lib/db/schema';

interface RecordInput {
  qrCodeId: string;
  destination: string;
  previousDestination: string | null;
  changedBy: string;
  restoredFromId?: string | null;
  /** Set when the save also changed the code's type, so a restore can bring the old type back. */
  qrType?: string | null;
  previousQrType?: string | null;
  payloadFields?: unknown;
  previousPayloadFields?: unknown;
}

/**
 * Remembers a dynamic code's destination change (who, when, from what). This is
 * bookkeeping: failing to record it must never fail the edit itself.
 */
export async function recordDestinationChange(input: RecordInput): Promise<void> {
  try {
    await db.insert(qrDestinationHistory).values({
      qrCodeId: input.qrCodeId,
      destination: input.destination,
      previousDestination: input.previousDestination,
      changedBy: input.changedBy,
      restoredFromId: input.restoredFromId ?? null,
      qrType: input.qrType ?? null,
      previousQrType: input.previousQrType ?? null,
      payloadFields: input.payloadFields ?? null,
      previousPayloadFields: input.previousPayloadFields ?? null,
    });
  } catch (error) {
    console.error('Destination history error:', error);
  }
}

interface BaselineInput {
  qrCodeId: string;
  destination: string | null;
  qrType: string;
  payloadFields: unknown;
  createdAt: Date;
}

/**
 * Writes the "how it was" entry for a code that has no history yet (made before history existed),
 * dated when the code was made, so its first change can be restored. Bookkeeping: never throws.
 */
export async function ensureBaselineEntry(input: BaselineInput): Promise<void> {
  if (!input.destination) return;
  try {
    const existing = await db
      .select({ id: qrDestinationHistory.id })
      .from(qrDestinationHistory)
      .where(eq(qrDestinationHistory.qrCodeId, input.qrCodeId))
      .limit(1);
    if (existing.length > 0) return;
    await db.insert(qrDestinationHistory).values({
      qrCodeId: input.qrCodeId,
      destination: input.destination,
      previousDestination: null,
      changedBy: null,
      qrType: input.qrType,
      payloadFields: input.payloadFields ?? null,
      createdAt: input.createdAt,
    });
  } catch (error) {
    console.error('Destination history baseline error:', error);
  }
}

/** True when a save actually moves a dynamic code to a different destination. */
export function destinationChanged(before: string | null, after: string | null | undefined): after is string {
  return typeof after === 'string' && after.length > 0 && after !== before;
}

/** True when a save moves a code to a different type (url → video, ...). */
export function typeChanged(before: string, after: string | undefined): after is string {
  return typeof after === 'string' && after !== before;
}
