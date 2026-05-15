export interface Lead {
  source: string;
  name: string;
  phone: string;
  email: string;
  website: string;
  address?: string;
}

let leads: Lead[] = [];

chrome.runtime.onMessage.addListener((request: any, sender: any, sendResponse: any) => {
  if (request.type === 'SAVE_LEAD') {
    leads.push(request.payload);
    console.log('Lead saved:', request.payload);
    sendResponse({ status: 'success', count: leads.length });
  } 
  else if (request.type === 'GET_LEADS') {
    sendResponse({ leads });
  } 
  else if (request.type === 'CLEAR_LEADS') {
    leads = [];
    sendResponse({ status: 'success' });
  }
  else if (request.type === 'EXPORT_CSV') {
    if (leads.length === 0) {
      sendResponse({ status: 'error', message: 'No leads to export' });
      return;
    }

    const headers = ['Source', 'Name', 'Phone', 'Email', 'Website', 'Address'];
    const csvContent = [
      headers.join(','),
      ...leads.map(lead => [
        `"${lead.source || ''}"`,
        `"${(lead.name || '').replace(/"/g, '""')}"`,
        `"${(lead.phone || '').replace(/"/g, '""')}"`,
        `"${(lead.email || '').replace(/"/g, '""')}"`,
        `"${(lead.website || '').replace(/"/g, '""')}"`,
        `"${(lead.address || '').replace(/"/g, '""')}"`
      ].join(','))
    ].join('\n');

    const dataUrl = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csvContent);
    
    chrome.downloads.download({
      url: dataUrl,
      filename: `leads_${new Date().getTime()}.csv`,
      saveAs: true
    }, () => {
      sendResponse({ status: 'success' });
    });

    return true; // Indicates asynchronous response
  }
  else if (request.type === 'EXPORT_XML') {
    if (leads.length === 0) {
      sendResponse({ status: 'error', message: 'No leads to export' });
      return;
    }

    let xmlContent = '<?xml version="1.0" encoding="UTF-8"?>\n<leads>\n';
    leads.forEach(lead => {
      xmlContent += '  <lead>\n';
      xmlContent += `    <source>${escapeXml(lead.source || '')}</source>\n`;
      xmlContent += `    <name>${escapeXml(lead.name || '')}</name>\n`;
      xmlContent += `    <phone>${escapeXml(lead.phone || '')}</phone>\n`;
      xmlContent += `    <email>${escapeXml(lead.email || '')}</email>\n`;
      xmlContent += `    <website>${escapeXml(lead.website || '')}</website>\n`;
      xmlContent += `    <address>${escapeXml(lead.address || '')}</address>\n`;
      xmlContent += '  </lead>\n';
    });
    xmlContent += '</leads>';

    const dataUrl = 'data:application/xml;charset=utf-8,' + encodeURIComponent(xmlContent);
    
    chrome.downloads.download({
      url: dataUrl,
      filename: `leads_${new Date().getTime()}.xml`,
      saveAs: true
    }, () => {
      sendResponse({ status: 'success' });
    });

    return true; // Indicates asynchronous response
  }
});

function escapeXml(unsafe: string) {
  return unsafe.replace(/[<>&'"]/g, function (c) {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}
