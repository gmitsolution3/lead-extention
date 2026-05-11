console.log('Content script running on:', window.location.href);

// Basic skeleton for extraction logic
function extractLead() {
  const url = window.location.href;
  let lead = { source: '', name: '', phone: '', email: '', website: '' };

  if (url.includes('google.com/maps')) {
    lead.source = 'Google Maps';
    // Add extraction logic for Google Maps
  } else if (url.includes('facebook.com')) {
    lead.source = 'Facebook';
    // Add extraction logic for Facebook
  }

  console.log('Extracted Lead:', lead);
  return lead;
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request: any, sender: any, sendResponse: any) => {
  if (request.action === 'START_EXTRACTION') {
    const lead = extractLead();
    
    // Send to background
    chrome.runtime.sendMessage({ type: 'SAVE_LEAD', payload: lead }, (response: any) => {
      console.log('Saved:', response);
    });
    
    sendResponse({ status: 'started' });
  }
});
