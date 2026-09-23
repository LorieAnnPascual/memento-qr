'use client';

import type { SmsFormValues } from '@/types/qr';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

interface SmsFormProps {
  values: SmsFormValues;
  onChange: (values: SmsFormValues) => void;
}

export function SmsForm({ values, onChange }: SmsFormProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="qr-sms-phone">Phone number</Label>
        <Input
          id="qr-sms-phone"
          type="tel"
          placeholder="+639171234567"
          value={values.phone}
          onChange={(event) => onChange({ ...values, phone: event.target.value })}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="qr-sms-message">Message (optional)</Label>
        <Textarea
          id="qr-sms-message"
          rows={3}
          value={values.message}
          onChange={(event) => onChange({ ...values, message: event.target.value })}
        />
      </div>
    </div>
  );
}
