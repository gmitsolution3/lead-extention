export interface Lead {
  source: string;
  name: string;
  phone: string;
  email: string;
  website: string;
  address?: string;
}

export interface ExtractionStatus {
  isExtracting: boolean;
  activeQuery: string;
  activeTabId: number | null;
}

// ── Storage helpers & Concurrency Queue ───────────────────────────────────────
let saveQueue: Promise<any> = Promise.resolve();

const getLeads = (): Promise<Lead[]> =>
  new Promise((r) =>
    chrome.storage.local.get(['leads'], (d) => r(((d.leads as Lead[]) || [])))
  );

const saveLeads = (leads: Lead[]): Promise<void> =>
  new Promise((r) => chrome.storage.local.set({ leads }, r));

const DEFAULT_EXTRACTION_STATUS: ExtractionStatus = {
  isExtracting: false,
  activeQuery: '',
  activeTabId: null,
};

const getExtractionStatus = (): Promise<ExtractionStatus> =>
  new Promise((r) =>
    chrome.storage.local.get(['extractionStatus'], (d) =>
      r((d.extractionStatus as ExtractionStatus) || DEFAULT_EXTRACTION_STATUS)
    )
  );

const setExtractionStatus = async (
  partial: Partial<ExtractionStatus>
): Promise<ExtractionStatus> => {
  const current = await getExtractionStatus();
  const next: ExtractionStatus = { ...current, ...partial };
  await new Promise<void>((r) =>
    chrome.storage.local.set({ extractionStatus: next }, () => r())
  );
  return next;
};

// ── Deduplication Helpers ───────────────────────────────────────────────────
function extractPhoneDigits(phone: string): string {
  return (phone || '').replace(/\D/g, '');
}

function normalizeUrl(url: string): string {
  if (!url) return '';
  return url
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/+$/, '');
}

function isDuplicateLead(candidate: Lead, existingLeads: Lead[]): boolean {
  const normName = (candidate.name || '').trim().toLowerCase();
  const candDigits = extractPhoneDigits(candidate.phone || '');
  const normWeb = (candidate.website || '').trim().toLowerCase();
  const normAddr = (candidate.address || '').trim().toLowerCase();

  return existingLeads.some((l) => {
    // a) Phone match: digits length >= 7 and identical
    const exDigits = extractPhoneDigits(l.phone || '');
    if (candDigits.length >= 7 && exDigits.length >= 7 && candDigits === exDigits) {
      return true;
    }

    const exNormName = (l.name || '').trim().toLowerCase();
    const sameName = normName === exNormName && normName.length > 0;

    if (sameName) {
      // b) Name + Website match: exact normalized name AND normalized website matches (length > 10)
      const exNormWeb = (l.website || '').trim().toLowerCase();
      if (normWeb.length > 10 && exNormWeb.length > 10 && normWeb === exNormWeb) {
        return true;
      }
      const cleanCandWeb = normalizeUrl(candidate.website || '');
      const cleanExWeb = normalizeUrl(l.website || '');
      if (cleanCandWeb.length > 6 && cleanCandWeb === cleanExWeb) {
        return true;
      }

      // c) Name + Address match: exact normalized name AND normalized street address matches (length > 15)
      const exNormAddr = (l.address || '').trim().toLowerCase();
      if (normAddr.length > 15 && exNormAddr.length > 15 && normAddr === exNormAddr) {
        return true;
      }
    }

    return false;
  });
}

// ── Lead Enrichment (Website Email Scraper) ──────────────────────────────────
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi;
const IGNORED_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.svg', '.webp', '.gif', '.js', '.css', '.woff', '.woff2'];
const JUNK_PREFIXES = ['sentry', 'noreply', 'no-reply', 'example', 'domain'];

