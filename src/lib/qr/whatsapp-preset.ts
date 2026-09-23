import type { QRStyleConfig } from './generator';

// A small original chat-bubble glyph on a WhatsApp-green circle, inlined as a
// data URI so applying the preset doesn't require an upload/storage round
// trip. Not the official WhatsApp mark — a simplified, original icon in the
// same spirit as the platform's own branding (green circle + white bubble).
const WHATSAPP_LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
  <circle cx="24" cy="24" r="24" fill="#25D366" />
  <path fill="#FFFFFF" d="M24 12a12 12 0 0 0-10.4 18l-1.3 5.3L18 34a12 12 0 1 0 6-22zm6.8 17c-.3.8-1.6 1.5-2.5 1.7-.6.1-1.5.2-4.3-.9a15 15 0 0 1-6.2-5.5c-.5-.6-1.7-2.3-1.7-4.4 0-2.2 1.1-3.2 1.5-3.6.4-.4.8-.5 1.1-.5h.8c.3 0 .6 0 .9.7l1.2 2.9c.1.3.2.5 0 .8l-.5.8c-.2.3-.4.5-.1.9.3.4 1.2 1.9 2.6 3.1 1.7 1.5 3.1 2 3.6 2.2.4.2.6.1.8-.1l1.2-1.4c.3-.3.5-.3.9-.2l2.7 1.3c.3.1.5.2.6.4.1.3.1 1-.2 1.8z" />
</svg>`;

export const WHATSAPP_LOGO_DATA_URI = `data:image/svg+xml,${encodeURIComponent(WHATSAPP_LOGO_SVG)}`;

export const WHATSAPP_DEFAULT_STYLE: Partial<QRStyleConfig> = {
  dotStyle: 'rounded',
  dotColor: '#25D366',
  cornerSquareStyle: 'extra-rounded',
  cornerSquareColor: '#128C7E',
  cornerDotStyle: 'dot',
  cornerDotColor: '#128C7E',
  backgroundColor: '#FFFFFF',
  logoUrl: WHATSAPP_LOGO_DATA_URI,
  logoSize: 0.3,
  logoMargin: 6,
  errorCorrectionLevel: 'H',
};
