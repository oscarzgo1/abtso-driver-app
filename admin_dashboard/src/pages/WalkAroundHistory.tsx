import { Fragment, useState, useEffect, useCallback, useMemo } from 'react';
import { ChevronLeft, ChevronRight, ChevronDown, Clock, ClipboardCheck, AlertTriangle } from 'lucide-react';
import { supabase, isMockMode } from '../App';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from '../components/ui/empty';
import TableFilter, { type TableFilterGroup } from '../components/ui/table-filter';

// ============================================================
// Walk-Around Check History — full, filterable, paginated log of
// every driver-submitted start-of-shift / end-of-shift walk-around
// (public.walkaround_checks, migration 052). Structurally the same
// pattern as ComplianceDefects.tsx: a sibling tab under the
// Compliance & Safety accordion, switched via activeTab (no router).
//
// "Target minutes" (org-configurable, default 15) is shown as a
// benchmark the admin set for themselves — not represented as a
// DVSA-mandated minimum, since it isn't one.
// ============================================================

type CheckType = 'start_of_shift' | 'end_of_shift';
type CheckResult = 'pass' | 'defects_found';
type FieldType = 'photo' | 'checkbox' | 'passFail' | 'text';

interface WalkaroundItem {
  key: string;
  label: string;
  type: FieldType;
  value: boolean | string | null;
  section?: string;
}

interface WalkaroundRow {
  id: string;
  driver_id: string;
  driver_name?: string;
  vehicle_id: string;
  vehicle_number?: string;
  trailer_id: string | null;
  trailer_number?: string;
  check_type: CheckType;
  started_at: string;
  completed_at: string | null;
  duration_seconds: number | null;
  items: WalkaroundItem[];
  overall_result: CheckResult | null;
  defect_note: string | null;
}

const PAGE_SIZE = 15;

