'use client';

import { Plus, X } from 'lucide-react';

import type { SocialFormValues } from '@/types/qr';
import { SOCIAL_PLATFORMS, SOCIAL_BADGES, type SocialPlatform } from '@/lib/qr/social-badges';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface SocialFormProps {
  values: SocialFormValues;
  onChange: (values: SocialFormValues) => void;
}

export function SocialForm({ values, onChange }: SocialFormProps) {
  const links = values.links;

  function addLink(): void {
    if (links.length === 0 && values.url.trim()) {
      onChange({ ...values, links: [{ platform: 'instagram', url: values.url }] });
      return;
    }
    onChange({ ...values, links: [...links, { platform: 'instagram', url: '' }] });
  }

  function updateLink(index: number, partial: Partial<{ platform: SocialPlatform; url: string }>): void {
    const next = [...links];
    next[index] = { ...next[index], ...partial };
    onChange({ ...values, links: next });
  }

  function removeLink(index: number): void {
    onChange({ ...values, links: links.filter((_, i) => i !== index) });
  }

  return (
    <div className="space-y-4">
      {links.length === 0 ? (
        <div className="space-y-2">
          <Label htmlFor="qr-social-url">Profile URL</Label>
          <Input
            id="qr-social-url"
            placeholder="instagram.com/yourbrand"
            value={values.url}
            onChange={(event) => onChange({ ...values, url: event.target.value })}
          />
          <p className="text-xs text-muted-foreground">
            Add more profiles below to show multiple logos on a card layout. The QR code always scans
            to the first profile in the list.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {links.map((link, index) => (
            <div key={index} className="flex items-end gap-2">
              <div className="w-36 shrink-0 space-y-2">
                <Label htmlFor={`qr-social-platform-${index}`}>Platform</Label>
                <Select
                  value={link.platform}
                  onValueChange={(v) => updateLink(index, { platform: v as SocialPlatform })}
                >
                  <SelectTrigger id={`qr-social-platform-${index}`} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SOCIAL_PLATFORMS.map((platform) => (
                      <SelectItem key={platform} value={platform}>
                        {SOCIAL_BADGES[platform].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1 space-y-2">
                <Label htmlFor={`qr-social-url-${index}`}>{index === 0 ? 'Profile URL (scanned)' : 'Profile URL'}</Label>
                <Input
                  id={`qr-social-url-${index}`}
                  placeholder="https://..."
                  value={link.url}
                  onChange={(event) => updateLink(index, { url: event.target.value })}
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Remove this link"
                onClick={() => removeLink(index)}
              >
                <X className="size-4" />
              </Button>
            </div>
          ))}
          <p className="text-xs text-muted-foreground">
            The QR code scans to the first profile above. The rest are shown as logos on the card
            layout but aren&apos;t separately scannable.
          </p>
        </div>
      )}
      <Button type="button" variant="outline" size="sm" onClick={addLink}>
        <Plus className="size-4" />
        {links.length === 0 ? 'Add another profile' : 'Add profile'}
      </Button>
    </div>
  );
}
