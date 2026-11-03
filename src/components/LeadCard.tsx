import { Phone, Mail, Globe, MapPin } from 'lucide-react';
import type { Lead } from '@/types/lead';

interface LeadCardProps {
  lead: Lead;
}

export function LeadCard({ lead }: LeadCardProps) {
  const noWebsite = !lead.website;

  return (
    <div
      className={`rounded-lg border px-3 py-2.5 text-sm flex flex-col gap-1 transition ${
        noWebsite
          ? 'bg-emerald-900/20 border-emerald-600/40'
          : 'bg-slate-800/60 border-slate-700/50'
      }`}
    >
      <div className="font-semibold text-white leading-tight">{lead.name}</div>

      {lead.phone && (
        <div className="flex items-center gap-1.5 text-xs text-slate-400">
          <Phone className="h-3 w-3 shrink-0" />
          {lead.phone}
        </div>
      )}

      {lead.email && (
        <div className="flex items-center gap-1.5 text-xs text-amber-300/90 truncate">
          <Mail className="h-3 w-3 shrink-0 text-amber-400" />
          <span className="truncate">{lead.email}</span>
        </div>
      )}

      {lead.website ? (
        <div className="flex items-center gap-1.5 text-xs text-blue-400 truncate">
          <Globe className="h-3 w-3 shrink-0" />
          <span className="truncate">{lead.website.replace(/^https?:\/\//, '')}</span>
        </div>
      ) : (
        <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
          <Globe className="h-3 w-3 shrink-0" />
          No website — potential client!
        </div>
      )}

      {lead.address && (
        <div className="flex items-center gap-1.5 text-xs text-slate-500 truncate">
          <MapPin className="h-3 w-3 shrink-0" />
          <span className="truncate">{lead.address}</span>
        </div>
      )}
    </div>
  );
}

