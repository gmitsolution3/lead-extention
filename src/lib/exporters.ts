import type { Lead } from '@/types/lead';

export function generateCsv(leads: Lead[]): string {
  const rows = leads.map((l) =>
    [l.source, l.name, l.phone, l.email, l.website, l.address ?? '', l.facebook ?? '']
      .map((v) => `"${(v || '').replace(/"/g, '""')}"`)
      .join(',')
  );
  // \uFEFF is UTF-8 Byte Order Mark for proper rendering in Excel
  return '\uFEFF' + ['Source,Name,Phone,Email,Website,Address,Facebook', ...rows].join('\r\n');
}

export function generateXml(leads: Lead[]): string {
  const x = (s: string) =>
    (s || '').replace(/[<>&'"]/g, (c) =>
      ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c] ?? c)
    );
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<leads>\n';
  for (const l of leads) {
    xml += `  <lead>\n    <source>${x(l.source)}</source>\n    <name>${x(l.name)}</name>\n`;
    xml += `    <phone>${x(l.phone)}</phone>\n    <email>${x(l.email)}</email>\n`;
    xml += `    <website>${x(l.website)}</website>\n    <address>${x(l.address ?? '')}</address>\n`;
    xml += `    <facebook>${x(l.facebook ?? '')}</facebook>\n`;
    xml += `  </lead>\n`;
  }
  xml += '</leads>';
  return xml;
}

export function exportCsv(leads: Lead[], callback?: () => void): boolean {
  if (!leads.length) return false;
  const csv = generateCsv(leads);
  chrome.downloads.download(
    {
      url: 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv),
      filename: `leads_${Date.now()}.csv`,
      saveAs: true,
    },
    () => callback?.()
  );
  return true;
}

export function exportXml(leads: Lead[], callback?: () => void): boolean {
  if (!leads.length) return false;
  const xml = generateXml(leads);
  chrome.downloads.download(
    {
      url: 'data:application/xml;charset=utf-8,' + encodeURIComponent(xml),
      filename: `leads_${Date.now()}.xml`,
      saveAs: true,
    },
    () => callback?.()
  );
  return true;
}
