'use client';

import { useRef } from 'react';
import { AlignCenter, AlignLeft, AlignRight, ArrowDownToLine, ArrowUpToLine, Trash2 } from 'lucide-react';

import type { CardElement, CardElementPatch, ShapeKind } from '@/lib/qr/card-builder-types';
import { CARD_FONTS, type CardFontKey } from '@/lib/qr/card-fonts';
import type { QRStyleConfig } from '@/lib/qr/generator';
import { useImageUpload } from '@/hooks/use-image-upload';
import { MediaPickerButton } from '@/components/media/media-picker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { ColorField } from '../color-field';
import { QRStyleEditor } from '../qr-style-editor';

const FONT_OPTIONS = Object.entries(CARD_FONTS) as [CardFontKey, (typeof CARD_FONTS)[CardFontKey]][];

interface ElementPanelProps {
  element: CardElement | undefined;
  onUpdate: (partial: CardElementPatch) => void;
  onDelete: () => void;
  onReorder: (direction: 'front' | 'back') => void;
}

function ElementPanel({ element, onUpdate, onDelete, onReorder }: ElementPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { isUploading, handleFileChange } = useImageUpload({
    onUploaded: (file) => onUpdate({ url: file.publicUrl }),
  });

  if (!element) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Select an element on the canvas to edit it.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium capitalize">{element.type} element</p>
        <div className="flex gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label="Bring to front"
            onClick={() => onReorder('front')}
          >
            <ArrowUpToLine className="size-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label="Send to back"
            onClick={() => onReorder('back')}
          >
            <ArrowDownToLine className="size-3.5" />
          </Button>
          {element.type !== 'qr' && (
            <Button type="button" variant="ghost" size="icon-xs" aria-label="Delete element" onClick={onDelete}>
              <Trash2 className="size-3.5" />
            </Button>
          )}
        </div>
      </div>

      {element.type === 'qr' && (
        <p className="text-xs text-muted-foreground">
          This is your QR code. Drag to move it or use the corner handle to resize it. Its dot color,
          style, and logo are set in the QR Style tab.
        </p>
      )}

      {element.type === 'text' && (
        <>
          <div className="space-y-2">
            <Label htmlFor="cb-text-content">Text</Label>
            <Textarea
              id="cb-text-content"
              value={element.text}
              onChange={(event) => onUpdate({ text: event.target.value })}
              rows={3}
            />
          </div>
          <ColorField
            id="cb-text-color"
            label="Text color"
            value={element.color}
            onChange={(color) => onUpdate({ color })}
          />
          <div className="space-y-2">
            <Label htmlFor="cb-text-font">Font</Label>
            <Select value={element.fontFamily} onValueChange={(v) => onUpdate({ fontFamily: v as CardFontKey })}>
              <SelectTrigger id="cb-text-font" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FONT_OPTIONS.map(([key, font]) => (
                  <SelectItem key={key} value={key}>
                    {font.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="cb-text-size">Size</Label>
            <Slider
              id="cb-text-size"
              min={10}
              max={72}
              step={1}
              value={[element.fontSize]}
              onValueChange={([next]) => onUpdate({ fontSize: next })}
            />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Switch
                id="cb-text-bold"
                checked={element.bold}
                onCheckedChange={(checked) => onUpdate({ bold: checked })}
              />
              <Label htmlFor="cb-text-bold">Bold</Label>
            </div>
            <div className="flex overflow-hidden rounded-md border border-input">
              {(['left', 'center', 'right'] as const).map((align) => {
                const Icon = align === 'left' ? AlignLeft : align === 'center' ? AlignCenter : AlignRight;
                return (
                  <button
                    key={align}
                    type="button"
                    aria-label={`Align ${align}`}
                    aria-pressed={element.align === align}
                    onClick={() => onUpdate({ align })}
                    className={cn(
                      'p-1.5',
                      element.align === align ? 'bg-primary text-primary-foreground' : 'hover:bg-muted',
                    )}
                  >
                    <Icon className="size-3.5" />
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}

      {element.type === 'shape' && (
        <>
          <div className="space-y-2">
            <Label htmlFor="cb-shape-kind">Shape</Label>
            <Select value={element.shape} onValueChange={(v) => onUpdate({ shape: v as ShapeKind })}>
              <SelectTrigger id="cb-shape-kind" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="rectangle">Rectangle</SelectItem>
                <SelectItem value="circle">Circle</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <ColorField
            id="cb-shape-color"
            label="Color"
            value={element.color}
            onChange={(color) => onUpdate({ color })}
          />
          <div className="space-y-2">
            <Label htmlFor="cb-shape-opacity">Opacity</Label>
            <Slider
              id="cb-shape-opacity"
              min={10}
              max={100}
              step={5}
              value={[element.opacity]}
              onValueChange={([next]) => onUpdate({ opacity: next })}
            />
          </div>
        </>
      )}

      {element.type === 'image' && (
        <div className="space-y-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            className="hidden"
            onChange={handleFileChange}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isUploading}
            onClick={() => fileInputRef.current?.click()}
          >
            {isUploading ? 'Uploading…' : 'Replace image'}
          </Button>
          <MediaPickerButton onSelect={(url) => onUpdate({ url })} />
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 border-t pt-3">
        <div className="space-y-1">
          <Label htmlFor="cb-el-width">Width</Label>
          <Input
            id="cb-el-width"
            type="number"
            value={Math.round(element.width)}
            onChange={(event) => onUpdate({ width: Number(event.target.value) || element.width })}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="cb-el-height">Height</Label>
          <Input
            id="cb-el-height"
            type="number"
            value={Math.round(element.height)}
            onChange={(event) => onUpdate({ height: Number(event.target.value) || element.height })}
          />
        </div>
      </div>
    </div>
  );
}

interface BackgroundPanelProps {
  style: QRStyleConfig;
  onChange: (style: QRStyleConfig) => void;
}

function BackgroundPanel({ style, onChange }: BackgroundPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { isUploading, handleFileChange } = useImageUpload({
    onUploaded: (file) => onChange({ ...style, cardBackgroundImage: file.publicUrl }),
  });

  return (
    <div className="space-y-4">
      <ColorField
        id="cb-bg-color"
        label="Background color"
        value={style.cardBackgroundColor ?? '#FFFFFF'}
        onChange={(color) => onChange({ ...style, cardBackgroundColor: color })}
      />
      <div className="space-y-2">
        <Label>Background image (optional)</Label>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={handleFileChange}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isUploading}
            onClick={() => fileInputRef.current?.click()}
          >
            {isUploading ? 'Uploading…' : style.cardBackgroundImage ? 'Replace image' : 'Upload image'}
          </Button>
          <MediaPickerButton onSelect={(url) => onChange({ ...style, cardBackgroundImage: url })} />
          {style.cardBackgroundImage && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onChange({ ...style, cardBackgroundImage: undefined })}
            >
              Remove
            </Button>
          )}
        </div>
      </div>
      {style.cardBackgroundImage && (
        <div className="space-y-2">
          <Label htmlFor="cb-bg-blur">Background image blur</Label>
          <Slider
            id="cb-bg-blur"
            min={0}
            max={20}
            step={1}
            value={[style.cardBackgroundImageBlur ?? 0]}
            onValueChange={([next]) => onChange({ ...style, cardBackgroundImageBlur: next })}
          />
        </div>
      )}
    </div>
  );
}

interface CardBuilderPanelProps {
  selectedElement: CardElement | undefined;
  onUpdateElement: (partial: CardElementPatch) => void;
  onDeleteElement: () => void;
  onReorderElement: (direction: 'front' | 'back') => void;
  style: QRStyleConfig;
  onChangeStyle: (style: QRStyleConfig) => void;
}

export function CardBuilderPanel({
  selectedElement,
  onUpdateElement,
  onDeleteElement,
  onReorderElement,
  style,
  onChangeStyle,
}: CardBuilderPanelProps) {
  return (
    <Tabs defaultValue="element">
      <TabsList className="w-full">
        <TabsTrigger value="element" className="flex-1">
          Element
        </TabsTrigger>
        <TabsTrigger value="background" className="flex-1">
          Background
        </TabsTrigger>
        <TabsTrigger value="qr-style" className="flex-1">
          QR Style
        </TabsTrigger>
      </TabsList>
      <TabsContent value="element">
        <ElementPanel
          element={selectedElement}
          onUpdate={onUpdateElement}
          onDelete={onDeleteElement}
          onReorder={onReorderElement}
        />
      </TabsContent>
      <TabsContent value="background">
        <BackgroundPanel style={style} onChange={onChangeStyle} />
      </TabsContent>
      <TabsContent value="qr-style">
        <QRStyleEditor value={style} onChange={onChangeStyle} />
      </TabsContent>
    </Tabs>
  );
}
