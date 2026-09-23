import type { EventData, QRFormValuesMap, QRType, VCardData, WifiSecurity } from '@/types/qr';

// ---- URL ----
export function buildUrlPayload(url: string): string {
  const trimmed = url.trim();
  // Nothing typed means no content, not the address "https://".
  if (!trimmed) return '';
  if (!/^https?:\/\//i.test(trimmed)) {
    return `https://${trimmed}`;
  }
  return trimmed;
}

// ---- Plain Text ----
export function buildTextPayload(text: string): string {
  return text;
}

// ---- Phone Call ----
export function buildPhonePayload(phone: string): string {
  return `tel:${phone}`;
}

// ---- SMS ----
export function buildSmsPayload(phone: string, message?: string): string {
  const base = `sms:${phone}`;
  return message ? `${base}?body=${encodeURIComponent(message)}` : base;
}

// ---- Email ----
export function buildEmailPayload(address: string, subject?: string, body?: string): string {
  const params = new URLSearchParams();
  if (subject) params.set('subject', subject);
  if (body) params.set('body', body);
  const query = params.toString();
  return `mailto:${address}${query ? `?${query}` : ''}`;
}

// ---- WiFi ----
export function buildWifiPayload(
  ssid: string,
  password: string,
  security: WifiSecurity | '' = 'WPA',
  hidden: boolean = false,
): string {
  const escape = (value: string) => value.replace(/([\\;,:"'])/g, '\\$1');
  const type = security === '' ? 'nopass' : security;
  // An open network has no password, regardless of what was passed in.
  const effectivePassword = type === 'nopass' ? '' : password;
  return `WIFI:T:${type};S:${escape(ssid)};P:${escape(effectivePassword)};H:${hidden};;`;
}

// ---- vCard (Contact) ----
export function buildVCardPayload(data: VCardData): string {
  const lines: string[] = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `N:${data.lastName};${data.firstName};;;`,
    `FN:${data.firstName} ${data.lastName}`,
  ];
  if (data.organization) lines.push(`ORG:${data.organization}`);
  if (data.title) lines.push(`TITLE:${data.title}`);
  if (data.phone) lines.push(`TEL;TYPE=WORK,VOICE:${data.phone}`);
  if (data.mobile) lines.push(`TEL;TYPE=CELL:${data.mobile}`);
  if (data.email) lines.push(`EMAIL:${data.email}`);
  if (data.website) lines.push(`URL:${data.website}`);
  if (data.social) {
    const s = data.social;
    if (s.facebook) lines.push(`URL;TYPE=facebook:${s.facebook}`);
    if (s.instagram) lines.push(`URL;TYPE=instagram:${s.instagram}`);
    if (s.twitter) lines.push(`URL;TYPE=twitter:${s.twitter}`);
    if (s.tiktok) lines.push(`URL;TYPE=tiktok:${s.tiktok}`);
    if (s.linkedin) lines.push(`URL;TYPE=linkedin:${s.linkedin}`);
    if (s.threads) lines.push(`URL;TYPE=threads:${s.threads}`);
  }
  if (data.address) {
    const a = data.address;
    lines.push(
      `ADR:;;${a.street ?? ''};${a.city ?? ''};${a.state ?? ''};${a.zip ?? ''};${a.country ?? ''}`,
    );
  }
  lines.push('END:VCARD');
  return lines.join('\n');
}

// ---- WhatsApp ----
export function buildWhatsAppPayload(phone: string, message?: string): string {
  const cleanPhone = phone.replace(/^\+/, '');
  const base = `https://wa.me/${cleanPhone}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}

// ---- Calendar Event ----
export function buildEventPayload(data: EventData): string {
  const formatDate = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'BEGIN:VEVENT',
    `SUMMARY:${data.title}`,
    `DTSTART:${formatDate(data.startDate)}`,
    `DTEND:${formatDate(data.endDate)}`,
  ];
  if (data.location) lines.push(`LOCATION:${data.location}`);
  if (data.description) lines.push(`DESCRIPTION:${data.description}`);
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.join('\n');
}

// ---- Location (Geo) ----
export function buildLocationPayload(latitude: number, longitude: number, label?: string): string {
  const base = `geo:${latitude},${longitude}`;
  return label ? `${base}?q=${encodeURIComponent(label)}` : base;
}

// ---- Social Media Links ----
export function buildSocialPayload(primaryUrl: string): string {
  return buildUrlPayload(primaryUrl);
}

/** Builds the encoded QR payload string for any QR type from its form values. */
export function buildPayloadForType<T extends QRType>(
  type: T,
  values: QRFormValuesMap[T],
): string {
  switch (type) {
    case 'url':
      return buildUrlPayload((values as QRFormValuesMap['url']).url);
    case 'text':
      return buildTextPayload((values as QRFormValuesMap['text']).text);
    case 'phone':
      return buildPhonePayload((values as QRFormValuesMap['phone']).phone);
    case 'sms': {
      const v = values as QRFormValuesMap['sms'];
      return buildSmsPayload(v.phone, v.message || undefined);
    }
    case 'email': {
      const v = values as QRFormValuesMap['email'];
      return buildEmailPayload(v.address, v.subject || undefined, v.body || undefined);
    }
    case 'wifi': {
      const v = values as QRFormValuesMap['wifi'];
      return buildWifiPayload(v.ssid, v.password, v.security, v.hidden);
    }
    case 'vcard': {
      const v = values as QRFormValuesMap['vcard'];
      const data: VCardData = {
        firstName: v.firstName,
        lastName: v.lastName,
        organization: v.organization || undefined,
        title: v.title || undefined,
        phone: v.phone || undefined,
        mobile: v.mobile || undefined,
        email: v.email || undefined,
        website: v.website || undefined,
        address:
          v.street || v.city || v.state || v.zip || v.country
            ? {
                street: v.street || undefined,
                city: v.city || undefined,
                state: v.state || undefined,
                zip: v.zip || undefined,
                country: v.country || undefined,
              }
            : undefined,
        social:
          v.facebook || v.instagram || v.twitter || v.tiktok || v.linkedin || v.threads
            ? {
                facebook: v.facebook || undefined,
                instagram: v.instagram || undefined,
                twitter: v.twitter || undefined,
                tiktok: v.tiktok || undefined,
                linkedin: v.linkedin || undefined,
                threads: v.threads || undefined,
              }
            : undefined,
      };
      return buildVCardPayload(data);
    }
    case 'whatsapp': {
      const v = values as QRFormValuesMap['whatsapp'];
      return buildWhatsAppPayload(v.phone, v.message || undefined);
    }
    case 'event': {
      const v = values as QRFormValuesMap['event'];
      const data: EventData = {
        title: v.title,
        startDate: new Date(v.startDate),
        endDate: new Date(v.endDate),
        location: v.location || undefined,
        description: v.description || undefined,
      };
      return buildEventPayload(data);
    }
    case 'location': {
      const v = values as QRFormValuesMap['location'];
      if (v.mapsUrl.trim()) {
        return buildUrlPayload(v.mapsUrl.trim());
      }
      return buildLocationPayload(
        Number.parseFloat(v.latitude) || 0,
        Number.parseFloat(v.longitude) || 0,
        v.label || undefined,
      );
    }
    case 'social': {
      const v = values as QRFormValuesMap['social'];
      const primaryUrl = v.links[0]?.url.trim() || v.url;
      return buildSocialPayload(primaryUrl);
    }
    default: {
      const _exhaustive: never = type;
      throw new Error(`Unknown QR type: ${_exhaustive}`);
    }
  }
}
