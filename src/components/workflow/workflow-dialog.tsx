'use client';

import { useState } from 'react';

import { toast } from 'sonner';
import { ListChecks, Plus, Trash2 } from 'lucide-react';

import type { TeamMember } from '@/lib/team/members';
import {
  checklistProgress,
  MAX_CHECKLIST_ITEMS,
  newChecklistItem,
  normalizeChecklist,
  STANDARD_CHECKLIST_STEPS,
  type ChecklistItem,
} from '@/lib/workflow/checklist';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

export interface WorkflowFields {
  assignedTo: string | null;
  nextAction: string | null;
  notes: string | null;
  checklist: unknown;
  purpose?: string | null;
}

interface WorkflowDialogProps {
  kind: 'qr' | 'page';
  itemId: string;
  itemName: string;
  value: WorkflowFields;
  members: TeamMember[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the saved values so the list behind the dialog can update. */
  onSaved: (next: WorkflowFields) => void;
}

const UNASSIGNED = 'none';

/** Hand an item to a teammate, say what happens next, leave a note, and tick off an optional checklist. */
export function WorkflowDialog({ kind, itemId, itemName, value, members, open, onOpenChange, onSaved }: WorkflowDialogProps) {
  const [assignedTo, setAssignedTo] = useState(value.assignedTo ?? UNASSIGNED);
  const [nextAction, setNextAction] = useState(value.nextAction ?? '');
  const [notes, setNotes] = useState(value.notes ?? '');
  const [purpose, setPurpose] = useState(value.purpose ?? '');
  const [checklist, setChecklist] = useState<ChecklistItem[]>(() => normalizeChecklist(value.checklist));
  const [newStep, setNewStep] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  const progress = checklistProgress(checklist);
  const assigneeName = members.find((member) => member.id === assignedTo)?.name;

  function addStep(label: string): void {
    if (!label.trim() || checklist.length >= MAX_CHECKLIST_ITEMS) return;
    setChecklist((items) => [...items, newChecklistItem(label)]);
    setNewStep('');
  }

  function addStandardSteps(): void {
    const existing = new Set(checklist.map((item) => item.label));
    const missing = STANDARD_CHECKLIST_STEPS.filter((step) => !existing.has(step));
    setChecklist((items) => [...items, ...missing.map(newChecklistItem)].slice(0, MAX_CHECKLIST_ITEMS));
  }

  async function handleSave(): Promise<void> {
    setIsSaving(true);
    try {
      const response = await fetch(`/api/workflow/${kind}/${itemId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assignedTo: assignedTo === UNASSIGNED ? null : assignedTo,
          nextAction: nextAction.trim() || null,
          notes: notes.trim() || null,
          purpose: purpose.trim() || null,
          checklist,
        }),
      });
      if (!response.ok) throw new Error('Request failed');

      const saved = (await response.json()) as WorkflowFields;
      onSaved(saved);
      setSavedAt(new Date());
      toast.success('Handoff details saved');
    } catch (error) {
      toast.error('Failed to save the handoff details. Please try again.');
      console.error('Workflow save error:', error);
    } finally {
      setIsSaving(false);
      setConfirming(false);
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Handoff &amp; checklist</DialogTitle>
            <DialogDescription>{itemName}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="wf-purpose">Purpose</Label>
              <Input
                id="wf-purpose"
                maxLength={500}
                placeholder="What is this for? e.g. Table cards for the June event"
                value={purpose}
                onChange={(event) => setPurpose(event.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="wf-assignee">Assigned to</Label>
              <Select value={assignedTo} onValueChange={setAssignedTo}>
                <SelectTrigger id="wf-assignee" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNASSIGNED}>Nobody</SelectItem>
                  {members.map((member) => (
                    <SelectItem key={member.id} value={member.id}>
                      {member.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="wf-next">Next action</Label>
              <Input
                id="wf-next"
                maxLength={500}
                placeholder="e.g. Send the final file to the printer"
                value={nextAction}
                onChange={(event) => setNextAction(event.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="wf-notes">Internal note</Label>
              <Textarea
                id="wf-notes"
                rows={3}
                maxLength={2000}
                placeholder="Context for whoever picks this up. Only the team sees this."
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-1.5">
                  <ListChecks className="size-4" />
                  Checklist
                  {progress.total > 0 && (
                    <span className="font-normal text-muted-foreground">
                      ({progress.done} of {progress.total} done)
                    </span>
                  )}
                </Label>
                <Button type="button" variant="ghost" size="sm" onClick={addStandardSteps}>
                  Add the usual steps
                </Button>
              </div>

              {checklist.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Optional. Add your own steps, or the usual ones above.
                </p>
              )}

              <ul className="space-y-1.5">
                {checklist.map((item) => (
                  <li key={item.id} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={item.done}
                      aria-label={`Done: ${item.label}`}
                      onChange={() =>
                        setChecklist((items) => items.map((i) => (i.id === item.id ? { ...i, done: !i.done } : i)))
                      }
                    />
                    <Input
                      aria-label={`Step: ${item.label}`}
                      value={item.label}
                      maxLength={200}
                      className={item.done ? 'text-muted-foreground line-through' : undefined}
                      onChange={(event) =>
                        setChecklist((items) => items.map((i) => (i.id === item.id ? { ...i, label: event.target.value } : i)))
                      }
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Remove step: ${item.label}`}
                      onClick={() => setChecklist((items) => items.filter((i) => i.id !== item.id))}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </li>
                ))}
              </ul>

              <div className="flex gap-2">
                <Input
                  aria-label="New checklist step"
                  placeholder="Add a step…"
                  maxLength={200}
                  value={newStep}
                  onChange={(event) => setNewStep(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      addStep(newStep);
                    }
                  }}
                />
                <Button type="button" variant="outline" disabled={!newStep.trim()} onClick={() => addStep(newStep)}>
                  <Plus className="size-4" />
                  Add
                </Button>
              </div>
            </div>
          </div>

          <DialogFooter className="items-center sm:justify-between">
            <span className="text-sm text-muted-foreground" role="status">
              {savedAt ? `Saved at ${savedAt.toLocaleTimeString()}` : ''}
            </span>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
              <Button type="button" onClick={() => setConfirming(true)}>
                Save
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Save these handoff details?"
        description={
          assigneeName
            ? `${itemName} will be assigned to ${assigneeName}, and the team will see the note and checklist.`
            : `The team will see the note and checklist on ${itemName}.`
        }
        confirmLabel="Save"
        pendingLabel="Saving…"
        isPending={isSaving}
        onConfirm={handleSave}
      />
    </>
  );
}
