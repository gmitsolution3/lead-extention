import { Trash2, Filter, X, Search } from 'lucide-react';
import type { Lead } from '@/types/lead';
import { LeadCard } from './LeadCard';

interface LeadsListProps {
  leads: Lead[];
  filteredLeads: Lead[];
  noWebsiteCount: number;
  filterNoWebsiteOnly: boolean;
  setFilterNoWebsiteOnly: (val: boolean | ((prev: boolean) => boolean)) => void;
  filterText: string;
  setFilterText: (text: string) => void;
  handleClear: () => void;
  isExtracting: boolean;
  onSelectLead?: (lead: Lead) => void;
}

export function LeadsList({
  leads,
  filteredLeads,
  noWebsiteCount,
  filterNoWebsiteOnly,
  setFilterNoWebsiteOnly,
  filterText,
  setFilterText,
  handleClear,
  isExtracting,
  onSelectLead,
}: LeadsListProps) {
  return (
    <div className="flex-1 flex flex-col px-5 pt-3 pb-3 overflow-hidden">
      {/* Results Header Bar */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold tracking-wider text-zinc-400 uppercase">
            Results ({filteredLeads.length}
            {filteredLeads.length !== leads.length ? ` / ${leads.length}` : ''})
          </span>
          {noWebsiteCount > 0 && (
            <button
              onClick={() => setFilterNoWebsiteOnly(!filterNoWebsiteOnly)}
              className={`text-[11px] px-2.5 py-0.5 rounded-lg transition-all duration-150 ${
                filterNoWebsiteOnly
                  ? 'bg-brand text-black font-semibold shadow-sm'
                  : 'bg-surface-alt border border-zinc-800 text-zinc-400 hover:text-zinc-200'
              }`}
              title="Filter leads without websites"
            >
              No Website ({noWebsiteCount})
            </button>
          )}
        </div>
        <button
          onClick={handleClear}
          disabled={leads.length === 0 || isExtracting}
          className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-rose-400 disabled:opacity-30 disabled:cursor-not-allowed transition duration-150"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Clear
        </button>
      </div>

      {/* Compact Matte Filter Input */}
      {leads.length > 0 && (
        <div className="relative mb-2.5">
          <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
          <input
            type="text"
            placeholder="Filter leads by name, phone, or 'no website'..."
            className="w-full h-8 rounded-lg bg-input border border-zinc-800/80 pl-8 pr-7 text-xs text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-brand/60 focus:ring-1 focus:ring-brand/40 transition duration-150"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
          />
          {filterText && (
            <button
              onClick={() => setFilterText('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-100 transition"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Styled Leads Scroll Area */}
      <div className="flex-1 overflow-y-auto flex flex-col gap-2.5 pr-0.5 min-h-0 max-h-[220px]">
        {leads.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-zinc-500 text-sm gap-2.5 py-8">
            <div className="h-10 w-10 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center">
              <Search className="h-5 w-5 text-zinc-600" />
            </div>
            <span className="text-xs text-zinc-500">No leads yet. Start an extraction above.</span>
          </div>
        ) : filteredLeads.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-zinc-500 text-xs gap-1.5 py-8">
            <span className="text-zinc-400 font-medium">No matches found</span>
            <span className="text-[11px] text-zinc-600">Try adjusting your filter search query.</span>
          </div>
        ) : (
          filteredLeads.map((lead, i) => (
            <LeadCard
              key={i}
              lead={lead}
              onClick={() => onSelectLead?.(lead)}
            />
          ))
        )}
      </div>
    </div>
  );
}
