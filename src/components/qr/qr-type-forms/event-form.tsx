'use client';

import type { EventFormValues } from '@/types/qr';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

interface EventFormProps {
  values: EventFormValues;
  onChange: (values: EventFormValues) => void;
}

export function EventForm({ values, onChange }: EventFormProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="qr-event-title">Event title</Label>
        <Input
          id="qr-event-title"
          value={values.title}
          onChange={(event) => onChange({ ...values, title: event.target.value })}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="qr-event-start">Starts</Label>
          <Input
            id="qr-event-start"
            type="datetime-local"
            value={values.startDate}
            onChange={(event) => onChange({ ...values, startDate: event.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="qr-event-end">Ends</Label>
          <Input
            id="qr-event-end"
            type="datetime-local"
            value={values.endDate}
            onChange={(event) => onChange({ ...values, endDate: event.target.value })}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="qr-event-location">Location (optional)</Label>
        <Input
          id="qr-event-location"
          value={values.location}
          onChange={(event) => onChange({ ...values, location: event.target.value })}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="qr-event-description">Description (optional)</Label>
        <Textarea
          id="qr-event-description"
          rows={3}
          value={values.description}
          onChange={(event) => onChange({ ...values, description: event.target.value })}
        />
      </div>
    </div>
  );
}
