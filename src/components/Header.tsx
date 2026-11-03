import { Target } from 'lucide-react';

interface HeaderProps {
  platform: string;
  platformColor: string;
}

export function Header({ platform, platformColor }: HeaderProps) {
  const isGoogleMaps = platform === 'Google Maps';

  return (
    <div className="px-5 pt-4 pb-3.5 border-b border-zinc-800/60 bg-canvas-subtle/40">
      <div className="flex items-center justify-between">
        {/* Left: Crisp branding with updated clean icon badge and logo */}
        <div className="flex items-center gap-2.5">
          <div className="h-7 w-7 rounded-lg bg-brand/10 border border-brand/25 flex items-center justify-center text-brand shadow-brand/10">
            <Target className="h-4 w-4" />
          </div>
          <h1 className="text-base font-bold tracking-tight text-zinc-100">Lead Scraper</h1>
        </div>

        {/* Right: Modern rounded pill badge for platform status with glowing subtle dot */}
        {isGoogleMaps ? (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-brand/10 text-brand border border-brand/25">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand opacity-75"></span>
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-brand"></span>
            </span>
            {platform}
          </span>
        ) : (
          <span
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold"
            style={{
              background: platformColor + '18',
              color: platformColor,
              border: `1px solid ${platformColor}40`,
            }}
          >
            <span
              className="inline-flex rounded-full h-1.5 w-1.5"
              style={{ backgroundColor: platformColor }}
            />
            {platform}
          </span>
        )}
      </div>

      <p className="text-xs text-zinc-400 mt-2 font-normal leading-relaxed">
        {isGoogleMaps
          ? 'Scrapes all results from the active Google Maps search'
          : 'Open Google Maps in this tab to start scraping'}
      </p>
    </div>
  );
}
