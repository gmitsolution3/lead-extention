let isExtracting = false;

console.log('Content script loaded');

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request: any, sender: any, sendResponse: any) => {
  if (request.action === 'START_EXTRACTION') {
    isExtracting = true;
    startGoogleMapsExtraction(request.query);
    sendResponse({ status: 'started' });
  } else if (request.action === 'STOP_EXTRACTION') {
    isExtracting = false;
    sendResponse({ status: 'stopped' });
  }
});

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function startGoogleMapsExtraction(query: string) {
  if (!window.location.href.includes('google.com/maps')) {
    alert("Please open Google Maps (https://www.google.com/maps) first before extracting.");
    isExtracting = false;
    return;
  }

  // 1. Enter search query
  const searchInput = document.querySelector('input#searchboxinput') as HTMLInputElement;
  const searchBtn = document.querySelector('button#searchbox-searchbutton') as HTMLButtonElement;

  if (searchInput && searchBtn) {
    searchInput.value = query;
    // trigger input event so React/JS catches it
    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(500);
    searchBtn.click();
    await sleep(4000); // Wait for initial results to load
  }

  // 2. Process feed
  let processedItems = new Set<string>();
  
  while (isExtracting) {
    const feed = document.querySelector('div[role="feed"]');
    if (!feed) {
      console.log('No feed found. Retrying in 2s...');
      await sleep(2000);
      continue;
    }

    // Find all clickable place links in the feed
    const items = Array.from(feed.querySelectorAll('a')).filter(a => a.href && a.href.includes('/maps/place/'));
    
    let hasNewItems = false;

    for (const item of items) {
      if (!isExtracting) break;
      
      const itemUrl = item.href;
      if (processedItems.has(itemUrl)) continue;
      
      hasNewItems = true;
      processedItems.add(itemUrl);

      // Scroll item into view and click
      item.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await sleep(500);
      item.click();
      
      await sleep(3000); // Wait for the detail panel to slide in

      // Extract details from the panel
      const lead = extractCurrentDetailView();
      if (lead.name) {
        chrome.runtime.sendMessage({ type: 'SAVE_LEAD', payload: lead });
      }

      // Go back to the list
      // Back button in the detail panel usually has an aria-label like "Back" or "Close"
      const backBtn = document.querySelector('button[aria-label="Back"]') as HTMLButtonElement || 
                      document.querySelector('button[aria-label="Back to results"]') as HTMLButtonElement ||
                      document.querySelector('button[aria-label="Close"]') as HTMLButtonElement;
      
      if (backBtn) {
        backBtn.click();
        await sleep(2000); // Wait for list to return
      } else {
        console.log("Back button not found, trying to continue...");
      }
    }

    // If no new items were processed in this loop, scroll to load more
    if (!hasNewItems) {
      const previousScrollTop = feed.scrollTop;
      feed.scrollTop = feed.scrollHeight;
      await sleep(3000); // Wait for new items to fetch and render
      
      // If scroll didn't move much, we might be at the end
      if (feed.scrollTop - previousScrollTop < 10) {
        const endText = document.body.innerText.includes("You've reached the end of the list");
        if (endText) {
          console.log("Reached the end of the list.");
          break;
        }
      }
    }
  }
  
  console.log("Extraction finished or stopped.");
  isExtracting = false;
}

function extractCurrentDetailView() {
  const lead = {
    source: 'Google Maps',
    name: '',
    phone: '',
    email: '', // Always empty as Google Maps doesn't provide it
    website: '',
    address: ''
  };

  // Name is usually in an h1 tag
  const h1 = document.querySelector('h1');
  if (h1) lead.name = h1.textContent?.trim() || '';

  // Phone: Look for buttons with data-tooltip containing "phone" or "Copy phone number"
  const phoneBtn = document.querySelector('button[data-tooltip*="phone number" i], button[data-item-id^="phone:tel:"]');
  if (phoneBtn) {
    const rawText = phoneBtn.getAttribute('aria-label') || phoneBtn.textContent || '';
    lead.phone = rawText.replace(/.*phone number:?\s*/i, '').trim();
  }

  // Website: Look for links with data-tooltip containing "website"
  const webLink = document.querySelector('a[data-tooltip*="website" i], a[data-item-id="authority"]');
  if (webLink) {
    lead.website = (webLink as HTMLAnchorElement).href;
  }

  // Address: Look for buttons with data-tooltip containing "address"
  const addrBtn = document.querySelector('button[data-tooltip*="address" i], button[data-item-id="address"]');
  if (addrBtn) {
    const rawText = addrBtn.getAttribute('aria-label') || addrBtn.textContent || '';
    lead.address = rawText.replace(/.*address:?\s*/i, '').trim();
  }

  return lead;
}
