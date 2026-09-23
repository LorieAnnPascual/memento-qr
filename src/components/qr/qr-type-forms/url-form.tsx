'use client';

import type { UrlFormValues } from '@/types/qr';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface UrlFormProps {
  values: UrlFormValues;
  onChange: (values: UrlFormValues) => void;
}

export function UrlForm({ values, onChange }: UrlFormProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor="qr-url">Website URL</Label>
      <Input
        id="qr-url"
        placeholder="example.com"
        value={values.url}
        onChange={(event) => onChange({ url: event.target.value })}
      />
    </div>
  );
}
