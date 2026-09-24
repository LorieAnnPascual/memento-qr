/** A single optional to-do on a QR code or page. The team edits these freely. */
export interface ChecklistItem {
  id: string;
  label: string;
  done: boolean;
}

/** Offered as a starting point ("Add the usual steps"); nothing forces them. */
export const STANDARD_CHECKLIST_STEPS = [
  'Verify the QR destination',
  'Check the published page',
  'Scan it with a phone',
  'Prepare the export',
] as const;

export const MAX_CHECKLIST_ITEMS = 30;

export function newChecklistItem(label: string): ChecklistItem {
  return { id: crypto.randomUUID().slice(0, 8), label: label.trim(), done: false };
}

/** Reads whatever is stored (null, or an older/odd shape) as a safe list. */
export function normalizeChecklist(value: unknown): ChecklistItem[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry): ChecklistItem[] => {
    if (typeof entry !== 'object' || entry === null) return [];
    const { id, label, done } = entry as Record<string, unknown>;
    if (typeof id !== 'string' || typeof label !== 'string' || !label.trim()) return [];
    return [{ id, label, done: done === true }];
  });
}

export function checklistProgress(items: ChecklistItem[]): { done: number; total: number } {
  return { done: items.filter((item) => item.done).length, total: items.length };
}
