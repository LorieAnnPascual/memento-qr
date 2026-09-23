import { describe, it, expect } from 'vitest';

import {
  buildUrlPayload,
  buildTextPayload,
  buildPhonePayload,
  buildSmsPayload,
  buildEmailPayload,
  buildWifiPayload,
  buildVCardPayload,
  buildWhatsAppPayload,
  buildEventPayload,
  buildLocationPayload,
  buildSocialPayload,
  buildPayloadForType,
} from '@/lib/qr/payloads';

describe('QR Payload Builders', () => {
  describe('buildUrlPayload', () => {
    it('returns the URL as-is when it already has a protocol', () => {
      expect(buildUrlPayload('https://example.com')).toBe('https://example.com');
    });

    it('preserves http:// URLs', () => {
      expect(buildUrlPayload('http://example.com')).toBe('http://example.com');
    });

    it('adds https:// if no protocol is provided', () => {
      expect(buildUrlPayload('example.com')).toBe('https://example.com');
    });

    it('treats an empty or blank URL as no content (never just "https://")', () => {
      expect(buildUrlPayload('')).toBe('');
      expect(buildUrlPayload('   ')).toBe('');
    });

    it('trims stray spaces around a pasted URL', () => {
      expect(buildUrlPayload('  example.com  ')).toBe('https://example.com');
      expect(buildUrlPayload('  https://example.com/x ')).toBe('https://example.com/x');
    });
  });

  describe('buildTextPayload', () => {
    it('returns the text unchanged', () => {
      expect(buildTextPayload('Hello, world!')).toBe('Hello, world!');
    });

    it('handles an empty string', () => {
      expect(buildTextPayload('')).toBe('');
    });
  });

  describe('buildPhonePayload', () => {
    it('generates a tel: URI', () => {
      expect(buildPhonePayload('+639171234567')).toBe('tel:+639171234567');
    });
  });

  describe('buildSmsPayload', () => {
    it('generates an sms: URI without a message', () => {
      expect(buildSmsPayload('+639171234567')).toBe('sms:+639171234567');
    });

    it('appends an encoded body when a message is provided', () => {
      expect(buildSmsPayload('+639171234567', 'Hello there')).toBe(
        'sms:+639171234567?body=Hello%20there',
      );
    });
  });

  describe('buildEmailPayload', () => {
    it('generates a mailto: URI with no subject or body', () => {
      expect(buildEmailPayload('juan@example.com')).toBe('mailto:juan@example.com');
    });

    it('includes an encoded subject', () => {
      expect(buildEmailPayload('juan@example.com', 'Hello')).toBe(
        'mailto:juan@example.com?subject=Hello',
      );
    });

    it('includes both subject and body', () => {
      expect(buildEmailPayload('juan@example.com', 'Hi', 'How are you?')).toBe(
        'mailto:juan@example.com?subject=Hi&body=How+are+you%3F',
      );
    });
  });

  describe('buildWifiPayload', () => {
    it('generates a valid WIFI QR string', () => {
      const result = buildWifiPayload('MyNetwork', 'secret123', 'WPA', false);
      expect(result).toBe('WIFI:T:WPA;S:MyNetwork;P:secret123;H:false;;');
    });

    it('escapes special characters in SSID and password', () => {
      const result = buildWifiPayload('Net;work', 'pass:word', 'WPA', false);
      expect(result).toContain('S:Net\\;work');
      expect(result).toContain('P:pass\\:word');
    });

    it('handles the hidden network flag', () => {
      const result = buildWifiPayload('Hidden', 'pass', 'WPA', true);
      expect(result).toContain('H:true');
    });

    it('handles open networks with no password', () => {
      const result = buildWifiPayload('OpenNet', 'nopass', '', false);
      expect(result).toBe('WIFI:T:nopass;S:OpenNet;P:;H:false;;');
    });

    it('defaults to WPA security and visible network', () => {
      const result = buildWifiPayload('DefaultNet', 'pw123456');
      expect(result).toBe('WIFI:T:WPA;S:DefaultNet;P:pw123456;H:false;;');
    });
  });

  describe('buildVCardPayload', () => {
    it('generates a valid vCard 3.0 string with all fields', () => {
      const result = buildVCardPayload({
        firstName: 'Juan',
        lastName: 'Dela Cruz',
        organization: 'Memento',
        title: 'Engineer',
        phone: '+639171234567',
        mobile: '+639179876543',
        email: 'juan@example.com',
        website: 'https://example.com',
        address: {
          street: '123 Main St',
          city: 'Manila',
          state: 'NCR',
          zip: '1000',
          country: 'PH',
        },
      });

      expect(result).toContain('BEGIN:VCARD');
      expect(result).toContain('VERSION:3.0');
      expect(result).toContain('N:Dela Cruz;Juan;;;');
      expect(result).toContain('FN:Juan Dela Cruz');
      expect(result).toContain('ORG:Memento');
      expect(result).toContain('TITLE:Engineer');
      expect(result).toContain('TEL;TYPE=WORK,VOICE:+639171234567');
      expect(result).toContain('TEL;TYPE=CELL:+639179876543');
      expect(result).toContain('EMAIL:juan@example.com');
      expect(result).toContain('URL:https://example.com');
      expect(result).toContain('ADR:;;123 Main St;Manila;NCR;1000;PH');
      expect(result).toContain('END:VCARD');
    });

    it('omits optional fields when not provided', () => {
      const result = buildVCardPayload({ firstName: 'Juan', lastName: 'Dela Cruz' });
      expect(result).not.toContain('TEL');
      expect(result).not.toContain('EMAIL');
      expect(result).not.toContain('ORG');
      expect(result).not.toContain('TITLE');
      expect(result).not.toContain('URL:');
      expect(result).not.toContain('ADR:');
    });

    it('fills missing address sub-fields with empty strings', () => {
      const result = buildVCardPayload({
        firstName: 'Juan',
        lastName: 'Dela Cruz',
        address: { city: 'Manila' },
      });
      expect(result).toContain('ADR:;;;Manila;;;');
    });

    it('fills a missing city with an empty string', () => {
      const result = buildVCardPayload({
        firstName: 'Juan',
        lastName: 'Dela Cruz',
        address: { street: '123 Main St' },
      });
      expect(result).toContain('ADR:;;123 Main St;;;;');
    });

    it('includes social profile URLs when provided', () => {
      const result = buildVCardPayload({
        firstName: 'Juan',
        lastName: 'Dela Cruz',
        social: {
          facebook: 'https://facebook.com/juan',
          instagram: 'https://instagram.com/juan',
          twitter: 'https://x.com/juan',
          tiktok: 'https://tiktok.com/@juan',
          linkedin: 'https://linkedin.com/in/juan',
          threads: 'https://threads.net/@juan',
        },
      });
      expect(result).toContain('URL;TYPE=facebook:https://facebook.com/juan');
      expect(result).toContain('URL;TYPE=instagram:https://instagram.com/juan');
      expect(result).toContain('URL;TYPE=twitter:https://x.com/juan');
      expect(result).toContain('URL;TYPE=tiktok:https://tiktok.com/@juan');
      expect(result).toContain('URL;TYPE=linkedin:https://linkedin.com/in/juan');
      expect(result).toContain('URL;TYPE=threads:https://threads.net/@juan');
    });

    it('omits social profile lines when social is not provided', () => {
      const result = buildVCardPayload({ firstName: 'Juan', lastName: 'Dela Cruz' });
      expect(result).not.toContain('TYPE=facebook');
    });
  });

  describe('buildWhatsAppPayload', () => {
    it('generates a wa.me link without a message', () => {
      expect(buildWhatsAppPayload('+639171234567')).toBe('https://wa.me/639171234567');
    });

    it('strips the leading + from the phone number', () => {
      expect(buildWhatsAppPayload('639171234567')).toBe('https://wa.me/639171234567');
    });

    it('appends an encoded prefilled message', () => {
      expect(buildWhatsAppPayload('+639171234567', 'Hi there')).toBe(
        'https://wa.me/639171234567?text=Hi%20there',
      );
    });
  });

  describe('buildEventPayload', () => {
    it('generates a valid VCALENDAR string', () => {
      const result = buildEventPayload({
        title: 'Team Meeting',
        startDate: new Date('2026-01-15T09:00:00.000Z'),
        endDate: new Date('2026-01-15T10:00:00.000Z'),
      });

      expect(result).toContain('BEGIN:VCALENDAR');
      expect(result).toContain('VERSION:2.0');
      expect(result).toContain('BEGIN:VEVENT');
      expect(result).toContain('SUMMARY:Team Meeting');
      expect(result).toContain('DTSTART:20260115T090000Z');
      expect(result).toContain('DTEND:20260115T100000Z');
      expect(result).toContain('END:VEVENT');
      expect(result).toContain('END:VCALENDAR');
    });

    it('includes optional location and description when provided', () => {
      const result = buildEventPayload({
        title: 'Launch Party',
        startDate: new Date('2026-02-01T00:00:00.000Z'),
        endDate: new Date('2026-02-01T02:00:00.000Z'),
        location: 'Main Office',
        description: 'Bring snacks',
      });

      expect(result).toContain('LOCATION:Main Office');
      expect(result).toContain('DESCRIPTION:Bring snacks');
    });

    it('omits location and description when not provided', () => {
      const result = buildEventPayload({
        title: 'Quick Sync',
        startDate: new Date('2026-03-01T00:00:00.000Z'),
        endDate: new Date('2026-03-01T00:30:00.000Z'),
      });

      expect(result).not.toContain('LOCATION');
      expect(result).not.toContain('DESCRIPTION');
    });
  });

  describe('buildLocationPayload', () => {
    it('generates a geo: URI without a label', () => {
      expect(buildLocationPayload(14.5995, 120.9842)).toBe('geo:14.5995,120.9842');
    });

    it('appends an encoded label as a query', () => {
      expect(buildLocationPayload(14.5995, 120.9842, 'Manila City Hall')).toBe(
        'geo:14.5995,120.9842?q=Manila%20City%20Hall',
      );
    });
  });

  describe('buildSocialPayload', () => {
    it('delegates to buildUrlPayload', () => {
      expect(buildSocialPayload('instagram.com/memento')).toBe('https://instagram.com/memento');
    });

    it('preserves an already-qualified URL', () => {
      expect(buildSocialPayload('https://instagram.com/memento')).toBe(
        'https://instagram.com/memento',
      );
    });
  });

  describe('buildPayloadForType', () => {
    it('dispatches url', () => {
      expect(buildPayloadForType('url', { url: 'example.com' })).toBe('https://example.com');
    });

    it('dispatches text', () => {
      expect(buildPayloadForType('text', { text: 'hello' })).toBe('hello');
    });

    it('dispatches phone', () => {
      expect(buildPayloadForType('phone', { phone: '+639171234567' })).toBe('tel:+639171234567');
    });

    it('dispatches sms with and without a message', () => {
      expect(buildPayloadForType('sms', { phone: '+639171234567', message: '' })).toBe(
        'sms:+639171234567',
      );
      expect(buildPayloadForType('sms', { phone: '+639171234567', message: 'Hi' })).toBe(
        'sms:+639171234567?body=Hi',
      );
    });

    it('dispatches email with and without subject/body', () => {
      expect(
        buildPayloadForType('email', { address: 'a@b.com', subject: '', body: '' }),
      ).toBe('mailto:a@b.com');
      expect(
        buildPayloadForType('email', { address: 'a@b.com', subject: 'Hi', body: 'There' }),
      ).toBe('mailto:a@b.com?subject=Hi&body=There');
    });

    it('dispatches wifi', () => {
      expect(
        buildPayloadForType('wifi', { ssid: 'Net', password: 'pw', security: 'WPA', hidden: false }),
      ).toBe('WIFI:T:WPA;S:Net;P:pw;H:false;;');
    });

    it('dispatches vcard with and without an address', () => {
      const withoutAddress = buildPayloadForType('vcard', {
        firstName: 'Juan',
        lastName: 'Dela Cruz',
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
      });
      expect(withoutAddress).not.toContain('ADR:');

      const withAddress = buildPayloadForType('vcard', {
        firstName: 'Juan',
        lastName: 'Dela Cruz',
        organization: 'Memento',
        title: 'Engineer',
        phone: '123',
        mobile: '456',
        email: 'juan@example.com',
        website: 'https://example.com',
        street: '123 Main St',
        city: '',
        state: '',
        zip: '',
        country: '',
        facebook: 'https://facebook.com/juan',
        instagram: '',
        twitter: '',
        tiktok: '',
        linkedin: '',
        threads: '',
      });
      expect(withAddress).toContain('ADR:;;123 Main St;;;;');
      expect(withAddress).toContain('ORG:Memento');
      expect(withAddress).toContain('URL;TYPE=facebook:https://facebook.com/juan');

      const cityOnlyAddress = buildPayloadForType('vcard', {
        firstName: 'Juan',
        lastName: 'Dela Cruz',
        organization: '',
        title: '',
        phone: '',
        mobile: '',
        email: '',
        website: '',
        street: '',
        city: 'Manila',
        state: '',
        zip: '',
        country: '',
        facebook: '',
        instagram: '',
        twitter: '',
        tiktok: '',
        linkedin: '',
        threads: '',
      });
      expect(cityOnlyAddress).toContain('ADR:;;;Manila;;;');
    });

    it('dispatches whatsapp', () => {
      expect(buildPayloadForType('whatsapp', { phone: '+639171234567', message: '' })).toBe(
        'https://wa.me/639171234567',
      );
    });

    it('dispatches event with and without optional fields', () => {
      const minimal = buildPayloadForType('event', {
        title: 'Sync',
        startDate: '2026-01-01T00:00',
        endDate: '2026-01-01T01:00',
        location: '',
        description: '',
      });
      expect(minimal).toContain('SUMMARY:Sync');
      expect(minimal).not.toContain('LOCATION');

      const full = buildPayloadForType('event', {
        title: 'Launch',
        startDate: '2026-01-01T00:00',
        endDate: '2026-01-01T01:00',
        location: 'HQ',
        description: 'Bring snacks',
      });
      expect(full).toContain('LOCATION:HQ');
      expect(full).toContain('DESCRIPTION:Bring snacks');
    });

    it('dispatches location with and without a label', () => {
      expect(
        buildPayloadForType('location', {
          latitude: '14.5995',
          longitude: '120.9842',
          label: '',
          mapsUrl: '',
        }),
      ).toBe('geo:14.5995,120.9842');
      expect(
        buildPayloadForType('location', {
          latitude: '14.5995',
          longitude: '120.9842',
          label: 'City',
          mapsUrl: '',
        }),
      ).toBe('geo:14.5995,120.9842?q=City');
    });

    it('defaults invalid coordinates to 0', () => {
      expect(
        buildPayloadForType('location', { latitude: '', longitude: '', label: '', mapsUrl: '' }),
      ).toBe('geo:0,0');
    });

    it('uses the Google Maps URL directly when provided, ignoring coordinates', () => {
      expect(
        buildPayloadForType('location', {
          latitude: '14.5995',
          longitude: '120.9842',
          label: 'City',
          mapsUrl: 'https://maps.app.goo.gl/abc123',
        }),
      ).toBe('https://maps.app.goo.gl/abc123');
    });

    it('dispatches social using the legacy single url when no links are set', () => {
      expect(buildPayloadForType('social', { url: 'instagram.com/memento', links: [] })).toBe(
        'https://instagram.com/memento',
      );
    });

    it('dispatches social using the first link when links are provided', () => {
      expect(
        buildPayloadForType('social', {
          url: '',
          links: [
            { platform: 'instagram', url: 'instagram.com/memento' },
            { platform: 'facebook', url: 'facebook.com/memento' },
          ],
        }),
      ).toBe('https://instagram.com/memento');
    });

    it('throws for an unknown type', () => {
      expect(() =>
        buildPayloadForType('bogus' as unknown as 'url', { url: '' }),
      ).toThrow('Unknown QR type: bogus');
    });
  });
});
