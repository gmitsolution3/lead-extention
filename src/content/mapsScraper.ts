import type { Lead } from '@/types/lead';
import {
  waitFor,
  waitForPanelUpdate,
  getDetailPanelH1,
  parseCardName,
  extractPhoneFromElement,
  extractWebsiteFromElement,
  saveLead,
  jitter,
  EMAIL_REGEX,
} from './domUtils';

// Extract place ID from Google Maps URL for reliable tracking
export function getPlaceId(href: string): string {
  try {
    const match = href.match(/\/maps\/place\/([^/]+)/);
    if (match) return decodeURIComponent(match[1]);
  } catch {
    /* ignore URI decode errors */
  }
  return href;
}

// ── Extract full lead from detail panel ───────────────────────────────────
export function extractFromDetailPanel(): Lead {
  const lead: Lead = { source: 'Google Maps', name: '', phone: '', email: '', website: '', address: '' };

  const detailPane =
    document.querySelector('div[role="main"] div.m6QEdf') ||
    document.querySelector('div.bJ2h1d') ||
    document.querySelector('div[role="main"]') ||
    document;

  // Name
  const titleEl = detailPane.querySelector('h1.DUwDvf, h1.fontTitleLarge, h1');
  lead.name = titleEl?.textContent?.trim() || '';

  // Phone — clean extraction from data-item-id="phone:tel:"
  lead.phone = extractPhoneFromElement(detailPane as HTMLElement);

  // Website — ignores internal Google domains
  lead.website = extractWebsiteFromElement(detailPane as HTMLElement);

  // Address
  const addrEl = detailPane.querySelector(
    'button[data-item-id="address"], button[aria-label*="address" i], button[aria-label*="ঠিকানা" i]'
  );
  if (addrEl) {
    const raw =
      addrEl.getAttribute('aria-label')?.replace(/^address:?\s*/i, '').replace(/^ঠিকানা:?\s*/i, '').trim() ||
      addrEl.textContent?.trim() ||
      '';
    lead.address = raw;
  }

  // Email on Maps panel (if listed)
  const paneText = detailPane.textContent || '';
  const emailMatches = paneText.match(EMAIL_REGEX);
  if (emailMatches) {
    const validEmail = emailMatches.find(
      (e) => !e.endsWith('.png') && !e.endsWith('.jpg') && !e.endsWith('.js') && !e.endsWith('.webp')
    );
    if (validEmail) lead.email = validEmail;
  }

  return lead;
}

// ── Google Maps Scraper ────────────────────────────────────────────────────
export async function scrapeGoogleMaps(checkActive: () => boolean): Promise<void> {
  console.log('[LeadScraper] Starting Google Maps extraction...');

  // Wait for results feed
  let feed: Element | null = await waitFor('div[role="feed"]', 12000, checkActive);
  if (!feed) {
    feed =
      document.querySelector('div[aria-label*="Results" i]') ||
      document.querySelector('div[aria-label*="ফলাফল" i]') ||
      document.querySelector('div.m6QEdf[aria-label]') ||
      document.querySelector('div.m6QEdf');
  }

  if (!feed) {
    // Single place view fallback
    const singleLead = extractFromDetailPanel();
    if (singleLead?.name) {
      saveLead(singleLead);
      return;
    }
    chrome.runtime.sendMessage(
      {
        type: 'EXTRACTION_ERROR',
        message: 'Google Maps search results not found. Please open a search page first.',
      },
      () => {
        if (chrome.runtime.lastError) {
          /* ignore */
        }
      }
    );
    return;
  }

  await jitter(1000, 1500);

  // Track processed places by their unique place-ID in href
  const processedIds = new Set<string>();
  let stuckCount = 0;
  let lastScrollTop = -1;

  while (checkActive()) {
    // Collect unprocessed result cards
    const allAnchors = Array.from(
      document.querySelectorAll<HTMLAnchorElement>('a[href*="/maps/place/"]')
    );

    // Deduplicate by extracting the place CID/ID from the URL
    const newAnchors = allAnchors.filter((a) => {
      const id = getPlaceId(a.href);
      return id && !processedIds.has(id);
    });

    if (!checkActive()) break;

    if (newAnchors.length === 0) {
      // Humanized dynamic scroll increment (400px–750px)
      const currentScroll = feed.scrollTop;
      const scrollDelta = Math.floor(Math.random() * (750 - 400 + 1)) + 400;
      feed.scrollTop += scrollDelta;
      await jitter(1500, 2200);

      if (!checkActive()) break;

      if (Math.abs(feed.scrollTop - currentScroll) < 10 || feed.scrollTop === lastScrollTop) {
        stuckCount++;
        const endText = feed.textContent || '';
        if (
          endText.includes("You've reached the end") ||
          endText.includes('তালিকায় আর কোনো স্থান নেই') ||
          stuckCount >= 5
        ) {
          console.log('[LeadScraper] Reached end of list.');
          break;
        }
      } else {
        stuckCount = 0;
      }
      lastScrollTop = feed.scrollTop;
      continue;
    }

    stuckCount = 0;

    for (const anchor of newAnchors) {
      if (!checkActive()) break;

      const placeId = getPlaceId(anchor.href);
      if (!placeId || processedIds.has(placeId)) continue;
      processedIds.add(placeId);

      // ── Step 1: Resilient Name Parsing (clean parser, no broken double-split) ──
      const rawLabel = anchor.getAttribute('aria-label') || '';
      const cardName = parseCardName(rawLabel) || parseCardName(anchor.textContent || '');

      // ── Step 2: Get card-level data without clicking ──
      const cardContainer =
        anchor.closest('div.Nv251d, div[jsaction*="mouseover"], div[role="article"]') ||
        anchor.parentElement?.parentElement ||
        anchor.parentElement;

      const cardPhone = cardContainer ? extractPhoneFromElement(cardContainer as HTMLElement) : '';
      const cardWebsite = cardContainer ? extractWebsiteFromElement(cardContainer as HTMLElement) : '';

      // ── Step 3: Scroll card into view ──
      try {
        anchor.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } catch {
        /* ignore scroll errors */
      }
      await jitter(300, 500);
      if (!checkActive()) break;

      // Capture current h1 BEFORE clicking
      const prevH1 = getDetailPanelH1();

      // Click the card
      anchor.click();

      // Wait until h1 changes (confirms detail panel updated with new place)
      await waitForPanelUpdate(prevH1, 5000, checkActive);
      if (!checkActive()) break;

      // Anti-bot delay after opening detail panel (1200ms–2500ms)
      await jitter(1200, 2500);
      if (!checkActive()) break;

      // ── Step 4: Extract detail panel data ──
      const detail = extractFromDetailPanel();

      // ── Step 5: Build final lead ──
      const lead: Lead = {
        source: 'Google Maps',
        name: cardName || detail.name || '',
        phone: detail.phone || cardPhone || '',
        email: detail.email || '',
        website: detail.website || cardWebsite || '',
        address: detail.address || '',
      };

      if (lead.name) {
        console.log('[LeadScraper] Lead:', lead.name, '| phone:', lead.phone, '| web:', lead.website);
        saveLead(lead);
      }

      await jitter(200, 400);
    }
  }

  console.log('[LeadScraper] Extraction finished. Total processed places:', processedIds.size);
}

