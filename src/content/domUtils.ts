import {
  isInternalGoogleDomain,
  unwrapGoogleRedirect,
  isSocialSharingOrExcluded,
  extractFacebook,
} from '@/lib/url';

export {
  unwrapGoogleRedirect,
  isSocialSharingOrExcluded,
  extractFacebook,
};

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export const jitter = (min: number, max: number) =>
  sleep(Math.floor(Math.random() * (max - min + 1) + min));

export const PHONE_REGEX = /(?:\+?[\d]{1,4}[-.\s]?)?\(?[\d]{2,5}\)?[-.\s]?[\d]{3,5}[-.\s]?[\d]{3,5}/g;
export const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

export const normalizeName = (s: string) =>
  (s || '').toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, '');

export function namesMatch(a: string, b: string): boolean {
  const x = normalizeName(a), y = normalizeName(b);
  if (!x || !y) return false; // empty never matches
  if (x === y) return true;
  return Math.min(x.length, y.length) >= 4 && (x.includes(y) || y.includes(x));
}

export const isVisible = (el: Element): boolean =>
  (el as any).checkVisibility?.({ checkVisibilityCSS: true }) ?? el.getClientRects().length > 0;

export const getFtid = (href: string): string =>
  href.match(/!1s(0x[0-9a-f]+:0x[0-9a-f]+)/i)?.[1]?.toLowerCase() || '';

export const urlMatchesAnchor = (anchorHref: string): boolean => {
  const id = getFtid(anchorHref);
  return id ? location.href.toLowerCase().includes(id) : true;
};

// Detail pane = visible [role=main] WITHOUT a [role=feed] inside, whose aria-label or h1 matches the clicked place.
export function findDetailPane(expectedName: string): HTMLElement | null {
  const mains = Array.from(document.querySelectorAll<HTMLElement>('[role="main"]'))
    .filter((m) => isVisible(m) && !m.querySelector('[role="feed"]'));
  return (
    mains.find((m) => namesMatch(m.getAttribute('aria-label') || '', expectedName)) ||
    mains.find((m) => Array.from(m.querySelectorAll('h1')).some((h) => namesMatch(h.textContent || '', expectedName))) ||
    null
  );
}

export async function waitForDetailReady(
  expectedName: string,
  opts: { anchorHref: string; timeout?: number; settleMs?: number; checkActive?: () => boolean }
) {
  const { anchorHref, timeout = 9000, settleMs = 700, checkActive = () => true } = opts;
  const start = Date.now();
  let lastSig = '', stableSince = 0;
  let pane: HTMLElement | null = null, rows: string[] = [], urlMatched = false;
  while (Date.now() - start < timeout && checkActive()) {
    pane = findDetailPane(expectedName);
    urlMatched = urlMatchesAnchor(anchorHref);
    if (pane && urlMatched) {
      const els = Array.from(pane.querySelectorAll<HTMLElement>('[data-item-id]'));
      rows = els.map((e) => e.getAttribute('data-item-id') || '');
      const sig = els.map((e) => `${e.getAttribute('data-item-id')}|${e.getAttribute('href') || ''}|${e.getAttribute('aria-label') || ''}`).join('~');
      if (els.length > 0) {
        if (sig !== lastSig) { lastSig = sig; stableSince = Date.now(); }
        else if (Date.now() - stableSince >= settleMs) break; // rows present and unchanged => fully rendered
      }
    }
    await sleep(200);
  }
  return { pane, titleMatched: !!pane, urlMatched, rows, waitedMs: Date.now() - start };
}

export async function waitFor(
  selector: string,
  timeout = 12000,
  checkActive: () => boolean = () => true
): Promise<Element | null> {
  const end = Date.now() + timeout;
  while (Date.now() < end && checkActive()) {
    const el = document.querySelector(selector);
    if (el) return el;
    await sleep(300);
  }
  return null;
}

// Get the h1 from the detail panel only (not the search results title)
export function getDetailPanelH1(expectedName?: string): string {
  if (expectedName) {
    const pane = findDetailPane(expectedName);
    if (pane) {
      return pane.getAttribute('aria-label') || pane.querySelector('h1')?.textContent?.trim() || '';
    }
  }
  const mains = Array.from(document.querySelectorAll<HTMLElement>('[role="main"]'))
    .filter((m) => isVisible(m) && !m.querySelector('[role="feed"]'));
  if (mains.length > 0) {
    return mains[0].getAttribute('aria-label') || mains[0].querySelector('h1')?.textContent?.trim() || '';
  }
  const h1 = document.querySelector('h1.DUwDvf, h1.fontTitleLarge');
  return h1?.textContent?.trim() || '';
}

