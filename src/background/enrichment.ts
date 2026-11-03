import type { Lead } from '@/types/lead';
import { normalizeUrl } from '@/lib/url';
import { getLeads, saveLeads, extractPhoneDigits, enqueueTask } from './storage';

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi;
const IGNORED_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.svg', '.webp', '.gif', '.js', '.css', '.woff', '.woff2'];
const JUNK_PREFIXES = ['sentry', 'noreply', 'no-reply', 'example', 'domain'];

export function extractEmailsFromHtml(html: string): string[] {
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

export async function fetchWithTimeout(url: string, timeoutMs = 5000): Promise<string | null> {
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

export function enqueueUpdateLeadEmail(targetLead: Lead, discoveredEmail: string): Promise<void> {
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

  return enqueueTask(task);
}

export async function enrichLeadEmail(lead: Lead): Promise<void> {
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

