import { describe, it, expect } from 'vitest';

import { getFormValidationError } from '@/lib/qr/form-validation';

describe('getFormValidationError', () => {
  it('requires a URL for the url type', () => {
    expect(getFormValidationError('url', { url: '' })).toBe('Enter a URL.');
    expect(getFormValidationError('url', { url: 'example.com' })).toBeNull();
  });

  it('requires text for the text type', () => {
    expect(getFormValidationError('text', { text: '' })).toBe('Enter some text.');
    expect(getFormValidationError('text', { text: 'hello' })).toBeNull();
  });

  it('requires a phone number for the phone type', () => {
    expect(getFormValidationError('phone', { phone: '' })).toBe('Enter a phone number.');
    expect(getFormValidationError('phone', { phone: '123' })).toBeNull();
  });

  it('requires a phone number for the sms type', () => {
    expect(getFormValidationError('sms', { phone: '', message: '' })).toBe('Enter a phone number.');
    expect(getFormValidationError('sms', { phone: '123', message: '' })).toBeNull();
  });

  it('requires a valid email address for the email type', () => {
    expect(getFormValidationError('email', { address: '', subject: '', body: '' })).toBe(
      'Enter an email address.',
    );
    expect(getFormValidationError('email', { address: 'not-an-email', subject: '', body: '' })).toBe(
      'Enter a valid email address.',
    );
    expect(
      getFormValidationError('email', { address: 'a@b.com', subject: '', body: '' }),
    ).toBeNull();
  });

  it('requires an SSID for the wifi type', () => {
    expect(getFormValidationError('wifi', { ssid: '', password: '', security: 'WPA', hidden: false })).toBe(
      'Enter the network name (SSID).',
    );
    expect(
      getFormValidationError('wifi', { ssid: 'Office', password: '', security: 'WPA', hidden: false }),
    ).toBeNull();
  });

  const baseVCard = {
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
  };

  it('requires a first or last name for the vcard type', () => {
    expect(getFormValidationError('vcard', baseVCard)).toBe('Enter at least a first or last name.');
    expect(getFormValidationError('vcard', { ...baseVCard, firstName: 'Juan' })).toBeNull();
    expect(getFormValidationError('vcard', { ...baseVCard, lastName: 'Cruz' })).toBeNull();
  });

  it('requires a phone number for the whatsapp type', () => {
    expect(getFormValidationError('whatsapp', { phone: '', message: '' })).toBe('Enter a phone number.');
    expect(getFormValidationError('whatsapp', { phone: '123', message: '' })).toBeNull();
  });

  const baseEvent = { title: '', startDate: '', endDate: '', location: '', description: '' };

  it('requires a title, start date, and end date for the event type', () => {
    expect(getFormValidationError('event', baseEvent)).toBe('Enter an event title.');
    expect(getFormValidationError('event', { ...baseEvent, title: 'Party' })).toBe('Enter a start date.');
    expect(
      getFormValidationError('event', { ...baseEvent, title: 'Party', startDate: '2026-01-01T10:00' }),
    ).toBe('Enter an end date.');
  });

  it('rejects an end date before the start date for the event type', () => {
    expect(
      getFormValidationError('event', {
        ...baseEvent,
        title: 'Party',
        startDate: '2026-01-02T10:00',
        endDate: '2026-01-01T10:00',
      }),
    ).toBe('End date must be after the start date.');
  });

  it('accepts a valid event', () => {
    expect(
      getFormValidationError('event', {
        ...baseEvent,
        title: 'Party',
        startDate: '2026-01-01T10:00',
        endDate: '2026-01-01T12:00',
      }),
    ).toBeNull();
  });

  it('requires coordinates or a maps URL for the location type', () => {
    expect(getFormValidationError('location', { latitude: '', longitude: '', label: '', mapsUrl: '' })).toBe(
      'Enter coordinates, or paste a Google Maps URL.',
    );
    expect(
      getFormValidationError('location', { latitude: '14.6', longitude: '120.9', label: '', mapsUrl: '' }),
    ).toBeNull();
    expect(
      getFormValidationError('location', {
        latitude: '',
        longitude: '',
        label: '',
        mapsUrl: 'https://maps.app.goo.gl/abc',
      }),
    ).toBeNull();
  });

  it('requires at least one profile link for the social type', () => {
    expect(getFormValidationError('social', { url: '', links: [] })).toBe('Enter at least one profile URL.');
    expect(getFormValidationError('social', { url: 'instagram.com/x', links: [] })).toBeNull();
    expect(
      getFormValidationError('social', { url: '', links: [{ platform: 'instagram', url: 'x' }] }),
    ).toBeNull();
  });

  it('throws for an unknown type', () => {
    // @ts-expect-error intentionally invalid type for the exhaustiveness check
    expect(() => getFormValidationError('bogus', {})).toThrow('Unknown QR type: bogus');
  });
});
