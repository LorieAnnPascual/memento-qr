'use client';

import type { EmailFormValues } from '@/types/qr';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

interface EmailFormProps {
  values: EmailFormValues;
  onChange: (values: EmailFormValues) => void;
}

export function EmailForm({ values, onChange }: EmailFormProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="qr-email-address">Email address</Label>
        <Input
          id="qr-email-address"
          type="email"
          placeholder="name@example.com"
          value={values.address}
          onChange={(event) => onChange({ ...values, address: event.target.value })}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="qr-email-subject">Subject (optional)</Label>
        <Input
          id="qr-email-subject"
          value={values.subject}
          onChange={(event) => onChange({ ...values, subject: event.target.value })}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="qr-email-body">Body (optional)</Label>
        <Textarea
          id="qr-email-body"
          rows={3}
          value={values.body}
          onChange={(event) => onChange({ ...values, body: event.target.value })}
        />
      </div>
    </div>
  );
}
