import { db } from '@/lib/db';
import { qrDestinationHistory } from '@/lib/db/schema';

interface RecordInput {
  qrCodeId: string;
  destination: string;
  previousDestination: string | null;
  changedBy: string;
  restoredFromId?: string | null;
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
    });
  } catch (error) {
    console.error('Destination history error:', error);
  }
}

/** True when a save actually moves a dynamic code to a different destination. */
export function destinationChanged(before: string | null, after: string | null | undefined): after is string {
  return typeof after === 'string' && after.length > 0 && after !== before;
}
