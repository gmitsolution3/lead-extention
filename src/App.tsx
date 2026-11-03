import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Search,
  Loader2,
  Download,
  Trash2,
  MapPin,
  Phone,
  Globe,
  AlertCircle,
  CheckCircle2,
  Mail,
  Filter,
  X,
} from 'lucide-react'

interface Lead {
  source: string
  name: string
  phone: string
  email: string
  website: string
  address?: string
}

interface ExtractionStatusResponse {
  isExtracting: boolean
  activeQuery: string
  activeTabId: number | null
}

// ── Retry helper: MV3 service workers can sleep; retry until they respond ──────
function sendMessageWithRetry(
  msg: object,
  callback?: (res: any) => void,
  retries = 5,
  delayMs = 300
) {
  const attempt = (remaining: number) => {
    try {
      chrome.runtime.sendMessage(msg, (res) => {
        if (chrome.runtime.lastError) {
          const errMsg = chrome.runtime.lastError.message || ''
          if (remaining > 0 && errMsg.includes('Receiving end does not exist')) {
            setTimeout(() => attempt(remaining - 1), delayMs)
          } else {
            callback?.(undefined)
          }
          return
        }
        callback?.(res)
      })
    } catch {
      if (remaining > 0) {
        setTimeout(() => attempt(remaining - 1), delayMs)
      } else {
        callback?.(undefined)
      }
    }
  }
  attempt(retries)
}

type Status = 'idle' | 'extracting' | 'done' | 'error'

// Detect which platform is open in the active tab
function detectPlatform(url: string): string {
  if (url.includes('google.com/maps')) return 'Google Maps'
  if (url.includes('facebook.com')) return 'Facebook'
  if (url.includes('linkedin.com')) return 'LinkedIn'
  return 'Unknown'
}

