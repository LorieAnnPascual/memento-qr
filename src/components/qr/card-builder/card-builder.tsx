'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { toast } from 'sonner';
import { ImagePlus, Shapes, Type } from 'lucide-react';

import type { QRTemplate } from '@/lib/db/schema';
import {
  CANVAS_PRESETS,
  createDefaultCustomCard,
  generateElementId,
  type CardElement,
  type CardElementPatch,
} from '@/lib/qr/card-builder-types';
import { DEFAULT_QR_STYLE, type QRStyleConfig } from '@/lib/qr/generator';
import { TEMPLATE_CATEGORIES } from '@/lib/qr/schemas';
import { useImageUpload } from '@/hooks/use-image-upload';
import { MediaPickerButton } from '@/components/media/media-picker';
import { useQRCode } from '@/hooks/use-qr-code';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CardBuilderElement } from './card-builder-element';
import { CardBuilderPanel } from './card-builder-panel';

const PREVIEW_DATA = 'https://memento-qr.vercel.app';

function buildInitialStyle(template?: QRTemplate): QRStyleConfig {
  if (template) {
    const style = template.styleConfig as QRStyleConfig;
    if (style.cardLayout === 'custom' && style.customCard) {
      return style;
    }
  }
  return { ...DEFAULT_QR_STYLE, cardLayout: 'custom', customCard: createDefaultCustomCard('vertical') };
}

interface CardBuilderProps {
  initialTemplate?: QRTemplate;
}

