export type PrintedCheckKind =
  /** The print encodes this code's own link (or content). */
  | 'match'
  /** The print is a Memento link, but a different one than this code's current link. */
  | 'different-link'
  /** The print has this code's link name on another website address. */
  | 'other-website'
  /** The print holds something else directly (for example a Canva address), not a Memento link. */
  | 'not-a-memento-link'
  /** No QR code could be read in the picture. */
  | 'unreadable';

export interface PrintedCheck {
  kind: PrintedCheckKind;
  headline: string;
  detail: string;
  /** True only when the print is this dynamic code's own link, so its type can change without the picture changing. */
  safeToChangeType: boolean;
}

interface CompareInput {
  /** What the picture was decoded to (null when no code was found). */
  decoded: string | null;
  /** What this code's picture encodes right now (its short link for a dynamic code). */
  expectedPayload: string;
  isDynamic: boolean;
}

interface QrLink {
  origin: string;
  code: string;
}

/** `https://host/q/<code>` split into its address and link name, or null for anything else. */
function parseQrLink(text: string): QrLink | null {
  try {
    const url = new URL(text.trim());
    const match = /^\/q\/([^/]+)\/?$/.exec(url.pathname);
    return match ? { origin: url.origin, code: decodeURIComponent(match[1]) } : null;
  } catch {
    return null;
  }
}

/** Says whether a scanned printed copy is this code, and whether it is safe to change the code's type. */
export function comparePrinted({ decoded, expectedPayload, isDynamic }: CompareInput): PrintedCheck {
  if (decoded === null) {
    return {
      kind: 'unreadable',
      headline: 'No QR code could be read in that picture.',
      detail: 'Try a sharper, larger picture of just the code, with white space around it. Nothing was changed.',
      safeToChangeType: false,
    };
  }

  const printed = parseQrLink(decoded);
  const current = parseQrLink(expectedPayload);
  const sameText = decoded.trim() === expectedPayload.trim();

  if (printed && current && printed.code.toLowerCase() === current.code.toLowerCase() && printed.origin !== current.origin) {
    return {
      kind: 'other-website',
      headline: 'The link name matches, but the website address is different.',
      detail: `The print points to ${printed.origin}, while this app is at ${current.origin}. Scanning the print would not reach this code, so do not rely on it.`,
      safeToChangeType: false,
    };
  }

  if (sameText || (printed && current && printed.code.toLowerCase() === current.code.toLowerCase())) {
    if (isDynamic && current) {
      return {
        kind: 'match',
        headline: 'This printed copy is this code. It is safe to change the type.',
        detail: `The print holds the link ${expectedPayload}. Changing the type only changes what people see after scanning; the picture and the link stay the same.`,
        safeToChangeType: true,
      };
    }
    return {
      kind: 'match',
      headline: 'This printed copy matches, but this code is static.',
      detail:
        'A static code holds its content inside the picture, so changing its content or type would make a different picture. The printed copy would stop matching.',
      safeToChangeType: false,
    };
  }

  if (printed) {
    return {
      kind: 'different-link',
      headline: 'The print is a Memento link, but not this code\'s current link.',
      detail: `The print holds ${decoded}; this code's link is ${expectedPayload}. It may belong to another code, or be an old link name of this one (old names still work, but check before changing anything).`,
      safeToChangeType: false,
    };
  }

  return {
    kind: 'not-a-memento-link',
    headline: 'The print does not hold a Memento link.',
    detail: `It holds ${decoded} directly, so it is a static code. Memento cannot change where it leads, and changing a type here would not affect it.`,
    safeToChangeType: false,
  };
}
