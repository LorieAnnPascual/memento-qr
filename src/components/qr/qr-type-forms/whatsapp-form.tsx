'use client';

import type { WhatsAppFormValues } from '@/types/qr';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

interface WhatsAppFormProps {
  values: WhatsAppFormValues;
  onChange: (values: WhatsAppFormValues) => void;
}

export function WhatsAppForm({ values, onChange }: WhatsAppFormProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="qr-whatsapp-phone">Phone number</Label>
        <Input
          id="qr-whatsapp-phone"
          type="tel"
          placeholder="+639171234567"
          value={values.phone}
          onChange={(event) => onChange({ ...values, phone: event.target.value })}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="qr-whatsapp-message">Prefilled message (optional)</Label>
        <Textarea
          id="qr-whatsapp-message"
          rows={3}
          value={values.message}
          onChange={(event) => onChange({ ...values, message: event.target.value })}
        />
      </div>
    </div>
  );
}
