import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { Building2, ChevronDown, Copy, Check, Plus, Search, X, UserPlus, Inbox, Users, Trash2, TriangleAlert } from 'lucide-react';
import { supabase, isMockMode } from '../App';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from '../components/ui/empty';

// ============================================================
// Accounts & Interest Buyers — platform owner only (migration 061).
//
//  • Interest buyers: people who asked for access from the website's
//    contact form or the admin login page. They have NO login. Work them
//    through a simple pipeline (New → Contacted → Demo booked) and create
//    their company + first admin login when they sign up, or decline.
//  • Accounts: every company with a login. Suspend/reactivate (enforced
//    by RLS via organizations.is_active) and set the plan.
//
// Account creation goes through the platform-accounts Edge Function
// (needs the service role); everything else through platform_* SQL
// functions that check is_platform_admin() themselves.
// ============================================================

type Stage = 'new' | 'contacted' | 'demo_booked' | 'approved' | 'declined';

interface AccessRequest {
  id: string;
  company_name: string;
  contact_name: string;
  email: string;
  phone: string | null;
  fleet_size: string | null;
  message: string | null;
  source: 'website' | 'admin_login';
  stage: Stage;
  notes: string | null;
  organization_id: string | null;
  created_at: string;
}

interface AccountRow {
  organization_id: string;
  name: string;
  slug: string;
  plan: string | null;
  is_active: boolean;
  created_at: string;
  admin_emails: string[];
  employees: number;
  active_employees: number;
  shifts_total: number;
  shifts_30d: number;
  last_shift_at: string | null;
}

interface CreatedAccount {
  companyName: string;
  companySlug: string;
  email: string;
  /** Whether the invite email actually sent (Resend configured + accepted it). */
  emailSent: boolean;
  /** One-time Supabase invite link — always returned, so it can be sent
   * manually as a fallback even when emailSent is true. */
  actionLink: string;
}

const STAGE_LABEL: Record<Stage, string> = {
  new: 'New',
  contacted: 'Contacted',
  demo_booked: 'Demo booked',
  approved: 'Account created',
  declined: 'Declined',
};

const OPEN_STAGES: Stage[] = ['new', 'contacted', 'demo_booked'];
const PLANS = ['starter', 'growth', 'enterprise'] as const;
const APP_SIGN_IN_URL = 'https://app.tachyo.co.uk';

const formatDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const describeError = (err: any, fallback: string) => err?.message ?? err?.error_description ?? fallback;

interface PlatformAccountsProps {
  /** The platform owner's own company — can't be suspended from here. */
  currentOrgId: string | null;
  /** Lets App.tsx refresh its sidebar/Alert Panel counts after changes. */
  onChanged?: () => void;
}

