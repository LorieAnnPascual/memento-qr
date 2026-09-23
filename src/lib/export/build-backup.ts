export const BACKUP_FORMAT_VERSION = 1;
export const MAX_BACKUP_SCAN_EVENTS = 50_000;

export interface BackupData {
  scope: 'mine' | 'team';
  exportedBy: string;
  folders: unknown[];
  qrCodes: unknown[];
  qrTemplates: unknown[];
  pages: unknown[];
  scanEvents: unknown[];
  activity: unknown[];
}

export interface Backup extends BackupData {
  app: 'memento-qr';
  formatVersion: number;
  exportedAt: string;
  counts: Record<'folders' | 'qrCodes' | 'qrTemplates' | 'pages' | 'scanEvents' | 'activity', number>;
  /** True when scan history was cut at MAX_BACKUP_SCAN_EVENTS (newest are kept). */
  scanEventsTruncated: boolean;
}

/** Wraps exported rows with the metadata someone needs to understand the file later. */
export function buildBackup(data: BackupData, now: Date = new Date()): Backup {
  return {
    app: 'memento-qr',
    formatVersion: BACKUP_FORMAT_VERSION,
    exportedAt: now.toISOString(),
    ...data,
    counts: {
      folders: data.folders.length,
      qrCodes: data.qrCodes.length,
      qrTemplates: data.qrTemplates.length,
      pages: data.pages.length,
      scanEvents: data.scanEvents.length,
      activity: data.activity.length,
    },
    scanEventsTruncated: data.scanEvents.length >= MAX_BACKUP_SCAN_EVENTS,
  };
}

export function backupFileName(now: Date = new Date()): string {
  return `memento-qr-backup-${now.toISOString().slice(0, 10)}.json`;
}
