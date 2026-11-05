export interface Lead {
  id: string; // Unique identifier: crypto.randomUUID() or fallback timestamp string
  source: string;
  name: string;
  phone: string;
  email: string;
  website: string;
  address?: string;
  facebook?: string;
  searchQuery?: string;
}

export interface SearchGroup {
  id: string; // Unique session ID
  query: string; // The search phrase, e.g. "pet shop mirpur 10"
  createdAt: number;
  updatedAt?: number;
  leads: Lead[];
}

export interface KnownLeads {
  phoneDigits: string[];
  normalizedNames: string[];
  websites: string[];
}

export function generateLeadId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `lead-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export interface ExtractionStatus {
  isExtracting: boolean;
  activeQuery: string;
  activeTabId: number | null;
}

export type ExtractionStatusResponse = ExtractionStatus;

export const DEFAULT_EXTRACTION_STATUS: ExtractionStatus = {
  isExtracting: false,
  activeQuery: '',
  activeTabId: null,
};

export type Status = 'idle' | 'extracting' | 'done' | 'error';
