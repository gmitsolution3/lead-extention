import type { Lead } from '@/types/lead';
import { exportCsv, exportXml } from '@/lib/exporters';
import {
  getSearchGroups,
  getLeads,
  clearLeads,
  deleteLead,
  deleteSearchGroup,
  getExtractionStatus,
  setExtractionStatus,
  enqueueSaveLead,
} from './storage';
import { navigateTabAndScrape, sendStartScrapingWithRetry } from './navigation';

export type { Lead, SearchGroup, ExtractionStatus } from '@/types/lead';

// ── Tab Lifecycle Cleanups ───────────────────────────────────────────────────
chrome.tabs.onRemoved.addListener(async (tabId) => {
  const status = await getExtractionStatus();
  if (status.isExtracting && status.activeTabId === tabId) {
    await setExtractionStatus({ isExtracting: false, activeTabId: null });
  }
});

// ── Message Hub ──────────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((req: any, _sender, sendResponse: any) => {

  // ── GET_EXTRACTION_STATUS ──────────────────────────────────────────────────
  if (req.type === 'GET_EXTRACTION_STATUS') {
    getExtractionStatus().then((status) => sendResponse(status));
    return true;
  }

  // ── START_SEARCH: navigate tab if needed then trigger scraper ──────────────
  if (req.type === 'START_SEARCH') {
    const { query, tabId } = req;
    const targetUrl = `https://www.google.com/maps/search/${encodeURIComponent(query)}/`;

    const handleNavigation = async (validTabId: number) => {
      await setExtractionStatus({
        isExtracting: true,
        activeQuery: query || '',
        activeTabId: validTabId,
      });

      chrome.tabs.get(validTabId, (tab) => {
        if (chrome.runtime.lastError || !tab) {
          console.error('[BG] tab get error:', chrome.runtime.lastError?.message);
          setExtractionStatus({ isExtracting: false });
          return;
        }

        if (tab.url && tab.url.includes('google.com/maps/search/')) {
          if (tab.url !== targetUrl) {
            navigateTabAndScrape(validTabId, targetUrl);
          } else {
            sendStartScrapingWithRetry(validTabId);
          }
        } else {
          navigateTabAndScrape(validTabId, targetUrl);
        }
      });
    };

    if (tabId) {
      handleNavigation(tabId);
    } else {
      chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
        if (tabs[0]?.id) handleNavigation(tabs[0].id);
      });
    }

    sendResponse({ status: 'navigating' });
    return false;
  }

  // ── STOP: forward stop to content script ─────────────────────────────────
  if (req.type === 'STOP_SEARCH') {
    setExtractionStatus({ isExtracting: false });
    if (req.tabId) {
      chrome.tabs.sendMessage(req.tabId, { action: 'STOP_EXTRACTION' }, () => {
        if (chrome.runtime.lastError) {
          /* ignore */
        }
      });
    }
    sendResponse({ status: 'stopping' });
    return false;
  }

  // ── SAVE_LEAD (Serialized Queue & Deduplication) ──────────────────────────
  if (req.type === 'SAVE_LEAD') {
    enqueueSaveLead(req.payload as Lead).then((res) => {
      sendResponse(res);
    });
    return true;
  }

  // ── GET_SEARCH_GROUPS ──────────────────────────────────────────────────────
  if (req.type === 'GET_SEARCH_GROUPS') {
    getSearchGroups().then((searchGroups) => sendResponse({ searchGroups }));
    return true;
  }

  // ── DELETE_LEAD ────────────────────────────────────────────────────────────
  if (req.type === 'DELETE_LEAD') {
    deleteLead(req.groupId, req.leadId).then((searchGroups) => {
      sendResponse({ status: 'ok', searchGroups });
    });
    return true;
  }

  // ── DELETE_SEARCH_GROUP ────────────────────────────────────────────────────
  if (req.type === 'DELETE_SEARCH_GROUP') {
    deleteSearchGroup(req.groupId).then((searchGroups) => {
      sendResponse({ status: 'ok', searchGroups });
    });
    return true;
  }

  // ── GET_LEADS (Compatibility) ──────────────────────────────────────────────
  if (req.type === 'GET_LEADS') {
    getLeads().then((leads) => sendResponse({ leads }));
    return true;
  }

  // ── CLEAR_LEADS ───────────────────────────────────────────────────────────
  if (req.type === 'CLEAR_LEADS') {
    clearLeads().then(() => {
      sendResponse({ status: 'ok' });
    });
    return true;
  }

  // ── Forward DONE / ERROR to popup and update state ───────────────────────
  if (req.type === 'EXTRACTION_DONE' || req.type === 'EXTRACTION_ERROR') {
    setExtractionStatus({ isExtracting: false });
    chrome.runtime.sendMessage(req, () => {
      if (chrome.runtime.lastError) {
        /* ignore popup closed cleanly */
      }
    });
    return false;
  }

  // ── EXPORT GROUP CSV ──────────────────────────────────────────────────────
  if (req.type === 'EXPORT_GROUP_CSV') {
    const success = exportCsv(req.leads || [], req.queryName, () => sendResponse({ status: 'ok' }));
    if (!success) {
      sendResponse({ status: 'error' });
    }
    return true;
  }

  // ── EXPORT GROUP XML ──────────────────────────────────────────────────────
  if (req.type === 'EXPORT_GROUP_XML') {
    const success = exportXml(req.leads || [], req.queryName, () => sendResponse({ status: 'ok' }));
    if (!success) {
      sendResponse({ status: 'error' });
    }
    return true;
  }

  // ── EXPORT CSV (All leads) ────────────────────────────────────────────────
  if (req.type === 'EXPORT_CSV') {
    (async () => {
      const leads = await getLeads();
      const success = exportCsv(leads, 'all', () => sendResponse({ status: 'ok' }));
      if (!success) {
        sendResponse({ status: 'error' });
      }
    })();
    return true;
  }

  // ── EXPORT XML (All leads) ────────────────────────────────────────────────
  if (req.type === 'EXPORT_XML') {
    (async () => {
      const leads = await getLeads();
      const success = exportXml(leads, 'all', () => sendResponse({ status: 'ok' }));
      if (!success) {
        sendResponse({ status: 'error' });
      }
    })();
    return true;
  }
});
