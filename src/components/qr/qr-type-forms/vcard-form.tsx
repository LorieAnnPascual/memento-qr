'use client';

import type { VCardFormValues } from '@/types/qr';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';

interface VCardFormProps {
  values: VCardFormValues;
  onChange: (values: VCardFormValues) => void;
}

function patch(
  values: VCardFormValues,
  onChange: (values: VCardFormValues) => void,
  field: keyof VCardFormValues,
) {
  return (event: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...values, [field]: event.target.value });
}

export function VCardForm({ values, onChange }: VCardFormProps) {
  const set = (field: keyof VCardFormValues) => patch(values, onChange, field);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="qr-vcard-firstName">First name</Label>
          <Input id="qr-vcard-firstName" value={values.firstName} onChange={set('firstName')} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="qr-vcard-lastName">Last name</Label>
          <Input id="qr-vcard-lastName" value={values.lastName} onChange={set('lastName')} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="qr-vcard-organization">Organization</Label>
          <Input id="qr-vcard-organization" value={values.organization} onChange={set('organization')} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="qr-vcard-title">Job title</Label>
          <Input id="qr-vcard-title" value={values.title} onChange={set('title')} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="qr-vcard-phone">Work phone</Label>
          <Input id="qr-vcard-phone" type="tel" value={values.phone} onChange={set('phone')} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="qr-vcard-mobile">Mobile phone</Label>
          <Input id="qr-vcard-mobile" type="tel" value={values.mobile} onChange={set('mobile')} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="qr-vcard-email">Email</Label>
          <Input id="qr-vcard-email" type="email" value={values.email} onChange={set('email')} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="qr-vcard-website">Website</Label>
          <Input id="qr-vcard-website" value={values.website} onChange={set('website')} />
        </div>
      </div>

      <Separator />

      <div className="space-y-2">
        <Label htmlFor="qr-vcard-street">Street address</Label>
        <Input id="qr-vcard-street" value={values.street} onChange={set('street')} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="qr-vcard-city">City</Label>
          <Input id="qr-vcard-city" value={values.city} onChange={set('city')} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="qr-vcard-state">State / Province</Label>
          <Input id="qr-vcard-state" value={values.state} onChange={set('state')} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="qr-vcard-zip">ZIP / Postal code</Label>
          <Input id="qr-vcard-zip" value={values.zip} onChange={set('zip')} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="qr-vcard-country">Country</Label>
          <Input id="qr-vcard-country" value={values.country} onChange={set('country')} />
        </div>
      </div>

      <Separator />

      <p className="text-sm font-medium">Social profiles (optional)</p>
      <p className="text-xs text-muted-foreground">
        Shown as logos on the horizontal/vertical card layout, and saved into the contact card.
      </p>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="qr-vcard-facebook">Facebook</Label>
          <Input
            id="qr-vcard-facebook"
            placeholder="https://facebook.com/..."
            value={values.facebook}
            onChange={set('facebook')}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="qr-vcard-instagram">Instagram</Label>
          <Input
            id="qr-vcard-instagram"
            placeholder="https://instagram.com/..."
            value={values.instagram}
            onChange={set('instagram')}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="qr-vcard-twitter">Twitter / X</Label>
          <Input
            id="qr-vcard-twitter"
            placeholder="https://x.com/..."
            value={values.twitter}
            onChange={set('twitter')}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="qr-vcard-tiktok">TikTok</Label>
          <Input
            id="qr-vcard-tiktok"
            placeholder="https://tiktok.com/@..."
            value={values.tiktok}
            onChange={set('tiktok')}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="qr-vcard-linkedin">LinkedIn</Label>
          <Input
            id="qr-vcard-linkedin"
            placeholder="https://linkedin.com/in/..."
            value={values.linkedin}
            onChange={set('linkedin')}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="qr-vcard-threads">Threads</Label>
          <Input
            id="qr-vcard-threads"
            placeholder="https://threads.net/@..."
            value={values.threads}
            onChange={set('threads')}
          />
        </div>
      </div>
    </div>
  );
}
