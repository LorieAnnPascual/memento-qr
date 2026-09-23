'use client';

import type { LocationFormValues } from '@/types/qr';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface LocationFormProps {
  values: LocationFormValues;
  onChange: (values: LocationFormValues) => void;
}

export function LocationForm({ values, onChange }: LocationFormProps) {
  const usingMapsUrl = values.mapsUrl.trim().length > 0;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="qr-location-maps-url">Google Maps URL (optional)</Label>
        <Input
          id="qr-location-maps-url"
          placeholder="https://maps.app.goo.gl/..."
          value={values.mapsUrl}
          onChange={(event) => onChange({ ...values, mapsUrl: event.target.value })}
        />
        <p className="text-xs text-muted-foreground">
          Paste a Google Maps share link to use it directly. Leave blank to use coordinates instead.
        </p>
      </div>
      <div className={usingMapsUrl ? 'space-y-4 opacity-50' : 'space-y-4'}>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="qr-location-lat">Latitude</Label>
            <Input
              id="qr-location-lat"
              type="number"
              step="any"
              placeholder="14.5995"
              value={values.latitude}
              disabled={usingMapsUrl}
              onChange={(event) => onChange({ ...values, latitude: event.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="qr-location-lng">Longitude</Label>
            <Input
              id="qr-location-lng"
              type="number"
              step="any"
              placeholder="120.9842"
              value={values.longitude}
              disabled={usingMapsUrl}
              onChange={(event) => onChange({ ...values, longitude: event.target.value })}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="qr-location-label">Label (optional)</Label>
          <Input
            id="qr-location-label"
            placeholder="Manila City Hall"
            value={values.label}
            disabled={usingMapsUrl}
            onChange={(event) => onChange({ ...values, label: event.target.value })}
          />
        </div>
      </div>
    </div>
  );
}