function formatDuration(seconds: number | null): string {
  if (seconds === null) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s.toString().padStart(2, '0')}s`;
}

interface WalkAroundHistoryProps {
  organizationId: string | null;
  // Org-configurable "does this look rushed" benchmark (migration 056,
  // Settings > Alerts) — passed down from App.tsx's orgAlertSettings,
  // same pattern as Compliance/FleetRoadworthiness's thresholdDays,
  // instead of this page fetching it itself.
  targetMinutes: number;
  onBack?: () => void;
}

export default function WalkAroundHistory({ organizationId, targetMinutes, onBack }: WalkAroundHistoryProps) {
  const [checks, setChecks] = useState<WalkaroundRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});

  const [typeFilter, setTypeFilter] = useState<string[]>([]);
  const [resultFilter, setResultFilter] = useState<string[]>([]);

  const loadChecks = useCallback(async () => {
    if (isMockMode || !supabase || !organizationId) return;
    setIsLoading(true);
    setError('');
    try {
      const { data, error: fetchError } = await supabase
        .from('walkaround_checks')
        .select('id, driver_id, vehicle_id, trailer_id, check_type, started_at, completed_at, duration_seconds, items, overall_result, defect_note, drivers(full_name), vehicle:vehicles!vehicle_id(vehicle_number), trailer:vehicles!trailer_id(vehicle_number)')
        .eq('organization_id', organizationId)
        .order('started_at', { ascending: false });
      if (fetchError) throw fetchError;
      setChecks((data ?? []).map((c: any) => ({
        ...c,
        driver_name: c.drivers?.full_name,
        vehicle_number: c.vehicle?.vehicle_number,
        trailer_number: c.trailer?.vehicle_number,
        items: c.items ?? [],
      })) as WalkaroundRow[]);
    } catch (err: any) {
      setError(err?.message ?? 'Could not load walk-around check history.');
    } finally {
      setIsLoading(false);
    }
  }, [organizationId]);

  useEffect(() => { loadChecks(); }, [loadChecks]);

  // Photo values are private-bucket storage paths, not URLs — resolve
  // signed URLs lazily, only for whichever row is actually expanded,
  // rather than for every photo across every row up front.
  useEffect(() => {
    if (isMockMode || !supabase || !expandedId) return;
    const row = checks.find(c => c.id === expandedId);
    if (!row) return;
    const paths = row.items
      .filter(i => i.type === 'photo' && typeof i.value === 'string' && !photoUrls[i.value as string])
      .map(i => i.value as string);
    if (paths.length === 0) return;
    supabase.storage.from('walkaround-photos').createSignedUrls(paths, 3600).then(({ data }) => {
      if (!data) return;
      setPhotoUrls(prev => {
        const next = { ...prev };
        data.forEach((d, i) => { if (d.signedUrl) next[paths[i]] = d.signedUrl; });
        return next;
      });
    });
  }, [expandedId, checks, photoUrls]);

  useEffect(() => {
    if (isMockMode || !supabase || !organizationId) return;
    const channel = supabase
      .channel('realtime_walkaround_history')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'walkaround_checks' }, () => loadChecks())
      .subscribe();
    return () => { supabase!.removeChannel(channel); };
  }, [organizationId, loadChecks]);

  const filterGroups: TableFilterGroup[] = [
    {
      key: 'type',
      label: 'Check Type',
      options: [
        { value: 'start_of_shift', label: 'Start of Shift' },
        { value: 'end_of_shift', label: 'End of Shift' },
      ],
      selected: typeFilter,
      onChange: (v) => { setTypeFilter(v); setPage(0); },
    },
    {
      key: 'result',
      label: 'Result',
      options: [
        { value: 'pass', label: 'Pass' },
        { value: 'defects_found', label: 'Defects Found' },
      ],
      selected: resultFilter,
      onChange: (v) => { setResultFilter(v); setPage(0); },
    },
  ];

  const filteredChecks = useMemo(() => {
    return checks.filter(c => {
      if (typeFilter.length > 0 && !typeFilter.includes(c.check_type)) return false;
      if (resultFilter.length > 0 && c.overall_result && !resultFilter.includes(c.overall_result)) return false;
      return true;
    });
  }, [checks, typeFilter, resultFilter]);

  const pageCount = Math.max(1, Math.ceil(filteredChecks.length / PAGE_SIZE));
  const clampedPage = Math.min(page, pageCount - 1);
  const pageChecks = filteredChecks.slice(clampedPage * PAGE_SIZE, clampedPage * PAGE_SIZE + PAGE_SIZE);
  const targetSeconds = targetMinutes * 60;

  return (
    <div className="flex-1">
      <div className="flex align-center justify-between mb-16">
        <div>
          <h2 className="text-xl font-black text-primary m-0">WALK-AROUND CHECK HISTORY</h2>
          <p className="text-xs text-muted m-0 mt-4">
            Every start-of-shift and end-of-shift vehicle check, with how long each one took — target is {targetMinutes} min, set in Alert Settings.
          </p>
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

      {error && <div className="login-notice login-notice--error mb-16">{error}</div>}

      <div className="glass-card" style={{ overflow: 'hidden' }}>
        <div className="p-16 flex align-center justify-between" style={{ borderBottom: '1px solid var(--border-color)', flexWrap: 'wrap', gap: '10px' }}>
          <TableFilter groups={filterGroups} />
          <span className="text-xs text-muted">
            {isLoading ? 'Loading…' : `${filteredChecks.length} of ${checks.length} checks`}
          </span>
        </div>

        {pageChecks.length === 0 ? (
          <Empty className="py-24">
            <EmptyHeader>
              <EmptyMedia variant="icon"><ClipboardCheck /></EmptyMedia>
              <EmptyTitle>No Walk-Around Checks Yet</EmptyTitle>
              <EmptyDescription>
                {checks.length === 0 ? 'Driver-submitted walk-around checks will show up here.' : 'No checks match the current filters.'}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <>
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Started</th>
                    <th>Driver</th>
                    <th>Tractor</th>
                    <th>Trailer</th>
                    <th>Type</th>
                    <th>Duration</th>
                    <th>Result</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {pageChecks.map(c => {
                    const isExpanded = expandedId === c.id;
                    const isRushed = c.duration_seconds !== null && c.duration_seconds < targetSeconds;
                    const isDraft = c.completed_at === null;
                    const failCount = c.items.filter(i => i.type === 'passFail' && i.value === 'fail').length;
                    return (
                      <Fragment key={c.id}>
                        <tr style={{ cursor: 'pointer' }} onClick={() => setExpandedId(isExpanded ? null : c.id)}>
                          <td className="text-secondary font-mono tabular-nums text-xs whitespace-nowrap">
                            {new Date(c.started_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td className="text-secondary">{c.driver_name ?? '—'}</td>
                          <td className="font-mono text-accent">{c.vehicle_number ?? '—'}</td>
                          <td className="font-mono text-accent">{c.trailer_number ?? '—'}</td>
                          <td className="text-secondary text-xs">{c.check_type === 'start_of_shift' ? 'Start of Shift' : 'End of Shift'}</td>
                          <td>
                            <span className="flex align-center font-mono tabular-nums text-xs" style={{ gap: '4px', color: isRushed ? '#E65100' : 'var(--charcoal-mid)' }}>
                              <Clock size={12} /> {formatDuration(c.duration_seconds)}
                              {isRushed && <AlertTriangle size={12} />}
                            </span>
                          </td>
                          <td>
                            {isDraft ? (
                              <span className="badge" style={{ background: 'var(--card-bg-hover)', color: 'var(--charcoal-light)', border: '1px solid var(--border-color)' }}>Draft</span>
                            ) : (
                              <span className={`badge ${c.overall_result === 'defects_found' ? 'badge-danger' : 'badge-success'}`}>
                                {c.overall_result === 'defects_found' ? (failCount > 0 ? `${failCount} Defect${failCount === 1 ? '' : 's'}` : 'Defects Found') : 'Pass'}
                              </span>
                            )}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <ChevronDown size={14} style={{ transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s', color: 'var(--charcoal-light)' }} />
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr>
                            <td colSpan={8} style={{ background: 'var(--card-bg-hover)', padding: '14px 16px' }}>
                              {isDraft && (
                                <p className="text-xs font-bold mb-8" style={{ color: 'var(--charcoal-light)' }}>Saved as a draft — not yet submitted, does not count as a completed check.</p>
                              )}
                              {c.defect_note && (
                                <p className="text-xs font-bold mb-8" style={{ color: '#E65100' }}>Defect details: {c.defect_note}</p>
                              )}
                              <div className="flex flex-col" style={{ gap: '6px' }}>
                                {c.items.map(item => (
                                  <div key={item.key}>
                                    {item.section && (
                                      <p className="text-xs font-bold mt-8 mb-4" style={{ color: 'var(--charcoal)' }}>{item.section}</p>
                                    )}
                                    <div className="flex align-center text-xs" style={{ gap: '8px' }}>
                                      <span className="text-secondary" style={{ minWidth: '260px' }}>{item.label}</span>
                                      {item.type === 'checkbox' && (
                                        <span className={`badge ${item.value ? 'badge-success' : ''}`} style={{ minWidth: '20px', textAlign: 'center', padding: '1px 6px', background: item.value ? undefined : 'var(--card-bg)', color: item.value ? undefined : 'var(--charcoal-light)', border: item.value ? undefined : '1px solid var(--border-color)' }}>
                                          {item.value ? '✓' : '—'}
                                        </span>
                                      )}
                                      {item.type === 'passFail' && (
                                        <span className={`badge ${item.value === 'fail' ? 'badge-danger' : item.value === 'pass' ? 'badge-success' : ''}`}>
                                          {item.value === 'fail' ? 'Fail' : item.value === 'pass' ? 'Pass' : 'Not answered'}
                                        </span>
                                      )}
                                      {item.type === 'text' && (
                                        <span className="font-mono text-secondary">{(item.value as string) || '—'}</span>
                                      )}
                                      {item.type === 'photo' && (
                                        typeof item.value === 'string' && photoUrls[item.value] ? (
                                          <a href={photoUrls[item.value]} target="_blank" rel="noreferrer">
                                            <img src={photoUrls[item.value]} alt={item.label} style={{ width: '36px', height: '36px', objectFit: 'cover', borderRadius: '6px', border: '1px solid var(--border-color)' }} />
                                          </a>
                                        ) : (
                                          <span className="text-muted">{item.value ? 'Loading…' : 'No photo'}</span>
                                        )
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
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
    </div>
  );
}
