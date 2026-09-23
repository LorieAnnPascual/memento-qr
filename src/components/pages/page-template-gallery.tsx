'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { toast } from 'sonner';
import { Eye, FilePlus } from 'lucide-react';

import type { Data } from '@puckeditor/core';

import type { PageTemplate } from '@/lib/db/schema';
import { buildPreviewHtml } from '@/lib/pages/download-html';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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

interface PageTemplateGalleryProps {
  templates: PageTemplate[];
}

/** `null` = start from a blank page. */
type Choice = PageTemplate | null | undefined;

export function PageTemplateGallery({ templates }: PageTemplateGalleryProps) {
  const router = useRouter();
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [previewing, setPreviewing] = useState<PageTemplate | null>(null);
  const [choice, setChoice] = useState<Choice>(undefined);
  const [name, setName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');

  useEffect(() => {
    if (!previewing) return;
    let cancelled = false;
    buildPreviewHtml(previewing.name, previewing.puckData as Data)
      .then((html) => !cancelled && setPreviewHtml(html))
      .catch((error: unknown) => {
        console.error('Preview render error:', error);
        toast.error('Failed to render the preview.');
      });
    return () => {
      cancelled = true;
      setPreviewHtml('');
    };
  }, [previewing]);

  const categories = useMemo(
    () => Array.from(new Set(templates.map((t) => t.category))).sort(),
    [templates],
  );
  const filtered =
    categoryFilter === 'all' ? templates : templates.filter((t) => t.category === categoryFilter);

  function startCreate(template: PageTemplate | null): void {
    setChoice(template);
    setName(template ? `${template.name} copy` : 'Untitled page');
    setPreviewing(null);
  }

  async function handleCreate(): Promise<void> {
    if (!name.trim()) {
      toast.error('Give the page a name.');
      return;
    }

    setIsCreating(true);
    try {
      const response = await fetch('/api/pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          ...(choice && { fromTemplateId: choice.id }),
        }),
      });
      if (!response.ok) throw new Error('Request failed');

      const created = (await response.json()) as { id: string };
      toast.success('Page created');
      router.push(`/pages/${created.id}`);
    } catch (error) {
      toast.error('Failed to create page. Please try again.');
      console.error('Page create error:', error);
      setIsCreating(false);
    }
  }

  return (
    <div className="space-y-4">
      <Select value={categoryFilter} onValueChange={setCategoryFilter}>
        <SelectTrigger className="w-48" aria-label="Category filter">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All categories</SelectItem>
          {categories.map((category) => (
            <SelectItem key={category} value={category} className="capitalize">
              {category}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="flex flex-col justify-between gap-3 rounded-lg border border-dashed p-4">
          <div className="space-y-1">
            <p className="font-medium">Blank page</p>
            <p className="text-sm text-muted-foreground">Start from scratch and add your own blocks.</p>
          </div>
          <Button type="button" onClick={() => startCreate(null)}>
            <FilePlus className="size-4" />
            Start blank
          </Button>
        </div>

        {filtered.map((template) => (
          <div key={template.id} className="flex flex-col justify-between gap-3 rounded-lg border p-4">
            <div className="space-y-2">
              <div className="flex items-start justify-between gap-2">
                <p className="font-medium">{template.name}</p>
                <Badge variant="outline" className="capitalize">
                  {template.category}
                </Badge>
              </div>
              {template.description && (
                <p className="text-sm text-muted-foreground">{template.description}</p>
              )}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setPreviewing(template)}>
                <Eye className="size-4" />
                Preview
              </Button>
              <Button type="button" size="sm" className="flex-1" onClick={() => startCreate(template)}>
                Use template
              </Button>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={previewing !== null} onOpenChange={(open) => !open && setPreviewing(null)}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{previewing?.name}</DialogTitle>
            <DialogDescription>Preview only. Nothing is created until you use the template.</DialogDescription>
          </DialogHeader>
          {previewing && (
            <iframe
              title={`Preview of ${previewing.name}`}
              srcDoc={previewHtml}
              sandbox="allow-same-origin"
              style={{ display: 'block', width: '100%', height: '60vh' }}
              className="rounded-md border bg-white"
            />
          )}
          <DialogFooter>
            <Button type="button" onClick={() => previewing && startCreate(previewing)}>
              Use template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={choice !== undefined} onOpenChange={(open) => !open && setChoice(undefined)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Name your page</DialogTitle>
            <DialogDescription>
              {choice
                ? `This creates your own copy of "${choice.name}". The template itself is never changed.`
                : 'You can rename it later.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="new-page-name">Page name</Label>
            <Input
              id="new-page-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && !isCreating && handleCreate()}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setChoice(undefined)}>
              Cancel
            </Button>
            <Button type="button" disabled={isCreating} onClick={handleCreate}>
              {isCreating ? 'Creating…' : 'Create page'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
