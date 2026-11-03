import { setExtractionStatus } from './storage';

export function sendStartScrapingWithRetry(tabId: number, retries = 30) {
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

export function navigateTabAndScrape(tabId: number, targetUrl: string) {
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

