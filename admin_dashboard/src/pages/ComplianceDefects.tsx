import { useState, useEffect, useCallback, useMemo } from 'react';
import { Camera, ChevronLeft, ChevronRight } from 'lucide-react';
import { supabase, isMockMode } from '../App';
import NoData from '../components/ui/no-data';
import TableFilter, { type TableFilterGroup } from '../components/ui/table-filter';
import DefectInspectionDrawer from './DefectInspectionDrawer';
import AuthorizeUnitModal from '../components/AuthorizeUnitModal';
import StatusLedger from './StatusLedger';

// ============================================================
// Compliance & Safety — full Defect Registry. The Overview page only
// ever shows the top 4 most urgent/recent defects; this is the
// complete, filterable, paginated list it links out to (onBack lets
// the caller return to Overview — this app switches views via
// activeTab, not a router, so there's no literal /compliance/defects
// URL, matching how Fleet Roadworthiness / Driver Hours already work
// as sibling tabs under the same Compliance & Safety nav group).
//
// Types/labels are intentionally duplicated from Compliance.tsx rather
// than imported — matches this app's existing per-page convention
// (FleetRoadworthiness/Compliance already each define their own local
// VehicleType/InspectionType rather than sharing one file).
// ============================================================

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
  /** The unit or trailer this defect is against (whichever was reported). */
  unit_id: string | null;
  registration?: string;
  driver_id: string;
  driver_name?: string;
  photo_urls: string[];
}

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

const PAGE_SIZE = 15;

interface ComplianceDefectsProps {
  organizationId: string | null;
  onBack?: () => void;
  /** Arrive filtered to one registration (the status badge in Fleet Roadworthiness). */
  focusUnit?: { number: string; nonce: number } | null;
}

