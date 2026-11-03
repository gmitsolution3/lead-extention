import { Download } from 'lucide-react';

interface ExportFooterProps {
  handleExportCSV: () => void;
  handleExportXML: () => void;
  disabled: boolean;
}

export function ExportFooter({ handleExportCSV, handleExportXML, disabled }: ExportFooterProps) {
  return (
    <div className="px-5 pb-5 flex gap-2 border-t border-slate-700/60 pt-3">
      <button
        onClick={handleExportCSV}
        disabled={disabled}
        className="flex-1 h-9 rounded-lg border border-slate-600 hover:border-slate-400 text-xs font-semibold text-slate-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition flex items-center justify-center gap-1.5"
      >
        <Download className="h-3.5 w-3.5" />
        Export CSV
      </button>
      <button
        onClick={handleExportXML}
        disabled={disabled}
        className="flex-1 h-9 rounded-lg border border-slate-600 hover:border-slate-400 text-xs font-semibold text-slate-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition flex items-center justify-center gap-1.5"
      >
        <Download className="h-3.5 w-3.5" />
        Export XML
      </button>
    </div>
  );
}

