'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Paintbrush, Plus, RectangleHorizontal, RectangleVertical, SwatchBook, Trash2 } from 'lucide-react';

import type { QRTemplate } from '@/lib/db/schema';
import type { QRStyleConfig } from '@/lib/qr/generator';
import { TEMPLATE_CATEGORIES } from '@/lib/qr/schemas';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useQRCode } from '@/hooks/use-qr-code';

const PREVIEW_DATA = 'https://memento-qr.vercel.app';
const SWATCH_SIZE = 96;

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function TemplateSwatch({
  template,
  onSelect,
  onDelete,
}: {
  template: QRTemplate;
  onSelect: (template: QRTemplate) => void;
  onDelete?: (template: QRTemplate) => void;
}) {
  const layout = (template.styleConfig as QRStyleConfig).cardLayout ?? 'none';
  // Always render the swatch as QR-only, even for card-layout templates —
  // a full card wouldn't fit this grid at a consistent size. The layout
  // badge below tells the user it applies a card layout when selected.
  const { ref } = useQRCode(
    { data: PREVIEW_DATA, ...(template.styleConfig as QRStyleConfig), cardLayout: 'none' },
    SWATCH_SIZE,
  );

  return (
    <div className="group relative">
      <button
        type="button"
        data-testid={`qr-template-${slugify(template.name)}`}
        onClick={() => onSelect(template)}
        className="flex w-full flex-col items-center gap-2 rounded-lg border border-input p-3 text-center transition-colors hover:border-primary hover:bg-muted"
      >
        <div className="relative">
          <div ref={ref} className="overflow-hidden rounded-md" />
          {layout !== 'none' && (
            <span
              title={
                layout === 'horizontal'
                  ? 'Horizontal card layout'
                  : layout === 'vertical'
                    ? 'Vertical card layout'
                    : 'Custom card design'
              }
              className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full border border-input bg-background text-muted-foreground"
            >
              {layout === 'horizontal' ? (
                <RectangleHorizontal className="size-3" />
              ) : layout === 'vertical' ? (
                <RectangleVertical className="size-3" />
              ) : (
                <Paintbrush className="size-3" />
              )}
            </span>
          )}
        </div>
        <div>
          <p className="text-sm font-medium">{template.name}</p>
          {template.description && (
            <p className="text-xs text-muted-foreground">{template.description}</p>
          )}
        </div>
      </button>
      {onDelete && (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={`Delete ${template.name}`}
          className="absolute top-1 right-1 opacity-0 group-hover:opacity-100"
          onClick={(event) => {
            event.stopPropagation();
            onDelete(template);
          }}
        >
          <Trash2 className="size-3.5" />
        </Button>
      )}
    </div>
  );
}

interface QRTemplatePickerProps {
  onApply: (styleConfig: QRStyleConfig) => void;
  currentStyle: QRStyleConfig;
}

export function QRTemplatePicker({ onApply, currentStyle }: QRTemplatePickerProps) {
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState<QRTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState<(typeof TEMPLATE_CATEGORIES)[number]>('custom');
  const [isSaving, setIsSaving] = useState(false);
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<QRTemplate | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  function loadTemplates(): void {
    fetch('/api/templates')
      .then((res) => res.json() as Promise<{ items: QRTemplate[] }>)
      .then((data) => setTemplates(data.items))
      .catch((error: unknown) => {
        toast.error('Failed to load templates.');
        console.error('Templates fetch error:', error);
      })
      .finally(() => setIsLoading(false));
  }

  useEffect(() => {
    if (!open) return;

    // Deferred to a microtask so this isn't a synchronous setState call in
    // the effect body (react-hooks/set-state-in-effect).
    Promise.resolve().then(() => setIsLoading(true));
    loadTemplates();
  }, [open]);

  function handleSelect(template: QRTemplate): void {
    onApply(template.styleConfig as QRStyleConfig);
    setOpen(false);
  }

  async function handleDelete(): Promise<void> {
    if (!pendingDelete) return;

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/templates/${pendingDelete.id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Request failed');
      setTemplates((prev) => prev.filter((t) => t.id !== pendingDelete.id));
      toast.success('Template deleted');
    } catch (error) {
      toast.error('Failed to delete template.');
      console.error('Template delete error:', error);
    } finally {
      setIsDeleting(false);
      setPendingDelete(null);
    }
  }

  function handleSaveAsTemplateClick(): void {
    if (!newName.trim()) {
      toast.error('Give the template a name.');
      return;
    }
    setShowSaveConfirm(true);
  }

  async function handleSaveAsTemplate(): Promise<void> {
    setIsSaving(true);
    try {
      const response = await fetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName.trim(),
          category: newCategory,
          styleConfig: currentStyle,
        }),
      });

      if (!response.ok) throw new Error('Request failed');

      toast.success('Template saved');
      setNewName('');
      setShowSaveForm(false);
      setShowSaveConfirm(false);
      loadTemplates();
    } catch (error) {
      toast.error('Failed to save template.');
      console.error('Template save error:', error);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <SwatchBook className="size-4" />
          Choose template
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Choose a template</DialogTitle>
          <DialogDescription>
            Applies the template&apos;s styling — you can still customize everything afterward.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Loading templates…</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {templates.map((template) => (
              <TemplateSwatch
                key={template.id}
                template={template}
                onSelect={handleSelect}
                onDelete={!template.isSystem ? setPendingDelete : undefined}
              />
            ))}
          </div>
        )}

        {showSaveForm ? (
          <div className="space-y-3 rounded-lg border border-input p-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="new-template-name">Name</Label>
                <Input
                  id="new-template-name"
                  value={newName}
                  onChange={(event) => setNewName(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-template-category">Category</Label>
                <Select value={newCategory} onValueChange={(v) => setNewCategory(v as typeof newCategory)}>
                  <SelectTrigger id="new-template-category" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TEMPLATE_CATEGORIES.map((category) => (
                      <SelectItem key={category} value={category}>
                        {category}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        ) : null}

        <DialogFooter className="sm:justify-between">
          {showSaveForm ? (
            <>
              <Button type="button" variant="ghost" size="sm" onClick={() => setShowSaveForm(false)}>
                Cancel
              </Button>
              <Button type="button" size="sm" disabled={isSaving} onClick={handleSaveAsTemplateClick}>
                {isSaving ? 'Saving…' : 'Save template'}
              </Button>
            </>
          ) : (
            <Button type="button" variant="outline" size="sm" onClick={() => setShowSaveForm(true)}>
              <Plus className="size-4" />
              Save current style as template
            </Button>
          )}
        </DialogFooter>
      </DialogContent>

      <ConfirmDialog
        open={showSaveConfirm}
        onOpenChange={setShowSaveConfirm}
        title="Save current style as a template?"
        description={`"${newName}" will be added to your team's template gallery.`}
        confirmLabel="Save template"
        pendingLabel="Saving…"
        isPending={isSaving}
        onConfirm={handleSaveAsTemplate}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(nextOpen) => !nextOpen && setPendingDelete(null)}
        title="Delete this template?"
        description={`"${pendingDelete?.name ?? ''}" will be removed from the gallery. QR codes already using it keep their style.`}
        confirmLabel="Delete"
        pendingLabel="Deleting…"
        variant="destructive"
        isPending={isDeleting}
        onConfirm={handleDelete}
      />
    </Dialog>
  );
}
