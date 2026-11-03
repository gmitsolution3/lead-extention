import { Phone, Mail, Globe, MapPin } from 'lucide-react';
import type { Lead } from '@/types/lead';

interface LeadCardProps {
  lead: Lead;
}

export function LeadCard({ lead }: LeadCardProps) {
  const noWebsite = !lead.website;

  return (
    <div
      className={`rounded-xl border p-3.5 text-sm flex flex-col gap-2 transition-all duration-150 ${
        noWebsite
          ? 'bg-[#1c1c1e] hover:bg-[#202023] border-[#c6f432]/30 shadow-[0_0_16px_rgba(198,244,50,0.03)]'
          : 'bg-[#1c1c1e] hover:bg-[#202023] border-zinc-800/60'
      }`}
    >
      <div className="font-semibold text-zinc-100 text-sm leading-tight">
        {lead.name}
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
            <Globe className="h-3.5 w-3.5 shrink-0 text-[#c6f432]/70" />
            <span className="text-[#c6f432] bg-[#c6f432]/10 border border-[#c6f432]/20 px-2 py-0.5 rounded-md text-[11px] font-medium">
              No website — potential client
            </span>
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
