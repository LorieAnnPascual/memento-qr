import { and, eq, isNull, sql } from 'drizzle-orm';

import { db } from '@/lib/db';
import { qrCodes, type QRCode } from '@/lib/db/schema';
import { logActivity } from '@/lib/activity/log-activity';
import { checkDestination } from '@/lib/qr/check-destination';
import { getQrStatus } from '@/lib/qr/status';

import { evaluateHealth } from './evaluate-health';

/** Each run checks at most this many codes (oldest check first) so it always finishes in time. */
export const MAX_CHECKS_PER_RUN = 60;
const CONCURRENCY = 5;
const CHECK_TIMEOUT_MS = 4000;

export interface LinkCheckSummary {
  checked: number;
  ok: number;
  warning: number;
  broken: number;
  newlyBroken: number;
}

async function checkOne(qr: QRCode, summary: LinkCheckSummary): Promise<void> {
  const status = getQrStatus(qr);
  const destination = await checkDestination(status.destination, CHECK_TIMEOUT_MS);
  const result = evaluateHealth(status, destination);

  await db
    .update(qrCodes)
    .set({ healthStatus: result.status, healthMessage: result.message, healthCheckedAt: new Date() })
    .where(eq(qrCodes.id, qr.id));

  summary.checked++;
  summary[result.status]++;

  const wasBroken = qr.healthStatus === 'broken';
  const isBroken = result.status === 'broken';

  // Only a change is news; a code that stays broken is not re-announced every day.
  if (isBroken && !wasBroken) {
    summary.newlyBroken++;
    await logActivity({
      userId: null,
      action: 'qr.health_changed',
      entityType: 'qr',
      entityId: qr.id,
      entityName: qr.name,
      details: { status: 'broken', message: result.message },
    });
  } else if (!isBroken && wasBroken) {
    await logActivity({
      userId: null,
      action: 'qr.health_changed',
      entityType: 'qr',
      entityId: qr.id,
      entityName: qr.name,
      details: { status: result.status },
    });
  }
}

/** Checks dynamic QR codes, least recently checked first, and stores the outcome on each. */
export async function runLinkChecks(limit: number = MAX_CHECKS_PER_RUN): Promise<LinkCheckSummary> {
  const codes = await db
    .select()
    .from(qrCodes)
    .where(and(eq(qrCodes.isDynamic, true), isNull(qrCodes.deletedAt)))
    .orderBy(sql`${qrCodes.healthCheckedAt} asc nulls first`)
    .limit(limit);

  const summary: LinkCheckSummary = { checked: 0, ok: 0, warning: 0, broken: 0, newlyBroken: 0 };
  const queue = [...codes];

  async function worker(): Promise<void> {
    for (let qr = queue.shift(); qr; qr = queue.shift()) {
      try {
        await checkOne(qr, summary);
      } catch (error) {
        // One bad row must not stop the rest of the run.
        console.error('Link check failed for a QR code:', error);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, codes.length) }, worker));
  return summary;
}
