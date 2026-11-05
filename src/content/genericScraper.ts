import type { Lead } from '@/types/lead';
import { generateLeadId } from '@/types/lead';
import { EMAIL_REGEX, PHONE_REGEX, saveLead } from './domUtils';

export async function scrapeGenericPage(): Promise<void> {
  console.log('[LeadScraper] Generic scraper on:', window.location.href);
  const pageText = document.body?.textContent || document.documentElement?.textContent || '';
  const title = document.title || document.querySelector('h1')?.textContent || '';
  const emails = Array.from(new Set(pageText.match(EMAIL_REGEX) || [])).filter(
    (e) => !e.endsWith('.png') && !e.endsWith('.jpg') && !e.endsWith('.svg')
  );
  const phones = Array.from(new Set(pageText.match(PHONE_REGEX) || [])).filter(
    (p) => p.replace(/\D/g, '').length >= 7 && p.replace(/\D/g, '').length <= 15
  );
  let source = 'Web Page';
  if (window.location.hostname.includes('facebook.com')) source = 'Facebook';
  if (window.location.hostname.includes('linkedin.com')) source = 'LinkedIn';
  const lead: Lead = {
    id: generateLeadId(),
    source,
    name: title.trim().substring(0, 100),
    phone: phones[0] || '',
    email: emails[0] || '',
    website: window.location.href,
    address: '',
  };
  if (lead.name && (lead.phone || lead.email)) saveLead(lead);
}
