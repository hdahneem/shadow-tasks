/**
 * Turns a raw User-Agent header into a short human label like "Chrome on macOS" for
 * the sessions list. Deliberately just enough regex matching to be readable — not a
 * full UA parser, so unrecognized combinations fall back to "Unknown device" rather
 * than guessing wrong.
 */
export function parseUserAgent(ua: string | undefined | null): string {
  if (!ua) return 'Unknown device';

  let browser = 'Unknown browser';
  if (/edg\//i.test(ua)) browser = 'Edge';
  else if (/opr\/|opera/i.test(ua)) browser = 'Opera';
  else if (/chrome|crios/i.test(ua)) browser = 'Chrome';
  else if (/firefox|fxios/i.test(ua)) browser = 'Firefox';
  else if (/safari/i.test(ua)) browser = 'Safari';

  let os = 'an unknown device';
  if (/iphone|ipad|ipod/i.test(ua)) os = 'iOS';
  else if (/android/i.test(ua)) os = 'Android';
  else if (/mac os x|macintosh/i.test(ua)) os = 'macOS';
  else if (/windows/i.test(ua)) os = 'Windows';
  else if (/linux/i.test(ua)) os = 'Linux';

  if (browser === 'Unknown browser' && os === 'an unknown device') return 'Unknown device';
  return `${browser} on ${os}`;
}
