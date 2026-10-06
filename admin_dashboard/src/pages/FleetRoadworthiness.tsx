import { useState, useEffect, useCallback, useMemo, type CSSProperties } from 'react';
import { useSectionRefresh } from '../lib/section-refresh';
import { AnimatePresence, motion } from 'framer-motion';
import { Truck, Container, Package, ChevronDown, ChevronRight, ChevronLeft, ArrowUpDown, Bell, AlertOctagon, CalendarX, CheckCircle2, Clock, Plus, Trash2, Settings2 } from 'lucide-react';
import { supabase, isMockMode } from '../App';
import NoData from '../components/ui/no-data';
import { getAssetComplianceStatus, formatDaysRemaining, TIER_BADGE_CLASS, type AssetComplianceStatus } from '../lib/compliance';
import TableFilter, { type TableFilterGroup } from '../components/ui/table-filter';
import AddAssetModal from './AddAssetModal';
import FleetTimeline, { type FleetTimelineGroup, type MarkerTier } from '../components/FleetTimeline';
import { EarningsDateRangePicker } from '../components/ui/earnings-date-range-picker';
import InspectionTypeSelect from '../components/InspectionTypeSelect';
import ManageInspectionTypes from '../components/ManageInspectionTypes';
import { useInspectionTypes, IconFor, type InspectionTypeDef } from '../lib/inspection-types';

// ============================================================
// Fleet Roadworthiness — MOT/PMI/VOR asset register. Requires
// migration 041 (vehicles.inspection_due_date/inspection_type/is_vor)
// and migration 042 (organizations.compliance_alert_lead_days).
//
// Roadworthiness status comes from the shared getAssetComplianceStatus
// helper (src/lib/compliance.ts) — fixes the earlier bug where an
// asset due soon (but not yet overdue) was shown as VOR Grounded.
// VOR now only fires on an actual overdue date or an unresolved
// critical defect, never on proximity alone.
//
// Row list structured after the 21st.dev "Interactive Logs Table"
// reference (ui.tripled.work/components/interactive-logs-table).
// The old separate "Critical <14 Days" / "VOR Grounded" filter tabs
// are gone — that surface is now the Notifications bell instead,
// keeping the main table to a single clean register.
// ============================================================

// Both widened to plain strings (migration 046) — Asset Type and
// Inspection Type are creatable comboboxes now, so a real vehicle row
// can carry a custom value ("Company Van", a bespoke inspection name)
// outside the original fixed enums. Every place that used to branch on
// the exact 'truck'/'trailer' values still does (falling through to a
// generic-asset treatment for anything else) — see inspectionTypeLabel/
// vehicleTypeIcon below.
type VehicleType = string;
type InspectionType = string;

interface VehicleRow {
  id: string;
  vehicle_number: string;
  vehicle_type: VehicleType;
  inspection_type: InspectionType;
  inspection_due_date: string | null;
  is_vor: boolean;
  is_active: boolean;
  notes: string | null;
  mot_due_date?: string | null;
  tax_due_date?: string | null;
  insurance_expiry_date?: string | null;
  inspection_start_date?: string | null;
  /** Grounded by hand — see the Unit Status Ledger (migration 097). */
  manual_vor?: boolean | null;
}

/** One inspection row: what it is, when it started, when it expires. */
interface InspectionEdit { type: string; from: string; to: string }

const SCHEDULED_NOTE_PREFIX = 'Workshop visit scheduled on';

const INSPECTION_TYPE_LABELS: Record<string, string> = {
  road_tax: 'Road Tax',
  insurance: 'Insurance',
  mot: 'MOT',
  pmi: 'PMI',
  tacho_calibration: 'Tacho Calibration',
  roller_brake_test: 'Roller Brake Test',
  loler: 'LOLER',
};

// Duplicated from Compliance.tsx/ComplianceDefects.tsx per this app's
// existing per-page convention (see Compliance.tsx's own header comment) —
// needed here so a VOR-grounded row can name the actual defect, not just
// flag that one exists.
const DEFECT_CATEGORY_LABELS: Record<string, string> = {
  tyres: 'Tyres & Wheels',
  brakes: 'Pneumatics & Brakes',
  lighting: 'Electrical & Lighting',
  air_leaks: 'Air Leaks',
  bodywork: 'Bodywork & Cab',
  mirrors: 'Mirrors',
  vehicle_damage: 'Vehicle Damage',
  near_miss: 'Near Miss',
  collision: 'Collision',
  mechanical_fault: 'Mechanical Fault',
  other: 'Other',
};
function defectCategoryLabel(value: string): string {
  return DEFECT_CATEGORY_LABELS[value] ?? value;
}

interface CriticalDefectInfo {
  count: number;
  category: string;
}

