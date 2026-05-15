import { useState, useEffect } from 'react'
import { Button } from './components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/ui/card'
import { Search, Loader2, Download, Trash2 } from 'lucide-react'

// Define Lead interface
interface Lead {
  source: string;
  name: string;
  phone: string;
  email: string;
  website: string;
  address?: string;
}

function App() {
  const [isExtracting, setIsExtracting] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [leads, setLeads] = useState<Lead[]>([])

  const fetchLeads = () => {
    chrome.runtime.sendMessage({ type: 'GET_LEADS' }, (response) => {
      if (response && response.leads) {
        setLeads(response.leads);
      }
    });
  };

  useEffect(() => {
    fetchLeads();
    
    // Periodically fetch leads while extracting to update UI
    let interval: any;
    if (isExtracting) {
      interval = setInterval(fetchLeads, 1500);
    }
    return () => clearInterval(interval);
  }, [isExtracting]);

  const handleExtract = () => {
    if (!searchQuery.trim()) return;
    
    setIsExtracting(true)
    
    // Send message to current tab's content script
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs: any) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'START_EXTRACTION', query: searchQuery }, (response: any) => {
          console.log('Extraction status:', response)
        })
      } else {
        setIsExtracting(false)
      }
    })
  }

  const handleStop = () => {
    setIsExtracting(false);
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs: any) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'STOP_EXTRACTION' });
      }
    });
  }

  const handleClear = () => {
    chrome.runtime.sendMessage({ type: 'CLEAR_LEADS' }, () => {
      setLeads([]);
    });
  };

  const handleExportCSV = () => {
    chrome.runtime.sendMessage({ type: 'EXPORT_CSV' });
  };

  const handleExportXML = () => {
    chrome.runtime.sendMessage({ type: 'EXPORT_XML' });
  };

  return (
    <div className="w-[400px] p-4 bg-slate-50 min-h-[500px]">
      <Card>
        <CardHeader>
          <CardTitle>Lead Scraper</CardTitle>
          <CardDescription>Extract business info from Maps.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <input 
            type="text" 
            placeholder="Search (e.g. cake house, school)" 
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            disabled={isExtracting}
          />

          {!isExtracting ? (
            <Button onClick={handleExtract} disabled={!searchQuery.trim()} className="w-full">
              <Search className="mr-2 h-4 w-4" />
              Start Extraction
            </Button>
          ) : (
             <Button onClick={handleStop} variant="destructive" className="w-full">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Stop Extraction
            </Button>
          )}

          <div className="flex justify-between items-center mt-2">
            <span className="text-sm font-semibold">Leads Found: {leads.length}</span>
            <Button variant="ghost" size="sm" onClick={handleClear} disabled={leads.length === 0 || isExtracting}>
              <Trash2 className="h-4 w-4 text-red-500" />
            </Button>
          </div>

          <div className="h-[200px] overflow-y-auto border rounded-md p-2 flex flex-col gap-2 bg-white">
            {leads.length === 0 ? (
              <p className="text-sm text-slate-500 text-center mt-10">No leads extracted yet.</p>
            ) : (
              leads.map((lead, idx) => (
                <div 
                  key={idx} 
                  className={`p-2 text-sm border rounded ${!lead.website ? 'bg-green-100 border-green-500' : 'bg-slate-50'}`}
                >
                  <div className="font-bold">{lead.name}</div>
                  {lead.phone && <div>📞 {lead.phone}</div>}
                  {lead.website ? <div>🌐 {lead.website}</div> : <div className="text-green-700 font-semibold">No Website Found</div>}
                </div>
              ))
            )}
          </div>

          <div className="flex gap-2">
             <Button onClick={handleExportCSV} disabled={leads.length === 0 || isExtracting} variant="outline" className="flex-1 border-slate-300">
              <Download className="mr-2 h-4 w-4" />
              CSV
            </Button>
             <Button onClick={handleExportXML} disabled={leads.length === 0 || isExtracting} variant="outline" className="flex-1 border-slate-300">
              <Download className="mr-2 h-4 w-4" />
              XML
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default App
