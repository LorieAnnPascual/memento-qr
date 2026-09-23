'use client';

import type { TextFormValues } from '@/types/qr';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

interface TextFormProps {
  values: TextFormValues;
  onChange: (values: TextFormValues) => void;
}

export function TextForm({ values, onChange }: TextFormProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor="qr-text">Text</Label>
      <Textarea
        id="qr-text"
        rows={4}
        value={values.text}
        onChange={(event) => onChange({ text: event.target.value })}
      />
    </div>
  );
}
