console.log('Background script running');

chrome.runtime.onMessage.addListener((request: any, sender: any, sendResponse: any) => {
  if (request.type === 'SAVE_LEAD') {
    console.log('Lead received in background:', request.payload);
    // In the future, send this to Next.js API
    sendResponse({ status: 'success' });
  }
});
