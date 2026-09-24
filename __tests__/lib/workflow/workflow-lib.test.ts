import { describe, it, expect } from 'vitest';

import { describeActivity } from '@/lib/activity/describe';
import { checklistProgress, newChecklistItem, normalizeChecklist } from '@/lib/workflow/checklist';
import { WorkflowSchema } from '@/lib/workflow/schemas';
import { displayName } from '@/lib/team/display-name';

describe('checklist helpers', () => {
  it('creates an unticked item with a trimmed label and an id', () => {
    const item = newChecklistItem('  Verify the QR destination  ');

    expect(item).toMatchObject({ label: 'Verify the QR destination', done: false });
    expect(item.id.length).toBeGreaterThan(0);
  });

  it('gives different ids to different items', () => {
    expect(newChecklistItem('a').id).not.toBe(newChecklistItem('a').id);
  });

  it('reads nothing or an odd shape as an empty list', () => {
    expect(normalizeChecklist(null)).toEqual([]);
    expect(normalizeChecklist('nope')).toEqual([]);
    expect(normalizeChecklist({ id: 'x' })).toEqual([]);
  });

  it('keeps well-formed items and drops broken ones', () => {
    const result = normalizeChecklist([
      { id: 'a', label: 'One', done: true },
      { id: 'b', label: '   ', done: false },
      { label: 'No id', done: false },
      null,
      'text',
      { id: 'c', label: 'Two' },
    ]);

    expect(result).toEqual([
      { id: 'a', label: 'One', done: true },
      { id: 'c', label: 'Two', done: false },
    ]);
  });

  it('counts finished steps', () => {
    expect(checklistProgress([])).toEqual({ done: 0, total: 0 });
    expect(
      checklistProgress([
        { id: '1', label: 'a', done: true },
        { id: '2', label: 'b', done: false },
      ]),
    ).toEqual({ done: 1, total: 2 });
  });
});

describe('WorkflowSchema', () => {
  const uuid = '11111111-1111-4111-8111-111111111111';

  it('accepts an empty update (nothing changed)', () => {
    expect(WorkflowSchema.safeParse({}).success).toBe(true);
  });

  it('accepts null to clear the assignee, next action, note and checklist', () => {
    expect(WorkflowSchema.safeParse({ assignedTo: null, nextAction: null, notes: null, checklist: null }).success).toBe(true);
  });

  it('rejects an assignee that is not an id', () => {
    expect(WorkflowSchema.safeParse({ assignedTo: 'maria' }).success).toBe(false);
    expect(WorkflowSchema.safeParse({ assignedTo: uuid }).success).toBe(true);
  });

  it('rejects an over-long next action or note', () => {
    expect(WorkflowSchema.safeParse({ nextAction: 'x'.repeat(501) }).success).toBe(false);
    expect(WorkflowSchema.safeParse({ notes: 'x'.repeat(2001) }).success).toBe(false);
  });

  it('rejects checklist items with an empty label or too many items', () => {
    expect(WorkflowSchema.safeParse({ checklist: [{ id: 'a', label: '  ', done: false }] }).success).toBe(false);
    const many = Array.from({ length: 31 }, (_, i) => ({ id: String(i), label: 'step', done: false }));
    expect(WorkflowSchema.safeParse({ checklist: many }).success).toBe(false);
  });
});

describe('displayName', () => {
  it('prefers the full name', () => {
    expect(displayName({ fullName: 'Carmina Reyes', email: 'c@x.co' })).toBe('Carmina Reyes');
  });

  it('falls back to the part of the email before the @', () => {
    expect(displayName({ fullName: null, email: 'yayenbuen@gmail.com' })).toBe('yayenbuen');
    expect(displayName({ fullName: '  ', email: 'lorie@x.co' })).toBe('lorie');
  });
});

describe('describeActivity for handoffs', () => {
  it('says who an item was handed to', () => {
    expect(describeActivity({ action: 'qr.handoff', entityName: 'Menu', details: { assignedToName: 'Maria' } })).toBe(
      'handed the QR code "Menu" to Maria',
    );
    expect(describeActivity({ action: 'page.handoff', entityName: 'Promo', details: { assignedToName: 'Yayen' } })).toBe(
      'handed the page "Promo" to Yayen',
    );
  });

  it('says when an item was unassigned', () => {
    expect(describeActivity({ action: 'qr.handoff', entityName: 'Menu', details: { assignedToName: null, unassigned: true } })).toBe(
      'unassigned the QR code "Menu"',
    );
  });

  it('describes note/checklist-only changes', () => {
    expect(describeActivity({ action: 'qr.handoff', entityName: 'Menu', details: null })).toBe(
      'updated the handoff notes or checklist on the QR code "Menu"',
    );
  });
});
