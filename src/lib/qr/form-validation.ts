import type { QRFormValuesMap, QRType } from '@/types/qr';

/** Returns a user-facing error message if the type's required fields are missing or inconsistent, or null when valid. */
export function getFormValidationError<T extends QRType>(type: T, values: QRFormValuesMap[T]): string | null {
  switch (type) {
    case 'url': {
      const v = values as QRFormValuesMap['url'];
      return v.url.trim() ? null : 'Enter a URL.';
    }
    case 'text': {
      const v = values as QRFormValuesMap['text'];
      return v.text.trim() ? null : 'Enter some text.';
    }
    case 'phone': {
      const v = values as QRFormValuesMap['phone'];
      return v.phone.trim() ? null : 'Enter a phone number.';
    }
    case 'sms': {
      const v = values as QRFormValuesMap['sms'];
      return v.phone.trim() ? null : 'Enter a phone number.';
    }
    case 'email': {
      const v = values as QRFormValuesMap['email'];
      if (!v.address.trim()) return 'Enter an email address.';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.address.trim())) return 'Enter a valid email address.';
      return null;
    }
    case 'wifi': {
      const v = values as QRFormValuesMap['wifi'];
      return v.ssid.trim() ? null : 'Enter the network name (SSID).';
    }
    case 'vcard': {
      const v = values as QRFormValuesMap['vcard'];
      return v.firstName.trim() || v.lastName.trim() ? null : 'Enter at least a first or last name.';
    }
    case 'whatsapp': {
      const v = values as QRFormValuesMap['whatsapp'];
      return v.phone.trim() ? null : 'Enter a phone number.';
    }
    case 'event': {
      const v = values as QRFormValuesMap['event'];
      if (!v.title.trim()) return 'Enter an event title.';
      if (!v.startDate) return 'Enter a start date.';
      if (!v.endDate) return 'Enter an end date.';
      if (new Date(v.endDate) < new Date(v.startDate)) return 'End date must be after the start date.';
      return null;
    }
    case 'location': {
      const v = values as QRFormValuesMap['location'];
      if (v.mapsUrl.trim()) return null;
      return v.latitude.trim() && v.longitude.trim()
        ? null
        : 'Enter coordinates, or paste a Google Maps URL.';
    }
    case 'social': {
      const v = values as QRFormValuesMap['social'];
      const hasLink = v.links.some((link) => link.url.trim()) || v.url.trim();
      return hasLink ? null : 'Enter at least one profile URL.';
    }
    default: {
      const _exhaustive: never = type;
      throw new Error(`Unknown QR type: ${_exhaustive}`);
    }
  }
}
