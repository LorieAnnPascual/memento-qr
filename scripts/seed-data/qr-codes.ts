import { DEFAULT_QR_STYLE, type QRStyleConfig } from '../../src/lib/qr/generator';
import {
  buildPhonePayload,
  buildTextPayload,
  buildUrlPayload,
  buildVCardPayload,
  buildWifiPayload,
} from '../../src/lib/qr/payloads';
import { buildRedirectUrl } from '../../src/lib/qr/short-code';
import { QR_FORM_DEFAULTS } from '../../src/types/qr';
import { LIMITED_SCAN_LIMIT, QA_CODES, QA_PREFIX } from './constants';

export interface SeedQR {
  name: string;
  qrType: string;
  payload: string;
  payloadFields: Record<string, unknown>;
  styleConfig: QRStyleConfig;
  isDynamic: boolean;
  shortCode: string | null;
  targetUrl: string | null;
  isPaused: boolean;
  expiresAt: Date | null;
  scanLimit: number | null;
  tags: string[];
  /** Which test user owns it. */
  owner: 'editor' | 'viewer' | 'admin';
}

const STYLES: QRStyleConfig[] = [
  DEFAULT_QR_STYLE,
  { ...DEFAULT_QR_STYLE, dotStyle: 'dots', dotColor: '#1d4ed8', cornerSquareColor: '#1d4ed8', cornerDotColor: '#1d4ed8' },
  { ...DEFAULT_QR_STYLE, dotStyle: 'square', cornerSquareStyle: 'square', cornerDotStyle: 'square', backgroundColor: '#f3f4f6' },
];

function style(index: number): QRStyleConfig {
  return STYLES[index % STYLES.length];
}

function staticQR(
  name: string,
  qrType: string,
  payload: string,
  payloadFields: Record<string, unknown>,
  index: number,
): SeedQR {
  return {
    name: `${QA_PREFIX} ${name}`,
    qrType,
    payload,
    payloadFields,
    styleConfig: style(index),
    isDynamic: false,
    shortCode: null,
    targetUrl: null,
    isPaused: false,
    expiresAt: null,
    scanLimit: null,
    tags: ['qa'],
    owner: 'editor',
  };
}

const HOUR = 60 * 60 * 1000;

function dynamicQR(
  name: string,
  shortCode: string,
  targetUrl: string,
  over: Partial<SeedQR>,
  index: number,
): SeedQR {
  return {
    name: `${QA_PREFIX} ${name}`,
    qrType: 'url',
    payload: buildRedirectUrl(shortCode),
    payloadFields: { url: targetUrl },
    styleConfig: style(index),
    isDynamic: true,
    shortCode,
    targetUrl,
    isPaused: false,
    expiresAt: null,
    scanLimit: null,
    tags: ['qa', 'dynamic'],
    owner: 'editor',
    ...over,
  };
}

/** 10 static codes: 2 each of URL, text, phone, WiFi and vCard. */
export const STATIC_QR_CODES: SeedQR[] = [
  staticQR('URL one', 'url', buildUrlPayload('https://example.com'), { url: 'https://example.com' }, 0),
  staticQR('URL two', 'url', buildUrlPayload('https://example.org/page?foo=bar&baz=qux#section'), { url: 'https://example.org/page?foo=bar&baz=qux#section' }, 1),
  staticQR('Text one', 'text', buildTextPayload('Hello from Memento'), { text: 'Hello from Memento' }, 2),
  staticQR('Text two', 'text', buildTextPayload('<script>alert("xss")</script> stays text'), { text: '<script>alert("xss")</script> stays text' }, 0),
  staticQR('Phone one', 'phone', buildPhonePayload('+639171234567'), { phone: '+639171234567' }, 1),
  staticQR('Phone two', 'phone', buildPhonePayload('+15550102000'), { phone: '+15550102000' }, 2),
  staticQR('WiFi one', 'wifi', buildWifiPayload('Office WiFi', 'correct horse', 'WPA', false), { ...QR_FORM_DEFAULTS.wifi, ssid: 'Office WiFi', password: 'correct horse' }, 0),
  staticQR('WiFi two', 'wifi', buildWifiPayload('Guest;Net', 'pass:word', 'WPA', true), { ...QR_FORM_DEFAULTS.wifi, ssid: 'Guest;Net', password: 'pass:word', hidden: true }, 1),
  staticQR(
    'vCard one',
    'vcard',
    buildVCardPayload({ firstName: 'Juan', lastName: 'Dela Cruz', phone: '+639171234567', email: 'juan@example.com' }),
    { ...QR_FORM_DEFAULTS.vcard, firstName: 'Juan', lastName: 'Dela Cruz', phone: '+639171234567', email: 'juan@example.com' },
    2,
  ),
  staticQR(
    'vCard two',
    'vcard',
    buildVCardPayload({ firstName: 'Maria', lastName: "O'Brien", organization: 'Memento', title: 'Designer' }),
    { ...QR_FORM_DEFAULTS.vcard, firstName: 'Maria', lastName: "O'Brien", organization: 'Memento', title: 'Designer' },
    0,
  ),
];

/** 5 dynamic codes: 2 active, 1 paused, 1 expired, 1 scan-limited (limit 10, 9 scans logged). */
export function buildDynamicQRCodes(now: Date): SeedQR[] {
  return [
    dynamicQR('Dynamic active A', QA_CODES.activeA, 'https://example.com/a', {}, 0),
    dynamicQR('Dynamic active B', QA_CODES.activeB, 'https://example.com/b?x=1&y=2#frag', {}, 1),
    dynamicQR('Dynamic paused', QA_CODES.paused, 'https://example.com/paused', { isPaused: true }, 2),
    dynamicQR('Dynamic expired', QA_CODES.expired, 'https://example.com/expired', { expiresAt: new Date(now.getTime() - 24 * HOUR) }, 0),
    dynamicQR('Dynamic limited', QA_CODES.limited, 'https://example.com/limited', { scanLimit: LIMITED_SCAN_LIMIT }, 1),
  ];
}

/** Owned by another user, for cross-user access (403/404) checks. */
export const VIEWER_PRIVATE_QR: SeedQR = {
  ...staticQR('Viewer private', 'url', buildUrlPayload('https://viewer.example.com'), { url: 'https://viewer.example.com' }, 0),
  owner: 'viewer',
};
