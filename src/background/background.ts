export interface Lead {
  source: string;
  name: string;
  phone: string;
  email: string;
  website: string;
  address?: string;
}

// ── Storage helpers ───────────────────────────────────────────────────────────
const getLeads = (): Promise<Lead[]> =>
  new Promise(r => chrome.storage.local.get(['leads'], d => r((d.leads as Lead[]) || [])));

const saveLeads = (leads: Lead[]): Promise<void> =>
  new Promise(r => chrome.storage.local.set({ leads }, r));

// ── Resilient message delivery to content script ─────────────────────────────
function sendStartScrapingWithRetry(tabId: number, retries = 30) {
  let attempts = 0;
  const interval = setInterval(() => {
    attempts++;
    chrome.tabs.sendMessage(tabId, { action: 'PING' }, response => {
      const err = chrome.runtime.lastError;
      if (err || !response?.alive) {
        if (attempts >= retries) {
          clearInterval(interval);
          chrome.runtime.sendMessage({
            type: 'EXTRACTION_ERROR',
            message: 'Failed to connect to page content script. Please try refreshing the tab.'
          }, () => {
            if (chrome.runtime.lastError) {}
          });
        }
        return;
      }
      // Content script is alive and responding!
      clearInterval(interval);
      chrome.tabs.sendMessage(tabId, { action: 'START_SCRAPING' }, res => {
        if (chrome.runtime.lastError) {}
        console.log('[BG] START_SCRAPING response:', res);
      });
    });
  }, 500);
}

// ── Helper to handle tab update with pre-registered listener (Race Condition Fix) ──
function navigateTabAndScrape(tabId: number, targetUrl: string) {
  let navigationHandled = false;

  const onUpdated = (id: number, info: { status?: string }) => {
    if (id !== tabId || info.status !== 'complete') return;
    navigationHandled = true;
    chrome.tabs.onUpdated.removeListener(onUpdated);
    clearTimeout(navTimeout);
    sendStartScrapingWithRetry(tabId);
  };

  // Register listener BEFORE triggering navigation (fixes race condition)
  chrome.tabs.onUpdated.addListener(onUpdated);

  // Safety fallback timeout so popup never hangs forever
  const navTimeout = setTimeout(() => {
    if (navigationHandled) return;
    chrome.tabs.onUpdated.removeListener(onUpdated);
    sendStartScrapingWithRetry(tabId);
  }, 15000);

  chrome.tabs.update(tabId, { url: targetUrl }, () => {
    if (chrome.runtime.lastError) {
      console.error('[BG] tabs.update failed:', chrome.runtime.lastError.message);
      navigationHandled = true;
      chrome.tabs.onUpdated.removeListener(onUpdated);
      clearTimeout(navTimeout);
      chrome.runtime.sendMessage({
        type: 'EXTRACTION_ERROR',
        message: 'Could not navigate tab: ' + chrome.runtime.lastError.message
      }, () => {
        if (chrome.runtime.lastError) {}
      });
    }
  });
}

