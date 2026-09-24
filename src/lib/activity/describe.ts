import type { ActivityAction } from './actions';

export interface DescribableActivity {
  action: string;
  entityName: string | null;
  details: unknown;
}

function detail<T>(details: unknown, key: string): T | undefined {
  if (typeof details !== 'object' || details === null) return undefined;
  return (details as Record<string, unknown>)[key] as T | undefined;
}

function quoted(name: string | null): string {
  return name ? `"${name}"` : 'an item';
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

function describeHandoff(noun: string, name: string, details: unknown): string {
  const assignee = detail<string | null>(details, 'assignedToName');
  if (assignee) return `handed ${noun} ${name} to ${assignee}`;
  if (detail<boolean>(details, 'unassigned')) return `unassigned ${noun} ${name}`;
  return `updated the handoff notes or checklist on ${noun} ${name}`;
}

/** A short, human sentence fragment for an activity entry, e.g. `created the QR code "Menu"`. */
export function describeActivity(entry: DescribableActivity): string {
  const name = quoted(entry.entityName);
  const action = entry.action as ActivityAction;

  switch (action) {
    case 'qr.created':
      return `created the QR code ${name}`;
    case 'qr.updated': {
      const paused = detail<boolean>(entry.details, 'isPaused');
      if (paused === true) return `paused the QR code ${name}`;
      if (paused === false) return `resumed the QR code ${name}`;
      return `edited the QR code ${name}`;
    }
    case 'qr.deleted':
      return `deleted the QR code ${name}`;
    case 'qr.duplicated':
      return `duplicated the QR code ${quoted(detail<string>(entry.details, 'from') ?? entry.entityName)}`;
    case 'qr.batch_created':
      return `imported ${plural(detail<number>(entry.details, 'count') ?? 0, 'QR code')} from a spreadsheet`;
    case 'qr.moved':
      return `moved ${plural(detail<number>(entry.details, 'count') ?? 0, 'QR code')} to ${name}`;
    case 'qr.destination_restored':
      return `restored an earlier destination of the QR code ${name}`;
    case 'qr.health_changed':
      return detail<string>(entry.details, 'status') === 'broken'
        ? `found that ${name} stopped working (${detail<string>(entry.details, 'message') ?? 'needs attention'})`
        : `found that ${name} is working again`;
    case 'qr.handoff':
      return describeHandoff('the QR code', name, entry.details);
    case 'folder.created':
      return `created the folder ${name}`;
    case 'folder.renamed':
      return `renamed the folder ${quoted(detail<string>(entry.details, 'from') ?? null)} to ${name}`;
    case 'folder.deleted':
      return `deleted the folder ${name}`;
    case 'page.created':
      return `created the page ${name}`;
    case 'page.updated':
      return `edited the page ${name}`;
    case 'page.deleted':
      return `deleted the page ${name}`;
    case 'page.published':
      return `published the page ${name}`;
    case 'page.unpublished':
      return `unpublished the page ${name}`;
    case 'page.expiry_changed':
      return detail<string | null>(entry.details, 'expiresAt')
        ? `set an expiry date on the page ${name}`
        : `removed the expiry date from the page ${name}`;
    case 'page.handoff':
      return describeHandoff('the page', name, entry.details);
    case 'template.created':
      return `created the QR template ${name}`;
    case 'template.updated':
      return `edited the QR template ${name}`;
    case 'template.deleted':
      return `deleted the QR template ${name}`;
    case 'data.exported':
      return 'exported a backup of their data';
    case 'data.imported':
      return 'restored data from a backup';
    default: {
      const _exhaustive: never = action;
      // Old or unknown entries should still read sensibly.
      return String(_exhaustive).replace('.', ' ');
    }
  }
}
