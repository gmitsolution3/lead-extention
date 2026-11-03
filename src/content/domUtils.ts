import { isInternalGoogleDomain } from '@/lib/url';

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export const jitter = (min: number, max: number) =>
  sleep(Math.floor(Math.random() * (max - min + 1) + min));

export const PHONE_REGEX = /(?:\+?[\d]{1,4}[-.\s]?)?\(?[\d]{2,5}\)?[-.\s]?[\d]{3,5}[-.\s]?[\d]{3,5}/g;
export const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

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

// Get the h1 from the detail panel only (not the search results title)
export function getDetailPanelH1(): string {
  const panel =
    document.querySelector('div[role="main"] div.m6QEdf') ||
    document.querySelector('div.bJ2h1d') ||
    document.querySelector('div[data-section-id="ap"]') ||
    document.querySelector('div[jsaction*="pane"]');

  if (panel) {
    const h1 = panel.querySelector('h1');
    if (h1?.textContent?.trim()) return h1.textContent.trim();
  }

  const h1 = document.querySelector('h1.DUwDvf, h1.fontTitleLarge');
  return h1?.textContent?.trim() || '';
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

// ── Extract phone from element (with clean phone:tel handling) ─────────────
export function extractPhoneFromElement(container: HTMLElement): string {
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

// ── Extract website from element (ignoring internal Google domains) ────────
export function extractWebsiteFromElement(container: HTMLElement): string {
  const webEl = container.querySelector<HTMLAnchorElement>(
    'a[data-item-id="authority"], a[aria-label*="website" i], a[data-tooltip*="website" i], a[aria-label*="ওয়েবসাইট" i], a[data-value="Website"]'
  );
  if (webEl?.href && !isInternalGoogleDomain(webEl.href)) {
    return webEl.href;
  }

  const allAnchors = Array.from(container.querySelectorAll<HTMLAnchorElement>("a[href^='http']"));
  for (const a of allAnchors) {
    if (a.href && !isInternalGoogleDomain(a.href)) {
      return a.href;
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
      console.log('[LeadScraper] Saved. Total:', res?.count);
    }
  });
}

