import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { SearchGroup, Status, ExtractionStatusResponse } from '@/types/lead';
import { sendMessageWithRetry } from '@/lib/messaging';

export type ActiveView =
  | { name: 'HOME' }
  | { name: 'GROUP_DETAIL'; groupId: string };

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
  const [searchGroups, setSearchGroups] = useState<SearchGroup[]>([]);
  const [currentView, setCurrentView] = useState<ActiveView>({ name: 'HOME' });
  const [platform, setPlatform] = useState('Unknown');
  const [tabId, setTabId] = useState<number | null>(null);

  const pendingGroupQueryRef = useRef<string>('');

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
          pendingGroupQueryRef.current = res.activeQuery.trim();
        }
        if (res.activeTabId) {
          setTabId(res.activeTabId);
        }
      }
    });
  }, []);

  // ── Helper to update search groups & handle view sync ─────────────────────
  const updateGroups = useCallback((groups: SearchGroup[]) => {
    setSearchGroups(groups);

    // Auto-navigate to newly started search group
    if (pendingGroupQueryRef.current) {
      const match = groups.find(
        (g) => g.query.trim().toLowerCase() === pendingGroupQueryRef.current.toLowerCase()
      );
      if (match) {
        setCurrentView({ name: 'GROUP_DETAIL', groupId: match.id });
        pendingGroupQueryRef.current = '';
      }
    }

    // Deletion safety: if viewed group no longer exists, return to Home
    setCurrentView((prev) => {
      if (prev.name === 'GROUP_DETAIL') {
        const stillExists = groups.some((g) => g.id === prev.groupId);
        if (!stillExists) {
          return { name: 'HOME' };
        }
      }
      return prev;
    });
  }, []);

  // ── Load stored search groups ─────────────────────────────────────────────
  const refreshSearchGroups = useCallback(() => {
    sendMessageWithRetry({ type: 'GET_SEARCH_GROUPS' }, (res) => {
      if (res?.searchGroups) {
        updateGroups(res.searchGroups);
      }
    });
  }, [updateGroups]);

  useEffect(() => {
    refreshSearchGroups();
  }, [refreshSearchGroups]);

  // ── Poll while extracting to reflect real-time lead counts ────────────────
  useEffect(() => {
    if (status !== 'extracting') return;
    const id = setInterval(refreshSearchGroups, 1500);
    return () => clearInterval(id);
  }, [status, refreshSearchGroups]);

  // ── Listen for messages from background/content ───────────────────────────
  useEffect(() => {
    const handler = (msg: any) => {
      if (msg.type === 'EXTRACTION_DONE') {
        setStatus('done');
        refreshSearchGroups();
      }
      if (msg.type === 'EXTRACTION_ERROR') {
        setStatus('error');
        setErrorMsg(msg.message || 'Something went wrong.');
      }
      if (msg.type === 'SEARCH_GROUPS_UPDATED') {
        if (msg.searchGroups) {
          updateGroups(msg.searchGroups);
        } else {
          refreshSearchGroups();
        }
      }
      if (msg.type === 'LEADS_UPDATED') {
        refreshSearchGroups();
      }
    };
    chrome.runtime.onMessage.addListener(handler);
    return () => chrome.runtime.onMessage.removeListener(handler);
  }, [refreshSearchGroups, updateGroups]);

  // ── Navigation Handlers ───────────────────────────────────────────────────
  const openGroup = useCallback((groupId: string) => {
    setCurrentView({ name: 'GROUP_DETAIL', groupId });
  }, []);

  const goBack = useCallback(() => {
    setCurrentView({ name: 'HOME' });
  }, []);

  // ── Start extraction (Auto-route to Search Detail View) ───────────────────
  const handleStart = () => {
    if (!query.trim()) return;
    const trimmed = query.trim();
    setStatus('extracting');
    setErrorMsg('');
    pendingGroupQueryRef.current = trimmed;

    // If matching group already exists, immediately switch view
    const existing = searchGroups.find(
      (g) => g.query.trim().toLowerCase() === trimmed.toLowerCase()
    );
    if (existing) {
      setCurrentView({ name: 'GROUP_DETAIL', groupId: existing.id });
      pendingGroupQueryRef.current = '';
    }

    const sendStartCmd = (targetTabId: number) => {
      sendMessageWithRetry(
        { type: 'START_SEARCH', query: trimmed, tabId: targetTabId },
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

  // ── Delete single lead from group ────────────────────────────────────────
  const handleDeleteLead = (groupId: string, leadId: string) => {
    sendMessageWithRetry({ type: 'DELETE_LEAD', groupId, leadId }, (res) => {
      if (res?.searchGroups) {
        updateGroups(res.searchGroups);
      } else {
        refreshSearchGroups();
      }
    });
  };

  // ── Delete search group (with immediate back routing) ─────────────────────
  const handleDeleteSearchGroup = (groupId: string) => {
    if (currentView.name === 'GROUP_DETAIL' && currentView.groupId === groupId) {
      goBack();
    }
    sendMessageWithRetry({ type: 'DELETE_SEARCH_GROUP', groupId }, (res) => {
      if (res?.searchGroups) {
        updateGroups(res.searchGroups);
      } else {
        refreshSearchGroups();
      }
    });
  };

  // ── Export group leads ───────────────────────────────────────────────────
  const handleExportGroupCSV = (group: SearchGroup) => {
    sendMessageWithRetry({
      type: 'EXPORT_GROUP_CSV',
      leads: group.leads,
      queryName: group.query,
    });
  };

  const handleExportGroupXML = (group: SearchGroup) => {
    sendMessageWithRetry({
      type: 'EXPORT_GROUP_XML',
      leads: group.leads,
      queryName: group.query,
    });
  };

  const isExtracting = status === 'extracting';
  const platformColor =
    platform === 'Google Maps'
      ? '#34a853'
      : platform === 'Facebook'
      ? '#1877f2'
      : platform === 'LinkedIn'
      ? '#0a66c2'
      : '#6b7280';

  const totalLeadsCount = useMemo(
    () => searchGroups.reduce((acc, g) => acc + g.leads.length, 0),
    [searchGroups]
  );

  const activeGroupLeadsCount = useMemo(() => {
    if (!query.trim()) return totalLeadsCount;
    const match = searchGroups.find(
      (g) => g.query.trim().toLowerCase() === query.trim().toLowerCase()
    );
    return match ? match.leads.length : 0;
  }, [searchGroups, query, totalLeadsCount]);

  return {
    status,
    errorMsg,
    query,
    setQuery,
    searchGroups,
    currentView,
    openGroup,
    goBack,
    platform,
    platformColor,
    tabId,
    isExtracting,
    totalLeadsCount,
    activeGroupLeadsCount,
    handleStart,
    handleStop,
    handleDeleteLead,
    handleDeleteSearchGroup,
    handleExportGroupCSV,
    handleExportGroupXML,
    refreshSearchGroups,
  };
}
