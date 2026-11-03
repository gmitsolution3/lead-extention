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
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      if (url.startsWith('//')) {
        parsed = new URL('https:' + url);
      } else {
        return (
          url.includes('google.com') ||
          url.includes('gstatic.com') ||
          url.includes('ggpht.com')
        );
      }
    }
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

export function unwrapGoogleRedirect(url: string): string {
  if (!url) return '';
  try {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      if (url.startsWith('//')) {
        parsed = new URL('https:' + url);
      } else {
        return url;
      }
    }
    const host = parsed.hostname.toLowerCase();
    if (host.includes('google.') && (parsed.pathname === '/url' || parsed.pathname.endsWith('/url'))) {
      const q = parsed.searchParams.get('q') || parsed.searchParams.get('url');
      if (q) return q;
    }
  } catch {
    // ignore parsing errors
  }
  return url;
}

export function isSocialSharingOrExcluded(url: string): boolean {
  if (!url) return true;
  try {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      if (url.startsWith('//')) {
        parsed = new URL('https:' + url);
      } else {
        return true;
      }
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return true;
    if (isInternalGoogleDomain(url)) return true;

    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname.toLowerCase();

    // Social sharing dialogs / intents (NOT business pages/profiles)
    if (
      (host.includes('facebook.com') && (path.includes('/sharer') || path.includes('/dialog'))) ||
      ((host.includes('twitter.com') || host === 'x.com' || host.endsWith('.x.com')) && path.includes('/intent')) ||
      (host.includes('linkedin.com') && (path.includes('/share') || path.includes('/sharing'))) ||
      (host.includes('pinterest.com') && path.includes('/pin/create')) ||
      (host.includes('whatsapp.com') && path.includes('/send')) ||
      host === 'wa.me' ||
      (host.includes('t.me') && path.includes('/share'))
    ) {
      return true;
    }

    return false;
  } catch {
    return true;
  }
}

export function extractFacebook(url: string): string | undefined {
  if (!url) return undefined;
  try {
    let target = url.trim();
    if (!/^https?:\/\//i.test(target)) {
      target = 'https://' + target;
    }
    const host = new URL(target).hostname.toLowerCase();
    if (
      host === 'facebook.com' ||
      host.endsWith('.facebook.com') ||
      host === 'fb.com' ||
      host.endsWith('.fb.com')
    ) {
      return url;
    }
  } catch {
    // ignore URL parsing error
  }
  return undefined;
}
