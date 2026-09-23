'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { toast } from 'sonner';

import type { QRTemplate } from '@/lib/db/schema';
import type { QRStyleConfig } from '@/lib/qr/generator';
import { TEMPLATE_CATEGORIES } from '@/lib/qr/schemas';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { QRPreview } from './qr-preview';
import { QRStyleEditor } from './qr-style-editor';

const PREVIEW_DATA = 'https://memento-qr.vercel.app';

interface TemplateEditFormProps {
  template: QRTemplate;
}

export function TemplateEditForm({ template }: TemplateEditFormProps) {
  const router = useRouter();
  const [name, setName] = useState(template.name);
  const [description, setDescription] = useState(template.description ?? '');
  const [category, setCategory] = useState(template.category);
  const [style, setStyle] = useState<QRStyleConfig>(template.styleConfig as QRStyleConfig);
  const [isSaving, setIsSaving] = useState(false);
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);

  function handleSaveClick(): void {
    if (!name.trim()) {
      toast.error('Give this template a name.');
      return;
    }
    setShowSaveConfirm(true);
  }

  async function handleSave(): Promise<void> {
    setIsSaving(true);
    try {
      const response = await fetch(`/api/templates/${template.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          category,
          styleConfig: { ...style, cardLayout: 'none', cardCaption: undefined },
        }),
      });

      if (!response.ok) throw new Error('Request failed');

      toast.success('Template updated');
      setShowSaveConfirm(false);
      router.push('/templates');
      router.refresh();
    } catch (error) {
      toast.error('Failed to update template. Please try again.');
      console.error('Template update error:', error);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
            <CardDescription>How this template appears in the gallery.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="template-name">Name</Label>
              <Input id="template-name" value={name} onChange={(event) => setName(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="template-description">Description (optional)</Label>
              <Textarea
                id="template-description"
                rows={2}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="template-category">Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger id="template-category" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TEMPLATE_CATEGORIES.map((option) => (
                    <SelectItem key={option} value={option} className="capitalize">
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Style</CardTitle>
            <CardDescription>Customize how QR codes using this template will look.</CardDescription>
          </CardHeader>
          <CardContent>
            <QRStyleEditor value={style} onChange={setStyle} />
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
        <Card>
          <CardHeader>
            <CardTitle>Preview</CardTitle>
          </CardHeader>
          <CardContent className="flex justify-center">
            <QRPreview config={{ data: PREVIEW_DATA, ...style, cardLayout: 'none' }} />
          </CardContent>
        </Card>
        <Button type="button" className="w-full" onClick={handleSaveClick} disabled={isSaving}>
          {isSaving ? 'Saving…' : 'Save changes'}
        </Button>
      </div>

      <ConfirmDialog
        open={showSaveConfirm}
        onOpenChange={setShowSaveConfirm}
        title="Save changes to this template?"
        description="QR codes that already used this template keep their existing style — only future uses of this template are affected."
        confirmLabel="Save changes"
        pendingLabel="Saving…"
        isPending={isSaving}
        onConfirm={handleSave}
      />
    </div>
  );
}
