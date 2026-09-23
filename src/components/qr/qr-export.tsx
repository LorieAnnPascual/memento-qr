'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Download } from 'lucide-react';

import type { FileExtension } from 'qr-code-styling';

import type { QRDesignConfig } from '@/lib/qr/generator';
import { createPrintQR, createQRCode, downloadQR } from '@/lib/qr/generator';
import { exportQRCard } from '@/lib/qr/card-export';
import type { SocialLink } from '@/lib/qr/social-badges';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface QRExportProps {
  config: QRDesignConfig;
  fileName: string;
  title?: string;
  socialLinks?: SocialLink[];
}

const FORMATS: { extension: FileExtension; label: string }[] = [
  { extension: 'svg', label: 'SVG (vector)' },
  { extension: 'png', label: 'PNG' },
  { extension: 'jpeg', label: 'JPEG' },
  { extension: 'webp', label: 'WebP' },
];

export function QRExport({ config, fileName, title, socialLinks = [] }: QRExportProps) {
  const [isExporting, setIsExporting] = useState(false);

  async function handleExport(extension: FileExtension, print: boolean): Promise<void> {
    if (!config.data) {
      toast.error('Fill in the QR content before exporting.');
      return;
    }

    const layout = config.cardLayout ?? 'none';
    const name = fileName || 'qr-code';

    setIsExporting(true);
    try {
      if (!print && layout !== 'none') {
        const qr = createQRCode(config);
        await exportQRCard(qr, extension, name, {
          layout,
          title: title || name,
          caption: config.cardCaption,
          backgroundColor: config.cardBackgroundColor,
          backgroundImageUrl: config.cardBackgroundImage,
          backgroundImageBlur: config.cardBackgroundImageBlur,
          titleColor: config.cardTitleColor,
          captionColor: config.cardCaptionColor,
          titleFont: config.cardTitleFont,
          captionFont: config.cardCaptionFont,
          logoUrl: config.logoUrl,
          socialLinks,
          customCard: config.customCard,
        });
      } else {
        const qr = print ? createPrintQR(config) : createQRCode(config);
        await downloadQR(qr, extension, name);
      }
    } catch (error) {
      toast.error('Failed to export QR code. Please try again.');
      console.error('QR export error:', error);
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="sm" disabled={isExporting}>
          <Download className="size-4" />
          {isExporting ? 'Exporting…' : 'Download'}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Standard</DropdownMenuLabel>
        {FORMATS.map((format) => (
          <DropdownMenuItem key={format.extension} onSelect={() => handleExport(format.extension, false)}>
            {format.label}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Print (QR code only)</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => handleExport('svg', true)}>
          High-res SVG (2048px)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
