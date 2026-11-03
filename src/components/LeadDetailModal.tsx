import { useState, useRef, useEffect } from 'react';
import { Dialog } from '@base-ui/react';
import { X, Phone, Mail, Globe, MapPin, Copy, Check, ExternalLink, Sparkles } from 'lucide-react';
import type { Lead } from '@/types/lead';

interface LeadDetailModalProps {
  lead: Lead | null;
  isOpen: boolean;
  onClose: () => void;
}

interface CopyFieldRowProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | undefined | null;
  isUrl?: boolean;
}

function CopyFieldRow({ icon: Icon, label, value, isUrl }: CopyFieldRowProps) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  if (!value || value.trim() === '') {
    return null;
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      timerRef.current = setTimeout(() => {
        setCopied(false);
      }, 1800);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  const handleOpenUrl = (e: React.MouseEvent) => {
    e.stopPropagation();
    let targetUrl = value.trim();
    if (!/^https?:\/\//i.test(targetUrl)) {
      targetUrl = `https://${targetUrl}`;
    }
    if (typeof chrome !== 'undefined' && chrome.tabs?.create) {
      chrome.tabs.create({ url: targetUrl });
    } else {
      window.open(targetUrl, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div
      onClick={handleCopy}
      className="bg-surface-alt border border-border/60 rounded-xl p-3 flex items-center justify-between group cursor-pointer hover:border-brand/40 hover:bg-surface-hover transition duration-150 gap-3"
      title="Click to copy"
    >
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        <div className="h-8 w-8 rounded-lg bg-zinc-900 border border-border/60 flex items-center justify-center shrink-0 text-zinc-400 group-hover:text-brand group-hover:border-brand/40 transition">
          <Icon className="h-4 w-4" />
        </div>
        <div className="flex flex-col min-w-0 flex-1">
          <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">
            {label}
          </span>
          <span className="text-xs text-zinc-200 font-medium truncate" title={value}>
            {value}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        {isUrl && (
          <button
            type="button"
            onClick={handleOpenUrl}
            title="Open website in new tab"
            className="p-1.5 rounded-lg text-zinc-400 hover:text-brand hover:bg-zinc-800 transition"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </button>
        )}

        {copied ? (
          <div className="flex items-center gap-1 bg-brand/10 border border-brand/20 px-2 py-1 rounded-md text-brand">
            <Check className="h-3 w-3 text-brand" />
            <span className="text-[10px] font-medium text-brand">Copied!</span>
          </div>
        ) : (
          <div className="flex items-center gap-1 px-1.5 py-1 text-[10px] text-zinc-500 group-hover:text-brand font-medium transition">
            <Copy className="h-3 w-3" />
            <span>Click to copy</span>
          </div>
        )}
      </div>
    </div>
  );
}

export function LeadDetailModal({ lead, isOpen, onClose }: LeadDetailModalProps) {
  if (!lead) return null;

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs animate-in fade-in rounded-2xl" />
        <Dialog.Popup className="fixed left-1/2 top-1/2 z-50 w-[380px] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-surface border border-border p-5 text-zinc-100 shadow-2xl animate-in fade-in zoom-in-95 outline-none flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-1 min-w-0 flex-1">
              {lead.source && (
                <div className="flex items-center">
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-zinc-800/90 text-zinc-300 border border-zinc-700/60 uppercase tracking-wide">
                    {lead.source}
                  </span>
                </div>
              )}
              <Dialog.Title className="text-base font-semibold text-zinc-100 leading-snug break-words">
                {lead.name}
              </Dialog.Title>
              <Dialog.Description className="sr-only">
                Detailed inspection and contact actions for lead {lead.name}
              </Dialog.Description>
            </div>
            <Dialog.Close
              onClick={onClose}
              className="rounded-lg p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition cursor-pointer shrink-0 focus:outline-none"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>

          {/* Opportunity Banner if !lead.website */}
          {!lead.website && (
            <div className="bg-brand/10 border border-brand/25 text-brand rounded-xl p-3 text-xs flex items-center gap-2">
              <Sparkles className="h-4 w-4 shrink-0 text-brand" />
              <span>No website detected. High-conversion prospect for web development and outreach!</span>
            </div>
          )}

          {/* Contact Fields */}
          <div className="flex flex-col gap-2">
            <CopyFieldRow icon={Phone} label="Phone" value={lead.phone} />
            <CopyFieldRow icon={Mail} label="Email" value={lead.email} />
            <CopyFieldRow icon={Globe} label="Website" value={lead.website} isUrl />
            <CopyFieldRow icon={MapPin} label="Address" value={lead.address} />
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
