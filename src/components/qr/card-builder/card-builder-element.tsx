'use client';

import { useRef } from 'react';

import type { CardElement, CardElementPatch } from '@/lib/qr/card-builder-types';
import { cssFontFamily } from '@/lib/qr/card-fonts';
import { cn } from '@/lib/utils';

interface CardBuilderElementProps {
  element: CardElement;
  isSelected: boolean;
  onSelect: () => void;
  onUpdate: (partial: CardElementPatch) => void;
  qrRef?: React.Ref<HTMLDivElement>;
}

export function CardBuilderElement({ element, isSelected, onSelect, onUpdate, qrRef }: CardBuilderElementProps) {
  const dragOrigin = useRef<{ x: number; y: number; elX: number; elY: number } | null>(null);
  const resizeOrigin = useRef<{ x: number; y: number; w: number; h: number } | null>(null);

  function handleDragPointerDown(event: React.PointerEvent<HTMLDivElement>): void {
    event.stopPropagation();
    onSelect();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragOrigin.current = { x: event.clientX, y: event.clientY, elX: element.x, elY: element.y };
  }

  function handleDragPointerMove(event: React.PointerEvent<HTMLDivElement>): void {
    if (!dragOrigin.current) return;
    const dx = event.clientX - dragOrigin.current.x;
    const dy = event.clientY - dragOrigin.current.y;
    onUpdate({ x: Math.round(dragOrigin.current.elX + dx), y: Math.round(dragOrigin.current.elY + dy) });
  }

  function handleDragPointerUp(): void {
    dragOrigin.current = null;
  }

  function handleResizePointerDown(event: React.PointerEvent<HTMLDivElement>): void {
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    resizeOrigin.current = { x: event.clientX, y: event.clientY, w: element.width, h: element.height };
  }

  function handleResizePointerMove(event: React.PointerEvent<HTMLDivElement>): void {
    event.stopPropagation();
    if (!resizeOrigin.current) return;
    const dx = event.clientX - resizeOrigin.current.x;
    const dy = event.clientY - resizeOrigin.current.y;
    onUpdate({
      width: Math.max(20, Math.round(resizeOrigin.current.w + dx)),
      height: Math.max(20, Math.round(resizeOrigin.current.h + dy)),
    });
  }

  function handleResizePointerUp(event: React.PointerEvent<HTMLDivElement>): void {
    event.stopPropagation();
    resizeOrigin.current = null;
  }

  return (
    <div
      data-testid={`card-builder-element-${element.id}`}
      onPointerDown={handleDragPointerDown}
      onPointerMove={handleDragPointerMove}
      onPointerUp={handleDragPointerUp}
      className={cn('absolute touch-none select-none', isSelected && 'outline-2 outline-offset-2 outline-[#b99c65]')}
      style={{
        left: element.x,
        top: element.y,
        width: element.width,
        height: element.height,
        zIndex: element.zIndex,
        cursor: element.type === 'qr' ? 'default' : 'move',
      }}
    >
      {element.type === 'qr' && (
        <div ref={qrRef} className="h-full w-full [&>svg]:h-full [&>svg]:w-full" />
      )}
      {element.type === 'shape' && (
        <div
          className="h-full w-full"
          style={{
            backgroundColor: element.color,
            opacity: element.opacity / 100,
            borderRadius: element.shape === 'circle' ? '9999px' : 0,
          }}
        />
      )}
      {element.type === 'image' && (
        // eslint-disable-next-line @next/next/no-img-element -- arbitrary uploaded URL positioned freeform on a canvas
        <img src={element.url} alt="" draggable={false} className="h-full w-full object-contain" />
      )}
      {element.type === 'text' && (
        <div
          className="h-full w-full overflow-hidden whitespace-pre-wrap"
          style={{
            color: element.color,
            fontFamily: cssFontFamily(element.fontFamily),
            fontSize: element.fontSize,
            fontWeight: element.bold ? 700 : 400,
            textAlign: element.align,
          }}
        >
          {element.text}
        </div>
      )}

      {isSelected && (
        <div
          data-testid={`card-builder-resize-${element.id}`}
          onPointerDown={handleResizePointerDown}
          onPointerMove={handleResizePointerMove}
          onPointerUp={handleResizePointerUp}
          className="absolute -right-1.5 -bottom-1.5 size-3.5 touch-none rounded-full border-2 border-white bg-[#b99c65]"
          style={{ cursor: 'nwse-resize' }}
        />
      )}
    </div>
  );
}