// Wait for h1 to change to a DIFFERENT value than prevText (means panel updated)
export async function waitForPanelUpdate(
  prevH1Text: string,
  timeout = 3500,
  checkActive: () => boolean = () => true
): Promise<boolean> {
  const end = Date.now() + timeout;
  while (Date.now() < end && checkActive()) {
    const h1 = getDetailPanelH1();
    if (h1 && h1.trim().toLowerCase() !== prevH1Text.trim().toLowerCase()) {
      return true;
    }
    await sleep(150);
  }
  return false;
}

// ── Clean Name Parser (replaces broken double split) ──────────────────────
export function parseCardName(rawText: string): string {
  if (!rawText) return '';
  // Google Maps separates card title from rating/category with middle dot, bullet, or pipe
  const firstChunk = rawText.split(/[·•|\n]/)[0].trim();

  // Strip ratings, review counts, stars if present in the chunk
  const cleaned = firstChunk
    .replace(/★\s*[\d.]+/g, '')
    .replace(/\b\d\.\d\s*(\([\d,]+\))?/g, '')
    .replace(/\([\d,]+\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return cleaned || firstChunk;
}

// ── Clean address text helper ─────────────────────────────────────────────
export function cleanAddressText(text: string): string {
  if (!text) return '';
  return text
    .replace(/^address:?\s*/i, '')
    .replace(/^ঠিকানা:?\s*/i, '')
    .trim();
}

// ── Extract address from element (with priority for data-item-id="address") ───
export function extractAddressFromElement(container: HTMLElement): string {
  if (!container) return '';
  const addrEl = container.querySelector(
    '[data-item-id="address"], button[aria-label*="address" i], button[aria-label*="ঠিকানা" i]'
  );
  if (addrEl) {
    const raw = addrEl.getAttribute('aria-label') || addrEl.textContent || '';
    return cleanAddressText(raw);
  }
  return '';
}

// ── Extract phone from element (with clean phone:tel handling) ─────────────
export function extractPhoneFromElement(container: HTMLElement): string {
  if (!container) return '';
  const phoneEl =
    container.querySelector('[data-item-id^="phone:tel:"]') ||
    container.querySelector('button[data-item-id^="phone:tel:"]') ||
    container.querySelector('button[data-tooltip*="phone" i]') ||
    container.querySelector('button[aria-label*="phone" i], button[aria-label*="Phone" i]') ||
    container.querySelector('button[aria-label*="ফোন" i]') ||
    container.querySelector('[data-item-id*="phone"]');

  if (phoneEl) {
    const itemId = phoneEl.getAttribute('data-item-id') || '';
    if (itemId.startsWith('phone:tel:')) {
      return itemId.replace('phone:tel:', '').trim();
    }
    const label = phoneEl.getAttribute('aria-label') || phoneEl.textContent || '';
    const m = label.match(/(?:\+?[\d]{1,4}[-.\s]?)?\(?[\d]{2,5}\)?[-.\s]?[\d]{3,5}[-.\s]?[\d]{3,5}/);
    if (m && m[0].replace(/\D/g, '').length >= 7) {
      return m[0].trim();
    }
  }

  const text = container.textContent || '';
  const matches = text.match(PHONE_REGEX);
  if (matches) {
    const valid = matches.find(
      (p) => p.replace(/\D/g, '').length >= 7 && p.replace(/\D/g, '').length <= 15
    );
    if (valid) return valid.trim();
  }
  return '';
}

// ── Extract website from element (ignoring internal Google domains & social sharing) ────────
export function extractWebsiteFromElement(container: HTMLElement): string {
  if (!container) return '';

  // Tier 1: Authority attribute
  const authEl = container.querySelector<HTMLAnchorElement>('a[data-item-id="authority"]');
  const authHref = authEl?.href || authEl?.getAttribute('href') || '';
  if (authHref) {
    const unwrapped = unwrapGoogleRedirect(authHref);
    if (unwrapped && !isInternalGoogleDomain(unwrapped) && !isSocialSharingOrExcluded(unwrapped)) {
      return unwrapped;
    }
  }

  // Tier 2: Label-based selectors
  const labelEl = container.querySelector<HTMLAnchorElement>(
    'a[aria-label*="website" i], a[data-tooltip*="website" i], a[aria-label*="ওয়েবসাইট" i], a[data-value="Website"]'
  );
  const labelHref = labelEl?.href || labelEl?.getAttribute('href') || '';
  if (labelHref) {
    const unwrapped = unwrapGoogleRedirect(labelHref);
    if (unwrapped && !isInternalGoogleDomain(unwrapped) && !isSocialSharingOrExcluded(unwrapped)) {
      return unwrapped;
    }
  }

  return '';
}

// Save lead to background queue with proper error handling
export function saveLead(lead: object) {
  chrome.runtime.sendMessage({ type: 'SAVE_LEAD', payload: lead }, (res) => {
    if (chrome.runtime.lastError) {
      console.warn('[LeadScraper] SAVE_LEAD error:', chrome.runtime.lastError.message);
    } else {
      console.log('[LeadScraper] Saved. Total:', res?.count, 'Status:', res?.status);
    }
  });
}
