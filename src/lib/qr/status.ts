export type QrHealth = 'ok' | 'warning' | 'problem';

export interface QrStatusInput {
  isDynamic: boolean;
  isPaused: boolean;
  expiresAt: Date | string | null;
  scanLimit: number | null;
  scanCount: number;
  targetUrl: string | null;
  payload: string;
}

export interface QrStatus {
  health: QrHealth;
  /** Short headline, e.g. "Working" or "Paused". */
  label: string;
  /** One line explaining what a scan does right now. */
  detail: string;
  /** Where a scan lands (dynamic: the current destination; static: what the code encodes). */
  destination: string;
}

/**
 * What happens if someone scans this code right now. Mirrors the rules the
 * public /q/ redirect applies (paused, expired, scan limit) so staff can check
 * a saved code without scanning it (scans are counted in analytics).
 */
export function getQrStatus(qr: QrStatusInput, now: Date = new Date()): QrStatus {
  if (!qr.isDynamic) {
    return {
      health: 'ok',
      label: 'Static code',
      detail: 'Always works. It contains its content directly and cannot be paused or expire.',
      destination: qr.payload,
    };
  }

  const destination = qr.targetUrl ?? '';

  if (!destination) {
    return { health: 'problem', label: 'No destination', detail: 'Scans have nowhere to go. Set a destination URL.', destination };
  }
  if (qr.isPaused) {
    return { health: 'problem', label: 'Paused', detail: 'Scans show a "paused" page. Resume it to send people to the destination.', destination };
  }
  if (qr.expiresAt && new Date(qr.expiresAt) <= now) {
    return { health: 'problem', label: 'Expired', detail: 'Scans show an "expired" page. Change or remove the expiry date.', destination };
  }
  if (qr.scanLimit !== null && qr.scanCount >= qr.scanLimit) {
    return { health: 'problem', label: 'Scan limit reached', detail: `It has been scanned ${qr.scanCount} of ${qr.scanLimit} allowed times. Raise or remove the limit.`, destination };
  }

  if (qr.expiresAt) {
    const daysLeft = Math.ceil((new Date(qr.expiresAt).getTime() - now.getTime()) / 86_400_000);
    if (daysLeft <= 7) {
      return { health: 'warning', label: 'Working, expires soon', detail: `Sends people to the destination, but expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'}.`, destination };
    }
  }
  if (qr.scanLimit !== null && qr.scanLimit - qr.scanCount <= Math.max(1, Math.ceil(qr.scanLimit * 0.1))) {
    return { health: 'warning', label: 'Working, nearly at its limit', detail: `${qr.scanLimit - qr.scanCount} scan(s) left before it stops working.`, destination };
  }

  return { health: 'ok', label: 'Working', detail: 'Scans send people to the destination.', destination };
}
