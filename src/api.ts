import type { Pricing } from "./schema";

export interface PriceChange {
  id: number;
  provider_id: string;
  created_at: string;
  changes: string[];
}

export interface ProviderView {
  id: string;
  name: string;
  url: string;
  tagline: string;
  sources: string[];
  pricing: Pricing;
  verified_at: string;
  verified_by: string;
  last_check: { at: string; ok: boolean; error: string | null; failed_sources: string[] } | null;
  pending_review: boolean;
  recent_changes: PriceChange[];
}

export interface PricesResponse {
  generated_at: string;
  providers: ProviderView[];
}

export interface HistoryResponse {
  changes: PriceChange[];
}
