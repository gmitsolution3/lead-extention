import { useState, useEffect, useCallback, useMemo } from 'react';
import type { Lead, Status, ExtractionStatusResponse } from '@/types/lead';
import { sendMessageWithRetry } from '@/lib/messaging';

// Detect which platform is open in the active tab
export function detectPlatform(url: string): string {
  if (url.includes('google.com/maps')) return 'Google Maps';
  if (url.includes('facebook.com')) return 'Facebook';
  if (url.includes('linkedin.com')) return 'LinkedIn';
  return 'Unknown';
}

export function useExtraction() {
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [query, setQuery] = useState('');
  const [leads, setLeads] = useState<Lead[]>([]);
  const [platform, setPlatform] = useState('Unknown');
  const [tabId, setTabId] = useState<number | null>(null);
  const [filterText, setFilterText] = useState('');
  const [filterNoWebsiteOnly, setFilterNoWebsiteOnly] = useState(false);

  // ── Fetch active browser tab info ──────────────────────────────────────────
  useEffect(() => {
    try {
      chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
        if (chrome.runtime.lastError) return;
        const tab = tabs[0];
        if (tab?.url) setPlatform(detectPlatform(tab.url));
        if (tab?.id) setTabId(tab.id);
      });
    } catch {
      /* ignore tab query errors */
    }
  }, []);

  // ── Restore State on Popup Open ───────────────────────────────────────────
  useEffect(() => {
    sendMessageWithRetry({ type: 'GET_EXTRACTION_STATUS' }, (res: ExtractionStatusResponse) => {
      if (res?.isExtracting) {
        setStatus('extracting');
        if (res.activeQuery) {
          setQuery(res.activeQuery);
        }
        if (res.activeTabId) {
          setTabId(res.activeTabId);
        }
      }
    });
  }, []);

  // ── Load stored leads ─────────────────────────────────────────────────────
  const refreshLeads = useCallback(() => {
    sendMessageWithRetry({ type: 'GET_LEADS' }, (res) => {
      if (res?.leads) setLeads(res.leads);
    });
  }, []);

  useEffect(() => {
    refreshLeads();
  }, [refreshLeads]);

  // ── Poll while extracting to reflect real-time lead counts ────────────────
  useEffect(() => {
    if (status !== 'extracting') return;
    const id = setInterval(refreshLeads, 1500);
    return () => clearInterval(id);
  }, [status, refreshLeads]);

  // ── Listen for messages from background/content ───────────────────────────
  useEffect(() => {
    const handler = (msg: any) => {
      if (msg.type === 'EXTRACTION_DONE') {
        setStatus('done');
        refreshLeads();
      }
      if (msg.type === 'EXTRACTION_ERROR') {
        setStatus('error');
        setErrorMsg(msg.message || 'Something went wrong.');
      }
      if (msg.type === 'LEADS_UPDATED') {
        refreshLeads();
      }
    };
    chrome.runtime.onMessage.addListener(handler);
    return () => chrome.runtime.onMessage.removeListener(handler);
  }, [refreshLeads]);

  // ── Start extraction ──────────────────────────────────────────────────────
  const handleStart = () => {
    if (!query.trim()) return;
    setStatus('extracting');
    setErrorMsg('');

    const sendStartCmd = (targetTabId: number) => {
      sendMessageWithRetry(
        { type: 'START_SEARCH', query: query.trim(), tabId: targetTabId },
        (res) => {
          if (!res) {
            setStatus('error');
            setErrorMsg('Could not connect to background service. Please reload the extension.');
          } else if (res?.status === 'error') {
            setStatus('error');
            setErrorMsg(res.message || 'Invalid tab.');
          }
        }
      );
    };

    if (tabId) {
      sendStartCmd(tabId);
    } else {
      chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
        const id = tabs[0]?.id;
        if (id) {
          setTabId(id);
          sendStartCmd(id);
        } else {
          setStatus('error');
          setErrorMsg('No active tab found.');
        }
      });
    }
  };

  // ── Stop extraction ───────────────────────────────────────────────────────
  const handleStop = () => {
    setStatus('idle');
    if (tabId) {
      sendMessageWithRetry({ type: 'STOP_SEARCH', tabId });
    }
  };

  // ── Clear leads with prompt confirmation ──────────────────────────────────
  const handleClear = () => {
    if (leads.length === 0) return;
    const confirmed = window.confirm('Are you sure you want to clear all extracted leads?');
    if (!confirmed) return;

    sendMessageWithRetry({ type: 'CLEAR_LEADS' }, () => {
      setLeads([]);
    });
  };

  // ── Exports ───────────────────────────────────────────────────────────────
  const handleExportCSV = () => {
    sendMessageWithRetry({ type: 'EXPORT_CSV' });
  };

  const handleExportXML = () => {
    sendMessageWithRetry({ type: 'EXPORT_XML' });
  };

  // ── Filtered leads calculation ────────────────────────────────────────────
  const filteredLeads = useMemo(() => {
    const term = filterText.toLowerCase().trim();
    return leads.filter((lead) => {
      if (filterNoWebsiteOnly && lead.website) return false;
      if (!term) return true;
      if (term === 'no website' || term === 'missing website') {
        return !lead.website;
      }
      return (
        (lead.name || '').toLowerCase().includes(term) ||
        (lead.phone || '').toLowerCase().includes(term) ||
        (lead.email || '').toLowerCase().includes(term) ||
        (lead.website || '').toLowerCase().includes(term) ||
        (lead.address || '').toLowerCase().includes(term)
      );
    });
  }, [leads, filterText, filterNoWebsiteOnly]);

  const isExtracting = status === 'extracting';
  const platformColor =
    platform === 'Google Maps'
      ? '#34a853'
      : platform === 'Facebook'
      ? '#1877f2'
      : platform === 'LinkedIn'
      ? '#0a66c2'
      : '#6b7280';

  const noWebsiteCount = useMemo(() => leads.filter((l) => !l.website).length, [leads]);

  return {
    status,
    errorMsg,
    query,
    setQuery,
    leads,
    platform,
    platformColor,
    tabId,
    filterText,
    setFilterText,
    filterNoWebsiteOnly,
    setFilterNoWebsiteOnly,
    filteredLeads,
    noWebsiteCount,
    isExtracting,
    handleStart,
    handleStop,
    handleClear,
    handleExportCSV,
    handleExportXML,
    refreshLeads,
  };
}

