import type { Lead, ExtractionStatus } from '@/types/lead';
import { DEFAULT_EXTRACTION_STATUS } from '@/types/lead';
import { normalizeUrl, extractFacebook } from '@/lib/url';
import { enrichLeadEmail } from './enrichment';

export let saveQueue: Promise<any> = Promise.resolve();

export function enqueueTask<T>(task: () => Promise<T>): Promise<T> {
  const nextPromise = saveQueue.then(task, task);
  saveQueue = nextPromise.catch(() => ({} as any));
  return nextPromise;
}

export const getLeads = (): Promise<Lead[]> =>
  new Promise((r) =>
    chrome.storage.local.get(['leads'], (d) => r(((d.leads as Lead[]) || [])))
  );

export const saveLeads = (leads: Lead[]): Promise<void> =>
  new Promise((r) => chrome.storage.local.set({ leads }, r));

export const clearLeads = (): Promise<void> => {
  return enqueueTask(async () => {
    await new Promise<void>((r) => chrome.storage.local.remove('leads', r));
  });
};

export const getExtractionStatus = (): Promise<ExtractionStatus> =>
  new Promise((r) =>
    chrome.storage.local.get(['extractionStatus'], (d) =>
      r((d.extractionStatus as ExtractionStatus) || DEFAULT_EXTRACTION_STATUS)
    )
  );

export const setExtractionStatus = async (
  partial: Partial<ExtractionStatus>
): Promise<ExtractionStatus> => {
  const current = await getExtractionStatus();
  const next: ExtractionStatus = { ...current, ...partial };
  await new Promise<void>((r) =>
    chrome.storage.local.set({ extractionStatus: next }, () => r())
  );
  return next;
};

export function extractPhoneDigits(phone: string): string {
  return (phone || '').replace(/\D/g, '');
}

export function findDuplicateIndex(candidate: Lead, existingLeads: Lead[]): number {
  const normName = (candidate.name || '').trim().toLowerCase();
  const candDigits = extractPhoneDigits(candidate.phone || '');
  const normWeb = (candidate.website || '').trim().toLowerCase();
  const normAddr = (candidate.address || '').trim().toLowerCase();
  const cleanCandWeb = normalizeUrl(candidate.website || '');
  const cleanCandFb = normalizeUrl(candidate.facebook || '');

  return existingLeads.findIndex((l) => {
    // a) Phone match: digits length >= 7 and identical
    const exDigits = extractPhoneDigits(l.phone || '');
    if (candDigits.length >= 7 && exDigits.length >= 7 && candDigits === exDigits) {
      return true;
    }

    // b) Facebook match: both have non-empty Facebook URLs (length > 12) and are identical
    const cleanExFb = normalizeUrl(l.facebook || '');
    if (cleanCandFb.length > 12 && cleanExFb.length > 12 && cleanCandFb === cleanExFb) {
      return true;
    }

    const exNormName = (l.name || '').trim().toLowerCase();
    const sameName = normName === exNormName && normName.length > 0;

    if (sameName) {
      // c) Name + Website match: exact normalized name AND normalized website matches (length > 10 / length > 6)
      const exNormWeb = (l.website || '').trim().toLowerCase();
      if (normWeb.length > 10 && exNormWeb.length > 10 && normWeb === exNormWeb) {
        return true;
      }
      const cleanExWeb = normalizeUrl(l.website || '');
      if (cleanCandWeb.length > 6 && cleanExWeb.length > 6 && cleanCandWeb === cleanExWeb) {
        return true;
      }

      // d) Name + Facebook match
      if (cleanCandFb.length > 12 && cleanExFb.length > 12 && cleanCandFb === cleanExFb) {
        return true;
      }

      // e) Name + Address match: exact normalized name AND normalized street address matches (length > 15)
      const exNormAddr = (l.address || '').trim().toLowerCase();
      if (normAddr.length > 15 && exNormAddr.length > 15 && normAddr === exNormAddr) {
        return true;
      }
    }

    return false;
  });
}

export function isDuplicateLead(candidate: Lead, existingLeads: Lead[]): boolean {
  return findDuplicateIndex(candidate, existingLeads) !== -1;
}

export function enqueueSaveLead(newLead: Lead): Promise<{ status: string; count: number }> {
  const task = async () => {
    if (!newLead || !newLead.name) {
      const current = await getLeads();
      return { status: 'ignored', count: current.length };
    }

    const leads = await getLeads();
    const dupIndex = findDuplicateIndex(newLead, leads);

    if (dupIndex !== -1) {
      const existing = leads[dupIndex];
      let changed = false;
      let websiteNewlyFilled = false;

      // Fill ONLY empty fields of the stored lead from the new one; never overwrite non-empty values
      if (!existing.phone && newLead.phone) {
        existing.phone = newLead.phone;
        changed = true;
      }
      if (!existing.email && newLead.email) {
        existing.email = newLead.email;
        changed = true;
      }
      if (!existing.website && newLead.website) {
        const isFb = Boolean(extractFacebook(newLead.website));
        if (isFb) {
          if (!existing.facebook) {
            existing.facebook = newLead.website;
            changed = true;
          }
        } else {
          existing.website = newLead.website;
          changed = true;
          websiteNewlyFilled = true;
        }
      }
      if (!existing.address && newLead.address) {
        existing.address = newLead.address;
        changed = true;
      }
      if (!existing.facebook && newLead.facebook) {
        existing.facebook = newLead.facebook;
        changed = true;
      }

      if (changed) {
        await saveLeads(leads);
        chrome.runtime.sendMessage({ type: 'LEADS_UPDATED', leads }, () => {
          if (chrome.runtime.lastError) {
            /* ignore popup closed cleanly */
          }
        });

        // If a website was newly filled and email is empty, call enrichLeadEmail(...)
        if (websiteNewlyFilled && !existing.email) {
          enrichLeadEmail(existing).catch(() => {});
        }

        return { status: 'merged', count: leads.length };
      }

      return { status: 'duplicate', count: leads.length };
    }

    leads.push(newLead);
    await saveLeads(leads);

    // Asynchronously enrich email if website is present and email is missing
    if (newLead.website && !extractFacebook(newLead.website) && !newLead.email) {
      enrichLeadEmail(newLead).catch(() => {});
    }

    return { status: 'ok', count: leads.length };
  };

  return enqueueTask(task);
}
