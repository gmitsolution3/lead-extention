export interface Lead {
  source: string; name: string; phone: string;
  email: string; website: string; address?: string;
}

// ── storage helpers ───────────────────────────────────────────────────────────
const getLeads = (): Promise<Lead[]> =>
  new Promise(r => chrome.storage.local.get(['leads'], d => r((d.leads as Lead[]) || [])));

const saveLeads = (leads: Lead[]): Promise<void> =>
  new Promise(r => chrome.storage.local.set({ leads }, r));

// ── message hub ──────────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((req: any, _sender, sendResponse: any) => {

  // ── START_SEARCH: navigate the tab then tell content script to scrape ──────
  if (req.type === 'START_SEARCH') {
    const { query, tabId } = req;
    const url = `https://www.google.com/maps/search/${encodeURIComponent(query)}/`;

    chrome.tabs.update(tabId, { url }, () => {
      const onUpdated = (id: number, info: { status?: string }) => {
        if (id !== tabId || info.status !== 'complete') return;
        chrome.tabs.onUpdated.removeListener(onUpdated);

        // Give Google Maps JS time to render the feed
        setTimeout(() => {
          chrome.tabs.sendMessage(tabId, { action: 'START_SCRAPING' }, (res: unknown) => {
            console.log('[BG] START_SCRAPING response:', res);
          });
        }, 4000);
      };
      chrome.tabs.onUpdated.addListener(onUpdated);
    });

    sendResponse({ status: 'navigating' });
    return true;
  }

  // ── STOP: forward stop to content script ─────────────────────────────────
  if (req.type === 'STOP_SEARCH') {
    chrome.tabs.sendMessage(req.tabId, { action: 'STOP_EXTRACTION' });
    sendResponse({ status: 'stopping' });
    return true;
  }

  // ── SAVE_LEAD ─────────────────────────────────────────────────────────────
  if (req.type === 'SAVE_LEAD') {
    (async () => {
      const leads = await getLeads();
      leads.push(req.payload as Lead);
      await saveLeads(leads);
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
    // chrome.runtime.sendMessage broadcasts to the popup if it's open
    chrome.runtime.sendMessage(req).catch(() => {});
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
      const csv = ['Source,Name,Phone,Email,Website,Address', ...rows].join('\n');
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