// ── Message hub ──────────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((req: any, _sender, sendResponse: any) => {

  // ── START_SEARCH: navigate tab if needed then trigger scraper ──────────────
  if (req.type === 'START_SEARCH') {
    const { query, tabId } = req;
    const targetUrl = `https://www.google.com/maps/search/${encodeURIComponent(query)}/`;

    const handleNavigation = (validTabId: number) => {
      chrome.tabs.get(validTabId, tab => {
        if (chrome.runtime.lastError || !tab) {
          console.error('[BG] tab get error:', chrome.runtime.lastError?.message);
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
      chrome.tabs.query({ active: true, lastFocusedWindow: true }, tabs => {
        if (tabs[0]?.id) handleNavigation(tabs[0].id);
      });
    }

    sendResponse({ status: 'navigating' });
    return false; // Return false because sendResponse was called synchronously
  }

  // ── STOP: forward stop to content script ─────────────────────────────────
  if (req.type === 'STOP_SEARCH') {
    if (req.tabId) {
      chrome.tabs.sendMessage(req.tabId, { action: 'STOP_EXTRACTION' }, () => {
        if (chrome.runtime.lastError) {}
      });
    }
    sendResponse({ status: 'stopping' });
    return false;
  }

  // ── SAVE_LEAD (Fixed Deduplication Bug) ───────────────────────────────────
  if (req.type === 'SAVE_LEAD') {
    (async () => {
      const newLead = req.payload as Lead;
      if (!newLead || !newLead.name) {
        sendResponse({ status: 'ignored' });
        return;
      }

      const leads = await getLeads();
      const normName = newLead.name.trim().toLowerCase();
      const normPhone = (newLead.phone || '').trim();
      const normWeb = (newLead.website || '').trim().toLowerCase();
      const normAddr = (newLead.address || '').trim();

      const isDuplicate = leads.some(l => {
        const sameName = l.name.trim().toLowerCase() === normName;
        const normExistingPhone = (l.phone || '').trim();
        const samePhone = normPhone.length >= 7 && normExistingPhone.length >= 7 && normPhone === normExistingPhone;
        const normExistingWeb = (l.website || '').trim().toLowerCase();
        const sameWeb = normWeb.length > 10 && normWeb === normExistingWeb;

        // Duplicate only when SAME NAME + strong second signal
        // (Phone alone is NOT enough — different businesses can share a number)
        if (sameName && samePhone) return true;   // same name + same phone
        if (sameName && sameWeb)   return true;   // same name + same website
        if (sameName && normAddr.length > 20 && l.address && l.address.trim() === normAddr) return true; // same name + same detailed address

        return false;
      });

      if (!isDuplicate) {
        leads.push(newLead);
        await saveLeads(leads);
      }
      sendResponse({ status: 'ok', count: leads.length });
    })();
    return true;
  }

  // ── GET_LEADS ─────────────────────────────────────────────────────────────
  if (req.type === 'GET_LEADS') {
    getLeads().then(leads => sendResponse({ leads }));
    return true;
  }

  // ── CLEAR_LEADS ───────────────────────────────────────────────────────────
  if (req.type === 'CLEAR_LEADS') {
    chrome.storage.local.remove('leads', () => sendResponse({ status: 'ok' }));
    return true;
  }

  // ── Forward DONE / ERROR to popup ────────────────────────────────────────
  if (req.type === 'EXTRACTION_DONE' || req.type === 'EXTRACTION_ERROR') {
    chrome.runtime.sendMessage(req, () => {
      if (chrome.runtime.lastError) {
        // Popup is closed, ignore error cleanly
      }
    });
    return false;
  }

  // ── EXPORT CSV ────────────────────────────────────────────────────────────
  if (req.type === 'EXPORT_CSV') {
    (async () => {
      const leads = await getLeads();
      if (!leads.length) { sendResponse({ status: 'error' }); return; }
      const rows = leads.map(l =>
        [l.source, l.name, l.phone, l.email, l.website, l.address ?? '']
          .map(v => `"${(v || '').replace(/"/g, '""')}"`)
          .join(',')
      );
      // \uFEFF is UTF-8 Byte Order Mark for proper rendering in Excel
      const csv = '\uFEFF' + ['Source,Name,Phone,Email,Website,Address', ...rows].join('\n');
      chrome.downloads.download({
        url: 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv),
        filename: `leads_${Date.now()}.csv`,
        saveAs: true,
      }, () => sendResponse({ status: 'ok' }));
    })();
    return true;
  }

  // ── EXPORT XML ────────────────────────────────────────────────────────────
  if (req.type === 'EXPORT_XML') {
    (async () => {
      const leads = await getLeads();
      if (!leads.length) { sendResponse({ status: 'error' }); return; }
      const x = (s: string) => (s || '').replace(/[<>&'"]/g, c =>
        ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c] ?? c));
      let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<leads>\n';
      for (const l of leads) {
        xml += `  <lead>\n    <source>${x(l.source)}</source>\n    <name>${x(l.name)}</name>\n`;
        xml += `    <phone>${x(l.phone)}</phone>\n    <email>${x(l.email)}</email>\n`;
        xml += `    <website>${x(l.website)}</website>\n    <address>${x(l.address ?? '')}</address>\n  </lead>\n`;
      }
      xml += '</leads>';
      chrome.downloads.download({
        url: 'data:application/xml;charset=utf-8,' + encodeURIComponent(xml),
        filename: `leads_${Date.now()}.xml`,
        saveAs: true,
      }, () => sendResponse({ status: 'ok' }));
    })();
    return true;
  }
});
