'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { toast } from 'sonner';
import { Pencil, Trash2 } from 'lucide-react';

import type { QRTemplate } from '@/lib/db/schema';
import type { QRStyleConfig } from '@/lib/qr/generator';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useQRCode } from '@/hooks/use-qr-code';

const PREVIEW_DATA = 'https://memento-qr.vercel.app';

function TemplateCard({
  template,
  currentUserProfileId,
  onDelete,
}: {
  template: QRTemplate;
  currentUserProfileId: string;
  onDelete: (template: QRTemplate) => void;
}) {
  const { ref } = useQRCode(
    { data: PREVIEW_DATA, ...(template.styleConfig as QRStyleConfig), cardLayout: 'none' },
    96,
  );
  const isOwn = !template.isSystem && template.userId === currentUserProfileId;
  const isCustomCard = (template.styleConfig as QRStyleConfig).cardLayout === 'custom';
  const editHref = isCustomCard ? `/templates/builder?id=${template.id}` : `/templates/${template.id}`;

  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border p-4 text-center">
      <div ref={ref} className="overflow-hidden rounded-md" />
      <div className="space-y-1">
        <p className="font-medium">{template.name}</p>
        {template.description && (
          <p className="text-xs text-muted-foreground">{template.description}</p>
        )}
        <Badge variant="outline" className="capitalize">
          {template.category}
        </Badge>
      </div>
      <div className="flex w-full gap-2">
        <Button asChild size="sm" className="flex-1">
          <Link href={`/qr/new?template=${template.id}`}>Use template</Link>
        </Button>
        {isOwn && (
          <>
            <Button asChild variant="ghost" size="icon-sm" aria-label={`Edit ${template.name}`}>
              <Link href={editHref}>
                <Pencil className="size-4" />
              </Link>
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Delete ${template.name}`}
              onClick={() => onDelete(template)}
            >
              <Trash2 className="size-4" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

interface TemplateGalleryProps {
  templates: QRTemplate[];
  currentUserProfileId: string;
}

export function TemplateGallery({ templates, currentUserProfileId }: TemplateGalleryProps) {
  const router = useRouter();
  const [items, setItems] = useState(templates);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [pendingDelete, setPendingDelete] = useState<QRTemplate | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const categories = useMemo(
    () => Array.from(new Set(items.map((item) => item.category))).sort(),
    [items],
  );

  const filtered =
    categoryFilter === 'all' ? items : items.filter((item) => item.category === categoryFilter);

  async function handleDelete(): Promise<void> {
    if (!pendingDelete) return;

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/templates/${pendingDelete.id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Request failed');

      setItems((prev) => prev.filter((item) => item.id !== pendingDelete.id));
      toast.success('Template deleted');
      router.refresh();
    } catch (error) {
      toast.error('Failed to delete template.');
      console.error('Template delete error:', error);
    } finally {
      setIsDeleting(false);
      setPendingDelete(null);
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

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed py-16 text-center text-muted-foreground">
          No templates in this category yet.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {filtered.map((template) => (
            <TemplateCard
              key={template.id}
              template={template}
              currentUserProfileId={currentUserProfileId}
              onDelete={setPendingDelete}
            />
          ))}
        </div>
      )}

      <AlertDialog open={pendingDelete !== null} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this template?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete?.name} will be removed. QR codes already using this style keep it — only
              the reusable template is deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={isDeleting} onClick={handleDelete}>
              {isDeleting ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
