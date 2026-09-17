import { useState, useEffect, useCallback } from 'react';
import { ArrowRight, ShieldAlert, Plus, Camera, X, AlertTriangle, Wrench, Clock, CheckCircle2 } from 'lucide-react';
import { supabase, isMockMode } from '../App';
import { FleetStatusDonutChart, type DonutSlice } from '../components/ui/fleet-status-donut-chart';
import { getAssetComplianceStatus, formatDaysRemaining, TIER_BADGE_CLASS } from '../lib/compliance';
import DefectInspectionDrawer from './DefectInspectionDrawer';

// ============================================================
// Compliance & Safety — overview / dispatch decision center.
//
// Every figure on this page is computed from real rows in vehicles/
// incident_reports/drivers — nothing here is a placeholder or an
// assumed constant. That deliberately leaves out a few things a
// denser "decision center" would usually show, because this app
// doesn't track the underlying data yet:
//   - No £-per-day VOR cost estimate: there's no configured
//     cost-per-grounded-day anywhere in this schema, so no cost badge
//     is shown rather than presenting an invented number as real.
//   - No "avg resolution turnaround": incident_reports has no
//     resolved_at timestamp (only created_at), so there's nothing to
//     average. Would need a schema change to track honestly.
//   - No "workshop status" (in repair / awaiting parts): not a
//     concept this schema has. The real open/acknowledged/closed
//     breakdown is shown instead.
//   - No "scheduled loads for tomorrow": this app has no dispatch/
//     load-booking feature, so the readiness panel reports real
//     roadworthy-unit counts only, not load-conflict predictions.
//
// Requires migration 041 (vehicles.is_vor, incident_reports.severity).
// ============================================================

// Widened to plain strings (migration 046) — Asset Type/Inspection Type
// are creatable comboboxes now, so a real row can carry a custom value
// outside these original fixed sets. tractorTotal/trailerTotal below
// already only match the exact 'truck'/'trailer' values, so a custom
// type is correctly excluded from HGV articulation math rather than
// miscounted as either.
type VehicleType = string;
type InspectionType = string;

interface VehicleRow {
  id: string;
  vehicle_number: string;
  vehicle_type: VehicleType;
  inspection_type: InspectionType;
  inspection_due_date: string | null;
  is_vor: boolean;
  notes: string | null;
}

type DefectCategory =
  | 'tyres' | 'brakes' | 'lighting' | 'air_leaks' | 'bodywork' | 'mirrors'
  | 'vehicle_damage' | 'near_miss' | 'collision' | 'mechanical_fault' | 'other';
type DefectSeverity = 'critical_vor' | 'advisory_minor';
type DefectStatus = 'open' | 'acknowledged' | 'closed';

interface DefectRow {
  id: string;
  category: DefectCategory;
  severity: DefectSeverity;
  status: DefectStatus;
  created_at: string;
  note: string | null;
  vehicle_id: string | null;
  vehicle_number?: string;
  driver_id: string;
  driver_name?: string;
  photo_urls: string[];
}

interface DriverOption {
  id: string;
  full_name: string;
  driver_id: string;
}

function formatUpcomingDue(daysRemaining: number): string {
  if (daysRemaining === 0) return 'Today';
  if (daysRemaining === 1) return 'Tomorrow';
  return `In ${daysRemaining} days`;
}

const INSPECTION_TYPE_LABELS: Record<InspectionType, string> = {
  mot: 'MOT',
  pmi: 'PMI',
  tacho_calibration: 'Tacho Calibration',
  roller_brake_test: 'Roller Brake Test',
  loler: 'LOLER',
};

