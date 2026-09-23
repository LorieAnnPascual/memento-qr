/**
 * Where to send someone after they sign in. Only same-site paths are allowed:
 * a `redirectTo` pointing at another site (`https://evil.example`,
 * `//evil.example`, `/\evil.example`, `javascript:...`) would turn the login
 * page into a phishing helper.
 */
export function safeRedirectPath(value: string | null | undefined, fallback = '/'): string {
  if (!value) return fallback;
  if (!value.startsWith('/')) return fallback;
  // "//host" and "/\host" are treated as protocol-relative by browsers.
  if (value.startsWith('//') || value.startsWith('/\\')) return fallback;
  // Control characters can smuggle a different target past the checks above.
  if (/[\u0000-\u001f\u007f]/.test(value)) return fallback;
  return value;
}
