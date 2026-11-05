import type { Lead, SearchGroup, KnownLeads, ExtractionStatus } from '@/types/lead';
import { DEFAULT_EXTRACTION_STATUS, generateLeadId } from '@/types/lead';
import { normalizeUrl, extractFacebook } from '@/lib/url';
import { enrichLeadEmail } from './enrichment';

export let saveQueue: Promise<any> = Promise.resolve();

export function enqueueTask<T>(task: () => Promise<T>): Promise<T> {
  const nextPromise = saveQueue.then(task, task);
  saveQueue = nextPromise.catch(() => ({} as any));
  return nextPromise;
}

export const getSearchGroups = (): Promise<SearchGroup[]> =>
  new Promise((resolve) => {
    chrome.storage.local.get(['searchGroups', 'leads'], async (d) => {
      let groups = (d.searchGroups as SearchGroup[]) || [];
      if (!Array.isArray(groups)) groups = [];

      // Automatic Migration from legacy flat leads
      if (groups.length === 0 && d.leads && Array.isArray(d.leads) && d.leads.length > 0) {
        const legacyLeads = d.leads as any[];
        const migratedGroup: SearchGroup = {
          id: 'legacy-default',
          query: 'Previous Leads',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          leads: legacyLeads.map((l, i) => ({
            ...l,
            id: l.id || `legacy-${i}-${Date.now()}`,
          })),
        };
        groups = [migratedGroup];
        await saveSearchGroups(groups);
      }
      resolve(groups);
    });
  });

export const saveSearchGroups = (searchGroups: SearchGroup[]): Promise<void> =>
  new Promise((r) => chrome.storage.local.set({ searchGroups }, r));

export const getLeads = async (): Promise<Lead[]> => {
  const groups = await getSearchGroups();
  return groups.flatMap((g) => g.leads);
};

export const saveLeads = async (leads: Lead[]): Promise<void> => {
  const groups = await getSearchGroups();
  if (groups.length > 0) {
    groups[0].leads = leads;
    groups[0].updatedAt = Date.now();
    await saveSearchGroups(groups);
  } else {
    await saveSearchGroups([
      {
        id: 'default',
        query: 'Direct Extraction',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        leads: leads.map((l) => ({ ...l, id: l.id || generateLeadId() })),
      },
    ]);
  }
};

export const clearSearchGroups = (): Promise<void> => {
  return enqueueTask(async () => {
    await new Promise<void>((r) => chrome.storage.local.remove(['searchGroups', 'leads'], r));
  });
};

export const clearLeads = clearSearchGroups;

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

export async function getKnownLeadsForQuery(query: string): Promise<KnownLeads> {
  const groups = await getSearchGroups();
  const existingGroup = groups.find(
    (g) => g.query.trim().toLowerCase() === (query || '').trim().toLowerCase()
  );
  if (!existingGroup) {
    return { phoneDigits: [], normalizedNames: [], websites: [] };
  }
  const phoneDigits = Array.from(
    new Set(
      existingGroup.leads
        .map((l) => extractPhoneDigits(l.phone || ''))
        .filter((d) => d.length >= 7)
    )
  );
  const normalizedNames = Array.from(
    new Set(
      existingGroup.leads
        .map((l) => (l.name || '').toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, ''))
        .filter((n) => n.length > 0)
    )
  );
  const websites = Array.from(
    new Set(
      existingGroup.leads
        .flatMap((l) => [normalizeUrl(l.website || ''), normalizeUrl(l.facebook || '')])
        .filter((w) => w.length > 6)
    )
  );
  return { phoneDigits, normalizedNames, websites };
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

export function deleteLead(groupId: string, leadId: string): Promise<SearchGroup[]> {
  return enqueueTask(async () => {
    const groups = await getSearchGroups();
    const targetGroup = groups.find((g) => g.id === groupId);
    if (targetGroup) {
      targetGroup.leads = targetGroup.leads.filter((l) => l.id !== leadId);
      targetGroup.updatedAt = Date.now();
      await saveSearchGroups(groups);
      chrome.runtime.sendMessage({ type: 'SEARCH_GROUPS_UPDATED', searchGroups: groups }, () => {
        if (chrome.runtime.lastError) {
          /* ignore */
        }
      });
      chrome.runtime.sendMessage({ type: 'LEADS_UPDATED', leads: groups.flatMap((g) => g.leads) }, () => {
        if (chrome.runtime.lastError) {
          /* ignore */
        }
      });
    }
    return groups;
  });
}

