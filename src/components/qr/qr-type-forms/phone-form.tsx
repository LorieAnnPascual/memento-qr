'use client';

import type { PhoneFormValues } from '@/types/qr';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface PhoneFormProps {
  values: PhoneFormValues;
  onChange: (values: PhoneFormValues) => void;
}

export function PhoneForm({ values, onChange }: PhoneFormProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor="qr-phone">Phone number</Label>
      <Input
        id="qr-phone"
        type="tel"
        placeholder="+639171234567"
        value={values.phone}
        onChange={(event) => onChange({ phone: event.target.value })}
      />
    </div>
  );
}
