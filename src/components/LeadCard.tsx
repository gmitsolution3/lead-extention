import { Phone, Mail, Globe, MapPin, ChevronRight, Trash2 } from 'lucide-react';
import type { Lead } from '@/types/lead';

interface LeadCardProps {
  lead: Lead;
  onClick?: () => void;
  onDelete?: (leadId: string) => void;
}

export function LeadCard({ lead, onClick, onDelete }: LeadCardProps) {
  const noWebsite = !lead.website;

  return (
    <div
      onClick={onClick}
      className={`rounded-xl border p-3.5 text-sm flex flex-col gap-2 transition-all duration-150 cursor-pointer hover:border-brand/50 hover:bg-surface-hover hover:scale-[1.01] active:scale-[0.99] group ${
        noWebsite
          ? 'bg-surface border-brand/30'
          : 'bg-surface border-zinc-800/60'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="font-semibold text-zinc-100 text-sm leading-tight group-hover:text-white transition truncate">
          {lead.name}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {onDelete && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(lead.id);
              }}
              className="p-1 rounded-md text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors duration-150"
              title="Delete lead"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
          <div className="flex items-center gap-0.5 text-[10px] text-zinc-500 group-hover:text-brand font-medium transition">
            <span>View details</span>
            <ChevronRight className="h-3.5 w-3.5 transition-transform duration-150 group-hover:translate-x-0.5" />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-1.5 pt-0.5">
        {lead.phone && (
          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <Phone className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
            <span>{lead.phone}</span>
          </div>
        )}

        {lead.email && (
          <div className="flex items-center gap-2 text-xs text-amber-300/90 truncate bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-lg">
            <Mail className="h-3.5 w-3.5 shrink-0 text-amber-400" />
            <span className="truncate font-medium">{lead.email}</span>
          </div>
        )}

        {lead.website ? (
          <div className="flex items-center gap-2 text-xs text-zinc-300 truncate">
            <Globe className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
            <span className="truncate">{lead.website.replace(/^https?:\/\//, '')}</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-xs pt-0.5">
            <Globe className="h-3.5 w-3.5 shrink-0 text-brand/70" />
            <span className="text-brand bg-brand/10 border border-brand/20 px-2 py-0.5 rounded-md text-[11px] font-medium">
              No website — potential client
            </span>
          </div>
        )}

        {lead.facebook && (
          <div className="flex items-center gap-2 text-xs text-blue-400 truncate min-w-0">
            <svg
              className="h-3.5 w-3.5 shrink-0 text-blue-400"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
            </svg>
            <span className="truncate">{lead.facebook.replace(/^https?:\/\/(www\.)?/, '')}</span>
          </div>
        )}

        {lead.address && (
          <div className="flex items-center gap-2 text-xs text-zinc-400 truncate">
            <MapPin className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
            <span className="truncate">{lead.address}</span>
          </div>
        )}
      </div>
    </div>
  );
}