export function deleteSearchGroup(groupId: string): Promise<SearchGroup[]> {
  return enqueueTask(async () => {
    let groups = await getSearchGroups();
    groups = groups.filter((g) => g.id !== groupId);
    await saveSearchGroups(groups);
    chrome.runtime.sendMessage({ type: 'SEARCH_GROUPS_UPDATED', searchGroups: groups }, () => {
      if (chrome.runtime.lastError) {
        /* ignore */
      }
    });
    chrome.runtime.sendMessage({ type: 'LEADS_UPDATED', leads: groups.flatMap((g) => g.leads) }, () => {
      if (chrome.runtime.lastError) {
        /* ignore */
      }
    });
    return groups;
  });
}

export function enqueueSaveLead(newLead: Lead): Promise<{ status: string; count: number }> {
  const task = async () => {
    if (!newLead || !newLead.name) {
      const current = await getSearchGroups();
      const total = current.reduce((acc, g) => acc + g.leads.length, 0);
      return { status: 'ignored', count: total };
    }

    // 1. Assign ID if missing
    if (!newLead.id) {
      newLead.id = generateLeadId();
    }

    // 2. Determine active query
    const status = await getExtractionStatus();
    const activeQuery = (status.activeQuery || newLead.searchQuery || '').trim() || 'Direct Extraction';
    newLead.searchQuery = activeQuery;

    // 3. Locate or create target SearchGroup
    const groups = await getSearchGroups();
    let group = groups.find((g) => g.query.trim().toLowerCase() === activeQuery.toLowerCase());

    if (!group) {
      group = {
        id: `group-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        query: activeQuery,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        leads: [],
      };
      groups.unshift(group);
    } else {
      group.updatedAt = Date.now();
    }

    // 4. Duplicate detection and merging strictly within this group
    const dupIndex = findDuplicateIndex(newLead, group.leads);

    if (dupIndex !== -1) {
      const existing = group.leads[dupIndex];
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
        group.updatedAt = Date.now();
        await saveSearchGroups(groups);
        chrome.runtime.sendMessage({ type: 'SEARCH_GROUPS_UPDATED', searchGroups: groups }, () => {
          if (chrome.runtime.lastError) {
            /* ignore popup closed cleanly */
          }
        });
        chrome.runtime.sendMessage({ type: 'LEADS_UPDATED', leads: groups.flatMap((g) => g.leads) }, () => {
          if (chrome.runtime.lastError) {
            /* ignore popup closed cleanly */
          }
        });

        // If a website was newly filled and email is empty, call enrichLeadEmail(...)
        if (websiteNewlyFilled && !existing.email) {
          enrichLeadEmail(existing).catch(() => {});
        }

        return { status: 'merged', count: group.leads.length };
      }

      return { status: 'duplicate', count: group.leads.length };
    }

    group.leads.push(newLead);
    group.updatedAt = Date.now();
    await saveSearchGroups(groups);

    chrome.runtime.sendMessage({ type: 'SEARCH_GROUPS_UPDATED', searchGroups: groups }, () => {
      if (chrome.runtime.lastError) {
        /* ignore */
      }
    });
    chrome.runtime.sendMessage({ type: 'LEADS_UPDATED', leads: groups.flatMap((g) => g.leads) }, () => {
      if (chrome.runtime.lastError) {
        /* ignore */
      }
    });

    // Asynchronously enrich email if website is present and email is missing
    if (newLead.website && !extractFacebook(newLead.website) && !newLead.email) {
      enrichLeadEmail(newLead).catch(() => {});
    }

    return { status: 'ok', count: group.leads.length };
  };

  return enqueueTask(task);
}
