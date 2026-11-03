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
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
        <input
          type="text"
          placeholder="e.g. English medium school Dhaka"
          className="w-full h-10 rounded-lg bg-slate-800 border border-slate-700 pl-9 pr-3 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-40 transition"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !isExtracting && handleStart()}
          disabled={isExtracting}
        />
      </div>

      {/* Action button */}
      {!isExtracting ? (
        <button
          onClick={handleStart}
          disabled={!query.trim()}
          className="w-full h-10 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-30 disabled:cursor-not-allowed text-sm font-semibold transition flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20"
        >
          <Search className="h-4 w-4" />
          Start Extraction
        </button>
      ) : (
        <button
          onClick={handleStop}
          className="w-full h-10 rounded-lg bg-red-600 hover:bg-red-500 text-sm font-semibold transition flex items-center justify-center gap-2 shadow-lg shadow-red-600/20"
        >
          <Loader2 className="h-4 w-4 animate-spin" />
          Stop Extraction
        </button>
      )}

      {/* Status banners */}
      {status === 'done' && (
        <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-400/10 border border-emerald-500/30 rounded-lg px-3 py-2">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          Extraction complete — {leadsCount} lead{leadsCount !== 1 ? 's' : ''} found
        </div>
      )}
      {status === 'error' && (
        <div className="flex items-center gap-2 text-xs text-red-400 bg-red-400/10 border border-red-500/30 rounded-lg px-3 py-2">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {errorMsg}
        </div>
      )}
      {isExtracting && (
        <div className="flex items-center gap-2 text-xs text-blue-400 bg-blue-400/10 border border-blue-500/30 rounded-lg px-3 py-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
          Navigating & Extracting… {leadsCount} lead{leadsCount !== 1 ? 's' : ''} collected
        </div>
      )}
    </div>
  );
}

