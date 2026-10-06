import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ClipboardCheck, Wrench, Gauge, Disc3, Weight, Receipt, ShieldCheck, CalendarCheck, FileText, Truck,
  Thermometer, Zap, Fuel, Snowflake, Flame, Cog, type LucideIcon,
} from 'lucide-react';
import { supabase, isMockMode } from '../App';

// ============================================================
// Inspection types — ONE list for everything a unit needs to keep valid:
// MOT, PMI, tacho, brake test, LOLER, road tax, insurance, plus any the
// company adds itself (inspection_types table, migration 098). No free
// typing: an inspection is always picked from this list, so the same thing
// can't be entered two different ways.
// ============================================================

export interface InspectionTypeDef {
  key: string;
  label: string;
  icon: string;
  /** Built in — can't be renamed or removed. */
  standard: boolean;
  /** Lapsing means "expired" (a legal document) rather than "overdue". */
  legal: boolean;
}

export const ICONS: Record<string, LucideIcon> = {
  'clipboard-check': ClipboardCheck,
  wrench: Wrench,
  gauge: Gauge,
  disc: Disc3,
  weight: Weight,
  receipt: Receipt,
  'shield-check': ShieldCheck,
  'calendar-check': CalendarCheck,
  'file-text': FileText,
  truck: Truck,
  thermometer: Thermometer,
  zap: Zap,
  fuel: Fuel,
  snowflake: Snowflake,
  flame: Flame,
  cog: Cog,
};

export const STANDARD_TYPES: InspectionTypeDef[] = [
  { key: 'mot', label: 'MOT', icon: 'clipboard-check', standard: true, legal: true },
  { key: 'pmi', label: 'PMI', icon: 'wrench', standard: true, legal: false },
  { key: 'tacho_calibration', label: 'Tacho Calibration', icon: 'gauge', standard: true, legal: false },
  { key: 'roller_brake_test', label: 'Roller Brake Test', icon: 'disc', standard: true, legal: false },
  { key: 'loler', label: 'LOLER', icon: 'weight', standard: true, legal: false },
  { key: 'road_tax', label: 'Road Tax', icon: 'receipt', standard: true, legal: true },
  { key: 'insurance', label: 'Insurance', icon: 'shield-check', standard: true, legal: true },
];

export function IconFor({ name, size = 15 }: { name: string; size?: number }) {
  const Icon = ICONS[name] ?? CalendarCheck;
  return <Icon size={size} />;
}

export const slugify = (label: string) => label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);

/** Standard types plus the company's own. */
export function useInspectionTypes(organizationId: string | null) {
  const [custom, setCustom] = useState<{ id: string; key: string; label: string; icon: string }[]>([]);

  const load = useCallback(async () => {
    if (isMockMode || !supabase || !organizationId) return;
    const { data } = await supabase.from('inspection_types').select('id, key, label, icon').eq('organization_id', organizationId).order('label');
    setCustom((data ?? []) as typeof custom);
  }, [organizationId]);

  useEffect(() => { load(); }, [load]);

  const types = useMemo<InspectionTypeDef[]>(() => [
    ...STANDARD_TYPES,
    ...custom.filter(c => !STANDARD_TYPES.some(s => s.key === c.key)).map(c => ({ key: c.key, label: c.label, icon: c.icon, standard: false, legal: false })),
  ], [custom]);

  return { types, custom, reload: load };
}

/** Label for a stored key, including legacy free-typed values. */
export function labelOf(types: InspectionTypeDef[], key: string): string {
  return types.find(t => t.key === key)?.label ?? key;
}
