// What a company's plan gives it (migration 067). The database decides —
// this is just how the admin panel asks and reads the answer.

export type FeatureKey = 'loads_pod' | 'fuel_audit' | 'payroll_rates' | 'analytics' | 'report_exports' | 'defect_compliance';

export interface CatalogFeature {
  key: string;
  label: string;
  description: string | null;
  included: boolean;
}

export interface Entitlements {
  plan: string;
  plan_label: string;
  tagline: string | null;
  features: string[];
  catalog: CatalogFeature[];
  /** null = unlimited. */
  limits: { employees: number | null; depots: number | null };
  usage: { employees: number; depots: number };
}

/** Which page needs which feature. A page not listed here is open to every plan. */
export const TAB_FEATURE: Partial<Record<string, FeatureKey>> = {
  shipments: 'loads_pod',
  rates: 'payroll_rates',
  analytics: 'analytics',
  'compliance-defects': 'defect_compliance',
  'driver-hours': 'defect_compliance',
};

export const FEATURE_LABEL: Record<FeatureKey, string> = {
  loads_pod: 'Loads & proof of delivery',
  fuel_audit: 'Fuel audit & theft detection',
  payroll_rates: 'Rates, payroll & expense claims',
  analytics: 'Analytics & true profit',
  report_exports: 'Reports & exports',
  defect_compliance: 'Defect registry & driver hours (WTD)',
};

export const UPGRADE_EMAIL = 'hello@tachyo.co.uk';