function App() {
  const [status, setStatus] = useState<Status>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [query, setQuery] = useState('')
  const [leads, setLeads] = useState<Lead[]>([])
  const [platform, setPlatform] = useState('Unknown')
  const [tabId, setTabId] = useState<number | null>(null)
  const [filterText, setFilterText] = useState('')
  const [filterNoWebsiteOnly, setFilterNoWebsiteOnly] = useState(false)

  // ── Fetch active browser tab info ──────────────────────────────────────────
  useEffect(() => {
    try {
      chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
        if (chrome.runtime.lastError) return
        const tab = tabs[0]
        if (tab?.url) setPlatform(detectPlatform(tab.url))
        if (tab?.id) setTabId(tab.id)
      })
    } catch {
      /* ignore tab query errors */
    }
  }, [])

  // ── Restore State on Popup Open ───────────────────────────────────────────
  useEffect(() => {
    sendMessageWithRetry({ type: 'GET_EXTRACTION_STATUS' }, (res: ExtractionStatusResponse) => {
      if (res?.isExtracting) {
        setStatus('extracting')
        if (res.activeQuery) {
          setQuery(res.activeQuery)
        }
        if (res.activeTabId) {
          setTabId(res.activeTabId)
        }
      }
    })
  }, [])

  // ── Load stored leads ─────────────────────────────────────────────────────
  const refreshLeads = useCallback(() => {
    sendMessageWithRetry({ type: 'GET_LEADS' }, (res) => {
      if (res?.leads) setLeads(res.leads)
    })
  }, [])

  useEffect(() => {
    refreshLeads()
  }, [refreshLeads])

  // ── Poll while extracting to reflect real-time lead counts ────────────────
  useEffect(() => {
    if (status !== 'extracting') return
    const id = setInterval(refreshLeads, 1500)
    return () => clearInterval(id)
  }, [status, refreshLeads])

  // ── Listen for messages from background/content ───────────────────────────
  useEffect(() => {
    const handler = (msg: any) => {
      if (msg.type === 'EXTRACTION_DONE') {
        setStatus('done')
        refreshLeads()
      }
      if (msg.type === 'EXTRACTION_ERROR') {
        setStatus('error')
        setErrorMsg(msg.message || 'Something went wrong.')
      }
      if (msg.type === 'LEADS_UPDATED') {
        refreshLeads()
      }
    }
    chrome.runtime.onMessage.addListener(handler)
    return () => chrome.runtime.onMessage.removeListener(handler)
  }, [refreshLeads])

  // ── Start extraction ──────────────────────────────────────────────────────
  const handleStart = () => {
    if (!query.trim()) return
    setStatus('extracting')
    setErrorMsg('')

    const sendStartCmd = (targetTabId: number) => {
      sendMessageWithRetry(
        { type: 'START_SEARCH', query: query.trim(), tabId: targetTabId },
        (res) => {
          if (!res) {
            setStatus('error')
            setErrorMsg('Could not connect to background service. Please reload the extension.')
          } else if (res?.status === 'error') {
            setStatus('error')
            setErrorMsg(res.message || 'Invalid tab.')
          }
        }
      )
    }

    if (tabId) {
      sendStartCmd(tabId)
    } else {
      chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
        const id = tabs[0]?.id
        if (id) {
          setTabId(id)
          sendStartCmd(id)
        } else {
          setStatus('error')
          setErrorMsg('No active tab found.')
        }
      })
    }
  }

  // ── Stop extraction ───────────────────────────────────────────────────────
  const handleStop = () => {
    setStatus('idle')
    if (tabId) {
      sendMessageWithRetry({ type: 'STOP_SEARCH', tabId })
    }
  }

  // ── Clear leads with prompt confirmation ──────────────────────────────────
  const handleClear = () => {
    if (leads.length === 0) return
    const confirmed = window.confirm('Are you sure you want to clear all extracted leads?')
    if (!confirmed) return

    sendMessageWithRetry({ type: 'CLEAR_LEADS' }, () => {
      setLeads([])
    })
  }

  // ── Exports ───────────────────────────────────────────────────────────────
  const handleExportCSV = () => {
    sendMessageWithRetry({ type: 'EXPORT_CSV' })
  }

  const handleExportXML = () => {
    sendMessageWithRetry({ type: 'EXPORT_XML' })
  }

  // ── Filtered leads calculation ────────────────────────────────────────────
  const filteredLeads = useMemo(() => {
    const term = filterText.toLowerCase().trim()
    return leads.filter((lead) => {
      if (filterNoWebsiteOnly && lead.website) return false
      if (!term) return true
      if (term === 'no website' || term === 'missing website') {
        return !lead.website
      }
      return (
        (lead.name || '').toLowerCase().includes(term) ||
        (lead.phone || '').toLowerCase().includes(term) ||
        (lead.email || '').toLowerCase().includes(term) ||
        (lead.website || '').toLowerCase().includes(term) ||
        (lead.address || '').toLowerCase().includes(term)
      )
    })
  }, [leads, filterText, filterNoWebsiteOnly])

  const isExtracting = status === 'extracting'
  const platformColor =
    platform === 'Google Maps'
      ? '#34a853'
      : platform === 'Facebook'
      ? '#1877f2'
      : platform === 'LinkedIn'
      ? '#0a66c2'
      : '#6b7280'

  const noWebsiteCount = useMemo(() => leads.filter((l) => !l.website).length, [leads])

  return (
    <div className="w-[420px] min-h-[580px] bg-[#0f172a] text-slate-100 font-sans flex flex-col">
      {/* ── Header ─────────────────────────────────────────────────────── */}
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

      {/* ── Search Input ───────────────────────────────────────────────── */}
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
            Extraction complete — {leads.length} lead{leads.length !== 1 ? 's' : ''} found
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
            Navigating & Extracting… {leads.length} lead{leads.length !== 1 ? 's' : ''} collected
          </div>
        )}
      </div>

      {/* ── Leads Section ──────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col px-5 pt-3 pb-3 overflow-hidden">
        {/* Results Bar */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-300 uppercase tracking-wide">
              Results ({filteredLeads.length}
              {filteredLeads.length !== leads.length ? ` / ${leads.length}` : ''})
            </span>
            {noWebsiteCount > 0 && (
              <button
                onClick={() => setFilterNoWebsiteOnly(!filterNoWebsiteOnly)}
                className={`text-[10px] px-2 py-0.5 rounded-full border transition ${
                  filterNoWebsiteOnly
                    ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300 font-semibold'
                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-300'
                }`}
                title="Filter leads without websites"
              >
                No Website ({noWebsiteCount})
              </button>
            )}
          </div>
          <button
            onClick={handleClear}
            disabled={leads.length === 0 || isExtracting}
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-red-400 disabled:opacity-30 disabled:cursor-not-allowed transition"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Clear
          </button>
        </div>

        {/* Filter Input */}
        {leads.length > 0 && (
          <div className="relative mb-2">
            <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
            <input
              type="text"
              placeholder="Filter leads by name, phone, or 'no website'..."
              className="w-full h-8 rounded-md bg-slate-800/80 border border-slate-700/70 pl-8 pr-7 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition"
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
            />
            {filterText && (
              <button
                onClick={() => setFilterText('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}

        {/* Leads Scroll Area */}
        <div className="flex-1 overflow-y-auto flex flex-col gap-2 pr-0.5 min-h-0 max-h-[220px]">
          {leads.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-500 text-sm gap-2 py-8">
              <Search className="h-8 w-8 opacity-30" />
              <span>No leads yet. Start an extraction above.</span>
            </div>
          ) : filteredLeads.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-500 text-xs gap-1 py-8">
              <span>No leads match current filter.</span>
            </div>
          ) : (
            filteredLeads.map((lead, i) => <LeadCard key={i} lead={lead} />)
          )}
        </div>
      </div>

      {/* ── Export Buttons ─────────────────────────────────────────────── */}
      <div className="px-5 pb-5 flex gap-2 border-t border-slate-700/60 pt-3">
        <button
          onClick={handleExportCSV}
          disabled={leads.length === 0 || isExtracting}
          className="flex-1 h-9 rounded-lg border border-slate-600 hover:border-slate-400 text-xs font-semibold text-slate-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition flex items-center justify-center gap-1.5"
        >
          <Download className="h-3.5 w-3.5" />
          Export CSV
        </button>
        <button
          onClick={handleExportXML}
          disabled={leads.length === 0 || isExtracting}
          className="flex-1 h-9 rounded-lg border border-slate-600 hover:border-slate-400 text-xs font-semibold text-slate-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition flex items-center justify-center gap-1.5"
        >
          <Download className="h-3.5 w-3.5" />
          Export XML
        </button>
      </div>
    </div>
  )
}

// ── Lead Card Component ───────────────────────────────────────────────────────
function LeadCard({ lead }: { lead: Lead }) {
  const noWebsite = !lead.website

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
  )
}

export default App
