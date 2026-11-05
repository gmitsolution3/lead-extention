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

export function sanitizeQueryForFilename(queryName?: string): string {
  if (!queryName) return 'all';
  const clean = queryName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 30);
  return clean || 'search';
}

export function exportCsv(
  leads: Lead[],
  queryNameOrCallback?: string | (() => void),
  callback?: () => void
): boolean {
  if (!leads.length) return false;
  const queryName = typeof queryNameOrCallback === 'string' ? queryNameOrCallback : undefined;
  const cb = typeof queryNameOrCallback === 'function' ? queryNameOrCallback : callback;
  const csv = generateCsv(leads);
  const cleanName = sanitizeQueryForFilename(queryName);
  const filename = `leads_${cleanName}_${Date.now()}.csv`;

  chrome.downloads.download(
    {
      url: 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv),
      filename,
      saveAs: true,
    },
    () => cb?.()
  );
  return true;
}

export function exportXml(
  leads: Lead[],
  queryNameOrCallback?: string | (() => void),
  callback?: () => void
): boolean {
  if (!leads.length) return false;
  const queryName = typeof queryNameOrCallback === 'string' ? queryNameOrCallback : undefined;
  const cb = typeof queryNameOrCallback === 'function' ? queryNameOrCallback : callback;
  const xml = generateXml(leads);
  const cleanName = sanitizeQueryForFilename(queryName);
  const filename = `leads_${cleanName}_${Date.now()}.xml`;

  chrome.downloads.download(
    {
      url: 'data:application/xml;charset=utf-8,' + encodeURIComponent(xml),
      filename,
      saveAs: true,
    },
    () => cb?.()
  );
  return true;
}
