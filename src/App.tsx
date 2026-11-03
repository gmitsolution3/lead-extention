import { useExtraction } from '@/hooks/useExtraction';
import { Header } from '@/components/Header';
import { SearchControls } from '@/components/SearchControls';
import { LeadsList } from '@/components/LeadsList';
import { ExportFooter } from '@/components/ExportFooter';

function App() {
  const {
    status,
    errorMsg,
    query,
    setQuery,
    leads,
    platform,
    platformColor,
    filterText,
    setFilterText,
    filterNoWebsiteOnly,
    setFilterNoWebsiteOnly,
    filteredLeads,
    noWebsiteCount,
    isExtracting,
    handleStart,
    handleStop,
    handleClear,
    handleExportCSV,
    handleExportXML,
  } = useExtraction();

  return (
    <div className="w-[420px] min-h-[580px] bg-[#121212] text-zinc-100 font-sans flex flex-col antialiased selection:bg-[#c6f432] selection:text-black">
      <Header platform={platform} platformColor={platformColor} />

      <SearchControls
        query={query}
        setQuery={setQuery}
        isExtracting={isExtracting}
        status={status}
        errorMsg={errorMsg}
        leadsCount={leads.length}
        handleStart={handleStart}
        handleStop={handleStop}
      />

      <LeadsList
        leads={leads}
        filteredLeads={filteredLeads}
        noWebsiteCount={noWebsiteCount}
        filterNoWebsiteOnly={filterNoWebsiteOnly}
        setFilterNoWebsiteOnly={setFilterNoWebsiteOnly}
        filterText={filterText}
        setFilterText={setFilterText}
        handleClear={handleClear}
        isExtracting={isExtracting}
      />

      <ExportFooter
        handleExportCSV={handleExportCSV}
        handleExportXML={handleExportXML}
        disabled={leads.length === 0 || isExtracting}
      />
    </div>
  );
}

export default App;
