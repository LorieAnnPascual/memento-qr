import { z } from 'zod';

import { MAX_CHECKLIST_ITEMS } from './checklist';

export const ChecklistItemSchema = z.object({
  id: z.string().min(1).max(40),
  label: z.string().trim().min(1).max(200),
  done: z.boolean(),
});

/** Every field is optional: send only what changed. `null` clears a field. */
export const WorkflowSchema = z.object({
  assignedTo: z.string().uuid().nullable().optional(),
  nextAction: z.string().trim().max(500).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  checklist: z.array(ChecklistItemSchema).max(MAX_CHECKLIST_ITEMS).nullable().optional(),
});

export type WorkflowInput = z.infer<typeof WorkflowSchema>;