export default function ComplianceDefects({ organizationId, onBack, focusUnit }: ComplianceDefectsProps) {
  const [subTab, setSubTab] = useState<'defects' | 'history'>('defects');
  const [authorizing, setAuthorizing] = useState<{ vehicleId: string; registration: string } | null>(null);
  const [defects, setDefects] = useState<DefectRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [inspectingDefectId, setInspectingDefectId] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  const [severityFilter, setSeverityFilter] = useState<string[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<string[]>([]);
  const [statusFilterMulti, setStatusFilterMulti] = useState<string[]>([]);
  // Manual search — real vehicle registrations only, no driver-name/free
  // text matching bundled in, since the ask is specifically "find the
  // truck/trailer with defects attached", not a general-purpose search.
  const [vehicleSearchQuery, setVehicleSearchQuery] = useState('');

  const loadDefects = useCallback(async () => {
    if (isMockMode || !supabase || !organizationId) return;
    setIsLoading(true);
    setError('');
    try {
      const { data, error: fetchError } = await supabase
        .from('incident_reports')
        .select('id, category, severity, status, created_at, note, vehicle_id, trailer_id, driver_id, photo_urls, vehicles!vehicle_id(vehicle_number), trailer:vehicles!trailer_id(vehicle_number), drivers(full_name)')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false });
      if (fetchError) throw fetchError;
      setDefects((data ?? []).map((d: any) => ({
        ...d,
        vehicle_number: d.vehicles?.vehicle_number ?? d.trailer?.vehicle_number,
        unit_id: d.vehicle_id ?? d.trailer_id ?? null,
        registration: (d.vehicles?.vehicle_number ?? d.trailer?.vehicle_number ?? '').toString().toUpperCase(),
        driver_name: d.drivers?.full_name,
        photo_urls: d.photo_urls ?? [],
      })) as DefectRow[]);
    } catch (err: any) {
      setError(err?.message ?? 'Could not load the defect registry.');
    } finally {
      setIsLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    loadDefects();
  }, [loadDefects]);

  useEffect(() => {
    if (isMockMode || !supabase || !organizationId) return;
    const incidentChannel = supabase
      .channel('realtime_defects_registry')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'incident_reports' }, () => loadDefects())
      .subscribe();
    return () => { supabase!.removeChannel(incidentChannel); };
  }, [organizationId, loadDefects]);

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

  const handleSetVor = async (defectId: string, vehicleId: string | null) => {
    if (isMockMode || !supabase || !vehicleId) return;
    try {
      const [{ error: vehicleError }, { error: defectError }] = await Promise.all([
        supabase.from('vehicles').update({ is_vor: true }).eq('id', vehicleId),
        supabase.from('incident_reports').update({ severity: 'critical_vor' }).eq('id', defectId),
      ]);
      if (vehicleError || defectError) throw vehicleError ?? defectError;
      setDefects(prev => prev.map(d => (d.id === defectId ? { ...d, severity: 'critical_vor' } : d)));
      setInspectingDefectId(null);
    } catch (err: any) {
      setError(err?.message ?? 'Could not ground this vehicle.');
    }
  };

  // Arriving from a status badge: show just that unit's defects.
  useEffect(() => {
    if (!focusUnit) return;
    setSubTab('defects');
    setVehicleSearchQuery(focusUnit.number);
    setSeverityFilter([]); setCategoryFilter([]); setStatusFilterMulti([]);
    setPage(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusUnit?.nonce]);

  const filterGroups: TableFilterGroup[] = [
    {
      key: 'severity',
      label: 'Severity',
      options: [
        { value: 'critical_vor', label: 'Critical VOR' },
        { value: 'advisory_minor', label: 'Advisory' },
      ],
      selected: severityFilter,
      onChange: (v) => { setSeverityFilter(v); setPage(0); },
    },
    {
      key: 'category',
      label: 'Component Category',
      options: (Object.keys(CATEGORY_LABELS) as DefectCategory[]).map(c => ({ value: c, label: CATEGORY_LABELS[c] })),
      selected: categoryFilter,
      onChange: (v) => { setCategoryFilter(v); setPage(0); },
    },
    {
      key: 'status',
      label: 'Status',
      options: [
        { value: 'open', label: 'Open' },
        { value: 'acknowledged', label: 'Under Inspection' },
        { value: 'closed', label: 'Rectified' },
      ],
      selected: statusFilterMulti,
      onChange: (v) => { setStatusFilterMulti(v); setPage(0); },
    },
  ];

  const filteredDefects = useMemo(() => {
    const query = vehicleSearchQuery.trim().toLowerCase();
    return defects.filter(d => {
      if (severityFilter.length > 0 && !severityFilter.includes(d.severity)) return false;
      if (categoryFilter.length > 0 && !categoryFilter.includes(d.category)) return false;
      if (statusFilterMulti.length > 0 && !statusFilterMulti.includes(d.status)) return false;
      if (query && !(d.vehicle_number ?? '').toLowerCase().includes(query)) return false;
      return true;
    });
  }, [defects, severityFilter, categoryFilter, statusFilterMulti, vehicleSearchQuery]);

  const pageCount = Math.max(1, Math.ceil(filteredDefects.length / PAGE_SIZE));
  const clampedPage = Math.min(page, pageCount - 1);
  const pageDefects = filteredDefects.slice(clampedPage * PAGE_SIZE, clampedPage * PAGE_SIZE + PAGE_SIZE);

  return (
    <div className="flex-1">
      <div className="flex align-center justify-between mb-16">
        <div>
          <h2 className="text-xl font-black text-primary m-0">DEFECT REGISTRY</h2>
          <p className="text-xs text-muted m-0 mt-4">Complete driver-reported defect history for this org.</p>
        </div>
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="flex align-center text-xs font-bold"
            style={{ gap: '4px', background: 'none', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '8px 14px', cursor: 'pointer', color: 'var(--charcoal)' }}
          >
            <ChevronLeft size={14} /> Back to Overview
          </button>
        )}
      </div>

      <div className="live-subtabs" role="tablist" style={{ marginTop: 0, marginBottom: '16px' }}>
        <button type="button" role="tab" aria-selected={subTab === 'defects'} className={`live-subtab${subTab === 'defects' ? ' live-subtab--active' : ''}`} onClick={() => setSubTab('defects')}>Defects</button>
        <button type="button" role="tab" aria-selected={subTab === 'history'} className={`live-subtab${subTab === 'history' ? ' live-subtab--active' : ''}`} onClick={() => setSubTab('history')}>Authorization History</button>
      </div>

      {error && <div className="login-notice login-notice--error mb-16">{error}</div>}

      {subTab === 'history' && (
        <StatusLedger
          organizationId={organizationId}
          embedded
          onOpenUnit={(reg) => { setVehicleSearchQuery(reg); setSubTab('defects'); setPage(0); }}
        />
      )}

      {subTab === 'defects' && (
      <div className="glass-card" style={{ overflow: 'hidden' }}>
        <div className="p-16 flex align-center justify-between" style={{ borderBottom: '1px solid var(--border-color)', flexWrap: 'wrap', gap: '10px' }}>
          <div className="flex align-center" style={{ gap: '10px', flexWrap: 'wrap' }}>
            <TableFilter groups={filterGroups} search={{ value: vehicleSearchQuery, onChange: (v) => { setVehicleSearchQuery(v); setPage(0); }, placeholder: 'Search by truck or trailer registration…' }} />
          </div>
          <span className="text-xs text-muted">
            {isLoading ? 'Loading…' : `${filteredDefects.length} of ${defects.length} defects`}
          </span>
        </div>

        {pageDefects.length === 0 ? (
          <NoData className="py-24" />
        ) : (
          <>
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Reported</th>
                    <th>Driver</th>
                    <th>Asset</th>
                    <th>Category</th>
                    <th>Severity</th>
                    <th>Status</th>
                    <th>Note</th>
                    <th>Evidence</th>
                  </tr>
                </thead>
                <tbody>
                  {pageDefects.map(d => (
                    <tr key={d.id} style={{ cursor: 'pointer' }} onClick={() => setInspectingDefectId(d.id)}>
                      <td className="text-secondary font-mono tabular-nums text-xs whitespace-nowrap">{new Date(d.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                      <td className="text-secondary">{d.driver_name ?? '—'}</td>
                      <td className="font-mono text-accent">{d.vehicle_number ?? '—'}</td>
                      <td className="text-secondary">{CATEGORY_LABELS[d.category]}</td>
                      <td><span className={`badge ${d.severity === 'critical_vor' ? 'badge-danger' : 'badge-warning'}`}>{d.severity === 'critical_vor' ? 'Critical' : 'Advisory'}</span></td>
                      <td><span className={`badge ${d.status === 'open' ? 'badge-danger' : d.status === 'acknowledged' ? 'badge-warning' : 'badge-success'}`}>{d.status === 'open' ? 'Open' : d.status === 'acknowledged' ? 'Under Inspection' : 'Rectified'}</span></td>
                      <td className="text-secondary text-xs" style={{ maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.note || '—'}</td>
                      <td>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setInspectingDefectId(d.id); }}
                          className="flex align-center text-xs font-bold"
                          style={{ gap: '4px', background: 'none', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '4px 8px', cursor: 'pointer', color: d.photo_urls.length > 0 ? 'var(--brand-red)' : 'var(--charcoal-light)' }}
                        >
                          <Camera size={12} /> {d.photo_urls.length > 0 ? `${d.photo_urls.length} Photo${d.photo_urls.length === 1 ? '' : 's'}` : 'No Photos'}
                        </button>
                      </td>

                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex align-center justify-between p-16" style={{ borderTop: '1px solid var(--border-color)' }}>
              <span className="text-xs text-muted">
                Page <span className="font-mono tabular-nums">{clampedPage + 1}</span> of <span className="font-mono tabular-nums">{pageCount}</span>
              </span>
              <div className="flex align-center" style={{ gap: '8px' }}>
                <button
                  type="button"
                  disabled={clampedPage === 0}
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  className="flex align-center text-xs font-bold"
                  style={{ gap: '4px', background: 'none', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '6px 10px', cursor: clampedPage === 0 ? 'default' : 'pointer', opacity: clampedPage === 0 ? 0.4 : 1, color: 'var(--charcoal)' }}
                >
                  <ChevronLeft size={13} /> Prev
                </button>
                <button
                  type="button"
                  disabled={clampedPage >= pageCount - 1}
                  onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))}
                  className="flex align-center text-xs font-bold"
                  style={{ gap: '4px', background: 'none', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '6px 10px', cursor: clampedPage >= pageCount - 1 ? 'default' : 'pointer', opacity: clampedPage >= pageCount - 1 ? 0.4 : 1, color: 'var(--charcoal)' }}
                >
                  Next <ChevronRight size={13} />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
      )}

      {authorizing && (
        <AuthorizeUnitModal
          organizationId={organizationId}
          vehicleId={authorizing.vehicleId}
          registration={authorizing.registration}
          defects={defects
            .filter(x => x.severity === 'critical_vor' && x.status !== 'closed' && x.registration === authorizing.registration)
            .map(x => ({ id: x.id, categoryLabel: CATEGORY_LABELS[x.category], created_at: x.created_at, driver_name: x.driver_name, note: x.note, photoCount: x.photo_urls.length }))}
          onClose={() => setAuthorizing(null)}
          onDone={() => { setAuthorizing(null); loadDefects(); }}
        />
      )}

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
            onAuthorise={d.unit_id ? () => { setInspectingDefectId(null); setAuthorizing({ vehicleId: d.unit_id!, registration: d.registration ?? '' }); } : undefined}
          />
        );
      })()}
    </div>
  );
}
