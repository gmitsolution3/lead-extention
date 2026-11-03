interface HeaderProps {
  platform: string;
  platformColor: string;
}

export function Header({ platform, platformColor }: HeaderProps) {
  return (
    <div className="px-5 pt-5 pb-4 border-b border-slate-700/60">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-lg font-bold tracking-tight text-white">Lead Scraper</h1>
        <span
          className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full"
          style={{
            background: platformColor + '22',
            color: platformColor,
            border: `1px solid ${platformColor}55`,
          }}
        >
          {platform}
        </span>
      </div>
      <p className="text-xs text-slate-400">
        {platform === 'Google Maps'
          ? 'Scrapes all results from the active Google Maps search'
          : 'Open Google Maps in this tab to start scraping'}
      </p>
    </div>
  );
}