// The one branch point this whole refactor is about: a red/VOR tier can
// mean two legally distinct things — an active physical defect grounding
// the asset, or a lapsed statutory inspection — and the register now says
// which, instead of showing an undifferentiated red badge for both.
interface OperationalStatusDisplay {
  text: string;
  secondary: string | null;
  icon: typeof AlertOctagon;
  color: string;
}
function operationalStatusDisplay(
  vehicle: VehicleRow,
  status: AssetComplianceStatus,
  defect: CriticalDefectInfo | undefined,
): OperationalStatusDisplay {
  if (status.tier === 'red') {
    if (defect) {
      return {
        text: `Critical Defect: ${defectCategoryLabel(defect.category)}`,
        secondary: defect.count > 1 ? `+${defect.count - 1} more open critical defect${defect.count - 1 === 1 ? '' : 's'}` : null,
        icon: AlertOctagon,
        color: '#CC0000',
      };
    }
    const overdueDays = status.daysRemaining !== null ? Math.abs(status.daysRemaining) : null;
    return {
      text: `VOR: Overdue ${inspectionTypeLabel(vehicle.inspection_type)}`,
      secondary: overdueDays !== null ? `${overdueDays}d overdue` : null,
      icon: CalendarX,
      color: '#CC0000',
    };
  }
  if (status.tier === 'amber') {
    return { text: 'Due Soon', secondary: null, icon: Clock, color: '#F59E0B' };
  }
  if (status.tier === 'green') {
    return { text: 'Clear', secondary: null, icon: CheckCircle2, color: '#10B981' };
  }
  return { text: 'Not Set', secondary: null, icon: Clock, color: 'var(--charcoal-light)' };
}
// Falls back to the raw stored value for a custom inspection type
// rather than showing "undefined".
let CUSTOM_LABELS: Record<string, string> = {};
function inspectionTypeLabel(value: string): string {
  return INSPECTION_TYPE_LABELS[value] ?? CUSTOM_LABELS[value] ?? value;
}
function vehicleTypeLabel(value: string): string {
  if (value === 'truck') return 'Tractor Unit';
  if (value === 'trailer') return 'Trailer';
  return value;
}
function VehicleTypeIcon({ vehicleType, size }: { vehicleType: string; size: number }) {
  if (vehicleType === 'truck') return <Truck size={size} />;
  if (vehicleType === 'trailer') return <Container size={size} />;
  return <Package size={size} />;
}