export function CardBuilder({ initialTemplate }: CardBuilderProps) {
  const router = useRouter();
  const canvasRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(initialTemplate?.name ?? '');
  const [category, setCategory] = useState<(typeof TEMPLATE_CATEGORIES)[number]>(
    (initialTemplate?.category as (typeof TEMPLATE_CATEGORIES)[number]) ?? 'custom',
  );
  const [style, setStyle] = useState<QRStyleConfig>(() => buildInitialStyle(initialTemplate));
  const [selectedId, setSelectedId] = useState<string>('qr');
  const [isSaving, setIsSaving] = useState(false);
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);

  const design = style.customCard ?? createDefaultCustomCard('vertical');
  const selectedElement = design.elements.find((el) => el.id === selectedId);

  const { ref: qrRef } = useQRCode(
    { data: PREVIEW_DATA, ...style, cardLayout: 'none' },
    design.elements.find((el) => el.type === 'qr')?.width ?? 160,
  );

  const { isUploading: isUploadingImage, handleFileChange: handleImageFileChange } = useImageUpload({
    onUploaded: (file) => addImageElement(file.publicUrl),
  });

  function addImageElement(url: string): void {
    addElement({
      id: generateElementId(),
      type: 'image',
      x: design.width / 2 - 60,
      y: design.height / 2 - 60,
      width: 120,
      height: 120,
      zIndex: nextZIndex(),
      url,
    });
  }

  function nextZIndex(): number {
    return design.elements.length ? Math.max(...design.elements.map((el) => el.zIndex)) + 1 : 1;
  }

  function updateDesign(elements: CardElement[]): void {
    setStyle((prev) => ({ ...prev, customCard: { ...design, elements } }));
  }

  function addElement(element: CardElement): void {
    updateDesign([...design.elements, element]);
    setSelectedId(element.id);
  }

  function addText(): void {
    addElement({
      id: generateElementId(),
      type: 'text',
      x: design.width * 0.15,
      y: design.height * 0.75,
      width: design.width * 0.7,
      height: 40,
      zIndex: nextZIndex(),
      text: 'Your text here',
      color: '#23334e',
      fontFamily: 'playfair',
      fontSize: 20,
      bold: false,
      align: 'center',
    });
  }

  function addShape(shape: 'rectangle' | 'circle'): void {
    addElement({
      id: generateElementId(),
      type: 'shape',
      x: design.width / 2 - 40,
      y: design.height / 2 - 40,
      width: 80,
      height: 80,
      zIndex: nextZIndex(),
      shape,
      color: '#b99c65',
      opacity: 100,
    });
  }

  function handleUpdateElement(id: string, partial: CardElementPatch): void {
    updateDesign(design.elements.map((el) => (el.id === id ? ({ ...el, ...partial } as CardElement) : el)));
  }

  function handleDeleteElement(id: string): void {
    if (id === 'qr') return;
    updateDesign(design.elements.filter((el) => el.id !== id));
    setSelectedId('qr');
  }

  function handleReorderElement(id: string, direction: 'front' | 'back'): void {
    const zIndexes = design.elements.map((el) => el.zIndex);
    const target = direction === 'front' ? Math.max(...zIndexes) + 1 : Math.min(...zIndexes) - 1;
    updateDesign(design.elements.map((el) => (el.id === id ? { ...el, zIndex: target } : el)));
  }

  function handleOrientationChange(orientation: keyof typeof CANVAS_PRESETS): void {
    const preset = CANVAS_PRESETS[orientation];
    setStyle((prev) => ({
      ...prev,
      customCard: { ...design, width: preset.width, height: preset.height },
    }));
  }

  const sortedElements = useMemo(() => [...design.elements].sort((a, b) => a.zIndex - b.zIndex), [design.elements]);

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
      const body = { name: name.trim(), category, styleConfig: style };
      const response = await fetch(
        initialTemplate ? `/api/templates/${initialTemplate.id}` : '/api/templates',
        {
          method: initialTemplate ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      );

      if (!response.ok) throw new Error('Request failed');

      toast.success(initialTemplate ? 'Template updated' : 'Template saved');
      setShowSaveConfirm(false);
      router.push('/templates');
      router.refresh();
    } catch (error) {
      toast.error('Failed to save template. Please try again.');
      console.error('Card builder save error:', error);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-wrap gap-4">
          <div className="w-full max-w-sm space-y-2">
            <Label htmlFor="cb-name">Template name</Label>
            <Input
              id="cb-name"
              placeholder="e.g. Rose Gold Memorial Card"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="w-40 space-y-2">
            <Label htmlFor="cb-category">Category</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as typeof category)}>
              <SelectTrigger id="cb-category" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TEMPLATE_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c} className="capitalize">
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button type="button" onClick={handleSaveClick} disabled={isSaving}>
          {isSaving ? 'Saving…' : initialTemplate ? 'Save changes' : 'Save template'}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-input p-3">
        <Button type="button" variant="outline" size="sm" onClick={addText}>
          <Type className="size-4" />
          Add text
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => addShape('rectangle')}>
          <Shapes className="size-4" />
          Add rectangle
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => addShape('circle')}>
          <Shapes className="size-4 rounded-full" />
          Add circle
        </Button>
        <input
          ref={imageInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          className="hidden"
          onChange={handleImageFileChange}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isUploadingImage}
          onClick={() => imageInputRef.current?.click()}
        >
          <ImagePlus className="size-4" />
          {isUploadingImage ? 'Uploading…' : 'Upload graphic'}
        </Button>
        <MediaPickerButton onSelect={(url) => addImageElement(url)} label="From media" />

        <div className="ml-auto flex items-center gap-2">
          <Label htmlFor="cb-orientation" className="text-sm text-muted-foreground">
            Canvas
          </Label>
          <Select
            value={design.width > design.height ? 'horizontal' : 'vertical'}
            onValueChange={(v) => handleOrientationChange(v as keyof typeof CANVAS_PRESETS)}
          >
            <SelectTrigger id="cb-orientation" className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="vertical">Vertical</SelectItem>
              <SelectItem value="horizontal">Horizontal</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="flex justify-center overflow-auto rounded-lg border border-dashed bg-muted/30 p-6">
          <div
            ref={canvasRef}
            data-testid="card-builder-canvas"
            onPointerDown={() => setSelectedId('qr')}
            className="relative shrink-0 overflow-hidden rounded-lg border border-input shadow-sm"
            style={{
              width: design.width,
              height: design.height,
              backgroundColor: style.cardBackgroundColor ?? '#FFFFFF',
              ...(style.cardBackgroundImage && {
                backgroundImage: `url(${style.cardBackgroundImage})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                filter: style.cardBackgroundImageBlur ? `blur(${style.cardBackgroundImageBlur}px)` : undefined,
              }),
            }}
          >
            {sortedElements.map((el) => (
              <CardBuilderElement
                key={el.id}
                element={el}
                isSelected={el.id === selectedId}
                onSelect={() => setSelectedId(el.id)}
                onUpdate={(partial) => handleUpdateElement(el.id, partial)}
                qrRef={el.type === 'qr' ? qrRef : undefined}
              />
            ))}
          </div>
        </div>

        <Card>
          <CardContent>
            <CardBuilderPanel
              selectedElement={selectedElement}
              onUpdateElement={(partial) => selectedElement && handleUpdateElement(selectedElement.id, partial)}
              onDeleteElement={() => selectedElement && handleDeleteElement(selectedElement.id)}
              onReorderElement={(direction) => selectedElement && handleReorderElement(selectedElement.id, direction)}
              style={style}
              onChangeStyle={setStyle}
            />
          </CardContent>
        </Card>
      </div>

      <ConfirmDialog
        open={showSaveConfirm}
        onOpenChange={setShowSaveConfirm}
        title={initialTemplate ? 'Save changes to this template?' : 'Save this template?'}
        description={
          initialTemplate
            ? 'This will overwrite the saved version with your current design.'
            : `"${name}" will be added to your team's template gallery.`
        }
        confirmLabel={initialTemplate ? 'Save changes' : 'Save template'}
        pendingLabel="Saving…"
        isPending={isSaving}
        onConfirm={handleSave}
      />
    </div>
  );
}
