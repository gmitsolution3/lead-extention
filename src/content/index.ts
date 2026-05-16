let isExtracting = false;
console.log('[LeadScraper] Loaded on:', window.location.hostname);

chrome.runtime.onMessage.addListener((req: any, _sender, sendResponse: any) => {

  // Popup pings to check if content script is alive
  if (req.action === 'PING') {
    sendResponse({ alive: true, url: window.location.href });
    return true;
  }

  // Background tells us to start scraping after navigation is done
  if (req.action === 'START_SCRAPING') {
    if (isExtracting) { sendResponse({ status: 'already_running' }); return true; }
    isExtracting = true;
    scrapeAllResults()
      .catch(err => {
        console.error('[LeadScraper]', err);
        chrome.runtime.sendMessage({ type: 'EXTRACTION_ERROR', message: String(err) });
      })
      .finally(() => {
        isExtracting = false;
        chrome.runtime.sendMessage({ type: 'EXTRACTION_DONE' });
      });
    sendResponse({ status: 'started' });
    return true;
  }

  if (req.action === 'STOP_EXTRACTION') {
    isExtracting = false;
    sendResponse({ status: 'stopped' });
    return true;
  }
});

// ── helpers ──────────────────────────────────────────────────────────────────
const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

async function waitFor(selector: string, timeout = 15000): Promise<Element | null> {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const el = document.querySelector(selector);
    if (el) return el;
    await sleep(300);
  }
  return null;
}

// ── main scrape loop ──────────────────────────────────────────────────────────
async function scrapeAllResults() {
  // Wait for the results feed
  const feed = await waitFor('div[role="feed"]', 20000);
  if (!feed) {
    chrome.runtime.sendMessage({ type: 'EXTRACTION_ERROR', message: 'Results did not load. Make sure you are on a Google Maps search results page.' });
    return;
  }

  await sleep(2000); // let first batch render

  const seen = new Set<string>();
  let stuckCount = 0;

  while (isExtracting) {
    const links = Array.from(
      feed.querySelectorAll<HTMLAnchorElement>('a[href*="/maps/place/"]')
    ).filter(a => a.href && !seen.has(a.href));

    if (links.length === 0) {
      // scroll to load more
      const before = feed.scrollTop;
      feed.scrollTop += 800;
      await sleep(3000);
      const scrolled = Math.abs(feed.scrollTop - before);
      if (scrolled < 30) {
        stuckCount++;
        if (stuckCount >= 3) break; // end of list
      } else {
        stuckCount = 0;
      }
      continue;
    }

    stuckCount = 0;

    for (const link of links) {
      if (!isExtracting) break;
      seen.add(link.href);

      link.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await sleep(500);
      link.click();

      // Wait until the detail panel title appears
      await waitFor('h1', 10000);
      await sleep(2000); // extra time for phone/website to load

      const lead = extractLead();
      console.log('[LeadScraper] Got:', lead);
      if (lead.name) {
        chrome.runtime.sendMessage({ type: 'SAVE_LEAD', payload: lead });
      }

      // Go back to the list
      const backBtn =
        document.querySelector<HTMLButtonElement>('button[aria-label="Back"]') ??
        document.querySelector<HTMLButtonElement>('button[aria-label="Back to results"]');

      if (backBtn) {
        backBtn.click();
      } else {
        window.history.back();
      }
      await sleep(2000);
    }
  }
  console.log('[LeadScraper] Done. Total seen:', seen.size);
}

// ── extract data from the open detail panel ───────────────────────────────────
function extractLead() {
  const lead = { source: 'Google Maps', name: '', phone: '', email: '', website: '', address: '' };

  // Name
  lead.name = document.querySelector('h1')?.textContent?.trim() ?? '';

  // Phone — data-item-id = "phone:tel:+8801..."
  const phoneEl = document.querySelector('[data-item-id^="phone:tel:"]');
  if (phoneEl) {
    const id = phoneEl.getAttribute('data-item-id') ?? '';
    lead.phone = id.replace('phone:tel:', '').trim() ||
      phoneEl.getAttribute('aria-label')?.replace(/^phone(:?\s*number)?:?\s*/i, '').trim() || '';
  }

  // Website
  const webEl = document.querySelector<HTMLAnchorElement>(
    'a[data-item-id="authority"], a[aria-label*="website" i]'
  );
  lead.website = webEl?.href ?? '';

  // Address
  const addrEl = document.querySelector(
    'button[data-item-id="address"], button[aria-label*="address" i]'
  );
  if (addrEl) {
    lead.address = addrEl.getAttribute('aria-label')?.replace(/^address:?\s*/i, '').trim() ||
      addrEl.textContent?.trim() || '';
  }

  return lead;
}
