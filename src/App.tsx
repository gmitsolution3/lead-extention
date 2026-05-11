import { useState } from 'react'
import { Button } from './components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/ui/card'
import { Search, Loader2 } from 'lucide-react'

function App() {
  const [isExtracting, setIsExtracting] = useState(false)

  const handleExtract = () => {
    setIsExtracting(true)
    
    // Send message to current tab's content script
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs: any) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'START_EXTRACTION' }, (response: any) => {
          console.log('Extraction started:', response)
          // For demo purposes, stop after 2s
          setTimeout(() => setIsExtracting(false), 2000)
        })
      } else {
        setTimeout(() => setIsExtracting(false), 500)
      }
    })
  }

  return (
    <div className="w-[350px] p-4 bg-slate-50 min-h-[400px]">
      <Card>
        <CardHeader>
          <CardTitle>Lead Scraper</CardTitle>
          <CardDescription>Extract business info from current page.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Button onClick={handleExtract} disabled={isExtracting} className="w-full">
            {isExtracting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Extracting...
              </>
            ) : (
              <>
                <Search className="mr-2 h-4 w-4" />
                Start Extraction
              </>
            )}
          </Button>

          <div className="text-sm text-slate-500 text-center mt-4">
            Works on Google Maps, Facebook, LinkedIn, WhatsApp.
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default App
