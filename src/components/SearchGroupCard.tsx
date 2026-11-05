import { useState, useMemo } from 'react';
import { ChevronDown, Trash2, Search, X, Download } from 'lucide-react';
import type { Lead, SearchGroup } from '@/types/lead';
import { LeadCard } from './LeadCard';

interface SearchGroupCardProps {
  group: SearchGroup;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onDeleteGroup: (groupId: string) => void;
  onDeleteLead: (groupId: string, leadId: string) => void;
  onExportCSV: (group: SearchGroup) => void;
  onExportXML: (group: SearchGroup) => void;
  onSelectLead: (lead: Lead) => void;
}

function formatDate(timestamp: number): string {
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

export function SearchGroupCard({
  group,
  isExpanded,
  onToggleExpand,
  onDeleteGroup,
  onDeleteLead,
  onExportCSV,
  onExportXML,
  onSelectLead,
}: SearchGroupCardProps) {
  const [localFilterText, setLocalFilterText] = useState('');
  const [filterNoWebsiteOnly, setFilterNoWebsiteOnly] = useState(false);

  const noWebsiteCount = useMemo(
    () => group.leads.filter((l) => !l.website).length,
    [group.leads]
  );

  const filteredLeads = useMemo(() => {
    const term = localFilterText.toLowerCase().trim();
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
  }, [group.leads, localFilterText, filterNoWebsiteOnly]);

  const handleDeleteGroup = (e: React.MouseEvent) => {
    e.stopPropagation();
    const confirmed = window.confirm(
      `Delete search group "${group.query}" and its ${group.leads.length} lead${
        group.leads.length !== 1 ? 's' : ''
      }?`
    );
    if (confirmed) {
      onDeleteGroup(group.id);
    }
  };

  const handleDeleteLead = (leadId: string) => {
    onDeleteLead(group.id, leadId);
  };

  return (
    <div className="rounded-2xl border border-zinc-800/80 bg-surface/90 overflow-hidden transition-all duration-200 shadow-xs">
      {/* Accordion Header */}
      <div
        onClick={onToggleExpand}
        className="flex items-center justify-between p-3.5 cursor-pointer hover:bg-surface-hover/70 transition-colors select-none gap-2"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="font-semibold text-zinc-100 text-sm truncate leading-tight">
            {group.query || 'Direct Extraction'}
          </div>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 border border-zinc-700/50 shrink-0">
            {group.leads.length} {group.leads.length === 1 ? 'lead' : 'leads'}
          </span>
          <span className="text-[10px] text-zinc-500 shrink-0">
            {formatDate(group.createdAt)}
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={handleDeleteGroup}
            className="p-1.5 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors duration-150"
            title="Delete this search group"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          <div className="p-1 text-zinc-400">
            <ChevronDown
              className={`h-4 w-4 transition-transform duration-200 ${
                isExpanded ? 'rotate-180 text-brand' : ''
              }`}
            />
          </div>
        </div>
      </div>

      {/* Expanded Accordion Body */}
      {isExpanded && (
        <div className="px-3 pb-3 pt-2 border-t border-zinc-800/60 flex flex-col gap-2.5">
          {/* Local Filter Bar */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
              <input
                type="text"
                placeholder="Filter by name, phone, address..."
                className="w-full h-8 rounded-lg bg-input border border-zinc-800/80 pl-8 pr-7 text-xs text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-brand/60 focus:ring-1 focus:ring-brand/40 transition duration-150"
                value={localFilterText}
                onChange={(e) => setLocalFilterText(e.target.value)}
              />
              {localFilterText && (
                <button
                  type="button"
                  onClick={() => setLocalFilterText('')}
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

          {/* Group Leads List */}
          <div className="max-h-[240px] overflow-y-auto flex flex-col gap-2 pr-0.5">
            {group.leads.length === 0 ? (
              <div className="py-6 text-center text-xs text-zinc-500">
                No leads collected for this search yet.
              </div>
            ) : filteredLeads.length === 0 ? (
              <div className="py-6 text-center text-xs text-zinc-500">
                No leads match your filter.
              </div>
            ) : (
              filteredLeads.map((lead) => (
                <LeadCard
                  key={lead.id}
                  lead={lead}
                  onClick={() => onSelectLead(lead)}
                  onDelete={handleDeleteLead}
                />
              ))
            )}
          </div>

          {/* Group Export Actions Bar */}
          <div className="flex items-center gap-2 pt-1 border-t border-zinc-800/40">
            <button
              type="button"
              onClick={() => onExportCSV(group)}
              disabled={group.leads.length === 0}
              className="flex-1 h-8 rounded-lg bg-surface-alt hover:bg-zinc-800 border border-zinc-800 text-xs text-zinc-300 hover:text-white font-medium flex items-center justify-center gap-1.5 transition-all duration-150 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <Download className="h-3.5 w-3.5 text-brand" />
              <span>Export CSV</span>
            </button>
            <button
              type="button"
              onClick={() => onExportXML(group)}
              disabled={group.leads.length === 0}
              className="flex-1 h-8 rounded-lg bg-surface-alt hover:bg-zinc-800 border border-zinc-800 text-xs text-zinc-300 hover:text-white font-medium flex items-center justify-center gap-1.5 transition-all duration-150 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <Download className="h-3.5 w-3.5 text-zinc-400" />
              <span>Export XML</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
