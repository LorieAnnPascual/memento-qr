'use client';

import type { WifiFormValues } from '@/types/qr';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PasswordInput } from '@/components/ui/password-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

interface WifiFormProps {
  values: WifiFormValues;
  onChange: (values: WifiFormValues) => void;
}

export function WifiForm({ values, onChange }: WifiFormProps) {
  const isOpenNetwork = values.security === '';

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="qr-wifi-ssid">Network name (SSID)</Label>
        <Input
          id="qr-wifi-ssid"
          value={values.ssid}
          onChange={(event) => onChange({ ...values, ssid: event.target.value })}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="qr-wifi-security">Security</Label>
        <Select
          value={values.security === '' ? 'nopass' : values.security}
          onValueChange={(next) =>
            onChange({ ...values, security: next === 'nopass' ? '' : (next as 'WPA' | 'WEP') })
          }
        >
          <SelectTrigger id="qr-wifi-security" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="WPA">WPA/WPA2</SelectItem>
            <SelectItem value="WEP">WEP</SelectItem>
            <SelectItem value="nopass">No password</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {!isOpenNetwork && (
        <div className="space-y-2">
          <Label htmlFor="qr-wifi-password">Password</Label>
          <PasswordInput
            id="qr-wifi-password"
            value={values.password}
            onChange={(event) => onChange({ ...values, password: event.target.value })}
          />
        </div>
      )}
      <div className="flex items-center justify-between rounded-lg border border-input px-3 py-2">
        <Label htmlFor="qr-wifi-hidden" className="font-normal">
          Hidden network
        </Label>
        <Switch
          id="qr-wifi-hidden"
          checked={values.hidden}
          onCheckedChange={(checked) => onChange({ ...values, hidden: checked })}
        />
      </div>
    </div>
  );
}
