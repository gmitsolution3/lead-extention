import { Download } from 'lucide-react';

interface ExportFooterProps {
  handleExportCSV: () => void;
  handleExportXML: () => void;
  disabled: boolean;
}

export function ExportFooter({ handleExportCSV, handleExportXML, disabled }: ExportFooterProps) {
  return (
    <div className="px-5 pb-5 pt-3.5 flex gap-2.5 border-t border-zinc-800/60 bg-canvas-subtle/40">
      <button
        onClick={handleExportCSV}
        disabled={disabled}
        className="flex-1 h-10 rounded-xl bg-surface hover:bg-surface-active border border-zinc-800 text-xs font-semibold text-zinc-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-surface disabled:hover:text-zinc-300 active:scale-[0.99] transition flex items-center justify-center gap-1.5 shadow-xs"
      >
        <Download className="h-3.5 w-3.5" />
        Export CSV
      </button>
      <button
        onClick={handleExportXML}
        disabled={disabled}
        className="flex-1 h-10 rounded-xl bg-surface hover:bg-surface-active border border-zinc-800 text-xs font-semibold text-zinc-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-surface disabled:hover:text-zinc-300 active:scale-[0.99] transition flex items-center justify-center gap-1.5 shadow-xs"
      >
        <Download className="h-3.5 w-3.5" />
        Export XML
      </button>
    </div>
  );
}