const regKey = (v: { vehicle_number: string; vehicle_type: string }) => `${v.vehicle_type}|${v.vehicle_number.trim().toUpperCase()}`;
const TIER_RANK: Record<string, number> = { red: 0, amber: 1, unknown: 2, green: 3 };
const shortDate = (k: string) => new Date(`${k}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

// Fixed column widths shared between the header row and every asset row,
// so the two stay pixel-aligned without resorting to a real <table> (which
// would break the expandable-row/framer-motion pattern already in use
// here and in the rest of this app's compact list views).
const COL = {
  status: '132px',
  registration: '128px',
  assetType: '104px',
  inspection: '168px',
  dueDate: '96px',
  actions: '28px',
};

function AssetTableHeader() {
  const th: CSSProperties = {
    fontSize: '12px', fontWeight: 600, color: 'var(--charcoal-light)',
    textTransform: 'none', letterSpacing: 0, flexShrink: 0,
  };
  return (
    <div
      className="flex align-center"
      style={{ gap: '16px', padding: '10px 20px', background: 'transparent', borderBottom: '1px solid var(--border-color)' }}
    >
      <span style={{ ...th, width: COL.status }}>Status</span>
      <span style={{ ...th, width: COL.registration }}>Registration</span>
      <span style={{ ...th, width: COL.assetType }}>Asset Type</span>
      <span style={{ ...th, flex: 1, minWidth: '180px' }}>Operational Status / Defect</span>
      <span style={{ ...th, width: COL.inspection }}>Next Inspection</span>
      <span style={{ ...th, width: COL.dueDate, textAlign: 'right' }}>Due Date</span>
      <span style={{ ...th, width: COL.actions }} />
    </div>
  );
}

/** Adds another inspection (MOT, road tax, insurance …) to a unit. */
function AddInspectionBar({ types, onAdd, onManageTypes }: { types: InspectionTypeDef[]; onAdd: (e: InspectionEdit) => Promise<void>; onManageTypes: () => void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<InspectionEdit>({ type: '', from: '', to: '' });
  const [saving, setSaving] = useState(false);
  if (!open) {
    return (
      <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border-color)' }}>
        <button type="button" className="comp-edit-btn" onClick={() => setOpen(true)}><Plus size={12} /> Add inspection</button>
      </div>
    );
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.2fr) auto', gap: '10px', alignItems: 'end', padding: '12px 16px', borderBottom: '1px solid var(--border-color)', background: 'var(--card-bg-hover)' }}>
      <div style={{ minWidth: 0 }}>
        <p className="text-xs font-bold text-muted mb-4" style={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}>Inspection</p>
        <InspectionTypeSelect types={types} value={draft.type} onChange={(k) => setDraft(d => ({ ...d, type: k }))} />
      </div>
      <div style={{ minWidth: 0 }}>
        <p className="text-xs font-bold text-muted mb-4" style={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}>Start → expiry</p>
        <EarningsDateRangePicker startDate={draft.from} endDate={draft.to} onChange={(from, to) => setDraft(d => ({ ...d, from, to }))} />
      </div>
      <span className="flex align-center" style={{ gap: '6px' }}>
        <button
          type="button"
          className="btn btn-primary"
          disabled={saving || !draft.type || !draft.to}
          onClick={async () => { setSaving(true); try { await onAdd(draft); setDraft({ type: '', from: '', to: '' }); setOpen(false); } finally { setSaving(false); } }}
        >
          {saving ? 'Adding…' : 'Add'}
        </button>
        <button type="button" className="comp-edit-btn" onClick={onManageTypes} title="Manage inspection types"><Settings2 size={12} /></button>
        <button type="button" className="comp-edit-btn" onClick={() => setOpen(false)}>Cancel</button>
      </span>
    </div>
  );
}

/** A driver's signed acceptance of taking this unit/trailer off-road (migration 063). */
interface Signoff {
  id: string;
  number: string;
  driver: string;
  issues: string[];
  context: string;
  signer_name: string;
  signature_svg: string;
  acknowledged_at: string;
}

interface AssetRowProps {
  signoffs: Signoff[];
  vehicle: VehicleRow;
  status: AssetComplianceStatus;
  defect: CriticalDefectInfo | undefined;
  expanded: boolean;
  onToggle: () => void;
  onSaveInspection: (vehicleId: string, edit: InspectionEdit) => Promise<void>;
  onRemoveInspection: (vehicleId: string) => Promise<void>;
  onOpenStatus?: (registration: string) => void;
  types: InspectionTypeDef[];
  onManageTypes: () => void;
}

function AssetRow({ vehicle, status, defect, expanded, onToggle, onSaveInspection, onRemoveInspection, signoffs, onOpenStatus, types, onManageTypes }: AssetRowProps) {
  const [edit, setEdit] = useState<InspectionEdit>({
    type: vehicle.inspection_type,
    from: vehicle.inspection_start_date ?? '',
    to: vehicle.inspection_due_date ?? '',
  });
  const [savingEdit, setSavingEdit] = useState(false);
  const editChanged = edit.type !== vehicle.inspection_type
    || edit.from !== (vehicle.inspection_start_date ?? '')
    || edit.to !== (vehicle.inspection_due_date ?? '');
  const dueLabel = vehicle.inspection_due_date ? new Date(vehicle.inspection_due_date).toLocaleDateString('en-GB') : '—';
  const registration = vehicle.vehicle_number.toUpperCase();
  const operational = operationalStatusDisplay(vehicle, status, defect);
  const OperationalIcon = operational.icon;

  return (
    <>
      <motion.button
        type="button"
        onClick={onToggle}
        className="w-full p-4 text-left transition-colors hover:bg-muted/50"
        style={{ borderBottom: '1px solid var(--border-color)' }}
      >
        <div className="flex align-center" style={{ gap: '16px' }}>
          <span
            className={`badge ${TIER_BADGE_CLASS[status.tier]}`}
            style={{ flexShrink: 0, width: COL.status, cursor: onOpenStatus ? 'pointer' : undefined }}
            role={onOpenStatus ? 'link' : undefined}
            title={onOpenStatus ? 'Open the full status page for this unit' : undefined}
            onClick={onOpenStatus ? (e) => { e.stopPropagation(); onOpenStatus(vehicle.vehicle_number); } : undefined}
          >{status.label}</span>

          <span
            className="flex align-center font-mono font-bold tabular-nums text-primary"
            style={{ gap: '6px', flexShrink: 0, width: COL.registration, letterSpacing: '0.03em' }}
          >
            <VehicleTypeIcon vehicleType={vehicle.vehicle_type} size={14} />
            {registration}
          </span>

          <span className="text-secondary text-sm" style={{ flexShrink: 0, width: COL.assetType, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {vehicleTypeLabel(vehicle.vehicle_type)}
          </span>

          <span style={{ flex: 1, minWidth: '180px', overflow: 'hidden' }}>
            <span className="flex align-center font-bold text-sm" style={{ gap: '6px', color: operational.color }}>
              <OperationalIcon size={13} style={{ flexShrink: 0 }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{operational.text}</span>
            </span>
            {operational.secondary && (
              <span className="text-xs text-muted" style={{ display: 'block', marginTop: '2px' }}>{operational.secondary}</span>
            )}
          </span>

          <span style={{ flexShrink: 0, width: COL.inspection, overflow: 'hidden' }}>
            <span className="text-xs text-secondary flex align-center" style={{ gap: '5px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              <IconFor name={types.find(t => t.key === vehicle.inspection_type)?.icon ?? 'calendar-check'} size={12} />
              {inspectionTypeLabel(vehicle.inspection_type)}
            </span>
            <span
              className="font-mono font-bold text-xs tabular-nums"
              style={{ color: status.tier === 'red' ? '#CC0000' : status.tier === 'amber' ? '#F59E0B' : status.tier === 'green' ? '#10B981' : 'var(--charcoal-light)' }}
            >
              {formatDaysRemaining(status.daysRemaining)}
            </span>
          </span>

          <span className="font-mono text-xs text-muted tabular-nums" style={{ width: COL.dueDate, flexShrink: 0, textAlign: 'right' }}>
            {dueLabel}
          </span>

          <motion.div
            animate={{ rotate: expanded ? 180 : 0 }}
            transition={{ duration: 0.2 }}
            style={{ flexShrink: 0, width: COL.actions, display: 'flex', justifyContent: 'flex-end' }}
          >
            <ChevronDown size={16} className="text-muted" />
          </motion.div>
        </div>
      </motion.button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ overflow: 'hidden', borderBottom: '1px solid var(--border-color)', background: 'var(--card-bg-hover)' }}
          >
            <div className="p-16" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
              <div>
                <p className="text-xs font-bold text-muted mb-4" style={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}>Registration</p>
                <p className="font-mono font-bold text-primary m-0" style={{ letterSpacing: '0.03em' }}>{registration}</p>
              </div>
              <div style={{ minWidth: 0 }}>
                <p className="text-xs font-bold text-muted mb-4" style={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}>Inspection</p>
                <div onClick={(e) => e.stopPropagation()}>
                  <InspectionTypeSelect types={types} value={edit.type} onChange={(k) => setEdit(x => ({ ...x, type: k }))} />
                </div>
              </div>
              <div style={{ minWidth: 0 }}>
                <p className="text-xs font-bold text-muted mb-4" style={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}>Start → expiry</p>
                <div onClick={(e) => e.stopPropagation()}>
                  <EarningsDateRangePicker startDate={edit.from} endDate={edit.to} onChange={(from, to) => setEdit(x => ({ ...x, from, to }))} />
                </div>
              </div>
              <div style={{ gridColumn: '1 / -1' }} className="flex align-center" onClick={(e) => e.stopPropagation()}>
                <span className="flex align-center" style={{ gap: '8px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn"
                    disabled={savingEdit || !editChanged || !edit.to}
                    style={{ padding: '6px 12px', fontSize: '11px', fontWeight: 700, backgroundColor: 'var(--brand-red)', color: '#fff', borderColor: 'var(--brand-red)', opacity: savingEdit || !editChanged || !edit.to ? 0.5 : 1 }}
                    onClick={async () => {
                      setSavingEdit(true);
                      try { await onSaveInspection(vehicle.id, edit); } finally { setSavingEdit(false); }
                    }}
                  >
                    {savingEdit ? 'Saving…' : 'Save inspection'}
                  </button>
                  <button type="button" className="comp-edit-btn" onClick={onManageTypes}><Settings2 size={12} /> Manage types</button>
                  <button
                    type="button"
                    className="comp-edit-btn"
                    onClick={async () => {
                      if (!window.confirm(`Remove the ${inspectionTypeLabel(vehicle.inspection_type)} inspection from ${registration}?`)) return;
                      await onRemoveInspection(vehicle.id);
                    }}
                  >
                    <Trash2 size={12} /> Remove inspection
                  </button>
                </span>
              </div>
              {(signoffs.length > 0 || status.tier === 'red') && (
                <div style={{ gridColumn: '1 / -1' }}>
                  <p className="text-xs font-bold text-muted mb-4" style={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}>Driver sign-offs (taken off-road)</p>
                  {signoffs.length === 0 ? (
                    <p className="text-secondary m-0 text-sm">No driver has signed to take this asset on the road.</p>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
                      {signoffs.map(so => (
                        <div key={so.id} style={{ border: '1px solid var(--border-color)', borderRadius: '10px', background: 'var(--card-bg)', padding: '10px' }}>
                          <div style={{ background: '#fff', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '6px' }}>
                            <img alt={`Signature of ${so.signer_name}`} src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(so.signature_svg)}`} style={{ display: 'block', width: '100%', maxHeight: '110px', objectFit: 'contain' }} />
                          </div>
                          <p className="text-xs font-bold text-primary m-0 mt-4">{so.signer_name}{so.driver && so.driver !== so.signer_name ? ` (${so.driver})` : ''}</p>
                          <p className="text-xs text-muted m-0">
                            {new Date(so.acknowledged_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            {so.context === 'coupling' ? ' · when coupling' : so.context === 'walkaround' ? ' · during a walk-around check' : ''}
                          </p>
                          <p className="text-xs font-bold m-0 mt-4" style={{ color: 'var(--brand-red)' }}>{so.issues.join(' · ')}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div style={{ gridColumn: '1 / -1' }}>
                <p className="text-xs font-bold text-muted mb-4" style={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}>Notes</p>
                <p className="text-secondary m-0">{vehicle.notes || 'No notes on this asset.'}</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

interface FleetRoadworthinessProps {
  organizationId: string | null;
  onAlertCountChange?: (count: number) => void;
  thresholdDays: number;
  onOpenAlertSettings?: () => void;
  /** Jump straight to one unit/trailer (the roadworthy icon in Live Tracking). */
  focusUnit?: { number: string; nonce: number } | null;
  /** Clicking a status badge opens the Unit Status page for that registration. */
  onOpenUnitStatus?: (registration: string) => void;
}

export default function FleetRoadworthiness({ organizationId, onAlertCountChange, thresholdDays, onOpenAlertSettings, focusUnit, onOpenUnitStatus }: FleetRoadworthinessProps) {
  const [vehicles, setVehicles] = useState<VehicleRow[]>([]);
  const [criticalDefects, setCriticalDefects] = useState<Record<string, CriticalDefectInfo>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string[]>([]);
  const [roadworthinessFilter, setRoadworthinessFilter] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [signoffs, setSignoffs] = useState<Signoff[]>([]);
  // Register table: a row per registration that opens into its inspection rows.
  const [openRegs, setOpenRegs] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<{ key: 'reg' | 'status' | 'next' | 'items'; dir: 1 | -1 }>({ key: 'status', dir: 1 });
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 12;
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isAssetModalOpen, setIsAssetModalOpen] = useState(false);
  const { types, custom, reload: reloadTypes } = useInspectionTypes(organizationId);
  const [manageTypesOpen, setManageTypesOpen] = useState(false);
  CUSTOM_LABELS = Object.fromEntries(types.map(t => [t.key, t.label]));

  // Every MOT / PMI / tacho / road tax / insurance … is one register row
  // (migration 098): a type, a start date and an expiry. The expiry
  // (inspection_due_date) is what drives the status badge, and a database
  // trigger keeps the old MOT / tax / insurance columns the driver app reads
  // in step with it.
  const saveInspection = async (vehicleId: string, e: InspectionEdit) => {
    if (isMockMode || !supabase) return;
    const target = vehicles.find(v => v.id === vehicleId);
    if (!target) return;
    const clash = vehicles.some(v => v.id !== vehicleId && v.vehicle_number.trim().toUpperCase() === target.vehicle_number.trim().toUpperCase() && v.vehicle_type === target.vehicle_type && v.inspection_type === e.type);
    if (clash) { setError(`${target.vehicle_number.toUpperCase()} already has a ${inspectionTypeLabel(e.type)} inspection.`); return; }
    const patch = { inspection_type: e.type, inspection_start_date: e.from || null, inspection_due_date: e.to || null };
    const { error: updateError } = await supabase.from('vehicles').update(patch).eq('id', vehicleId);
    if (updateError) { setError(updateError.message); return; }
    setError('');
    await loadVehicles();
  };

  const removeInspection = async (vehicleId: string) => {
    if (isMockMode || !supabase) return;
    // Hidden, not deleted: shifts and reports may still point at the row.
    const { error: updateError } = await supabase.from('vehicles').update({ is_active: false }).eq('id', vehicleId);
    if (updateError) { setError(updateError.message); return; }
    setError('');
    setVehicles(prev => prev.filter(v => v.id !== vehicleId));
  };

  const addInspection = async (unit: VehicleRow, e: InspectionEdit) => {
    if (isMockMode || !supabase || !organizationId) return;
    const reg = unit.vehicle_number.trim().toUpperCase();
    if (vehicles.some(v => v.vehicle_number.trim().toUpperCase() === reg && v.vehicle_type === unit.vehicle_type && v.inspection_type === e.type)) {
      setError(`${reg} already has a ${inspectionTypeLabel(e.type)} inspection.`);
      return;
    }
    const { error: insertError } = await supabase.from('vehicles').insert({
      organization_id: organizationId, vehicle_number: unit.vehicle_number, vehicle_type: unit.vehicle_type,
      inspection_type: e.type, inspection_start_date: e.from || null, inspection_due_date: e.to || null,
      fuel_tank_capacity_litres: (unit as { fuel_tank_capacity_litres?: number | null }).fuel_tank_capacity_litres ?? null,
    });
    if (insertError) { setError(insertError.message); return; }
    setError('');
    await loadVehicles();
  };

  const loadVehicles = useCallback(async () => {
    if (isMockMode || !supabase || !organizationId) return;
    setIsLoading(true);
    setError('');
    try {
      const [{ data: vRows, error: vErr }, { data: dRows, error: dErr }, { data: sRows }] = await Promise.all([
        supabase.from('vehicles').select('*').eq('organization_id', organizationId).eq('is_active', true).order('vehicle_number', { ascending: true }),
        supabase.from('incident_reports').select('vehicle_id, severity, status, category').eq('organization_id', organizationId).order('created_at', { ascending: false }),
        supabase.from('vehicle_risk_acknowledgements').select('id, issues, context, signer_name, signature_svg, acknowledged_at, drivers(full_name), vehicle:vehicles!vehicle_id(vehicle_number)').eq('organization_id', organizationId).order('acknowledged_at', { ascending: false }).limit(300),
      ]);
      if (vErr || dErr) throw vErr ?? dErr;

      setVehicles((vRows ?? []) as VehicleRow[]);
      setSignoffs((sRows ?? []).map((r: any) => ({
        id: r.id, number: (r.vehicle?.vehicle_number ?? '').toUpperCase(), driver: r.drivers?.full_name ?? '',
        issues: r.issues ?? [], context: r.context, signer_name: r.signer_name, signature_svg: r.signature_svg, acknowledged_at: r.acknowledged_at,
      })));

      // Rows arrive newest-first, so the first hit per vehicle_id is its
      // most recently reported open critical defect — that's the one
      // named in the register's Operational Status column.
      const defects: Record<string, CriticalDefectInfo> = {};
      for (const d of dRows ?? []) {
        if (d.severity === 'critical_vor' && d.status !== 'closed' && d.vehicle_id) {
          const existing = defects[d.vehicle_id];
          defects[d.vehicle_id] = existing
            ? { count: existing.count + 1, category: existing.category }
            : { count: 1, category: d.category };
        }
      }
      setCriticalDefects(defects);
    } catch (err: any) {
      setError(err?.message ?? 'Could not load the fleet register.');
    } finally {
      setIsLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    loadVehicles();
  }, [loadVehicles]);
  useSectionRefresh(loadVehicles);

  // Realtime: a driver-submitted incident report can ground a vehicle
  // (trg_ground_vehicle_on_critical_defect) — this register's VOR badges
  // and notification bell need to reflect that the moment it happens, not
  // on the next manual refresh. Mirrors Compliance.tsx's same subscription.
  useEffect(() => {
    if (isMockMode || !supabase || !organizationId) return;
    const incidentChannel = supabase
      .channel('realtime_fleet_incident_reports')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vehicle_risk_acknowledgements' }, () => { loadVehicles(); })
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'incident_reports' },
        () => {
          loadVehicles();
        }
      )
      .subscribe();
    return () => {
      supabase!.removeChannel(incidentChannel);
    };
  }, [organizationId, loadVehicles]);

  // Deliberately does NOT fall back to v.is_vor — see Compliance.tsx's
  // identical computation for why forcing it in here kept vehicles stuck
  // at VOR long after their defect was rectified.
  const vehiclesWithStatus = useMemo(
    () => vehicles.map(v => ({
      vehicle: v,
      status: getAssetComplianceStatus(v.inspection_due_date, (criticalDefects[v.id]?.count ?? 0) + (v.manual_vor ? 1 : 0), thresholdDays),
      defect: criticalDefects[v.id],
    })),
    [vehicles, criticalDefects, thresholdDays]
  );

  // Arriving from the roadworthy icon: show only that registration, with its
  // worst row open, so the defect and any signed acceptance are right there.
  useEffect(() => {
    if (!focusUnit || vehiclesWithStatus.length === 0) return;
    const num = focusUnit.number.trim().toUpperCase();
    const rows = vehiclesWithStatus.filter(r => r.vehicle.vehicle_number.trim().toUpperCase() === num);
    if (rows.length === 0) return;
    const worst = rows.find(r => r.status.tier === 'red') ?? rows[0];
    setCategoryFilter([]);
    setRoadworthinessFilter([]);
    setSearchQuery(num);
    setExpandedId(worst.vehicle.id);
    setOpenRegs(prev => new Set(prev).add(regKey(worst.vehicle)));
    setPage(0);
    setTimeout(() => document.getElementById(`asset-row-${worst.vehicle.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 250);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusUnit?.nonce, vehiclesWithStatus.length]);

  const dueSoonCount = vehiclesWithStatus.filter(v => v.status.tier === 'amber').length;
  const vorCount = vehiclesWithStatus.filter(v => v.status.tier === 'red').length;
  const urgentCount = dueSoonCount + vorCount;

  useEffect(() => {
    onAlertCountChange?.(urgentCount);
  }, [urgentCount, onAlertCountChange]);

  const notificationItems = vehiclesWithStatus
    .filter(v => v.status.tier === 'red' || v.status.tier === 'amber')
    .sort((a, b) => {
      if (a.status.tier !== b.status.tier) return a.status.tier === 'red' ? -1 : 1;
      return (a.status.daysRemaining ?? 0) - (b.status.daysRemaining ?? 0);
    });

  const handleMarkScheduled = async (vehicleId: string) => {
    if (isMockMode || !supabase) return;
    const existing = vehicles.find(v => v.id === vehicleId)?.notes?.trim();
    // Appended, not replaced — notes also carry make/model and other context.
    const scheduledNote = [existing, `${SCHEDULED_NOTE_PREFIX} ${new Date().toLocaleDateString('en-GB')}.`].filter(Boolean).join('\n');
    try {
      const { error: updateError } = await supabase.from('vehicles').update({ notes: scheduledNote }).eq('id', vehicleId);
      if (updateError) throw updateError;
      setVehicles(prev => prev.map(v => (v.id === vehicleId ? { ...v, notes: scheduledNote } : v)));
    } catch (err: any) {
      setError(err?.message ?? 'Could not update the asset.');
    }
  };

  const handleViewAsset = (vehicleId: string) => {
    setIsNotificationsOpen(false);
    setExpandedId(vehicleId);
    const v = vehicles.find(x => x.id === vehicleId);
    if (v) setOpenRegs(prev => new Set(prev).add(regKey(v)));
    setTimeout(() => document.getElementById(`asset-row-${vehicleId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 250);
  };

  const filteredVehicles = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return vehiclesWithStatus.filter(({ vehicle: v, status }) => {
      if (categoryFilter.length > 0 && !categoryFilter.includes(v.vehicle_type)) return false;
      if (roadworthinessFilter.length > 0 && !roadworthinessFilter.includes(status.tier)) return false;
      if (query && !v.vehicle_number.toLowerCase().includes(query) && !inspectionTypeLabel(v.inspection_type).toLowerCase().includes(query)) {
        return false;
      }
      return true;
    });
  }, [vehiclesWithStatus, categoryFilter, roadworthinessFilter, searchQuery]);

  // One group per registration (a unit/trailer has a register row per
  // inspection type). Dates are listed exactly, each with its own tier.
  const groups = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const tierOfDate = (d: string): MarkerTier => {
      const days = Math.floor((new Date(`${d}T00:00:00`).getTime() - Date.now()) / 86_400_000);
      return days < 0 || d <= today ? 'red' : days <= thresholdDays ? 'amber' : 'green';
    };
    type G = { key: string; reg: string; type: string; rows: typeof filteredVehicles; markers: { id: string; label: string; date: string; tier: MarkerTier }[] };
    const map = new Map<string, G>();
    for (const r of filteredVehicles) {
      const key = regKey(r.vehicle);
      let g = map.get(key);
      if (!g) { g = { key, reg: r.vehicle.vehicle_number.trim().toUpperCase(), type: r.vehicle.vehicle_type, rows: [], markers: [] }; map.set(key, g); }
      g.rows.push(r);
      const target = g;
      const add = (id: string, label: string, date: string | null | undefined, tier?: MarkerTier) => {
        if (!date) return;
        if (target.markers.some(m => m.label === label && m.date === date)) return;
        target.markers.push({ id, label, date, tier: tier ?? tierOfDate(date) });
      };
      add(`${r.vehicle.id}-insp`, inspectionTypeLabel(r.vehicle.inspection_type), r.vehicle.inspection_due_date, r.status.tier === 'unknown' ? undefined : (r.status.tier as MarkerTier));
    }
    return [...map.values()].map(g => {
      const worst = (g.rows.map(r => r.status.tier as string).concat(g.markers.map(m => m.tier as string))).sort((a, b) => TIER_RANK[a] - TIER_RANK[b])[0] ?? 'unknown';
      const next = g.markers.map(m => m.date).sort()[0] ?? null;
      return { ...g, worst: worst as MarkerTier, next };
    });
  }, [filteredVehicles, thresholdDays]);

  const sortedGroups = useMemo(() => {
    const d = sort.dir;
    const cmp = (a: typeof groups[number], b: typeof groups[number]) => {
      if (sort.key === 'reg') return d * a.reg.localeCompare(b.reg);
      if (sort.key === 'items') return d * (a.rows.length - b.rows.length);
      if (sort.key === 'next') return d * ((a.next ?? '9999').localeCompare(b.next ?? '9999'));
      return d * (TIER_RANK[a.worst] - TIER_RANK[b.worst]) || a.reg.localeCompare(b.reg);
    };
    return [...groups].sort(cmp);
  }, [groups, sort]);

  const pageCount = Math.max(1, Math.ceil(sortedGroups.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageGroups = sortedGroups.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  const timelineGroups: FleetTimelineGroup[] = useMemo(
    () => sortedGroups.map(g => ({ key: g.key, reg: g.reg, typeLabel: vehicleTypeLabel(g.type), markers: g.markers })),
    [sortedGroups],
  );

  const openFromTimeline = (key: string) => {
    const idx = sortedGroups.findIndex(g => g.key === key);
    if (idx >= 0) setPage(Math.floor(idx / PAGE_SIZE));
    setOpenRegs(prev => new Set(prev).add(key));
    setTimeout(() => document.getElementById(`reg-group-${key.replace(/[^A-Za-z0-9]/g, '_')}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 250);
  };

  const sortBy = (key: typeof sort.key) => { setSort(s => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: 1 })); setPage(0); };

  const filterGroups: TableFilterGroup[] = [
    {
      key: 'category',
      label: 'Asset Category',
      options: [
        { value: 'truck', label: 'Tractor Units' },
        { value: 'trailer', label: 'Trailers' },
      ],
      selected: categoryFilter,
      onChange: setCategoryFilter,
    },
    {
      key: 'roadworthiness',
      label: 'Roadworthiness',
      options: [
        { value: 'green', label: 'Compliant' },
        { value: 'amber', label: 'Due Soon' },
        { value: 'red', label: 'VOR Grounded' },
      ],
      selected: roadworthinessFilter,
      onChange: setRoadworthinessFilter,
    },
  ];

  return (
    <div className="flex-1">
      <div className="flex align-center justify-between mb-16">
        <h2 className="text-xl font-black text-primary m-0">FLEET ROADWORTHINESS</h2>
        <div className="flex align-center" style={{ gap: '10px' }}>
          {/* ── Notifications bell — replaces the old Critical/VOR
               filter tabs as the single urgency surface. ─────────── */}
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setIsNotificationsOpen(v => !v)}
              aria-label="Compliance notifications"
              style={{
                position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: '38px', height: '38px', borderRadius: '10px', border: '1px solid var(--border-color)',
                background: 'var(--card-bg)', cursor: 'pointer',
              }}
            >
              <Bell size={17} />
              {urgentCount > 0 && (
                <span
                  className="font-mono tabular-nums"
                  style={{
                    position: 'absolute', top: '-6px', right: '-6px', minWidth: '18px', height: '18px',
                    borderRadius: '9px', background: 'var(--brand-red)', color: '#fff', fontSize: '10px',
                    fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px',
                  }}
                >
                  {urgentCount}
                </span>
              )}
            </button>

            {isNotificationsOpen && (
              <div
                style={{
                  position: 'absolute', right: 0, top: '44px', width: '360px', maxHeight: '440px', overflowY: 'auto',
                  background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '12px',
                  boxShadow: '0 16px 32px rgba(0,0,0,0.28)', zIndex: 60,
                }}
              >
                <div className="p-16" style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <p className="font-bold text-primary m-0" style={{ fontSize: '13.5px' }}>Compliance Action Required</p>
                  <p className="text-xs text-muted m-0 mt-4">
                    {urgentCount} item{urgentCount === 1 ? '' : 's'} · Showing expiries within the next {thresholdDays} days
                  </p>
                </div>

                {notificationItems.length === 0 ? (
                  <p className="text-sm text-muted p-16 m-0">Nothing needs attention right now.</p>
                ) : (
                  <div>
                    {notificationItems.map(({ vehicle: v, status }) => (
                      <div key={v.id} className="p-12" style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <div className="flex align-center justify-between mb-4">
                          <span className="flex align-center font-mono font-bold text-primary" style={{ gap: '6px', letterSpacing: '0.03em' }}>
                            <VehicleTypeIcon vehicleType={v.vehicle_type} size={13} />
                            {v.vehicle_number.toUpperCase()}
                          </span>
                          <span className={`badge ${TIER_BADGE_CLASS[status.tier]}`} style={{ fontSize: '10px' }}>{status.label}</span>
                        </div>
                        <p className="text-xs text-secondary m-0 mb-8">
                          {vehicleTypeLabel(v.vehicle_type)} · {inspectionTypeLabel(v.inspection_type)}{' '}
                          {status.tier === 'red'
                            ? (status.daysRemaining !== null && status.daysRemaining <= 0 ? `overdue by ${Math.abs(status.daysRemaining)}d` : 'grounded — critical defect')
                            : `expires in ${status.daysRemaining}d`}
                        </p>
                        {status.tier === 'amber' && v.notes?.includes(SCHEDULED_NOTE_PREFIX) ? (
                          <span className="text-xs font-bold text-muted">Scheduled ✓</span>
                        ) : status.tier === 'amber' ? (
                          <button
                            type="button"
                            onClick={() => handleMarkScheduled(v.id)}
                            className="text-xs font-bold"
                            style={{ background: 'none', border: 'none', color: 'var(--brand-red)', cursor: 'pointer', padding: 0 }}
                          >
                            Mark Scheduled
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleViewAsset(v.id)}
                            className="text-xs font-bold"
                            style={{ background: 'none', border: 'none', color: 'var(--brand-red)', cursor: 'pointer', padding: 0 }}
                          >
                            View Asset Details
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <div className="p-12" style={{ borderTop: '1px solid var(--border-color)' }}>
                  <button
                    type="button"
                    onClick={() => { setIsNotificationsOpen(false); onOpenAlertSettings?.(); }}
                    className="text-xs font-bold"
                    style={{ background: 'none', border: 'none', color: 'var(--charcoal-light)', cursor: 'pointer', padding: 0 }}
                  >
                    Configure Alert Thresholds →
                  </button>
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            className="btn"
            style={{ padding: '6px 12px', fontSize: '11px', fontWeight: 700, backgroundColor: 'var(--brand-red)', color: '#FFFFFF', borderColor: 'var(--brand-red)' }}
            onClick={() => setIsAssetModalOpen(true)}
          >
            + Add Asset
          </button>
        </div>
      </div>

      {manageTypesOpen && (
        <ManageInspectionTypes organizationId={organizationId} custom={custom} onClose={() => setManageTypesOpen(false)} onChanged={reloadTypes} />
      )}

      {isAssetModalOpen && (
        <AddAssetModal
          organizationId={organizationId}
          onClose={() => setIsAssetModalOpen(false)}
          onSaved={loadVehicles}
        />
      )}

      {error && <div className="login-notice login-notice--error mb-16">{error}</div>}

      <FleetTimeline groups={timelineGroups} onOpen={openFromTimeline} />

      {/* ── Fleet Assets register — a HeroUI-style tree table: a row per
           registration (sortable, paged) that opens into its inspection rows. ── */}
      <div className="glass-card" style={{ overflow: 'hidden' }}>
        <div className="p-16" style={{ borderBottom: '1px solid var(--border-color)' }}>
          <div className="flex align-center justify-between mb-8">
            <h3 className="text-lg font-black text-primary m-0">Fleet Assets</h3>
            <span className="text-xs text-muted">{isLoading ? 'Loading…' : `${groups.length} unit${groups.length === 1 ? '' : 's'} · ${filteredVehicles.length} of ${vehicles.length} inspections`}</span>
          </div>

          <div className="flex align-center" style={{ gap: '10px', flexWrap: 'wrap' }}>
            <TableFilter groups={filterGroups} search={{ value: searchQuery, onChange: (v) => { setSearchQuery(v); setPage(0); }, placeholder: 'Search assets by registration or type…' }} />
          </div>
        </div>

        {groups.length === 0 ? (
          <NoData />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <div style={{ minWidth: '760px' }}>
              <div className="flex align-center" style={{ gap: '16px', padding: '10px 20px', background: 'transparent', borderBottom: '1px solid var(--border-color)' }}>
                {([['reg', 'Registration', null], ['status', 'Status', '150px'], ['next', 'Next date', '170px'], ['items', 'Inspections', '100px']] as const).map(([key, label, w]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => sortBy(key)}
                    style={{ ...(w ? { width: w, flexShrink: 0 } : { flex: 1.2, minWidth: 0 }), display: 'flex', alignItems: 'center', gap: '4px', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left', fontSize: '12px', fontWeight: 600, color: sort.key === key ? 'var(--charcoal)' : 'var(--charcoal-light)', textTransform: 'none', letterSpacing: 0, fontFamily: 'inherit' }}
                  >
                    {label} <ArrowUpDown size={11} />
                  </button>
                ))}
                <span style={{ width: '24px', flexShrink: 0 }} />
              </div>

              {pageGroups.map(g => {
                const open = openRegs.has(g.key);
                const tierLabel = g.worst === 'red' ? 'VOR Grounded' : g.worst === 'amber' ? 'Due Soon' : g.worst === 'green' ? 'Compliant' : 'Not Set';
                const nextDays = g.next ? Math.floor((new Date(`${g.next}T00:00:00`).getTime() - Date.now()) / 86_400_000) : null;
                return (
                  <div key={g.key} id={`reg-group-${g.key.replace(/[^A-Za-z0-9]/g, '_')}`}>
                    <button
                      type="button"
                      onClick={() => setOpenRegs(prev => { const n = new Set(prev); if (n.has(g.key)) n.delete(g.key); else n.add(g.key); return n; })}
                      aria-expanded={open}
                      className="w-full text-left transition-colors hover:bg-muted/50"
                      style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '12px 16px', background: open ? 'var(--card-bg-hover)' : 'transparent', border: 'none', borderBottom: '1px solid var(--border-color)', cursor: 'pointer', fontFamily: 'inherit' }}
                    >
                      <span className="flex align-center font-mono font-bold text-primary" style={{ flex: 1.2, minWidth: 0, gap: '8px', letterSpacing: '0.03em' }}>
                        <ChevronRight size={15} style={{ transform: open ? 'rotate(90deg)' : undefined, transition: 'transform 0.15s', color: 'var(--charcoal-light)', flexShrink: 0 }} />
                        <VehicleTypeIcon vehicleType={g.type} size={14} />
                        {g.reg}
                        <span className="text-xs text-muted" style={{ fontFamily: 'inherit', fontWeight: 500, letterSpacing: 0 }}>{vehicleTypeLabel(g.type)}</span>
                      </span>
                      <span style={{ width: '150px', flexShrink: 0 }}>
                        <span
                          className={`badge ${TIER_BADGE_CLASS[g.worst]}`}
                          style={{ cursor: onOpenUnitStatus ? 'pointer' : undefined }}
                          role={onOpenUnitStatus ? 'link' : undefined}
                          title={onOpenUnitStatus ? 'Open the full status page for this unit' : undefined}
                          onClick={onOpenUnitStatus ? (e) => { e.stopPropagation(); onOpenUnitStatus(g.reg); } : undefined}
                        >{tierLabel}</span>
                      </span>
                      <span style={{ width: '170px', flexShrink: 0 }}>
                        {g.next ? (
                          <>
                            <span className="font-mono font-bold text-xs" style={{ display: 'block', color: 'var(--charcoal)' }}>{shortDate(g.next)}</span>
                            <span className="text-xs" style={{ color: nextDays !== null && nextDays < 0 ? 'var(--brand-red)' : 'var(--charcoal-light)', fontWeight: 700 }}>{formatDaysRemaining(nextDays)}</span>
                          </>
                        ) : <span className="text-xs text-muted">No dates set</span>}
                      </span>
                      <span className="text-sm text-secondary" style={{ width: '100px', flexShrink: 0 }}>{g.rows.length}</span>
                      <span style={{ width: '24px', flexShrink: 0 }} />
                    </button>
                    {open && (
                      <div style={{ borderLeft: '3px solid var(--border-color)', background: 'var(--card-bg)' }}>
                        <AddInspectionBar types={types} onAdd={(e) => addInspection(g.rows[0].vehicle, e)} onManageTypes={() => setManageTypesOpen(true)} />
                        <AssetTableHeader />
                        {g.rows.map(({ vehicle: v, status, defect }) => (
                          <div id={`asset-row-${v.id}`} key={v.id}>
                            <AssetRow
                              signoffs={signoffs.filter(x => x.number === v.vehicle_number.toUpperCase())}
                              vehicle={v}
                              status={status}
                              defect={defect}
                              expanded={expandedId === v.id}
                              onToggle={() => setExpandedId(prev => (prev === v.id ? null : v.id))}
                              onSaveInspection={saveInspection}
                              onRemoveInspection={removeInspection}
                              types={types}
                              onManageTypes={() => setManageTypesOpen(true)}
                              onOpenStatus={onOpenUnitStatus}
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex align-center justify-between" style={{ padding: '10px 16px', gap: '10px' }}>
              <span className="text-xs text-muted">Page {safePage + 1} of {pageCount}</span>
              <span className="flex align-center" style={{ gap: '6px' }}>
                <button type="button" className="comp-edit-btn" disabled={safePage === 0} onClick={() => setPage(safePage - 1)} aria-label="Previous page"><ChevronLeft size={13} /></button>
                <button type="button" className="comp-edit-btn" disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)} aria-label="Next page"><ChevronRight size={13} /></button>
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
