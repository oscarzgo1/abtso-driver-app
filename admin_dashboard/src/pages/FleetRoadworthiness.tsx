import { useState, useEffect, useCallback, useMemo, type CSSProperties } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Truck, Container, Package, Search, ChevronDown, Bell, AlertOctagon, CalendarX, CheckCircle2, Clock } from 'lucide-react';
import { supabase, isMockMode } from '../App';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from '../components/ui/empty';
import { getAssetComplianceStatus, formatDaysRemaining, TIER_BADGE_CLASS, type AssetComplianceStatus } from '../lib/compliance';
import TableFilter, { type TableFilterGroup } from '../components/ui/table-filter';
import AddAssetModal from './AddAssetModal';

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
}

const INSPECTION_TYPE_LABELS: Record<string, string> = {
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
function inspectionTypeLabel(value: string): string {
  return INSPECTION_TYPE_LABELS[value] ?? value;
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
    fontSize: '10px', fontWeight: 800, color: 'var(--charcoal-light)',
    textTransform: 'uppercase', letterSpacing: '0.7px', flexShrink: 0,
  };
  return (
    <div
      className="flex align-center"
      style={{ gap: '16px', padding: '10px 16px', background: 'var(--card-bg-hover)', borderBottom: '1px solid var(--border-color)' }}
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

interface AssetRowProps {
  vehicle: VehicleRow;
  status: AssetComplianceStatus;
  defect: CriticalDefectInfo | undefined;
  expanded: boolean;
  onToggle: () => void;
}

function AssetRow({ vehicle, status, defect, expanded, onToggle }: AssetRowProps) {
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
          <span className={`badge ${TIER_BADGE_CLASS[status.tier]}`} style={{ flexShrink: 0, width: COL.status }}>{status.label}</span>

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
            <span className="text-xs text-secondary" style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
              <div>
                <p className="text-xs font-bold text-muted mb-4" style={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}>Inspection Type</p>
                <p className="text-primary m-0">{inspectionTypeLabel(vehicle.inspection_type)}</p>
              </div>
              <div>
                <p className="text-xs font-bold text-muted mb-4" style={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}>Due Date</p>
                <p className="font-mono text-primary m-0">{dueLabel}</p>
              </div>
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
}

export default function FleetRoadworthiness({ organizationId, onAlertCountChange, thresholdDays, onOpenAlertSettings }: FleetRoadworthinessProps) {
  const [vehicles, setVehicles] = useState<VehicleRow[]>([]);
  const [criticalDefects, setCriticalDefects] = useState<Record<string, CriticalDefectInfo>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string[]>([]);
  const [roadworthinessFilter, setRoadworthinessFilter] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isAssetModalOpen, setIsAssetModalOpen] = useState(false);

  const loadVehicles = useCallback(async () => {
    if (isMockMode || !supabase || !organizationId) return;
    setIsLoading(true);
    setError('');
    try {
      const [{ data: vRows, error: vErr }, { data: dRows, error: dErr }] = await Promise.all([
        supabase.from('vehicles').select('*').eq('organization_id', organizationId).eq('is_active', true).order('vehicle_number', { ascending: true }),
        supabase.from('incident_reports').select('vehicle_id, severity, status, category').eq('organization_id', organizationId).order('created_at', { ascending: false }),
      ]);
      if (vErr || dErr) throw vErr ?? dErr;

      setVehicles((vRows ?? []) as VehicleRow[]);

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

  // Realtime: a driver-submitted incident report can ground a vehicle
  // (trg_ground_vehicle_on_critical_defect) — this register's VOR badges
  // and notification bell need to reflect that the moment it happens, not
  // on the next manual refresh. Mirrors Compliance.tsx's same subscription.
  useEffect(() => {
    if (isMockMode || !supabase || !organizationId) return;
    const incidentChannel = supabase
      .channel('realtime_fleet_incident_reports')
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
      status: getAssetComplianceStatus(v.inspection_due_date, criticalDefects[v.id]?.count ?? 0, thresholdDays),
      defect: criticalDefects[v.id],
    })),
    [vehicles, criticalDefects, thresholdDays]
  );

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
    const scheduledNote = `Workshop visit scheduled on ${new Date().toLocaleDateString('en-GB')}.`;
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
    const el = document.getElementById(`asset-row-${vehicleId}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
                        {status.tier === 'amber' ? (
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
            style={{ padding: '10px 16px', fontSize: '13px', fontWeight: 800, backgroundColor: 'var(--brand-red)', color: '#FFFFFF', borderColor: 'var(--brand-red)' }}
            onClick={() => setIsAssetModalOpen(true)}
          >
            + Add Asset
          </button>
        </div>
      </div>

      {isAssetModalOpen && (
        <AddAssetModal
          organizationId={organizationId}
          onClose={() => setIsAssetModalOpen(false)}
          onSaved={loadVehicles}
        />
      )}

      {error && <div className="login-notice login-notice--error mb-16">{error}</div>}

      {/* ── Unified Fleet Assets table — structured after the 21st.dev
           "Interactive Logs Table" reference: header+count, search +
           category tabs, expandable rows. ─────────────────────────── */}
      <div className="glass-card" style={{ overflow: 'hidden' }}>
        <div className="p-16" style={{ borderBottom: '1px solid var(--border-color)' }}>
          <div className="flex align-center justify-between mb-8">
            <h3 className="text-lg font-black text-primary m-0">Fleet Assets</h3>
            <span className="text-xs text-muted">{isLoading ? 'Loading…' : `${filteredVehicles.length} of ${vehicles.length} assets`}</span>
          </div>

          <div className="flex align-center" style={{ gap: '10px', flexWrap: 'wrap' }}>
            <div className="telemetry-search-wrap" style={{ minWidth: '220px' }}>
              <Search size={14} />
              <input
                type="text"
                placeholder="Search assets by registration or type…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <TableFilter groups={filterGroups} />
          </div>
        </div>

        {filteredVehicles.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon"><Truck /></EmptyMedia>
              <EmptyTitle>No Assets</EmptyTitle>
              <EmptyDescription>
                {vehicles.length === 0 ? 'Add your trucks and trailers to start tracking roadworthiness.' : 'No vehicles match this filter or search.'}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div>
            <AssetTableHeader />
            {filteredVehicles.map(({ vehicle: v, status, defect }) => (
              <div id={`asset-row-${v.id}`} key={v.id}>
                <AssetRow
                  vehicle={v}
                  status={status}
                  defect={defect}
                  expanded={expandedId === v.id}
                  onToggle={() => setExpandedId(prev => (prev === v.id ? null : v.id))}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
