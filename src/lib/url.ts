export function normalizeUrl(url: string): string {
  if (!url) return '';
  return url
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/+$/, '');
}

export function isInternalGoogleDomain(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    return (
      host === 'google.com' ||
      host.endsWith('.google.com') ||
      host.includes('.google.') ||
      host.endsWith('gstatic.com') ||
      host.endsWith('ggpht.com') ||
      host.endsWith('googleusercontent.com') ||
      host.endsWith('goo.gl')
    );
  } catch {
    return (
      url.includes('google.com') ||
      url.includes('gstatic.com') ||
      url.includes('ggpht.com')
    );
  }
}

