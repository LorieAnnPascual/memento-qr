import { customAlphabet } from 'nanoid';

// Excludes ambiguous characters: 0, O, 1, l, I
const SAFE_ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz';

export const generateShortCode = customAlphabet(SAFE_ALPHABET, 6);

/** The URL a dynamic QR code actually encodes — resolves through /q/[shortCode] to the current target. */
export function buildRedirectUrl(shortCode: string): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  return `${appUrl.replace(/\/$/, '')}/q/${shortCode}`;
}
