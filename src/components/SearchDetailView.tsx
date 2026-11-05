import { useState, useMemo } from 'react';
import { ArrowLeft, Trash2, Search, X, Download } from 'lucide-react';
import type { Lead, SearchGroup } from '@/types/lead';
import { LeadCard } from './LeadCard';

interface SearchDetailViewProps {
  group: SearchGroup;
  onBack: () => void;
  onDeleteGroup: (groupId: string) => void;
  onDeleteLead: (groupId: string, leadId: string) => void;
  onExportCSV: (group: SearchGroup) => void;
  onExportXML: (group: SearchGroup) => void;
  onSelectLead: (lead: Lead) => void;
}

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

export function SearchDetailView({
  group,
  onBack,
  onDeleteGroup,
  onDeleteLead,
  onExportCSV,
  onExportXML,
  onSelectLead,
}: SearchDetailViewProps) {
  const [filterText, setFilterText] = useState('');
  const [filterNoWebsiteOnly, setFilterNoWebsiteOnly] = useState(false);

  const noWebsiteCount = useMemo(
    () => group.leads.filter((l) => !l.website).length,
    [group.leads]
  );

  const filteredLeads = useMemo(() => {
    const term = filterText.toLowerCase().trim();
    return group.leads.filter((lead) => {
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
  }, [group.leads, filterText, filterNoWebsiteOnly]);

  const handleDeleteGroup = () => {
    const confirmed = window.confirm(
      `Delete search group "${group.query}" and its ${group.leads.length} lead${
        group.leads.length !== 1 ? 's' : ''
      }?`
    );
    if (confirmed) {
      onDeleteGroup(group.id);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-canvas text-zinc-100 overflow-hidden">
      {/* 1. Navigation Header Bar */}
      <div className="px-5 py-3.5 border-b border-zinc-800/80 bg-surface/90 flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <button
            type="button"
            onClick={onBack}
            className="p-1.5 -ml-1 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors shrink-0"
            title="Back to search history"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="font-semibold text-zinc-100 text-sm truncate leading-tight">
            {group.query || 'Direct Extraction'}
          </div>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 border border-zinc-700/50 shrink-0">
            {group.leads.length} {group.leads.length === 1 ? 'lead' : 'leads'}
          </span>
          <span className="text-[10px] text-zinc-500 shrink-0 hidden sm:inline">
            {formatRelativeTime(group.createdAt)}
          </span>
        </div>

        <button
          type="button"
          onClick={handleDeleteGroup}
          className="p-1.5 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors shrink-0"
          title="Delete this entire search session"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {/* 2. Local Filter Bar */}
      <div className="px-5 py-2.5 bg-canvas flex items-center gap-2 shrink-0 border-b border-zinc-800/50">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
          <input
            type="text"
            placeholder="Filter leads by name, phone, address..."
            className="w-full h-8 rounded-lg bg-surface-alt border border-zinc-800 pl-8 pr-7 text-xs text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-brand/60 focus:ring-1 focus:ring-brand/40 transition duration-150"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
          />
          {filterText && (
            <button
              type="button"
              onClick={() => setFilterText('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-100 transition"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {noWebsiteCount > 0 && (
          <button
            type="button"
            onClick={() => setFilterNoWebsiteOnly((prev) => !prev)}
            className={`text-[11px] h-8 px-2.5 rounded-lg transition-all duration-150 shrink-0 font-medium ${
              filterNoWebsiteOnly
                ? 'bg-brand text-black font-semibold shadow-xs'
                : 'bg-surface-alt border border-zinc-800 text-zinc-400 hover:text-zinc-200'
            }`}
            title="Filter leads without websites"
          >
            No Website ({noWebsiteCount})
          </button>
        )}
      </div>

      {/* 3. Scrollable Leads List */}
      <div className="flex-1 min-h-0 overflow-y-auto px-5 py-3 flex flex-col gap-2.5 pr-4">
        {group.leads.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-zinc-500 text-xs py-16 gap-1.5">
            <span className="font-medium text-zinc-400">No leads yet</span>
            <span className="text-[11px] text-zinc-600">
              Extraction in progress or no places found.
            </span>
          </div>
        ) : filteredLeads.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-zinc-500 text-xs py-16 gap-1.5">
            <span className="font-medium text-zinc-400">No matches found</span>
            <span className="text-[11px] text-zinc-600">
              Try adjusting your filter search query.
            </span>
          </div>
        ) : (
          filteredLeads.map((lead) => (
            <LeadCard
              key={lead.id}
              lead={lead}
              onClick={() => onSelectLead(lead)}
              onDelete={(leadId) => onDeleteLead(group.id, leadId)}
            />
          ))
        )}
      </div>

      {/* 4. Fixed Export Footer */}
      <div className="p-3 border-t border-zinc-800/80 bg-surface/90 flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={() => onExportCSV(group)}
          disabled={group.leads.length === 0}
          className="flex-1 h-9 rounded-xl bg-surface-alt hover:bg-zinc-800 border border-zinc-800 text-xs text-zinc-200 hover:text-white font-medium flex items-center justify-center gap-1.5 transition-all duration-150 disabled:opacity-30 disabled:cursor-not-allowed shadow-xs"
        >
          <Download className="h-3.5 w-3.5 text-brand" />
          <span>Export CSV</span>
        </button>
        <button
          type="button"
          onClick={() => onExportXML(group)}
          disabled={group.leads.length === 0}
          className="flex-1 h-9 rounded-xl bg-surface-alt hover:bg-zinc-800 border border-zinc-800 text-xs text-zinc-200 hover:text-white font-medium flex items-center justify-center gap-1.5 transition-all duration-150 disabled:opacity-30 disabled:cursor-not-allowed shadow-xs"
        >
          <Download className="h-3.5 w-3.5 text-zinc-400" />
          <span>Export XML</span>
        </button>
      </div>
    </div>
  );
}

