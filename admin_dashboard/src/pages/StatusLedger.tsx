import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, Lock } from 'lucide-react';
import { supabase, isMockMode } from '../App';
import TableFilter from '../components/ui/table-filter';
import NoData from '../components/ui/no-data';
import { signatureSrc, fullWhen, ACTION_LABEL, type LedgerEntry } from '../lib/authorization';

// ============================================================
// Unit Status Ledger — the permanent record of every manual change to a
// unit's or trailer's road status: who approved it (first and last name),
// their signature, when (server time), and why. Read-only by design: there
// is no edit or delete anywhere, and the database refuses both (migration
// 097), so the history stays exactly as it was written.
// ============================================================

const PAGE = 15;

export default function StatusLedger({ organizationId, onBack, onOpenUnit, embedded }: { organizationId: string | null; onBack?: () => void; onOpenUnit: (reg: string) => void; /** Shown inside the Defect Registry (no page header). */ embedded?: boolean }) {
  const [rows, setRows] = useState<LedgerEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState<string[]>([]);
  const [page, setPage] = useState(0);

  const load = useCallback(async () => {
    if (isMockMode || !supabase || !organizationId) return;
    setIsLoading(true);
    const { data, error: err } = await supabase
      .from('unit_status_ledger')
      .select('id, registration, action, previous_issues, reason, approver_first_name, approver_last_name, signature_svg, approved_by_email, approved_at, fixed_at, renewals')
      .eq('organization_id', organizationId)
      .order('approved_at', { ascending: false })
      .limit(1000);
    if (err) setError(err.message);
    else { setError(''); setRows((data ?? []) as LedgerEntry[]); }
    setIsLoading(false);
  }, [organizationId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (isMockMode || !supabase || !organizationId) return;
    const channel = supabase
      .channel('realtime_status_ledger')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'unit_status_ledger' }, () => load())
      .subscribe();
    return () => { supabase!.removeChannel(channel); };
  }, [organizationId, load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(r =>
      (actionFilter.length === 0 || actionFilter.includes(r.action)) &&
      (!q || `${r.registration} ${r.approver_first_name} ${r.approver_last_name} ${r.reason}`.toLowerCase().includes(q)));
  }, [rows, search, actionFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE));
  const safePage = Math.min(page, pageCount - 1);
  const shown = filtered.slice(safePage * PAGE, safePage * PAGE + PAGE);

  return (
    <div className="flex-1" style={{ minWidth: 0 }}>
      {!embedded && <div className="flex align-center justify-between mb-16" style={{ gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <h2 className="text-xl font-black text-primary m-0">AUTHORIZATION HISTORY</h2>
          <p className="text-xs text-muted m-0 mt-4 flex align-center" style={{ gap: '6px' }}>
            <Lock size={12} /> Permanent record of every manual status change — signed, timed and approved by name. Entries cannot be edited or removed.
          </p>
        </div>
        {onBack && (
          <button type="button" onClick={onBack} className="flex align-center text-xs font-bold" style={{ gap: '4px', background: 'none', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '8px 14px', cursor: 'pointer', color: 'var(--charcoal)' }}>
            <ChevronLeft size={14} /> Back
          </button>
        )}
      </div>}

      {embedded && (
        <p className="text-xs text-muted m-0 mb-12 flex align-center" style={{ gap: '6px' }}>
          <Lock size={12} /> Permanent record of every unit authorised for road use by hand — signed, timed and approved by name. Entries cannot be edited or removed.
        </p>
      )}

      {error && <div className="login-notice login-notice--error mb-16">{error}</div>}

      <div className="glass-card" style={{ overflow: 'hidden' }}>
        <div className="p-16 flex align-center justify-between" style={{ borderBottom: '1px solid var(--border-color)', gap: '10px', flexWrap: 'wrap' }}>
          <TableFilter
            groups={[{
              key: 'action', label: 'Change',
              options: [{ value: 'return_to_service', label: 'Authorised for road use' }, { value: 'ground', label: 'Grounded (VOR)' }],
              selected: actionFilter,
              onChange: (v) => { setActionFilter(v); setPage(0); },
            }]}
            search={{ value: search, onChange: (v) => { setSearch(v); setPage(0); }, placeholder: 'Search registration, approver or reason…' }}
          />
          <span className="text-xs text-muted">{isLoading ? 'Loading…' : `${filtered.length} entr${filtered.length === 1 ? 'y' : 'ies'}`}</span>
        </div>

        {shown.length === 0 ? (
          <NoData className="py-24" />
        ) : (
          <div className="table-container" style={{ border: 'none', borderRadius: 0, overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date &amp; time</th>
                  <th>Unit</th>
                  <th>Change</th>
                  <th>Approved by</th>
                  <th>Signature</th>
                  <th>Fix recorded</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {shown.map(r => (
                  <tr key={r.id}>
                    <td className="font-mono text-xs" style={{ whiteSpace: 'nowrap' }}>{fullWhen(r.approved_at)}</td>
                    <td>
                      <button type="button" onClick={() => onOpenUnit(r.registration)} className="font-mono font-bold" style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--brand-red)', letterSpacing: '0.03em' }}>{r.registration}</button>
                    </td>
                    <td><span className={`badge ${r.action === 'ground' ? 'badge-danger' : 'badge-success'}`}>{ACTION_LABEL[r.action]}</span></td>
                    <td>
                      <span className="font-bold text-primary" style={{ display: 'block' }}>{r.approver_first_name} {r.approver_last_name}</span>
                      <span className="text-xs text-muted">{r.approved_by_email ?? ''}</span>
                    </td>
                    <td>
                      <div style={{ background: '#fff', border: '1px solid var(--border-color)', borderRadius: 6, padding: 3, width: 120 }}>
                        <img alt="Signature" src={signatureSrc(r.signature_svg)} style={{ display: 'block', width: '100%', height: 46, objectFit: 'contain' }} />
                      </div>
                    </td>
                    <td style={{ minWidth: '170px' }}>
                      <span className="font-mono text-xs" style={{ display: 'block', whiteSpace: 'nowrap' }}>{r.fixed_at ? fullWhen(r.fixed_at) : '—'}</span>
                      {(r.renewals ?? []).map((n, i) => (
                        <span key={i} className="text-xs text-muted" style={{ display: 'block', overflowWrap: 'anywhere' }}>
                          {n.type.replace(/_/g, ' ')}: new expiry {new Date(`${n.new_due}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                      ))}
                    </td>
                    <td style={{ maxWidth: '320px' }}>
                      <span className="text-sm" style={{ display: 'block', overflowWrap: 'anywhere' }}>{r.reason}</span>
                      {r.previous_issues.length > 0 && <span className="text-xs text-muted" style={{ display: 'block', overflowWrap: 'anywhere' }}>Before: {r.previous_issues.join(' · ')}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex align-center justify-between" style={{ padding: '10px 16px' }}>
          <span className="text-xs text-muted">Page {safePage + 1} of {pageCount}</span>
          <span className="flex" style={{ gap: '6px' }}>
            <button type="button" className="comp-edit-btn" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>Previous</button>
            <button type="button" className="comp-edit-btn" disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)}>Next</button>
          </span>
        </div>
      </div>
    </div>
  );
}