export default function PlatformAccounts({ currentOrgId, onChanged }: PlatformAccountsProps) {
  const [tab, setTab] = useState<'requests' | 'accounts'>('requests');
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [showClosed, setShowClosed] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [notesDraft, setNotesDraft] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [confirmSuspendId, setConfirmSuspendId] = useState<string | null>(null);
  const [accessAccount, setAccessAccount] = useState<AccountRow | null>(null);
  const [deleteAccount, setDeleteAccount] = useState<AccountRow | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [createForRequest, setCreateForRequest] = useState<AccessRequest | null>(null);
  const [createForm, setCreateForm] = useState({ companyName: '', adminEmail: '', plan: 'starter' });
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [created, setCreated] = useState<CreatedAccount | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (isMockMode || !supabase) return;
    setIsLoading(true);
    setError('');
    try {
      const [{ data: requestRows, error: reqErr }, { data: accountRows, error: accErr }] = await Promise.all([
        supabase.from('access_requests').select('*').order('created_at', { ascending: false }),
        supabase.rpc('platform_account_overview'),
      ]);
      if (reqErr || accErr) throw reqErr ?? accErr;
      setRequests((requestRows ?? []) as AccessRequest[]);
      setAccounts(((accountRows ?? []) as any[]).map(a => ({
        ...a,
        employees: Number(a.employees) || 0,
        active_employees: Number(a.active_employees) || 0,
        shifts_total: Number(a.shifts_total) || 0,
        shifts_30d: Number(a.shifts_30d) || 0,
        admin_emails: a.admin_emails ?? [],
      })) as AccountRow[]);
    } catch (err: any) {
      setError(describeError(err, 'Could not load accounts.'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const accountEmails = useMemo(() => {
    const set = new Set<string>();
    accounts.forEach(a => a.admin_emails.forEach(e => set.add(e.toLowerCase())));
    return set;
  }, [accounts]);

  const query = search.trim().toLowerCase();

  const visibleRequests = useMemo(() => requests.filter(r => {
    if (!showClosed && !OPEN_STAGES.includes(r.stage)) return false;
    if (!query) return true;
    return [r.company_name, r.contact_name, r.email, r.phone].some(v => v?.toLowerCase().includes(query));
  }), [requests, showClosed, query]);

  const visibleAccounts = useMemo(() => accounts.filter(a => {
    if (!query) return true;
    return [a.name, a.slug, ...a.admin_emails].some(v => v?.toLowerCase().includes(query));
  }), [accounts, query]);

  const counts = useMemo(() => ({
    newRequests: requests.filter(r => r.stage === 'new').length,
    inConversation: requests.filter(r => r.stage === 'contacted' || r.stage === 'demo_booked').length,
    active: accounts.filter(a => a.is_active).length,
    suspended: accounts.filter(a => !a.is_active).length,
    openRequests: requests.filter(r => OPEN_STAGES.includes(r.stage)).length,
  }), [requests, accounts]);

  const changed = () => {
    onChanged?.();
  };

  const updateRequest = async (request: AccessRequest, stage: Stage | null, notes: string | null) => {
    if (isMockMode || !supabase) return;
    setSavingId(request.id);
    setError('');
    try {
      const { error: rpcError } = await supabase.rpc('platform_update_access_request', {
        p_id: request.id,
        p_stage: stage,
        p_notes: notes,
      });
      if (rpcError) throw rpcError;
      setRequests(prev => prev.map(r => r.id === request.id
        ? { ...r, stage: stage ?? r.stage, notes: notes === null ? r.notes : (notes.trim() || null) }
        : r));
      changed();
    } catch (err: any) {
      setError(describeError(err, 'Could not update the request.'));
    } finally {
      setSavingId(null);
    }
  };

  const setAccountActive = async (account: AccountRow, active: boolean) => {
    if (isMockMode || !supabase) return;
    setSavingId(account.organization_id);
    setError('');
    try {
      const { error: rpcError } = await supabase.rpc('platform_set_account_active', {
        p_organization_id: account.organization_id,
        p_active: active,
      });
      if (rpcError) throw rpcError;
      setAccounts(prev => prev.map(a => a.organization_id === account.organization_id ? { ...a, is_active: active } : a));
      setConfirmSuspendId(null);
    } catch (err: any) {
      setError(describeError(err, 'Could not change the account status.'));
    } finally {
      setSavingId(null);
    }
  };

  const setAccountPlan = async (account: AccountRow, plan: string) => {
    if (isMockMode || !supabase || plan === account.plan) return;
    setSavingId(account.organization_id);
    setError('');
    try {
      const { error: rpcError } = await supabase.rpc('platform_set_account_plan', {
        p_organization_id: account.organization_id,
        p_plan: plan,
      });
      if (rpcError) throw rpcError;
      setAccounts(prev => prev.map(a => a.organization_id === account.organization_id ? { ...a, plan } : a));
    } catch (err: any) {
      setError(describeError(err, 'Could not change the plan.'));
    } finally {
      setSavingId(null);
    }
  };

  const openCreate = (request: AccessRequest | null) => {
    setCreateForRequest(request);
    setCreateForm({
      companyName: request?.company_name ?? '',
      adminEmail: request?.email ?? '',
      plan: 'starter',
    });
    setCreateError('');
    setCreated(null);
    setCreateOpen(true);
  };

  const closeCreate = () => {
    setCreateOpen(false);
    setCreated(null);
    setCreateForRequest(null);
  };

  const submitCreate = async () => {
    if (isMockMode || !supabase) return;
    setCreateError('');
    if (createForm.companyName.trim().length < 2) {
      setCreateError('Enter the company name.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(createForm.adminEmail.trim())) {
      setCreateError("Enter a valid email for the company's first admin.");
      return;
    }
    setIsCreating(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('platform-accounts', {
        body: {
          action: 'create-account',
          requestId: createForRequest?.id,
          companyName: createForm.companyName.trim(),
          adminEmail: createForm.adminEmail.trim().toLowerCase(),
          plan: createForm.plan,
        },
      });
      let failure: string | null = data?.error ?? null;
      if (!failure && fnError) {
        try {
          const body = await (fnError as any).context?.json?.();
          failure = body?.error ?? fnError.message;
        } catch {
          failure = fnError.message;
        }
      }
      if (failure) {
        setCreateError(failure);
        return;
      }
      setCreated(data as CreatedAccount);
      await load();
      changed();
    } catch (err: any) {
      setCreateError(describeError(err, 'Could not create the account.'));
    } finally {
      setIsCreating(false);
    }
  };

  const copy = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      setTimeout(() => setCopied(c => (c === key ? null : c)), 1500);
    } catch {
      // Clipboard blocked — the value is still selectable on screen.
    }
  };

  const tile = (label: string, value: number, tone?: 'red') => (
    <div className="glass-card" style={{ padding: '14px 16px', flex: '1 1 160px' }}>
      <p className="text-xs font-bold text-muted m-0" style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</p>
      <p className="font-black m-0 mt-4 tabular-nums" style={{ fontSize: '24px', color: tone === 'red' && value > 0 ? 'var(--brand-red)' : 'var(--charcoal)' }}>{value}</p>
    </div>
  );

  return (
    <div className="flex-1">
      <div className="flex align-center justify-between mb-16" style={{ gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <h2 className="text-xl font-black text-primary m-0">ACCOUNTS &amp; INTEREST BUYERS</h2>
          <p className="text-xs text-muted m-0 mt-4">
            Companies with a Tachyo login, and people who've asked for access. Only you (the platform owner) can see this page.
          </p>
        </div>
        <button
          type="button"
          onClick={() => openCreate(null)}
          className="btn flex align-center"
          style={{ gap: '6px', padding: '10px 16px', fontSize: '13px', fontWeight: 800, backgroundColor: 'var(--brand-red)', color: '#FFFFFF', borderColor: 'var(--brand-red)' }}
        >
          <Plus size={15} /> New Account
        </button>
      </div>

      {error && <div className="login-notice login-notice--error mb-16">{error}</div>}

      <div className="flex mb-16" style={{ gap: '12px', flexWrap: 'wrap' }}>
        {tile('New interest buyers', counts.newRequests, 'red')}
        {tile('In conversation', counts.inConversation)}
        {tile('Active accounts', counts.active)}
        {tile('Suspended', counts.suspended)}
      </div>

      <div className="flex align-center justify-between mb-16" style={{ gap: '12px', flexWrap: 'wrap' }}>
        <div className="telemetry-tabs" style={{ borderBottom: '1px solid var(--border-color)' }}>
          <button type="button" className={`telemetry-tab ${tab === 'requests' ? 'telemetry-tab--active' : ''}`} onClick={() => setTab('requests')}>
            <Inbox size={13} /> Interest Buyers
            {counts.openRequests > 0 && <span className="badge badge-danger" style={{ marginLeft: '4px' }}>{counts.openRequests}</span>}
          </button>
          <button type="button" className={`telemetry-tab ${tab === 'accounts' ? 'telemetry-tab--active' : ''}`} onClick={() => setTab('accounts')}>
            <Users size={13} /> Accounts
            <span className="badge badge-dark" style={{ marginLeft: '4px' }}>{accounts.length}</span>
          </button>
        </div>
        <div className="flex align-center" style={{ gap: '10px' }}>
          {tab === 'requests' && (
            <label className="flex align-center text-xs font-bold text-secondary" style={{ gap: '6px', cursor: 'pointer' }}>
              <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} />
              Show created &amp; declined
            </label>
          )}
          <div className="telemetry-search-wrap" style={{ minWidth: '240px' }}>
            <Search size={14} />
            <input type="text" placeholder={tab === 'requests' ? 'Search company, name, email…' : 'Search company or admin email…'} value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>
      </div>

      {tab === 'requests' ? (
        <div className="glass-card" style={{ overflow: 'hidden' }}>
          {visibleRequests.length === 0 ? (
            <Empty className="py-24">
              <EmptyHeader>
                <EmptyMedia variant="icon"><Inbox /></EmptyMedia>
                <EmptyTitle>{isLoading ? 'Loading…' : 'No Interest Buyers'}</EmptyTitle>
                <EmptyDescription>
                  {requests.length === 0
                    ? 'Requests from the website contact form and the admin login page will appear here.'
                    : 'Nothing matches — try "Show created & declined" or clear the search.'}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="table-container" style={{ border: 'none', borderRadius: 0 }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Received</th>
                    <th>Company &amp; contact</th>
                    <th>Fleet</th>
                    <th>Source</th>
                    <th>Stage</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRequests.map(r => {
                    const isExpanded = expandedId === r.id;
                    const hasAccount = accountEmails.has(r.email.toLowerCase());
                    const closed = r.stage === 'approved' || r.stage === 'declined';
                    return (
                      <Fragment key={r.id}>
                        <tr>
                          <td className="text-secondary font-mono tabular-nums text-xs whitespace-nowrap">{formatDate(r.created_at)}</td>
                          <td>
                            <div className="font-bold text-primary">{r.company_name}</div>
                            <div className="text-xs text-secondary">
                              {r.contact_name} · <a href={`mailto:${r.email}`} style={{ color: 'var(--brand-red)' }}>{r.email}</a>
                              {r.phone && <> · <a href={`tel:${r.phone}`} style={{ color: 'var(--charcoal)' }}>{r.phone}</a></>}
                            </div>
                            {hasAccount && <span className="badge badge-accent" style={{ marginTop: '4px' }}>Email already has a login</span>}
                          </td>
                          <td className="text-secondary text-xs whitespace-nowrap">{r.fleet_size ? `${r.fleet_size} vehicles` : '—'}</td>
                          <td className="text-secondary text-xs whitespace-nowrap">{r.source === 'website' ? 'Website' : 'Admin login page'}</td>
                          <td>
                            {closed ? (
                              <span className={`badge ${r.stage === 'approved' ? 'badge-success' : 'badge-dark'}`}>{STAGE_LABEL[r.stage]}</span>
                            ) : (
                              <div className="telemetry-pill-select-wrap">
                                <span className="telemetry-pill-icon"><span className="telemetry-status-dot" /></span>
                                <select
                                  className="telemetry-pill-select"
                                  value={r.stage}
                                  disabled={savingId === r.id}
                                  onChange={(e) => updateRequest(r, e.target.value as Stage, null)}
                                >
                                  {(['new', 'contacted', 'demo_booked', 'declined'] as Stage[]).map(s => (
                                    <option key={s} value={s}>{STAGE_LABEL[s]}</option>
                                  ))}
                                </select>
                                <ChevronDown size={12} className="telemetry-pill-chevron" />
                              </div>
                            )}
                          </td>
                          <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                            {!closed && (
                              <button
                                type="button"
                                onClick={() => openCreate(r)}
                                className="btn flex align-center"
                                style={{ display: 'inline-flex', gap: '5px', padding: '6px 10px', fontSize: '11.5px', fontWeight: 800, backgroundColor: 'var(--brand-red)', color: '#FFFFFF', borderColor: 'var(--brand-red)', marginRight: '8px' }}
                              >
                                <UserPlus size={13} /> Create account
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                setExpandedId(isExpanded ? null : r.id);
                                setNotesDraft(prev => ({ ...prev, [r.id]: prev[r.id] ?? r.notes ?? '' }));
                              }}
                              title="Message & notes"
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--charcoal-light)', verticalAlign: 'middle' }}
                            >
                              <ChevronDown size={15} style={{ transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
                            </button>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr>
                            <td colSpan={6} style={{ background: 'var(--card-bg-hover)', padding: '14px 16px' }}>
                              <p className="text-xs font-bold m-0 mb-4" style={{ color: 'var(--charcoal)' }}>Their message</p>
                              <p className="text-xs text-secondary m-0 mb-12" style={{ whiteSpace: 'pre-wrap' }}>{r.message || 'No message left.'}</p>
                              <p className="text-xs font-bold m-0 mb-4" style={{ color: 'var(--charcoal)' }}>Your notes</p>
                              <textarea
                                className="input-field"
                                style={{ width: '100%', minHeight: '70px', resize: 'vertical', fontSize: '13px' }}
                                placeholder="Call notes, demo date, pricing discussed…"
                                value={notesDraft[r.id] ?? ''}
                                onChange={(e) => setNotesDraft(prev => ({ ...prev, [r.id]: e.target.value }))}
                              />
                              <div className="flex align-center mt-8" style={{ gap: '8px' }}>
                                <button
                                  type="button"
                                  className="btn btn-secondary"
                                  style={{ padding: '6px 12px', fontSize: '12px' }}
                                  disabled={savingId === r.id || (notesDraft[r.id] ?? '') === (r.notes ?? '')}
                                  onClick={() => updateRequest(r, null, notesDraft[r.id] ?? '')}
                                >
                                  {savingId === r.id ? 'Saving…' : 'Save notes'}
                                </button>
                                {(notesDraft[r.id] ?? '') === (r.notes ?? '') && r.notes && <span className="text-xs text-muted">Saved</span>}
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
          )}
        </div>
      ) : (
        <div className="glass-card" style={{ overflow: 'hidden' }}>
          {visibleAccounts.length === 0 ? (
            <Empty className="py-24">
              <EmptyHeader>
                <EmptyMedia variant="icon"><Building2 /></EmptyMedia>
                <EmptyTitle>{isLoading ? 'Loading…' : 'No Accounts'}</EmptyTitle>
                <EmptyDescription>Companies you create will appear here.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="table-container" style={{ border: 'none', borderRadius: 0 }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Company</th>
                    <th>Admin logins</th>
                    <th>Plan</th>
                    <th>Employees</th>
                    <th>Shifts (30d)</th>
                    <th>Last shift</th>
                    <th>Since</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {visibleAccounts.map(a => {
                    const isOwn = a.organization_id === currentOrgId;
                    const busy = savingId === a.organization_id;
                    return (
                      <tr key={a.organization_id} style={{ opacity: a.is_active ? 1 : 0.75 }}>
                        <td>
                          <div className="font-bold text-primary">{a.name}{isOwn && <span className="badge badge-dark" style={{ marginLeft: '6px' }}>You</span>}</div>
                          <div className="font-mono text-xs text-muted" title="Driver company code">{a.slug}</div>
                        </td>
                        <td className="text-xs text-secondary">
                          {a.admin_emails.length === 0 ? '—' : (
                            <span title={a.admin_emails.join('\n')}>
                              {a.admin_emails[0]}{a.admin_emails.length > 1 ? ` +${a.admin_emails.length - 1}` : ''}
                            </span>
                          )}
                        </td>
                        <td>
                          <div className="telemetry-pill-select-wrap">
                            <span className="telemetry-pill-icon"><Building2 size={12} color="#94A3B8" /></span>
                            <select
                              className="telemetry-pill-select"
                              value={a.plan ?? 'starter'}
                              disabled={busy}
                              onChange={(e) => setAccountPlan(a, e.target.value)}
                            >
                              {PLANS.map(p => <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>)}
                            </select>
                            <ChevronDown size={12} className="telemetry-pill-chevron" />
                          </div>
                        </td>
                        <td className="font-mono tabular-nums text-secondary">{a.active_employees}<span className="text-muted">/{a.employees}</span></td>
                        <td className="font-mono tabular-nums text-secondary">{a.shifts_30d}</td>
                        <td className="font-mono tabular-nums text-xs text-secondary whitespace-nowrap">{formatDate(a.last_shift_at)}</td>
                        <td className="font-mono tabular-nums text-xs text-secondary whitespace-nowrap">{formatDate(a.created_at)}</td>
                        <td>
                          <span className={`badge ${a.is_active ? 'badge-success' : 'badge-danger'}`}>{a.is_active ? 'Active' : 'Suspended'}</span>
                        </td>
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <button type="button" className="btn btn-secondary" style={{ padding: '6px 10px', fontSize: '11.5px', marginRight: '6px' }} onClick={() => setAccessAccount(a)}>
                            Manage access
                          </button>
                          {isOwn ? null : a.is_active ? (
                            confirmSuspendId === a.organization_id ? (
                              <span className="flex align-center" style={{ gap: '6px', justifyContent: 'flex-end' }}>
                                <button type="button" className="btn" disabled={busy} onClick={() => setAccountActive(a, false)} style={{ padding: '6px 10px', fontSize: '11.5px', fontWeight: 800, backgroundColor: 'var(--brand-red)', color: '#fff', borderColor: 'var(--brand-red)' }}>
                                  {busy ? 'Suspending…' : 'Confirm suspend'}
                                </button>
                                <button type="button" className="btn btn-secondary" onClick={() => setConfirmSuspendId(null)} style={{ padding: '6px 10px', fontSize: '11.5px' }}>Cancel</button>
                              </span>
                            ) : (
                              <button type="button" className="btn btn-secondary" onClick={() => setConfirmSuspendId(a.organization_id)} style={{ padding: '6px 10px', fontSize: '11.5px' }}>
                                Suspend
                              </button>
                            )
                          ) : (
                            <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setAccountActive(a, true)} style={{ padding: '6px 10px', fontSize: '11.5px' }}>
                              {busy ? 'Reactivating…' : 'Reactivate'}
                            </button>
                          )}
                          {!isOwn && (
                            <button
                              type="button"
                              title="Permanently delete this account"
                              onClick={() => setDeleteAccount(a)}
                              style={{ marginLeft: '6px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--brand-red)', verticalAlign: 'middle', padding: '6px' }}
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-muted m-0" style={{ padding: '10px 16px', borderTop: '1px solid var(--border-color)' }}>
            Suspending blocks the company's admin panel straight away (their drivers can still clock out of a shift in progress) and can be undone any time. The <Trash2 size={11} style={{ verticalAlign: '-1px' }} /> icon permanently deletes an account instead — that cannot be undone.
          </p>
        </div>
      )}

      {accessAccount && <AccessModal account={accessAccount} onClose={() => setAccessAccount(null)} onChanged={load} />}

      {deleteAccount && (
        <DeleteAccountModal
          account={deleteAccount}
          onClose={() => setDeleteAccount(null)}
          onDeleted={() => { setDeleteAccount(null); load(); changed(); }}
        />
      )}

      {createOpen && (
        <div
          className="modal-overlay"
          style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '16px' }}
          onClick={() => { if (!isCreating) closeCreate(); }}
        >
          <div
            className="modal-content glass-panel"
            style={{ width: '460px', maxWidth: '100%', padding: '24px', borderRadius: '16px', backgroundColor: 'var(--card-bg)', border: '1px solid var(--border-color)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex align-center justify-between mb-16">
              <h3 className="text-md font-bold text-primary m-0">{created ? 'Account Created' : createForRequest ? `Create account — ${createForRequest.company_name}` : 'New Account'}</h3>
              <button type="button" onClick={closeCreate} disabled={isCreating} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--charcoal-light)' }}>
                <X size={18} />
              </button>
            </div>

            {created ? (
              <>
                {created.emailSent ? (
                  <p className="text-xs text-secondary m-0 mb-16">
                    An invite email is on its way to <strong>{created.email}</strong> — they'll click through, set their own password, and be straight in. Nothing more for you to send, but the one-time link is below if you'd rather forward it yourself.
                  </p>
                ) : (
                  <p className="login-notice login-notice--error m-0 mb-16" style={{ fontSize: '12px' }}>
                    Couldn't email the invite (Resend isn't configured, or the send failed) — copy the link below and send it to {created.email} yourself. It's one-time and expires soon.
                  </p>
                )}
                {([
                  ['Sign in at', APP_SIGN_IN_URL],
                  ['Email', created.email],
                  ['Driver company code', created.companySlug],
                  ['One-time invite link', created.actionLink],
                ] as const).map(([label, value]) => (
                  <div key={label} className="input-group mb-12">
                    <span className="input-label">{label.toUpperCase()}</span>
                    <div className="flex align-center" style={{ gap: '8px' }}>
                      <input readOnly className="input-field font-mono" style={{ flex: 1, minWidth: 0 }} value={value} onFocus={(e) => e.currentTarget.select()} />
                      <button type="button" className="btn btn-secondary flex align-center" style={{ gap: '4px', padding: '8px 10px' }} onClick={() => copy(label, value)}>
                        {copied === label ? <Check size={14} /> : <Copy size={14} />}
                      </button>
                    </div>
                  </div>
                ))}
                <div className="flex justify-end" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
                  <button type="button" className="btn" style={{ backgroundColor: 'var(--brand-red)', color: '#fff', borderColor: 'var(--brand-red)' }} onClick={closeCreate}>Done</button>
                </div>
              </>
            ) : (
              <>
                <div className="input-group mb-16">
                  <span className="input-label">COMPANY NAME</span>
                  <input type="text" className="input-field" style={{ width: '100%' }} value={createForm.companyName} onChange={(e) => setCreateForm(f => ({ ...f, companyName: e.target.value }))} />
                </div>
                <div className="input-group mb-16">
                  <span className="input-label">FIRST ADMIN EMAIL (THEIR LOGIN)</span>
                  <input type="email" className="input-field" style={{ width: '100%' }} value={createForm.adminEmail} onChange={(e) => setCreateForm(f => ({ ...f, adminEmail: e.target.value }))} />
                </div>
                <div className="input-group mb-16">
                  <span className="input-label">PLAN</span>
                  <select className="select-field" style={{ width: '100%' }} value={createForm.plan} onChange={(e) => setCreateForm(f => ({ ...f, plan: e.target.value }))}>
                    {PLANS.map(p => <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>)}
                  </select>
                </div>
                <p className="text-xs text-muted m-0 mb-16">
                  Creates the company and a Payroll Admin login with a one-time temporary password. They can add their own staff, depots and drivers once signed in.
                </p>
                {createError && <div className="text-error text-sm font-semibold mb-16">{createError}</div>}
                <div className="flex gap-8 justify-end" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
                  <button type="button" className="btn btn-secondary" onClick={closeCreate} disabled={isCreating}>Cancel</button>
                  <button type="button" className="btn" disabled={isCreating} style={{ backgroundColor: 'var(--brand-red)', color: '#fff', borderColor: 'var(--brand-red)' }} onClick={submitCreate}>
                    {isCreating ? 'Creating…' : 'Create account'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}


// ── Manage access: plan, per-feature exceptions and limits ────
// Everything here goes through platform_* SQL functions that check
// is_platform_admin() themselves (migration 067); changes apply
// immediately in the company's admin panel and driver app.

interface EntFeature { key: string; label: string; in_plan: boolean; override: boolean | null; effective: boolean }
interface EntData {
  plan: string;
  plan_label: string;
  plans: { id: string; label: string }[];
  features: EntFeature[];
  limits: { plan_employees: number | null; plan_depots: number | null; override_employees: number | null; override_depots: number | null };
  usage: { employees: number; depots: number };
}

function AccessModal({ account, onClose, onChanged }: { account: AccountRow; onClose: () => void; onChanged: () => void }) {
  const [data, setData] = useState<EntData | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [emp, setEmp] = useState('');
  const [dep, setDep] = useState('');
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data: d, error: e } = await supabase.rpc('platform_org_entitlements', { p_organization_id: account.organization_id });
    if (e) return setError(describeError(e, 'Could not load this company\'s access.'));
    const ent = d as EntData;
    setData(ent);
    setEmp(ent.limits.override_employees === null ? '' : String(ent.limits.override_employees));
    setDep(ent.limits.override_depots === null ? '' : String(ent.limits.override_depots));
  }, [account.organization_id]);

  useEffect(() => { load(); }, [load]);

  const run = async (key: string, call: () => PromiseLike<{ error: any }>) => {
    setBusy(key);
    setError('');
    const { error: e } = await call();
    setBusy(null);
    if (e) return setError(describeError(e, 'That change failed.'));
    await load();
    onChanged();
  };

  const setPlan = (plan: string) => run('plan', () => supabase!.rpc('platform_set_account_plan', { p_organization_id: account.organization_id, p_plan: plan }));
  const setOverride = (key: string, value: string) =>
    run(`f:${key}`, () => supabase!.rpc('platform_set_feature_override', {
      p_organization_id: account.organization_id, p_feature_key: key, p_enabled: value === 'on' ? true : value === 'off' ? false : null,
    }));

  const saveLimits = async () => {
    const parse = (v: string): number | null | undefined => {
      if (!v.trim()) return null;
      const n = Number(v);
      return Number.isInteger(n) && n > 0 ? n : undefined;
    };
    const e = parse(emp);
    const d = parse(dep);
    if (e === undefined || d === undefined) return setError('Limits must be whole numbers above zero, or blank to follow the plan.');
    await run('limits', () => supabase!.rpc('platform_set_limit_overrides', { p_organization_id: account.organization_id, p_max_employees: e, p_max_depots: d }));
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const limitNote = (planLimit: number | null, override: number | null, used: number) => {
    const effective = override ?? planLimit;
    if (effective !== null && used > effective) return `Already over (${used} in use) — existing ones stay, new ones are blocked.`;
    return planLimit === null ? 'Plan: no limit.' : `Plan: ${planLimit}.`;
  };

  return (
    <div className="modal-overlay" style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '40px 16px', overflowY: 'auto' }} onClick={onClose}>
      <div className="modal-content glass-panel" style={{ width: '620px', maxWidth: '100%', padding: '24px', borderRadius: '16px', backgroundColor: 'var(--card-bg)', border: '1px solid var(--border-color)' }} onClick={e => e.stopPropagation()}>
        <div className="flex align-center justify-between mb-16">
          <div>
            <h3 className="text-md font-bold text-primary m-0">Manage access — {account.name}</h3>
            <p className="text-xs text-muted m-0 mt-4">Changes apply straight away in their admin panel and driver app.</p>
          </div>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--charcoal-light)' }}><X size={18} /></button>
        </div>

        {error && <div className="login-notice login-notice--error mb-16">{error}</div>}
        {!data ? (
          <p className="text-xs text-muted">Loading…</p>
        ) : (
          <>
            <div className="input-group mb-16">
              <span className="input-label">PLAN</span>
              <select className="select-field" style={{ width: '100%' }} value={data.plan} disabled={busy === 'plan'} onChange={e => setPlan(e.target.value)}>
                {data.plans.map(pl => <option key={pl.id} value={pl.id}>{pl.label}</option>)}
              </select>
            </div>

            <p className="text-xs font-bold text-muted uppercase m-0 mb-8" style={{ letterSpacing: '0.08em' }}>Features</p>
            <div className="flex flex-col mb-16" style={{ gap: '6px' }}>
              {data.features.map(f => (
                <div key={f.key} className="flex align-center justify-between" style={{ gap: '10px', padding: '8px 10px', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
                  <div style={{ minWidth: 0 }}>
                    <p className="text-sm font-bold text-primary m-0">{f.label}</p>
                    <p className="text-xs text-muted m-0">
                      {f.in_plan ? 'In this plan' : 'Not in this plan'}
                      {f.override !== null && <> · <strong style={{ color: 'var(--brand-red)' }}>exception: forced {f.override ? 'on' : 'off'}</strong></>}
                    </p>
                  </div>
                  <div className="flex align-center" style={{ gap: '8px', flexShrink: 0 }}>
                    <span className={`badge ${f.effective ? 'badge-success' : 'badge-dark'}`}>{f.effective ? 'Available' : 'Locked'}</span>
                    <select
                      className="select-field"
                      style={{ padding: '5px 8px', fontSize: '12px' }}
                      value={f.override === null ? '' : f.override ? 'on' : 'off'}
                      disabled={busy === `f:${f.key}`}
                      onChange={e => setOverride(f.key, e.target.value)}
                    >
                      <option value="">Follow plan</option>
                      <option value="on">Force on</option>
                      <option value="off">Force off</option>
                    </select>
                  </div>
                </div>
              ))}
            </div>

            <p className="text-xs font-bold text-muted uppercase m-0 mb-8" style={{ letterSpacing: '0.08em' }}>Limits <span style={{ fontWeight: 400, textTransform: 'none' }}>(blank = follow the plan)</span></p>
            <div className="grid grid-cols-2 gap-16 mb-8">
              <div className="input-group">
                <span className="input-label">MAX ACTIVE EMPLOYEES</span>
                <input type="number" min="1" className="input-field" style={{ width: '100%' }} placeholder="Follow plan" value={emp} onChange={e => setEmp(e.target.value)} />
                <p className="text-xs text-muted m-0 mt-4">{limitNote(data.limits.plan_employees, data.limits.override_employees, data.usage.employees)}</p>
              </div>
              <div className="input-group">
                <span className="input-label">MAX DEPOTS</span>
                <input type="number" min="1" className="input-field" style={{ width: '100%' }} placeholder="Follow plan" value={dep} onChange={e => setDep(e.target.value)} />
                <p className="text-xs text-muted m-0 mt-4">{limitNote(data.limits.plan_depots, data.limits.override_depots, data.usage.depots)}</p>
              </div>
            </div>
            <div className="flex align-center" style={{ gap: '10px', borderTop: '1px solid var(--border-color)', paddingTop: '14px' }}>
              <button type="button" className="btn" disabled={busy === 'limits'} style={{ backgroundColor: 'var(--brand-red)', color: '#fff', borderColor: 'var(--brand-red)', fontWeight: 800 }} onClick={saveLimits}>
                {busy === 'limits' ? 'Saving…' : 'Save limits'}
              </button>
              {saved && <span className="text-xs text-muted">Saved</span>}
              <span className="text-xs text-muted" style={{ marginLeft: 'auto' }}>{data.usage.employees} active employees · {data.usage.depots} depot{data.usage.depots === 1 ? '' : 's'} in use</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Permanent delete: type the company name to confirm ────────
// Everything the account has — drivers, shifts, telemetry, walk-
// arounds, proofs, loads, logins — is gone for good. Suspend (above)
// is the reversible option; this isn't, so it needs its own explicit,
// harder-to-misclick confirmation rather than the inline
// confirm/cancel pair Suspend uses.
function DeleteAccountModal({ account, onClose, onDeleted }: { account: AccountRow; onClose: () => void; onDeleted: () => void }) {
  const [confirmText, setConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState('');
  const matches = confirmText.trim() === account.name;

  const submit = async () => {
    if (!supabase || !matches || isDeleting) return;
    setIsDeleting(true);
    setError('');
    try {
      const { data, error: fnError } = await supabase.functions.invoke('platform-accounts', {
        body: { action: 'delete-account', organizationId: account.organization_id, confirmName: confirmText.trim() },
      });
      let failure: string | null = data?.error ?? null;
      if (!failure && fnError) {
        try {
          const body = await (fnError as any).context?.json?.();
          failure = body?.error ?? fnError.message;
        } catch {
          failure = fnError.message;
        }
      }
      if (failure) {
        setError(failure);
        return;
      }
      onDeleted();
    } catch (err: any) {
      setError(describeError(err, 'Could not delete this account.'));
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="modal-overlay" style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '16px' }} onClick={() => { if (!isDeleting) onClose(); }}>
      <div className="modal-content glass-panel" style={{ width: '460px', maxWidth: '100%', padding: '24px', borderRadius: '16px', backgroundColor: 'var(--card-bg)', border: '1px solid var(--border-color)' }} onClick={e => e.stopPropagation()}>
        <div className="flex align-center justify-between mb-16">
          <h3 className="text-md font-bold text-primary m-0 flex align-center" style={{ gap: '8px' }}>
            <TriangleAlert size={18} color="var(--brand-red)" /> Permanently Delete Account
          </h3>
          <button type="button" onClick={onClose} disabled={isDeleting} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--charcoal-light)' }}><X size={18} /></button>
        </div>

        <div className="login-notice login-notice--error mb-16" style={{ fontSize: '12.5px' }}>
          This deletes <strong>{account.name}</strong> and everything it has — {account.employees} employee{account.employees === 1 ? '' : 's'}, {account.shifts_total} shift{account.shifts_total === 1 ? '' : 's'}, every driver login, walk-around check, proof of delivery and load. It cannot be undone, and there's no backup to restore from. Suspend instead if you just want to block their access for now.
        </div>

        <div className="input-group mb-16">
          <span className="input-label">TYPE THE COMPANY NAME TO CONFIRM</span>
          <input
            type="text"
            className="input-field font-mono"
            style={{ width: '100%' }}
            placeholder={account.name}
            value={confirmText}
            disabled={isDeleting}
            onChange={(e) => setConfirmText(e.target.value)}
            autoFocus
          />
        </div>

        {error && <div className="login-notice login-notice--error mb-16">{error}</div>}

        <div className="flex gap-8 justify-end" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={isDeleting}>Cancel</button>
          <button
            type="button"
            className="btn"
            disabled={!matches || isDeleting}
            style={{ backgroundColor: 'var(--brand-red)', color: '#fff', borderColor: 'var(--brand-red)', opacity: matches ? 1 : 0.5 }}
            onClick={submit}
          >
            {isDeleting ? 'Deleting…' : 'Permanently Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}
