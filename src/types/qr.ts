import type { SocialPlatform } from '@/lib/qr/social-badges';

export const QR_TYPES = [
  'url',
  'text',
  'phone',
  'sms',
  'email',
  'wifi',
  'vcard',
  'whatsapp',
  'event',
  'location',
  'social',
] as const;

export type QRType = (typeof QR_TYPES)[number];

export function getQRTypeLabel(type: QRType): string {
  switch (type) {
    case 'url':
      return 'Website URL';
    case 'text':
      return 'Plain Text';
    case 'phone':
      return 'Phone Call';
    case 'sms':
      return 'SMS';
    case 'email':
      return 'Email';
    case 'wifi':
      return 'WiFi';
    case 'vcard':
      return 'Contact (vCard)';
    case 'whatsapp':
      return 'WhatsApp';
    case 'event':
      return 'Calendar Event';
    case 'location':
      return 'Location';
    case 'social':
      return 'Social Media';
    default: {
      const _exhaustive: never = type;
      throw new Error(`Unknown QR type: ${_exhaustive}`);
    }
  }
}

export function getQRTypeDescription(type: QRType): string {
  switch (type) {
    case 'url':
      return 'Link to any website';
    case 'text':
      return 'Display plain text';
    case 'phone':
      return 'Start a phone call';
    case 'sms':
      return 'Prefill a text message';
    case 'email':
      return 'Prefill an email draft';
    case 'wifi':
      return 'Join a WiFi network';
    case 'vcard':
      return 'Save a contact card';
    case 'whatsapp':
      return 'Start a WhatsApp chat';
    case 'event':
      return 'Add a calendar event';
    case 'location':
      return 'Drop a map pin';
    case 'social':
      return 'Link to a social profile';
    default: {
      const _exhaustive: never = type;
      throw new Error(`Unknown QR type: ${_exhaustive}`);
    }
  }
}

export type WifiSecurity = 'WPA' | 'WEP' | 'nopass';

export interface VCardAddress {
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
}

export interface VCardSocialLinks {
  facebook?: string;
  instagram?: string;
  twitter?: string;
  tiktok?: string;
  linkedin?: string;
  threads?: string;
}

export interface VCardData {
  firstName: string;
  lastName: string;
  organization?: string;
  title?: string;
  phone?: string;
  mobile?: string;
  email?: string;
  website?: string;
  address?: VCardAddress;
  social?: VCardSocialLinks;
}

export interface EventData {
  title: string;
  startDate: Date;
  endDate: Date;
  location?: string;
  description?: string;
}

export interface UrlFormValues {
  url: string;
}

export interface TextFormValues {
  text: string;
}

export interface PhoneFormValues {
  phone: string;
}

export interface SmsFormValues {
  phone: string;
  message: string;
}

export interface EmailFormValues {
  address: string;
  subject: string;
  body: string;
}

export interface WifiFormValues {
  ssid: string;
  password: string;
  security: WifiSecurity | '';
  hidden: boolean;
}

export interface VCardFormValues {
  firstName: string;
  lastName: string;
  organization: string;
  title: string;
  phone: string;
  mobile: string;
  email: string;
  website: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  facebook: string;
  instagram: string;
  twitter: string;
  tiktok: string;
  linkedin: string;
  threads: string;
}

export interface WhatsAppFormValues {
  phone: string;
  message: string;
}

export interface EventFormValues {
  title: string;
  startDate: string;
  endDate: string;
  location: string;
  description: string;
}

export interface LocationFormValues {
  latitude: string;
  longitude: string;
  label: string;
  /** A pasted Google Maps share link — used as the payload directly when present, instead of the geo: coordinates. */
  mapsUrl: string;
}

export interface SocialLinkFormValue {
  platform: SocialPlatform;
  url: string;
}

export interface SocialFormValues {
  /** Kept for backward compatibility with QR codes saved before multi-link support; ignored once `links` is non-empty. */
  url: string;
  links: SocialLinkFormValue[];
}

export interface QRFormValuesMap {
  url: UrlFormValues;
  text: TextFormValues;
  phone: PhoneFormValues;
  sms: SmsFormValues;
  email: EmailFormValues;
  wifi: WifiFormValues;
  vcard: VCardFormValues;
  whatsapp: WhatsAppFormValues;
  event: EventFormValues;
  location: LocationFormValues;
  social: SocialFormValues;
}

export const QR_FORM_DEFAULTS: QRFormValuesMap = {
  url: { url: '' },
  text: { text: '' },
  phone: { phone: '' },
  sms: { phone: '', message: '' },
  email: { address: '', subject: '', body: '' },
  wifi: { ssid: '', password: '', security: 'WPA', hidden: false },
  vcard: {
    firstName: '',
    lastName: '',
    organization: '',
    title: '',
    phone: '',
    mobile: '',
    email: '',
    website: '',
    street: '',
    city: '',
    state: '',
    zip: '',
    country: '',
    facebook: '',
    instagram: '',
    twitter: '',
    tiktok: '',
    linkedin: '',
    threads: '',
  },
  whatsapp: { phone: '', message: '' },
  event: { title: '', startDate: '', endDate: '', location: '', description: '' },
  location: { latitude: '', longitude: '', label: '', mapsUrl: '' },
  social: { url: '', links: [] },
};
