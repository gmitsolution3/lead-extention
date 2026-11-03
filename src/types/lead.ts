export interface Lead {
  source: string;
  name: string;
  phone: string;
  email: string;
  website: string;
  address?: string;
  facebook?: string;
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
