import type { DestinationCheck } from '@/lib/qr/check-destination';
import type { QrStatus } from '@/lib/qr/status';

export type HealthStatus = 'ok' | 'warning' | 'broken';

export interface HealthResult {
  status: HealthStatus;
  /** Short, plain reason, e.g. "Paused" or "The destination returned HTTP 404." */
  message: string;
}

/** Combines what a scan would do (paused, expired, limit) with whether the destination answers. */
export function evaluateHealth(status: QrStatus, destination: DestinationCheck): HealthResult {
  if (status.health === 'problem') return { status: 'broken', message: status.label };
  if (destination.result === 'unreachable') return { status: 'broken', message: destination.message };
  if (status.health === 'warning') return { status: 'warning', message: status.label };
  return { status: 'ok', message: 'Working' };
}
