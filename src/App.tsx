import { useState } from 'react';
import { Search, Trash2, ChevronRight } from 'lucide-react';
import { useExtraction } from '@/hooks/useExtraction';
import { Header } from '@/components/Header';
import { SearchControls } from '@/components/SearchControls';
import { SearchDetailView } from '@/components/SearchDetailView';
import { LeadDetailModal } from '@/components/LeadDetailModal';
import type { Lead } from '@/types/lead';

function formatRelativeTime(timestamp: number): string {
  if (!timestamp) return '';
  const d = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function App() {
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);

  const {
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
    isExtracting,
    totalLeadsCount,
    activeGroupLeadsCount,
    handleStart,
    handleStop,
    handleDeleteLead,
    handleDeleteSearchGroup,
    handleExportGroupCSV,
    handleExportGroupXML,
  } = useExtraction();

  const selectedGroup =
    currentView.name === 'GROUP_DETAIL'
      ? searchGroups.find((g) => g.id === currentView.groupId)
      : null;

  return (
    <div className="w-[420px] min-h-[580px] max-h-[640px] bg-canvas text-zinc-100 font-sans flex flex-col antialiased selection:bg-brand selection:text-black relative overflow-hidden">
      {currentView.name === 'GROUP_DETAIL' && selectedGroup ? (
        /* View 2: Dedicated Search Session Detail View */
        <SearchDetailView
          group={selectedGroup}
          onBack={goBack}
          onDeleteGroup={handleDeleteSearchGroup}
          onDeleteLead={handleDeleteLead}
          onExportCSV={handleExportGroupCSV}
          onExportXML={handleExportGroupXML}
          onSelectLead={setSelectedLead}
        />
      ) : (
        /* View 1: Home View (Search & History Directory) */
        <>
          <Header platform={platform} platformColor={platformColor} />

          <SearchControls
            query={query}
            setQuery={setQuery}
            isExtracting={isExtracting}
            status={status}
            errorMsg={errorMsg}
            leadsCount={isExtracting ? activeGroupLeadsCount : totalLeadsCount}
            handleStart={handleStart}
            handleStop={handleStop}
          />

          {/* Search History Directory Section */}
          <div className="flex-1 flex flex-col px-5 pt-3 pb-3 overflow-hidden min-h-0">
            <div className="flex items-center justify-between mb-2 shrink-0">
              <span className="text-[11px] font-semibold tracking-wider text-zinc-400 uppercase">
                Search History ({searchGroups.length})
              </span>
              {totalLeadsCount > 0 && (
                <span className="text-[11px] text-zinc-500 font-medium">
                  {totalLeadsCount} total {totalLeadsCount === 1 ? 'lead' : 'leads'}
                </span>
              )}
            </div>

            <div className="flex-1 overflow-y-auto flex flex-col gap-2 pr-0.5 min-h-0">
              {searchGroups.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-zinc-500 text-sm gap-2.5 py-12">
                  <div className="h-10 w-10 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center">
                    <Search className="h-5 w-5 text-zinc-600" />
                  </div>
                  <span className="text-xs text-zinc-500 text-center max-w-[240px]">
                    No search history. Run a search above to start collecting leads.
                  </span>
                </div>
              ) : (
                searchGroups.map((group) => (
                  <div
                    key={group.id}
                    onClick={() => openGroup(group.id)}
                    className="rounded-xl border border-zinc-800/80 bg-surface p-3.5 flex items-center justify-between gap-3 cursor-pointer hover:border-brand/50 hover:bg-surface-hover/70 transition-all duration-150 group shadow-xs"
                  >
                    <div className="flex flex-col gap-1 min-w-0 flex-1">
                      <div className="font-semibold text-zinc-100 text-sm leading-tight group-hover:text-white transition truncate">
                        {group.query || 'Direct Extraction'}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 border border-zinc-700/50 shrink-0">
                          {group.leads.length} {group.leads.length === 1 ? 'lead' : 'leads'}
                        </span>
                        <span className="text-[10px] text-zinc-500 shrink-0">
                          {formatRelativeTime(group.createdAt)}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          const confirmed = window.confirm(
                            `Delete search group "${group.query}" and its ${group.leads.length} leads?`
                          );
                          if (confirmed) {
                            handleDeleteSearchGroup(group.id);
                          }
                        }}
                        className="p-1.5 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors duration-150"
                        title="Delete search group"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                      <ChevronRight className="h-4 w-4 text-zinc-500 group-hover:text-brand group-hover:translate-x-0.5 transition-all" />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}

      {/* Global Lead Details Modal */}
      <LeadDetailModal
        lead={selectedLead}
        isOpen={!!selectedLead}
        onClose={() => setSelectedLead(null)}
      />
    </div>
  );
}

export default App;