const CATEGORY_LABELS: Record<DefectCategory, string> = {
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

// DVSA walkaround-aligned grouping for the "Defect Hotspots by
// Component" chart specifically — CATEGORY_LABELS above still governs
// the Defect Inbox table and the quick-add form, unchanged. Near Miss
// and Collision are excluded here (both an HSE/incident report, not a
// vehicle component defect) — same reasoning applied consistently to
// both, not just the one named in the spec. Anything that doesn't map
// to one of the 5 named DVSA groups (currently only "other") lands in
// a 6th "Other" row rather than being silently dropped — every real
// defect stays accounted for, even the ones that don't fit neatly.
type DvsaGroup = 'braking_pneumatics' | 'tyres_wheels' | 'electrical_lighting' | 'cab_mirrors_vision' | 'bodywork_chassis_coupling' | 'other';
const DVSA_GROUP_LABELS: Record<DvsaGroup, string> = {
  braking_pneumatics: 'Braking & Pneumatics',
  tyres_wheels: 'Tyres & Wheels',
  electrical_lighting: 'Electrical & Lighting',
  cab_mirrors_vision: 'Cab, Mirrors & Vision',
  bodywork_chassis_coupling: 'Bodywork, Chassis & Coupling',
  other: 'Other',
};
const CATEGORY_TO_DVSA_GROUP: Partial<Record<DefectCategory, DvsaGroup>> = {
  brakes: 'braking_pneumatics',
  air_leaks: 'braking_pneumatics',
  tyres: 'tyres_wheels',
  lighting: 'electrical_lighting',
  mirrors: 'cab_mirrors_vision',
  bodywork: 'bodywork_chassis_coupling',
  vehicle_damage: 'bodywork_chassis_coupling',
  mechanical_fault: 'bodywork_chassis_coupling',
  other: 'other',
  // near_miss / collision deliberately absent — excluded from this chart.
};

interface ComplianceProps {
  organizationId: string | null;
  thresholdDays: number;
  onViewGroundedAssets?: () => void;
  onViewAllDefects?: () => void;
}

export default function Compliance({ organizationId, thresholdDays, onViewGroundedAssets, onViewAllDefects }: ComplianceProps) {
  const [vehicles, setVehicles] = useState<VehicleRow[]>([]);
  const [defects, setDefects] = useState<DefectRow[]>([]);
  const [drivers, setDrivers] = useState<DriverOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const [statusFilter, setStatusFilter] = useState<DefectStatus | 'critical_vor' | null>(null);
  const [inspectingDefectId, setInspectingDefectId] = useState<string | null>(null);
  const [isAddingDefect, setIsAddingDefect] = useState(false);
  const [newCategory, setNewCategory] = useState<DefectCategory>('tyres');
  const [newSeverity, setNewSeverity] = useState<DefectSeverity>('advisory_minor');
  const [newVehicleId, setNewVehicleId] = useState('');
  const [newDriverId, setNewDriverId] = useState('');
  const [newNote, setNewNote] = useState('');
  const [isSavingDefect, setIsSavingDefect] = useState(false);
  const [defectFormError, setDefectFormError] = useState('');

  const loadOverview = useCallback(async () => {
    if (isMockMode || !supabase || !organizationId) return;
    setIsLoading(true);
    setError('');
    try {
      const [{ data: vRows, error: vErr }, { data: dRows, error: dErr }, { data: drRows, error: drErr }] = await Promise.all([
        supabase.from('vehicles').select('id, vehicle_number, vehicle_type, inspection_type, inspection_due_date, is_vor, notes').eq('organization_id', organizationId).eq('is_active', true),
        supabase
          .from('incident_reports')
          .select('id, category, severity, status, created_at, note, vehicle_id, driver_id, photo_urls, vehicles!vehicle_id(vehicle_number), drivers(full_name)')
          .eq('organization_id', organizationId)
          .order('created_at', { ascending: false }),
        supabase.from('drivers').select('id, driver_id, full_name').eq('organization_id', organizationId).eq('is_active', true),
      ]);
      if (vErr || dErr || drErr) {
        setError((vErr ?? dErr ?? drErr)?.message ?? 'Could not load the compliance overview.');
        return;
      }
      setVehicles((vRows ?? []) as VehicleRow[]);
      setDefects((dRows ?? []).map((d: any) => ({
        ...d,
        vehicle_number: d.vehicles?.vehicle_number,
        driver_name: d.drivers?.full_name,
        photo_urls: d.photo_urls ?? [],
      })) as DefectRow[]);
      setDrivers((drRows ?? []) as DriverOption[]);
    } catch (_) {
      setError('Could not load the compliance overview.');
    } finally {
      setIsLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  // Realtime: a driver-submitted incident report must land on this panel
  // immediately — dispatch can't wait on a manual refresh to find out a
  // truck or trailer just went down. Mirrors the realtime_alerts/
  // realtime_sos_alerts pattern already used in App.tsx.
  useEffect(() => {
    if (isMockMode || !supabase || !organizationId) return;
    const incidentChannel = supabase
      .channel('realtime_incident_reports')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'incident_reports' },
        () => {
          loadOverview();
        }
      )
      .subscribe();
    return () => {
      supabase!.removeChannel(incidentChannel);
    };
  }, [organizationId, loadOverview]);

  const handleAddDefect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isMockMode || !supabase) return;
    setDefectFormError('');
    if (!newDriverId) {
      setDefectFormError('Select who this walkaround defect is being reported by.');
      return;
    }
    setIsSavingDefect(true);
    try {
      const { error: insertError } = await supabase.from('incident_reports').insert({
        driver_id: newDriverId,
        vehicle_id: newVehicleId || null,
        category: newCategory,
        severity: newSeverity,
        note: newNote.trim() || null,
        status: 'open',
      });
      if (insertError) throw insertError;
      setNewCategory('tyres');
      setNewSeverity('advisory_minor');
      setNewVehicleId('');
      setNewDriverId('');
      setNewNote('');
      setIsAddingDefect(false);
      await loadOverview();
    } catch (err: any) {
      setDefectFormError(err?.message ?? 'Could not log the defect.');
    } finally {
      setIsSavingDefect(false);
    }
  };

  const handleUpdateDefectStatus = async (id: string, status: DefectStatus) => {
    if (isMockMode || !supabase) return;
    try {
      const { error: updateError } = await supabase.from('incident_reports').update({ status }).eq('id', id);
      if (updateError) throw updateError;
      setDefects(prev => prev.map(d => (d.id === id ? { ...d, status } : d)));
      setInspectingDefectId(null);
    } catch (err: any) {
      setError(err?.message ?? 'Could not update the defect.');
    }
  };

  // Grounds the tagged vehicle directly — VOR is a property of the asset,
  // not a workflow state of the defect report itself.
  const handleSetVor = async (defectId: string, vehicleId: string | null) => {
    if (isMockMode || !supabase || !vehicleId) return;
    try {
      const [{ error: vehicleError }, { error: defectError }] = await Promise.all([
        supabase.from('vehicles').update({ is_vor: true }).eq('id', vehicleId),
        supabase.from('incident_reports').update({ severity: 'critical_vor' }).eq('id', defectId),
      ]);
      if (vehicleError || defectError) throw vehicleError ?? defectError;
      setVehicles(prev => prev.map(v => (v.id === vehicleId ? { ...v, is_vor: true } : v)));
      setDefects(prev => prev.map(d => (d.id === defectId ? { ...d, severity: 'critical_vor' } : d)));
      setInspectingDefectId(null);
    } catch (err: any) {
      setError(err?.message ?? 'Could not ground this vehicle.');
    }
  };

  // Real, unresolved critical-defect count per vehicle — drives VOR
  // status alongside an actual overdue date (never proximity alone).
  const criticalDefectCounts: Record<string, number> = {};
  for (const d of defects) {
    if (d.severity === 'critical_vor' && d.status !== 'closed' && d.vehicle_id) {
      criticalDefectCounts[d.vehicle_id] = (criticalDefectCounts[d.vehicle_id] ?? 0) + 1;
    }
  }
  // Deliberately does NOT fall back to v.is_vor here. That flag is only
  // ever set (by the "Set VOR" action or the ground_vehicle_on_critical_
  // defect trigger), never cleared when the underlying defect is closed —
  // forcing it into the count kept a vehicle stuck at VOR forever after
  // its defect was rectified, even 80+ days from its next inspection.
  // criticalDefectCounts is already the live, authoritative source (open
  // critical_vor defects only), matching getAssetComplianceStatus's own
  // two-condition rule exactly.
  const vehiclesWithStatus = vehicles.map(v => ({
    ...v,
    status: getAssetComplianceStatus(v.inspection_due_date, criticalDefectCounts[v.id] ?? 0, thresholdDays),
  }));
  const compliantCount = vehiclesWithStatus.filter(v => v.status.tier === 'green').length;
  const actionRequiredCount = vehiclesWithStatus.filter(v => v.status.tier === 'amber').length;
  const vorCount = vehiclesWithStatus.filter(v => v.status.tier === 'red').length;

  const urgentQueue = vehiclesWithStatus
    .filter(v => v.status.tier === 'red' || v.status.tier === 'amber')
    .sort((a, b) => {
      if (a.status.tier !== b.status.tier) return a.status.tier === 'red' ? -1 : 1;
      return (a.status.daysRemaining ?? 0) - (b.status.daysRemaining ?? 0);
    })
    .slice(0, 5);

  // Upcoming 7-day inspection schedule — vehicles whose next inspection
  // falls due today through 7 days out, independent of current VOR/defect
  // status (already-grounded assets are covered by the Urgent Queue
  // above; this is purely "what's coming due soon" for planning).
  const upcoming7Day = vehiclesWithStatus
    .filter(v => v.status.daysRemaining !== null && v.status.daysRemaining >= 0 && v.status.daysRemaining <= 7)
    .sort((a, b) => (a.status.daysRemaining ?? 0) - (b.status.daysRemaining ?? 0))
    .slice(0, 5);

  const fleetDonutData: DonutSlice[] = [
    { label: 'Compliant', value: compliantCount, color: '#10B981' },
    { label: 'Action Required', value: actionRequiredCount, color: '#F59E0B' },
    { label: 'VOR (Grounded)', value: vorCount, color: '#CC0000' },
  ].filter(d => d.value > 0);

  // Real triage metrics — see the file header for what's deliberately
  // NOT shown here (cost estimate, resolution turnaround, workshop status).
  const activeVorStopsCount = defects.filter(d => d.severity === 'critical_vor' && d.status !== 'closed').length;
  const openCount = defects.filter(d => d.status === 'open').length;
  const acknowledgedCount = defects.filter(d => d.status === 'acknowledged').length;
  const closedCount = defects.filter(d => d.status === 'closed').length;

  const filteredDefects = statusFilter === null
    ? defects
    : statusFilter === 'critical_vor'
      ? defects.filter(d => d.severity === 'critical_vor' && d.status !== 'closed')
      : defects.filter(d => d.status === statusFilter);

  // Overview inbox: unresolved critical defects first, then most recent —
  // the full registry (all of filteredDefects, unranked) lives on the
  // dedicated Defects view.
  const compactDefects = [...filteredDefects]
    .sort((a, b) => {
      const aUrgent = a.severity === 'critical_vor' && a.status !== 'closed';
      const bUrgent = b.severity === 'critical_vor' && b.status !== 'closed';
      if (aUrgent !== bUrgent) return aUrgent ? -1 : 1;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    })
    .slice(0, 4);

  // Readiness: real roadworthy-unit counts, no load-scheduling data implied.
  const totalActive = vehicles.length;
  const roadworthyCount = compliantCount;
  const percentRoadworthy = totalActive > 0 ? Math.round((roadworthyCount / totalActive) * 100) : 0;
  const tractorTotal = vehiclesWithStatus.filter(v => v.vehicle_type === 'truck').length;
  const tractorRoadworthy = vehiclesWithStatus.filter(v => v.vehicle_type === 'truck' && v.status.tier === 'green').length;
  const tractorPercent = tractorTotal > 0 ? Math.round((tractorRoadworthy / tractorTotal) * 100) : 0;
  const trailerTotal = vehiclesWithStatus.filter(v => v.vehicle_type === 'trailer').length;
  const trailerRoadworthy = vehiclesWithStatus.filter(v => v.vehicle_type === 'trailer' && v.status.tier === 'green').length;
  const trailerPercent = trailerTotal > 0 ? Math.round((trailerRoadworthy / trailerTotal) * 100) : 0;
  // An articulated combination needs one roadworthy tractor AND one
  // roadworthy trailer — real capacity is whichever side is scarcer.
  const articulatedCapacity = Math.min(tractorRoadworthy, trailerRoadworthy);

  // Defect hotspots by component — DVSA-aligned 5-group taxonomy (plus an
  // "Other" catch-all for anything unmapped), counting only active
  // (non-rectified) defects, matching the card's own "active" framing.
  const hotspotEligibleDefects = defects.filter(d => d.status !== 'closed' && CATEGORY_TO_DVSA_GROUP[d.category]);
  const totalActiveHotspotDefects = hotspotEligibleDefects.length;
  const categoryBreakdown = (Object.keys(DVSA_GROUP_LABELS) as DvsaGroup[])
    .map(group => ({
      group,
      count: hotspotEligibleDefects.filter(d => CATEGORY_TO_DVSA_GROUP[d.category] === group).length,
    }))
    .filter(g => g.count > 0)
    .sort((a, b) => b.count - a.count);
  const HOTSPOT_RANK_COLORS = ['#CC0000', '#F59E0B', '#94A3B8', '#CBD5E1', '#E2E8F0', '#E2E8F0'];

  return (
    <div className="flex-1">
      <div className="flex align-center justify-between mb-16">
        <h2 className="text-xl font-black text-primary m-0">COMPLIANCE &amp; SAFETY</h2>
      </div>

      {error && <div className="login-notice login-notice--error mb-16">{error}</div>}
      {isLoading && <p className="text-sm text-muted mb-16">Loading…</p>}

      {/* ── Fleet Readiness & Dispatch Capacity (60%) + Defect
           Hotspots (40%) — the two highest-stakes "can we actually
           dispatch right now" figures, so they lead the page instead
           of sitting below the donuts. Real 60/40 split, not the
           grid-cols-2's implicit 50/50. ─────────────────────────── */}
      <div className="flex gap-16 mb-16" style={{ alignItems: 'stretch', flexWrap: 'wrap' }}>
        <div className="glass-card p-24" style={{ display: 'flex', flexDirection: 'column', flex: '3 1 420px' }}>
          <div className="flex align-center justify-between mb-16">
            <h3 className="text-sm font-bold text-primary m-0">Fleet Readiness &amp; Dispatch Capacity</h3>
            <span className={`badge ${percentRoadworthy >= 60 ? 'badge-success' : percentRoadworthy >= 30 ? 'badge-warning' : 'badge-danger'}`}>
              {percentRoadworthy}% Overall
            </span>
          </div>

          <div className="grid grid-cols-2 gap-16 mb-16">
            {/* Tractor Units */}
            <div>
              <div className="flex justify-between mb-4">
                <span className="text-xs font-bold text-primary">Tractor Units (HGV)</span>
              </div>
              <span className="font-mono tabular-nums text-xs text-muted">
                {tractorRoadworthy} / {tractorTotal} Roadworthy ({tractorPercent}%)
              </span>
              <div className="flex mt-4" style={{ gap: '2px', height: '10px' }}>
                {tractorTotal === 0 ? (
                  <div style={{ flex: 1, borderRadius: '4px', background: 'var(--card-bg-hover)' }} />
                ) : (
                  Array.from({ length: tractorTotal }, (_, i) => (
                    <div key={i} style={{ flex: 1, borderRadius: '3px', background: i < tractorRoadworthy ? '#10B981' : '#CC0000' }} />
                  ))
                )}
              </div>
            </div>

            {/* Trailers */}
            <div>
              <div className="flex justify-between mb-4">
                <span className="text-xs font-bold text-primary">Trailers</span>
              </div>
              <span className="font-mono tabular-nums text-xs text-muted">
                {trailerRoadworthy} / {trailerTotal} Roadworthy ({trailerPercent}%)
              </span>
              <div className="flex mt-4" style={{ gap: '2px', height: '10px' }}>
                {trailerTotal === 0 ? (
                  <div style={{ flex: 1, borderRadius: '4px', background: 'var(--card-bg-hover)' }} />
                ) : (
                  Array.from({ length: trailerTotal }, (_, i) => (
                    <div key={i} style={{ flex: 1, borderRadius: '3px', background: i < trailerRoadworthy ? '#10B981' : '#CC0000' }} />
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Compact horizontal dispatch alert banner — one line,
              real state (blocked/limited/balanced/no-data), always
              rendered so this half of the card is never empty. */}
          <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end' }}>
            {tractorTotal === 0 || trailerTotal === 0 ? (
              <div className="flex align-center justify-between" style={{ gap: '10px', padding: '10px', borderRadius: '8px', background: 'var(--card-bg-hover)', width: '100%' }}>
                <span className="flex align-center text-xs text-muted" style={{ gap: '8px' }}>
                  <ShieldAlert size={15} style={{ flexShrink: 0 }} />
                  Add both tractor units and trailers to see articulated dispatch capacity.
                </span>
              </div>
            ) : articulatedCapacity === 0 ? (
              <div className="flex align-center justify-between" style={{ gap: '10px', padding: '10px', borderRadius: '8px', background: 'rgba(254,242,242,0.7)', border: '1px solid #FECACA', width: '100%', flexWrap: 'wrap' }}>
                <span className="flex align-center text-xs font-bold" style={{ gap: '8px', color: '#991B1B' }}>
                  <AlertTriangle size={15} color="#CC0000" style={{ flexShrink: 0 }} />
                  Dispatch Blocked: <span className="font-mono tabular-nums">{trailerRoadworthy < tractorRoadworthy ? trailerRoadworthy : tractorRoadworthy}</span> {trailerRoadworthy < tractorRoadworthy ? 'trailers' : 'tractor units'} cleared for dispatch. Zero articulated combinations can legally depart.
                </span>
                <button
                  type="button"
                  onClick={onViewGroundedAssets}
                  className="flex align-center text-xs font-bold"
                  style={{ gap: '4px', background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--brand-red)', flexShrink: 0 }}
                >
                  Review Grounded {trailerRoadworthy === 0 ? 'Trailers' : 'Tractor Units'} <ArrowRight size={12} />
                </button>
              </div>
            ) : tractorRoadworthy !== trailerRoadworthy ? (
              <div className="flex align-center justify-between" style={{ gap: '10px', padding: '10px', borderRadius: '8px', background: '#FFFBEB', border: '1px solid #FDE68A', width: '100%', flexWrap: 'wrap' }}>
                <span className="flex align-center text-xs font-bold" style={{ gap: '8px', color: '#92400E' }}>
                  <AlertTriangle size={15} color="#F59E0B" style={{ flexShrink: 0 }} />
                  Dispatch Capacity Limited: <span className="font-mono tabular-nums">{articulatedCapacity}</span> combination{articulatedCapacity === 1 ? '' : 's'} can depart — limited by {trailerRoadworthy < tractorRoadworthy ? 'trailers' : 'tractor units'}.
                </span>
                <button
                  type="button"
                  onClick={onViewGroundedAssets}
                  className="flex align-center text-xs font-bold"
                  style={{ gap: '4px', background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#92400E', flexShrink: 0 }}
                >
                  Review Grounded {trailerRoadworthy < tractorRoadworthy ? 'Trailers' : 'Tractor Units'} <ArrowRight size={12} />
                </button>
              </div>
            ) : (
              <div className="flex align-center" style={{ gap: '10px', padding: '10px', borderRadius: '8px', background: '#F0FDF4', border: '1px solid #BBF7D0', width: '100%' }}>
                <ShieldAlert size={15} color="#10B981" style={{ flexShrink: 0 }} />
                <span className="text-xs" style={{ color: '#166534' }}>
                  <span className="font-mono tabular-nums">{articulatedCapacity}</span> articulated combination{articulatedCapacity === 1 ? '' : 's'} ready for dispatch — balanced.
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="glass-card p-24" style={{ display: 'flex', flexDirection: 'column', flex: '2 1 280px' }}>
          <div className="flex align-center justify-between mb-16">
            <h3 className="text-sm font-bold text-primary m-0">Defect Hotspots</h3>
            <span className="font-mono tabular-nums text-xs text-muted">{totalActiveHotspotDefects} active</span>
          </div>
          {categoryBreakdown.length === 0 ? (
            <p className="text-sm text-muted">No active defects logged yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {categoryBreakdown.map(({ group, count }, i) => {
                const pct = totalActiveHotspotDefects > 0 ? Math.round((count / totalActiveHotspotDefects) * 100) : 0;
                const barColor = HOTSPOT_RANK_COLORS[Math.min(i, HOTSPOT_RANK_COLORS.length - 1)];
                return (
                  <div key={group}>
                    <div className="flex justify-between mb-4">
                      <span className="text-xs font-bold text-primary">{DVSA_GROUP_LABELS[group]}</span>
                      <span className="font-mono tabular-nums text-xs" style={{ color: '#64748B' }}>{pct}% ({count})</span>
                    </div>
                    <div style={{ height: '7px', borderRadius: '4px', background: 'var(--card-bg-hover)', overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: barColor }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Card 1: Fleet Roadworthiness — 40/60 split ──────────── */}
      <div className="glass-card mb-16" style={{ display: 'flex', flexWrap: 'wrap', overflow: 'hidden' }}>
        <div className="p-24" style={{ flex: '1 1 320px', maxWidth: '400px', minWidth: 0, borderRight: '1px solid var(--border-color)' }}>
          <h3 className="text-sm font-bold text-primary mb-8">Current Fleet State</h3>
          <FleetStatusDonutChart
            data={fleetDonutData}
            centerLabel="Assets"
            height={220}
            emptyTitle="No Fleet Assets Yet"
            emptyDescription="Add trucks and trailers on Fleet Roadworthiness to see status here."
          />
        </div>
        <div className="p-24" style={{ flex: '2 1 420px' }}>
          <div className="flex align-center justify-between mb-16">
            <h3 className="text-sm font-bold text-primary m-0">Actionable Urgent Queue</h3>
            {vorCount > 0 && <span className="badge badge-danger">{vorCount} grounded</span>}
          </div>

          {urgentQueue.length === 0 ? (
            <p className="text-sm text-muted">Nothing needs attention right now — every asset is compliant.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {urgentQueue.map(v => (
                <div key={v.id} className="flex align-center" style={{ gap: '10px', padding: '8px 10px', borderRadius: '8px', background: 'var(--card-bg-hover)' }}>
                  <span className="font-mono font-bold text-accent" style={{ flexShrink: 0 }}>{v.vehicle_number}</span>
                  <span className="text-secondary text-xs" style={{ flexShrink: 0 }}>{v.vehicle_type === 'truck' ? 'Tractor Unit' : v.vehicle_type === 'trailer' ? 'Trailer' : v.vehicle_type}</span>
                  <span className={`badge ${TIER_BADGE_CLASS[v.status.tier]}`} style={{ flexShrink: 0 }}>{v.status.label}</span>
                  <span className="text-secondary text-xs" style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {v.notes || INSPECTION_TYPE_LABELS[v.inspection_type] || v.inspection_type}
                  </span>
                  <span className="font-mono text-xs text-muted tabular-nums" style={{ flexShrink: 0 }}>{formatDaysRemaining(v.status.daysRemaining)}</span>
                </div>
              ))}
            </div>
          )}

          {vorCount > 0 && (
            <button
              type="button"
              onClick={onViewGroundedAssets}
              className="flex align-center mt-16"
              style={{ gap: '4px', background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--brand-red)', fontWeight: 700, fontSize: '13px' }}
            >
              View all {vorCount} grounded asset{vorCount === 1 ? '' : 's'} <ArrowRight size={14} />
            </button>
          )}
        </div>
      </div>

      {/* ── Card 2: Defect Status Queue + Upcoming 7-Day Inspections —
           50/50 split, no charts. This pairing is operational (what
           needs action now) and scheduling (what's coming due) —
           both read faster as a list/table than a ring, unlike Card
           1's fleet mix which is genuinely a proportion. ─────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 mb-16" style={{ alignItems: 'stretch' }}>

        {/* Left: vertical defect severity & status queue */}
        <div className="glass-card p-24" style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="flex align-center justify-between mb-16">
            <h3 className="text-sm font-bold text-primary m-0">Defect Severity &amp; Operational Status</h3>
            <span className="badge badge-accent font-mono">{defects.length} Total Defects</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {([
              ['critical_vor', 'Critical VOR (Immediate Grounding)', activeVorStopsCount, '#CC0000', AlertTriangle],
              ['open', 'Open (Awaiting Workshop Triage)', openCount, '#F59E0B', Clock],
              ['acknowledged', 'Under Inspection / In Workshop', acknowledgedCount, 'var(--charcoal-light)', Wrench],
              ['closed', 'Rectified (Awaiting Operator Clearance)', closedCount, '#10B981', CheckCircle2],
            ] as const).map(([value, label, count, color, Icon]) => (
              <button
                key={value}
                type="button"
                onClick={() => setStatusFilter(prev => (prev === value ? null : value))}
                className={`defect-status-row${statusFilter === value ? ' active' : ''}`}
                style={{ borderLeft: `4px solid ${color}` }}
              >
                <span className="flex align-center" style={{ gap: '10px' }}>
                  <Icon size={16} color={color} style={{ flexShrink: 0 }} />
                  <span className="text-xs font-bold text-primary">{label}</span>
                </span>
                <span className="font-mono font-black text-primary tabular-nums" style={{ fontSize: '16px', flexShrink: 0 }}>{count}</span>
              </button>
            ))}
          </div>

          {statusFilter && (
            <button
              type="button"
              onClick={() => setStatusFilter(null)}
              className="flex align-center text-xs font-bold mt-8"
              style={{ gap: '4px', background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--charcoal-light)', alignSelf: 'flex-start' }}
            >
              <X size={12} /> Clear filter
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsAddingDefect(!isAddingDefect)}
            className="h-8 px-3 text-xs font-medium rounded-lg inline-flex items-center gap-1.5 mt-16"
            style={{ backgroundColor: '#CC0000', color: '#FFFFFF', border: 'none', cursor: 'pointer', alignSelf: 'flex-start' }}
          >
            <Plus size={14} />
            Report Defect
          </button>

          {isAddingDefect && (
            <div className="glass-panel p-16 mt-16" style={{ borderRadius: '12px' }}>
              {defectFormError && <div className="login-notice login-notice--error mb-16">{defectFormError}</div>}
              <form onSubmit={handleAddDefect}>
                <div className="grid grid-cols-2 gap-16 mb-16">
                  <div className="input-group">
                    <span className="input-label">CATEGORY</span>
                    <select className="select-field" value={newCategory} onChange={(e) => setNewCategory(e.target.value as DefectCategory)}>
                      {(['tyres', 'brakes', 'lighting', 'air_leaks', 'bodywork', 'mirrors'] as DefectCategory[]).map(cat => (
                        <option key={cat} value={cat}>{CATEGORY_LABELS[cat]}</option>
                      ))}
                    </select>
                  </div>
                  <div className="input-group">
                    <span className="input-label">SEVERITY</span>
                    <select className="select-field" value={newSeverity} onChange={(e) => setNewSeverity(e.target.value as DefectSeverity)}>
                      <option value="advisory_minor">Advisory / Minor</option>
                      <option value="critical_vor">Critical / VOR (grounds the asset)</option>
                    </select>
                  </div>
                  <div className="input-group">
                    <span className="input-label">VEHICLE (OPTIONAL)</span>
                    <select className="select-field" value={newVehicleId} onChange={(e) => setNewVehicleId(e.target.value)}>
                      <option value="">Not tagged to a vehicle</option>
                      {vehicles.map(v => (
                        <option key={v.id} value={v.id}>{v.vehicle_number}</option>
                      ))}
                    </select>
                  </div>
                  <div className="input-group">
                    <span className="input-label">REPORTED BY</span>
                    <select className="select-field" value={newDriverId} onChange={(e) => setNewDriverId(e.target.value)}>
                      <option value="">Select driver…</option>
                      {drivers.map(d => (
                        <option key={d.id} value={d.id}>{d.full_name} ({d.driver_id})</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="input-group mb-16">
                  <span className="input-label">NOTE</span>
                  <textarea
                    className="input-field"
                    style={{ width: '100%', minHeight: '60px', resize: 'vertical' }}
                    placeholder="What was found on the walkaround check…"
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                  />
                </div>
                <button type="submit" className="btn btn-primary" disabled={isSavingDefect}>
                  {isSavingDefect ? 'Saving…' : 'Log Defect'}
                </button>
              </form>
            </div>
          )}
        </div>

        {/* Right: upcoming 7-day inspection schedule — pure table, no
            chart. "Service Provider" and "Booking Status" columns from
            the original spec are deliberately left out: this schema
            doesn't track workshop bookings anywhere, so inventing
            provider names or booking states here would be fabricated
            data, not a real read on the fleet. Notes (a real, free-text
            field on the vehicle) stands in for anything an admin has
            actually recorded, honestly. */}
        <div className="glass-card p-24" style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="flex align-center mb-4" style={{ gap: '8px' }}>
            <Wrench size={16} color="var(--charcoal)" />
            <h3 className="text-sm font-bold text-primary m-0">Upcoming 7-Day Inspections &amp; Tests</h3>
          </div>
          <p className="text-xs text-muted mb-16">Mandatory PMI, roller brake test &amp; MOT dates due across your fleet.</p>

          {upcoming7Day.length === 0 ? (
            <p className="text-sm text-muted m-0" style={{ flex: 1 }}>No inspections due in the next 7 days.</p>
          ) : (
            <div className="table-container" style={{ flex: 1 }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Due</th>
                    <th>Asset</th>
                    <th>Inspection</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {upcoming7Day.map(v => (
                    <tr key={v.id}>
                      <td className="font-mono tabular-nums text-xs">{formatUpcomingDue(v.status.daysRemaining ?? 0)}</td>
                      <td className="font-mono font-bold text-xs">{v.vehicle_number}</td>
                      <td>
                        <span className="badge badge-accent" style={{ fontSize: '10px' }}>
                          {INSPECTION_TYPE_LABELS[v.inspection_type] || v.inspection_type}
                        </span>
                      </td>
                      <td className="text-xs text-muted">{v.notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <button
            type="button"
            onClick={onViewGroundedAssets}
            className="flex align-center mt-16"
            style={{ gap: '4px', background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--brand-red)', fontWeight: 700, fontSize: '13px', alignSelf: 'flex-start' }}
          >
            View Full Maintenance Planner <ArrowRight size={14} />
          </button>
        </div>
      </div>

      {/* ── Defect Inbox — compact, top 4 (urgent-first, then most
           recent) of whatever the triage pill above filters to. The
           full sortable/filterable registry lives on the dedicated
           Defects view (onViewAllDefects). Row click opens the same
           inspection drawer either way. ────────────────────────── */}
      <div className="glass-card mb-16" style={{ overflow: 'hidden' }}>
        <div className="p-16 flex align-center justify-between" style={{ borderBottom: '1px solid var(--border-color)' }}>
          <h3 className="text-sm font-bold text-primary m-0">Defect Inbox</h3>
          <span className="text-xs text-muted">{filteredDefects.length} of {defects.length} defects</span>
        </div>
        {compactDefects.length === 0 ? (
          <p className="text-sm text-muted p-16 m-0">No defects match this filter.</p>
        ) : (
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Reported</th>
                  <th>Asset</th>
                  <th>Category</th>
                  <th>Severity</th>
                  <th>Status</th>
                  <th>Evidence</th>
                </tr>
              </thead>
              <tbody>
                {compactDefects.map(d => (
                  <tr key={d.id} style={{ cursor: 'pointer' }} onClick={() => setInspectingDefectId(d.id)}>
                    <td className="text-secondary font-mono tabular-nums text-xs" style={{ padding: '8px 12px' }}>{new Date(d.created_at).toLocaleDateString('en-GB')}</td>
                    <td className="font-mono text-accent" style={{ padding: '8px 12px' }}>{d.vehicle_number ?? '—'}</td>
                    <td className="text-secondary" style={{ padding: '8px 12px' }}>{CATEGORY_LABELS[d.category]}</td>
                    <td style={{ padding: '8px 12px' }}><span className={`badge ${d.severity === 'critical_vor' ? 'badge-danger' : 'badge-warning'}`}>{d.severity === 'critical_vor' ? 'Critical' : 'Advisory'}</span></td>
                    <td style={{ padding: '8px 12px' }}><span className={`badge ${d.status === 'open' ? 'badge-danger' : d.status === 'acknowledged' ? 'badge-warning' : 'badge-success'}`}>{d.status === 'open' ? 'Open' : d.status === 'acknowledged' ? 'Under Inspection' : 'Rectified'}</span></td>
                    <td style={{ padding: '8px 12px' }}>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setInspectingDefectId(d.id); }}
                        className="flex align-center text-xs font-bold"
                        style={{ gap: '4px', background: 'none', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '3px 7px', cursor: 'pointer', color: d.photo_urls.length > 0 ? 'var(--brand-red)' : 'var(--charcoal-light)' }}
                      >
                        <Camera size={12} /> {d.photo_urls.length > 0 ? d.photo_urls.length : 'None'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex align-center justify-between p-16" style={{ borderTop: '1px solid var(--border-color)' }}>
          <span className="text-xs text-muted">Showing {compactDefects.length} of {filteredDefects.length} defects</span>
          <button
            type="button"
            onClick={onViewAllDefects}
            className="flex align-center text-xs font-bold"
            style={{ gap: '4px', background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--brand-red)' }}
          >
            View All Defects &amp; History <ArrowRight size={12} />
          </button>
        </div>
      </div>

      {inspectingDefectId && (() => {
        const d = defects.find(x => x.id === inspectingDefectId);
        if (!d) return null;
        return (
          <DefectInspectionDrawer
            defect={{
              id: d.id,
              vehicle_id: d.vehicle_id,
              vehicle_number: d.vehicle_number,
              category: d.category,
              categoryLabel: CATEGORY_LABELS[d.category],
              severity: d.severity,
              status: d.status,
              created_at: d.created_at,
              note: d.note,
              driver_name: d.driver_name,
              photo_urls: d.photo_urls,
            }}
            onClose={() => setInspectingDefectId(null)}
            onUpdateStatus={handleUpdateDefectStatus}
            onSetVor={handleSetVor}
          />
        );
      })()}

    </div>
  );
}
