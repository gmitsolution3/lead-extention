import type { KnownLeads } from '@/types/lead';
import { scrapeGoogleMaps } from './mapsScraper';
import { scrapeGenericPage } from './genericScraper';

try {
  let isExtracting = false;
  console.log('[LeadScraper] Content script loaded on:', window.location.href);

  // ── Main orchestrator ──────────────────────────────────────────────────────
  async function startScrapeProcess(knownLeads?: KnownLeads) {
    const isMaps =
      window.location.hostname.includes('google.com') &&
      window.location.pathname.includes('/maps');
    if (isMaps) {
      await scrapeGoogleMaps(() => isExtracting, knownLeads);
    } else {
      await scrapeGenericPage();
    }
  }

  // ── Message listener ───────────────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((req: any, _sender, sendResponse: any) => {
    try {
      if (req.action === 'PING') {
        sendResponse({ alive: true, url: window.location.href });
        return true;
      }
      if (req.action === 'START_SCRAPING') {
        if (isExtracting) {
          sendResponse({ status: 'already_running' });
          return true;
        }
        isExtracting = true;
        startScrapeProcess(req.knownLeads)
          .catch((err) => {
            console.error('[LeadScraper] Error:', err);
            chrome.runtime.sendMessage(
              { type: 'EXTRACTION_ERROR', message: String(err?.message || err) },
              () => {
                if (chrome.runtime.lastError) {
                  /* ignore */
                }
              }
            );
          })
          .finally(() => {
            isExtracting = false;
            chrome.runtime.sendMessage({ type: 'EXTRACTION_DONE' }, () => {
              if (chrome.runtime.lastError) {
                /* ignore */
              }
            });
          });
        sendResponse({ status: 'started' });
        return true;
      }
      if (req.action === 'STOP_EXTRACTION') {
        isExtracting = false;
        sendResponse({ status: 'stopped' });
        return true;
      }
    } catch (e) {
      console.warn('[LeadScraper] Listener error:', e);
    }
  });
} catch (globalErr) {
  console.warn('[LeadScraper] Init error:', globalErr);
}
