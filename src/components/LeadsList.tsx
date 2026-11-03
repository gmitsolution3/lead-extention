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
}: LeadsListProps) {
  return (
    <div className="flex-1 flex flex-col px-5 pt-3 pb-3 overflow-hidden">
      {/* Results Bar */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-300 uppercase tracking-wide">
            Results ({filteredLeads.length}
            {filteredLeads.length !== leads.length ? ` / ${leads.length}` : ''})
          </span>
          {noWebsiteCount > 0 && (
            <button
              onClick={() => setFilterNoWebsiteOnly(!filterNoWebsiteOnly)}
              className={`text-[10px] px-2 py-0.5 rounded-full border transition ${
                filterNoWebsiteOnly
                  ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300 font-semibold'
                  : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-300'
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
          className="flex items-center gap-1 text-xs text-slate-500 hover:text-red-400 disabled:opacity-30 disabled:cursor-not-allowed transition"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Clear
        </button>
      </div>

      {/* Filter Input */}
      {leads.length > 0 && (
        <div className="relative mb-2">
          <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
          <input
            type="text"
            placeholder="Filter leads by name, phone, or 'no website'..."
            className="w-full h-8 rounded-md bg-slate-800/80 border border-slate-700/70 pl-8 pr-7 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
          />
          {filterText && (
            <button
              onClick={() => setFilterText('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Leads Scroll Area */}
      <div className="flex-1 overflow-y-auto flex flex-col gap-2 pr-0.5 min-h-0 max-h-[220px]">
        {leads.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-500 text-sm gap-2 py-8">
            <Search className="h-8 w-8 opacity-30" />
            <span>No leads yet. Start an extraction above.</span>
          </div>
        ) : filteredLeads.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-500 text-xs gap-1 py-8">
            <span>No leads match current filter.</span>
          </div>
        ) : (
          filteredLeads.map((lead, i) => <LeadCard key={i} lead={lead} />)
        )}
      </div>
    </div>
  );
}

