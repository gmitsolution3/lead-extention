import type { Lead } from '@/types/lead';
import {
  waitFor,
  waitForPanelUpdate,
  getDetailPanelH1,
  parseCardName,
  extractPhoneFromElement,
  extractWebsiteFromElement,
  extractAddressFromElement,
  cleanAddressText,
  saveLead,
  jitter,
  EMAIL_REGEX,
  getFtid,
  waitForDetailReady,
  isVisible,
  extractFacebook,
} from './domUtils';

export {
  waitForPanelUpdate,
  getDetailPanelH1,
};

export const DEBUG = true;

// Extract place ID from Google Maps URL for reliable tracking
export function getPlaceId(href: string): string {
  const ftid = getFtid(href);
  if (ftid) return ftid;
  try {
    const match = href.match(/\/maps\/place\/([^/]+)/);
    if (match) return decodeURIComponent(match[1]);
  } catch {
    /* ignore URI decode errors */
  }
  return href;
}

// ── Extract full lead from detail panel ───────────────────────────────────
export function extractFromDetailPanel(pane?: HTMLElement | null): Lead {
  const emptyLead: Lead = { source: 'Google Maps', name: '', phone: '', email: '', website: '', address: '' };
  if (!pane) return emptyLead;

  // Name
  const ariaLabel = pane.getAttribute('aria-label')?.trim();
  const h1Text = pane.querySelector('h1')?.textContent?.trim();
  const name = ariaLabel || h1Text || '';

  // Phone
  const phone = extractPhoneFromElement(pane);

  // Website
  const website = extractWebsiteFromElement(pane);

  // Address
  const addrEl = pane.querySelector(
    '[data-item-id="address"], button[aria-label*="address" i], button[aria-label*="ঠিকানা" i]'
  );
  let address = '';
  if (addrEl) {
    const raw = addrEl.getAttribute('aria-label') || addrEl.textContent || '';
    address = cleanAddressText(raw);
  }

  // Email on Maps panel (if listed)
  let email = '';
  const paneText = pane.textContent || '';
  const emailMatches = paneText.match(EMAIL_REGEX);
  if (emailMatches) {
    const validEmail = emailMatches.find(
      (e) => !e.endsWith('.png') && !e.endsWith('.jpg') && !e.endsWith('.js') && !e.endsWith('.webp')
    );
    if (validEmail) email = validEmail;
  }

  const facebook = extractFacebook(website);

  return {
    source: 'Google Maps',
    name,
    phone,
    email,
    website,
    address,
    ...(facebook ? { facebook } : {}),
  };
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
    const mains = Array.from(document.querySelectorAll<HTMLElement>('[role="main"]'))
      .filter((m) => isVisible(m) && !m.querySelector('[role="feed"]'));
    const singlePane = mains[0] || null;
    const singleLead = extractFromDetailPanel(singlePane);
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
    // Collect unprocessed result cards directly from feed
    const allAnchors = Array.from(
      feed.querySelectorAll<HTMLAnchorElement>('a[href*="/maps/place/"]')
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
      const expectedName = cardName;

      // ── Step 2: Get card-level data without clicking ──
      const cardContainer =
        anchor.closest('div.Nv251d, div[jsaction*="mouseover"], div[role="article"]') ||
        anchor.parentElement?.parentElement ||
        anchor.parentElement;

      const cardPhone = cardContainer ? extractPhoneFromElement(cardContainer as HTMLElement) : '';
      const cardWebsite = cardContainer ? extractWebsiteFromElement(cardContainer as HTMLElement) : '';
      const cardAddress = cardContainer ? extractAddressFromElement(cardContainer as HTMLElement) : '';

      // ── Step 3: Click with retry loop (up to 3 attempts) ──
      let readyResult = {
        pane: null as HTMLElement | null,
        titleMatched: false,
        urlMatched: false,
        rows: [] as string[],
        waitedMs: 0,
      };
      let attempts = 0;

      for (let attempt = 1; attempt <= 3 && checkActive(); attempt++) {
        attempts = attempt;

        try {
          anchor.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } catch {
          /* ignore scroll errors */
        }
        await jitter(200, 400);
        if (!checkActive()) break;

        const mouseOpts = { bubbles: true, cancelable: true, view: window };
        anchor.dispatchEvent(new MouseEvent('mousedown', mouseOpts));
        anchor.dispatchEvent(new MouseEvent('mouseup', mouseOpts));
        anchor.click();

        if (cardContainer && cardContainer !== anchor) {
          cardContainer.dispatchEvent(new MouseEvent('mousedown', mouseOpts));
          cardContainer.dispatchEvent(new MouseEvent('mouseup', mouseOpts));
        }

        readyResult = await waitForDetailReady(expectedName, {
          anchorHref: anchor.href,
          checkActive,
        });

        if (readyResult.titleMatched && readyResult.urlMatched && readyResult.rows.length > 0) {
          break;
        }

        if (attempt < 3 && checkActive()) {
          await jitter(800, 1500);
        }
      }

      if (!checkActive()) break;

      // ── Step 4: Verification & Merging ──
      const isVerified =
        readyResult.titleMatched &&
        readyResult.urlMatched &&
        readyResult.rows.length > 0 &&
        !!readyResult.pane;

      const detail = isVerified
        ? extractFromDetailPanel(readyResult.pane)
        : { source: 'Google Maps', name: '', phone: '', email: '', website: '', address: '' };

      const finalName = (isVerified && detail.name) ? detail.name : cardName;
      const finalPhone = (isVerified && detail.phone) ? detail.phone : cardPhone;
      const finalWebsite = (isVerified && detail.website) ? detail.website : cardWebsite;
      const finalAddress = (isVerified && detail.address) ? detail.address : cardAddress;
      const finalEmail = (isVerified && detail.email) ? detail.email : '';
      const facebook = (isVerified && detail.facebook) ? detail.facebook : extractFacebook(finalWebsite);

      const lead: Lead = {
        source: 'Google Maps',
        name: finalName,
        phone: finalPhone,
        email: finalEmail,
        website: finalWebsite,
        address: finalAddress,
        ...(facebook ? { facebook } : {}),
      };

      const source = {
        phone: (isVerified && detail.phone) ? 'detail' : cardPhone ? 'card' : '',
        website: (isVerified && detail.website) ? 'detail' : cardWebsite ? 'card' : '',
        address: (isVerified && detail.address) ? 'detail' : cardAddress ? 'card' : '',
      };

      if (DEBUG) {
        console.log('[LeadScraper][DEBUG]', {
          name: finalName,
          attempts,
          paneFound: readyResult.titleMatched,
          urlMatched: readyResult.urlMatched,
          rowIds: readyResult.rows,
          waitedMs: readyResult.waitedMs,
          source,
        });
      }

      if (lead.name) {
        console.log('[LeadScraper] Lead:', lead.name, '| phone:', lead.phone, '| web:', lead.website);
        saveLead(lead);
      }

      if (isVerified) {
        await jitter(300, 800);
      }
      await jitter(200, 400);
    }
  }

  console.log('[LeadScraper] Extraction finished. Total processed places:', processedIds.size);
}
