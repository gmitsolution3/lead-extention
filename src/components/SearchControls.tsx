import { Search, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import type { Status } from '@/types/lead';

interface SearchControlsProps {
  query: string;
  setQuery: (query: string) => void;
  isExtracting: boolean;
  status: Status;
  errorMsg: string;
  leadsCount: number;
  handleStart: () => void;
  handleStop: () => void;
}

export function SearchControls({
  query,
  setQuery,
  isExtracting,
  status,
  errorMsg,
  leadsCount,
  handleStart,
  handleStop,
}: SearchControlsProps) {
  return (
    <div className="px-5 pt-4 flex flex-col gap-3">
      {/* Matte dark search field */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
        <input
          type="text"
          placeholder="e.g. English medium school Dhaka"
          className="w-full h-11 rounded-xl bg-[#1a1a1c] border border-zinc-800 pl-10 pr-3.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-[#c6f432] focus:ring-1 focus:ring-[#c6f432]/50 disabled:opacity-40 transition-all duration-150"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !isExtracting && query.trim() && handleStart()}
          disabled={isExtracting}
        />
      </div>

      {/* Action buttons */}
      {!isExtracting ? (
        <button
          onClick={handleStart}
          disabled={!query.trim()}
          className="w-full h-11 rounded-xl bg-[#c6f432] text-black font-bold text-sm flex items-center justify-center gap-2 hover:bg-[#b8e82b] active:scale-[0.99] disabled:opacity-35 disabled:cursor-not-allowed disabled:hover:bg-[#c6f432] transition-all duration-150 shadow-md shadow-[#c6f432]/10"
        >
          <Search className="h-4 w-4 stroke-[2.5]" />
          Start Extraction
        </button>
      ) : (
        <button
          onClick={handleStop}
          className="w-full h-11 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 font-semibold text-sm flex items-center justify-center gap-2 hover:bg-rose-500/25 active:scale-[0.99] transition duration-150"
        >
          <Loader2 className="h-4 w-4 animate-spin" />
          Stop Extraction
        </button>
      )}

      {/* Status banners */}
      {status === 'done' && (
        <div className="flex items-center gap-2.5 text-xs text-emerald-300 bg-[#1c1c1e] border border-emerald-500/30 rounded-xl px-3.5 py-2.5 font-medium shadow-xs">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
          <span>Extraction complete — {leadsCount} lead{leadsCount !== 1 ? 's' : ''} found</span>
        </div>
      )}

      {status === 'error' && (
        <div className="flex items-center gap-2.5 text-xs text-rose-300 bg-rose-950/20 border border-rose-800/40 rounded-xl px-3.5 py-2.5 shadow-xs">
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
          <span className="truncate">{errorMsg || 'An error occurred during extraction.'}</span>
        </div>
      )}

      {isExtracting && (
        <div className="flex items-center gap-2.5 text-xs text-[#c6f432] bg-[#1c1c1e] border border-[#c6f432]/25 rounded-xl px-3.5 py-2.5 font-medium shadow-xs">
          <Loader2 className="h-4 w-4 animate-spin shrink-0 text-[#c6f432]" />
          <span>Navigating & Extracting… {leadsCount} lead{leadsCount !== 1 ? 's' : ''} collected</span>
        </div>
      )}
    </div>
  );
}