function extractEmailsFromHtml(html: string): string[] {
  const mailtoMatches = Array.from(html.matchAll(/href=["']mailto:([^"'?>]+)/gi)).map((m) => m[1].trim());
  const bodyMatches = html.match(EMAIL_REGEX) || [];
  const allMatches: string[] = [...bodyMatches, ...mailtoMatches];

  const cleanEmails = allMatches
    .map((e) => e.trim().toLowerCase())
    .filter((email) => {
      if (email.length < 5 || email.length > 80) return false;
      if (IGNORED_EXTENSIONS.some((ext) => email.endsWith(ext))) return false;
      if (JUNK_PREFIXES.some((prefix) => email.startsWith(prefix))) return false;
      if (email.endsWith('@example.com') || email.includes('w3.org')) return false;
      return true;
    });

  return Array.from(new Set(cleanEmails));
}

async function fetchWithTimeout(url: string, timeoutMs = 5000): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function enqueueUpdateLeadEmail(targetLead: Lead, discoveredEmail: string): Promise<void> {
  const task = async () => {
    const leads = await getLeads();
    const targetDigits = extractPhoneDigits(targetLead.phone || '');
    const targetNormName = (targetLead.name || '').trim().toLowerCase();
    const targetCleanWeb = normalizeUrl(targetLead.website || '');

    const index = leads.findIndex((l) => {
      const lDigits = extractPhoneDigits(l.phone || '');
      const lNormName = (l.name || '').trim().toLowerCase();
      const lCleanWeb = normalizeUrl(l.website || '');

      if (targetDigits && lDigits && targetDigits === lDigits) return true;
      if (targetNormName && lNormName === targetNormName) {
        if (targetCleanWeb && lCleanWeb && targetCleanWeb === lCleanWeb) return true;
      }
      return false;
    });

    if (index !== -1 && !leads[index].email) {
      leads[index].email = discoveredEmail;
      await saveLeads(leads);
      console.log(`[BG] Enriched email for "${leads[index].name}": ${discoveredEmail}`);
      chrome.runtime.sendMessage({ type: 'LEADS_UPDATED', leads }, () => {
        if (chrome.runtime.lastError) {
          /* ignore popup closed error */
        }
      });
    }
  };

  const nextPromise = saveQueue.then(task, task);
  saveQueue = nextPromise.catch(() => {});
  return nextPromise;
}

async function enrichLeadEmail(lead: Lead): Promise<void> {
  try {
    let rawUrl = (lead.website || '').trim();
    if (!rawUrl) return;
    if (!/^https?:\/\//i.test(rawUrl)) {
      rawUrl = 'https://' + rawUrl;
    }
    const urlObj = new URL(rawUrl);
    const host = urlObj.hostname.toLowerCase();

    // Skip internal/social domains
    if (
      host.includes('google.') ||
      host.includes('facebook.com') ||
      host.includes('instagram.com') ||
      host.includes('twitter.com') ||
      host.includes('x.com') ||
      host.includes('linkedin.com') ||
      host.includes('youtube.com')
    ) {
      return;
    }

    const domain = `${urlObj.protocol}//${urlObj.host}`;

    // 1. Check homepage
    const homeHtml = await fetchWithTimeout(urlObj.href, 5000);
    if (homeHtml) {
      const foundEmails = extractEmailsFromHtml(homeHtml);
      if (foundEmails.length > 0) {
        await enqueueUpdateLeadEmail(lead, foundEmails[0]);
        return;
      }
    }

    // 2. Shallow crawl of contact or about pages
    const contactUrls = [
      `${domain}/contact`,
      `${domain}/contact-us`,
      `${domain}/about`,
      `${domain}/about-us`,
    ];

    for (const subUrl of contactUrls) {
      const subHtml = await fetchWithTimeout(subUrl, 5000);
      if (subHtml) {
        const subEmails = extractEmailsFromHtml(subHtml);
        if (subEmails.length > 0) {
          await enqueueUpdateLeadEmail(lead, subEmails[0]);
          return;
        }
      }
    }
  } catch {
    // Non-blocking enrichment failure
  }
}

// ── Enqueue SAVE_LEAD (Storage Concurrency Fix) ──────────────────────────────
function enqueueSaveLead(newLead: Lead): Promise<{ status: string; count: number }> {
  const task = async () => {
    if (!newLead || !newLead.name) {
      const current = await getLeads();
      return { status: 'ignored', count: current.length };
    }

    const leads = await getLeads();
    if (isDuplicateLead(newLead, leads)) {
      return { status: 'duplicate', count: leads.length };
    }

    leads.push(newLead);
    await saveLeads(leads);

    // Asynchronously enrich email if website is present and email is missing
    if (newLead.website && !newLead.email) {
      enrichLeadEmail(newLead).catch(() => {});
    }

    return { status: 'ok', count: leads.length };
  };

  const nextPromise = saveQueue.then(task, task);
  saveQueue = nextPromise.catch(() => ({ status: 'error', count: 0 }));
  return nextPromise;
}

// ── Resilient message delivery to content script ─────────────────────────────
function sendStartScrapingWithRetry(tabId: number, retries = 30) {
  let attempts = 0;
  const interval = setInterval(() => {
    attempts++;
    chrome.tabs.sendMessage(tabId, { action: 'PING' }, (response) => {
      const err = chrome.runtime.lastError;
      if (err || !response?.alive) {
        if (attempts >= retries) {
          clearInterval(interval);
          setExtractionStatus({ isExtracting: false });
          chrome.runtime.sendMessage(
            {
              type: 'EXTRACTION_ERROR',
              message: 'Failed to connect to page content script. Please try refreshing the tab.',
            },
            () => {
              if (chrome.runtime.lastError) {
                /* ignore */
              }
            }
          );
        }
        return;
      }
      // Content script is alive and responding!
      clearInterval(interval);
      chrome.tabs.sendMessage(tabId, { action: 'START_SCRAPING' }, (res) => {
        if (chrome.runtime.lastError) {
          /* ignore */
        }
        console.log('[BG] START_SCRAPING response:', res);
      });
    });
  }, 500);
}

// ── Helper to handle tab update with pre-registered listener ─────────────────
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
      setExtractionStatus({ isExtracting: false });
      chrome.runtime.sendMessage(
        {
          type: 'EXTRACTION_ERROR',
          message: 'Could not navigate tab: ' + chrome.runtime.lastError.message,
        },
        () => {
          if (chrome.runtime.lastError) {
            /* ignore */
          }
        }
      );
    }
  });
}

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

  // ── GET_LEADS ─────────────────────────────────────────────────────────────
  if (req.type === 'GET_LEADS') {
    getLeads().then((leads) => sendResponse({ leads }));
    return true;
  }

  // ── CLEAR_LEADS ───────────────────────────────────────────────────────────
  if (req.type === 'CLEAR_LEADS') {
    saveQueue = saveQueue
      .then(() => new Promise<void>((r) => chrome.storage.local.remove('leads', r)))
      .then(() => {
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

  // ── EXPORT CSV (RFC 4180 + UTF-8 BOM) ─────────────────────────────────────
  if (req.type === 'EXPORT_CSV') {
    (async () => {
      const leads = await getLeads();
      if (!leads.length) {
        sendResponse({ status: 'error' });
        return;
      }
      const rows = leads.map((l) =>
        [l.source, l.name, l.phone, l.email, l.website, l.address ?? '']
          .map((v) => `"${(v || '').replace(/"/g, '""')}"`)
          .join(',')
      );
      // \uFEFF is UTF-8 Byte Order Mark for proper rendering in Excel
      const csv = '\uFEFF' + ['Source,Name,Phone,Email,Website,Address', ...rows].join('\r\n');
      chrome.downloads.download(
        {
          url: 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv),
          filename: `leads_${Date.now()}.csv`,
          saveAs: true,
        },
        () => sendResponse({ status: 'ok' })
      );
    })();
    return true;
  }

  // ── EXPORT XML ────────────────────────────────────────────────────────────
  if (req.type === 'EXPORT_XML') {
    (async () => {
      const leads = await getLeads();
      if (!leads.length) {
        sendResponse({ status: 'error' });
        return;
      }
      const x = (s: string) =>
        (s || '').replace(/[<>&'"]/g, (c) =>
          ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c] ?? c)
        );
      let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<leads>\n';
      for (const l of leads) {
        xml += `  <lead>\n    <source>${x(l.source)}</source>\n    <name>${x(l.name)}</name>\n`;
        xml += `    <phone>${x(l.phone)}</phone>\n    <email>${x(l.email)}</email>\n`;
        xml += `    <website>${x(l.website)}</website>\n    <address>${x(l.address ?? '')}</address>\n  </lead>\n`;
      }
      xml += '</leads>';
      chrome.downloads.download(
        {
          url: 'data:application/xml;charset=utf-8,' + encodeURIComponent(xml),
          filename: `leads_${Date.now()}.xml`,
          saveAs: true,
        },
        () => sendResponse({ status: 'ok' })
      );
    })();
    return true;
  }
});
