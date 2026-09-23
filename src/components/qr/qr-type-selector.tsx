'use client';

import { QR_TYPES, getQRTypeDescription, getQRTypeLabel, type QRType } from '@/types/qr';
import { cn } from '@/lib/utils';
import { getQRTypeIcon } from './qr-type-icon';

interface QRTypeSelectorProps {
  value: QRType;
  onChange: (type: QRType) => void;
}

export function QRTypeSelector({ value, onChange }: QRTypeSelectorProps) {
  return (
    <div
      role="radiogroup"
      aria-label="QR code type"
      className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6"
    >
      {QR_TYPES.map((type) => {
        const Icon = getQRTypeIcon(type);
        const isActive = type === value;
        const label = getQRTypeLabel(type);
        const description = getQRTypeDescription(type);

        return (
          <button
            key={type}
            type="button"
            role="radio"
            aria-checked={isActive}
            aria-label={`${label}: ${description}`}
            title={description}
            data-testid={`qr-type-${type}`}
            onClick={() => onChange(type)}
            className={cn(
              'flex flex-col items-center gap-1.5 rounded-lg border px-2 py-3 text-xs font-medium transition-colors',
              isActive
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-input text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <Icon className="size-5" />
            <span>{label}</span>
            <span
              className={cn(
                'text-[0.65rem] leading-tight font-normal',
                isActive ? 'text-primary-foreground' : 'text-muted-foreground',
              )}
            >
              {description}
            </span>
          </button>
        );
      })}
    </div>
  );
}
