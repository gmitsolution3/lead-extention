import { useState } from 'react';
import { Search } from 'lucide-react';
import { useExtraction } from '@/hooks/useExtraction';
import { Header } from '@/components/Header';
import { SearchControls } from '@/components/SearchControls';
import { SearchGroupCard } from '@/components/SearchGroupCard';
import { LeadDetailModal } from '@/components/LeadDetailModal';
import type { Lead } from '@/types/lead';

function App() {
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);

  const {
    status,
    errorMsg,
    query,
    setQuery,
    searchGroups,
    expandedGroupId,
    toggleExpandGroup,
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

  return (
    <div className="w-[420px] min-h-[580px] max-h-[640px] bg-canvas text-zinc-100 font-sans flex flex-col antialiased selection:bg-brand selection:text-black relative">
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

      {/* Search Groups Accordion List Section */}
      <div className="flex-1 flex flex-col px-5 pt-3 pb-3 overflow-hidden">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-semibold tracking-wider text-zinc-400 uppercase">
            Search History ({searchGroups.length} {searchGroups.length === 1 ? 'group' : 'groups'})
          </span>
          {totalLeadsCount > 0 && (
            <span className="text-[11px] text-zinc-500 font-medium">
              {totalLeadsCount} total {totalLeadsCount === 1 ? 'lead' : 'leads'}
            </span>
          )}
        </div>

        <div className="flex-1 overflow-y-auto flex flex-col gap-2.5 pr-0.5 min-h-0">
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
              <SearchGroupCard
                key={group.id}
                group={group}
                isExpanded={expandedGroupId === group.id}
                onToggleExpand={() => toggleExpandGroup(group.id)}
                onDeleteGroup={handleDeleteSearchGroup}
                onDeleteLead={handleDeleteLead}
                onExportCSV={handleExportGroupCSV}
                onExportXML={handleExportGroupXML}
                onSelectLead={setSelectedLead}
              />
            ))
          )}
        </div>
      </div>

      <LeadDetailModal
        lead={selectedLead}
        isOpen={!!selectedLead}
        onClose={() => setSelectedLead(null)}
      />
    </div>
  );
}

export default App;
