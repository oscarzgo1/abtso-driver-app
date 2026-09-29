import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Check, KeyRound, Shield, ShieldCheck, Trash2 } from 'lucide-react';
import { supabase, isMockMode } from '../App';

// Two things Payroll Admins can control themselves:
//  • Enrol an authenticator app for a second factor at every login.
//  • Read the last 200 security events (logins, PIN resets, activation
//    codes issued, lock-outs — every write goes through record_audit()).

const EVENT_LABEL: Record<string, string> = {
  activation_code_issued: 'Activation code issued',
  pin_created: 'Driver set their first PIN',
  pin_reset: 'Driver reset their PIN',
  pin_reset_requested: 'Driver requested a PIN reset',
  pin_locked: 'Driver locked out after wrong PINs',
  login_ok: 'Driver signed in',
  login_failed: 'Failed driver login',
};

interface AuditRow {
  id: string;
  event: string;
  actor_email: string | null;
  driver_id: string | null;
  driver_ref: string | null;
  detail: Record<string, unknown> | null;
  created_at: string;
}

interface FactorRow { id: string; friendly_name?: string; status: 'unverified' | 'verified'; factor_type: string }

export default function SecuritySettings() {
  const [factors, setFactors] = useState<FactorRow[]>([]);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [enrolling, setEnrolling] = useState(false);
  const [enrolment, setEnrolment] = useState<null | { id: string; qr: string; secret: string; code: string; error: string; verifying: boolean }>(null);
  const [error, setError] = useState('');

  const loadFactors = useCallback(async () => {
    if (isMockMode || !supabase) return;
    const { data, error: err } = await supabase.auth.mfa.listFactors();
    if (err) return setError(err.message);
    // All non-phone factors go into `totp` in v2 SDKs; be forgiving.
    const all: any[] = (data as any)?.totp ?? (data as any)?.all ?? [];
    setFactors(all);
  }, []);

  const loadAudit = useCallback(async () => {
    if (isMockMode || !supabase) return;
    const { data } = await supabase.from('security_audit_log').select('*').order('created_at', { ascending: false }).limit(200);
    setAudit((data ?? []) as AuditRow[]);
  }, []);

  useEffect(() => { loadFactors(); loadAudit(); }, [loadFactors, loadAudit]);

  const beginEnrol = async () => {
    if (isMockMode || !supabase) return;
    setEnrolling(true);
    setError('');
    const { data, error: err } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `Tachyo ${new Date().toLocaleDateString('en-GB')}` });
    setEnrolling(false);
    if (err || !data) return setError(err?.message ?? 'Could not start setup.');
    setEnrolment({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret, code: '', error: '', verifying: false });
  };

  const finishEnrol = async () => {
    if (!enrolment || !supabase) return;
    const code = enrolment.code.trim();
    if (!/^\d{6}$/.test(code)) return setEnrolment(e => e && { ...e, error: 'Enter the 6-digit code from your authenticator app.' });
    setEnrolment(e => e && { ...e, verifying: true, error: '' });
    const { data: challenge, error: chErr } = await supabase.auth.mfa.challenge({ factorId: enrolment.id });
    if (chErr || !challenge) {
      setEnrolment(e => e && { ...e, verifying: false, error: chErr?.message ?? 'Could not verify — try again.' });
      return;
    }
    const { error: vErr } = await supabase.auth.mfa.verify({ factorId: enrolment.id, challengeId: challenge.id, code });
    if (vErr) {
      setEnrolment(e => e && { ...e, verifying: false, error: vErr.message });
      return;
    }
    setEnrolment(null);
    loadFactors();
  };

  const removeFactor = async (id: string) => {
    if (!supabase) return;
    if (!window.confirm('Remove this authenticator? You will no longer be asked for a code at sign-in.')) return;
    const { error: err } = await supabase.auth.mfa.unenroll({ factorId: id });
    if (err) return setError(err.message);
    loadFactors();
  };

  const verified = factors.filter(f => f.status === 'verified');

  return (
    <div>
      <div className="settings-panel-header">
        <p>Security</p>
        <p>Two-step sign-in and a log of PIN activity for your company.</p>
      </div>

      {error && <div className="login-notice login-notice--error mb-16">{error}</div>}

      <div className="input-group" style={{ background: 'var(--card-bg-hover)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '14px 16px' }}>
        <div className="flex align-center" style={{ gap: '8px', marginBottom: '6px' }}>
          {verified.length > 0 ? <ShieldCheck size={16} color="var(--brand-red)" /> : <Shield size={16} color="var(--charcoal-light)" />}
          <span className="font-bold text-primary">Two-step sign-in</span>
          {verified.length > 0 && <span className="badge badge-success">On</span>}
        </div>
        <p className="text-xs text-secondary m-0">
          After signing in with your password, we'll ask for a 6-digit code from an authenticator app on your phone (Google Authenticator, Microsoft Authenticator, 1Password, or similar).
        </p>

        {verified.length > 0 ? (
          <div className="flex flex-col mt-12" style={{ gap: '6px' }}>
            {verified.map(f => (
              <div key={f.id} className="flex align-center justify-between" style={{ padding: '8px 10px', border: '1px solid var(--border-color)', borderRadius: '8px', background: 'var(--card-bg)' }}>
                <span className="flex align-center text-xs" style={{ gap: '8px' }}><KeyRound size={13} color="var(--brand-red)" /> {f.friendly_name || 'Authenticator'}</span>
                <button type="button" onClick={() => removeFactor(f.id)} title="Remove" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--charcoal-light)' }}><Trash2 size={13} /></button>
              </div>
            ))}
          </div>
        ) : (
          <button type="button" className="btn flex align-center mt-12" style={{ gap: '6px', backgroundColor: 'var(--brand-red)', color: '#fff', borderColor: 'var(--brand-red)', padding: '8px 14px', fontWeight: 800 }} disabled={enrolling} onClick={beginEnrol}>
            <ShieldCheck size={14} /> {enrolling ? 'Setting up…' : 'Set up two-step sign-in'}
          </button>
        )}
      </div>

      {enrolment && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }} onClick={() => setEnrolment(null)}>
          <div className="modal-content glass-panel" style={{ width: '460px', maxWidth: '100%', padding: '24px', borderRadius: '16px', backgroundColor: 'var(--card-bg)', border: '1px solid var(--border-color)' }} onClick={e => e.stopPropagation()}>
            <h3 className="text-md font-bold text-primary m-0 mb-4">Set up two-step sign-in</h3>
            <ol className="text-xs text-secondary m-0" style={{ paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <li>Open your authenticator app on your phone.</li>
              <li>Scan this QR code, or type in the secret below.</li>
              <li>Enter the 6-digit code the app then shows.</li>
            </ol>
            <div className="flex align-center justify-center" style={{ marginTop: '14px', marginBottom: '10px' }}>
              <div style={{ background: '#fff', padding: '10px', borderRadius: '8px' }} dangerouslySetInnerHTML={{ __html: enrolment.qr }} />
            </div>
            <p className="text-xs text-muted font-mono m-0 mb-12" style={{ textAlign: 'center', letterSpacing: '0.06em', wordBreak: 'break-all' }}>{enrolment.secret}</p>
            <input
              className="input-field font-mono"
              inputMode="numeric"
              maxLength={6}
              placeholder="6-digit code"
              style={{ width: '100%', fontSize: '18px', letterSpacing: '0.2em', textAlign: 'center', padding: '10px' }}
              value={enrolment.code}
              onChange={e => setEnrolment(v => v && { ...v, code: e.target.value.replace(/\D/g, '').slice(0, 6) })}
            />
            {enrolment.error && <p className="text-xs m-0 mt-4" style={{ color: 'var(--brand-red)', fontWeight: 700 }}>{enrolment.error}</p>}
            <div className="flex justify-end mt-16" style={{ gap: '8px', borderTop: '1px solid var(--border-color)', paddingTop: '14px' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setEnrolment(null)}>Cancel</button>
              <button type="button" className="btn" disabled={enrolment.verifying} style={{ backgroundColor: 'var(--brand-red)', color: '#fff', borderColor: 'var(--brand-red)' }} onClick={finishEnrol}>
                <Check size={14} style={{ marginRight: '4px', verticalAlign: '-1px' }} />
                {enrolment.verifying ? 'Verifying…' : 'Turn it on'}
              </button>
            </div>
          </div>
        </div>
      )}

      <h4 className="font-bold text-xs text-muted mt-24 mb-8" style={{ textTransform: 'uppercase', letterSpacing: '0.02em' }}>Activity log</h4>
      {audit.length === 0 ? (
        <p className="text-xs text-muted">No security events yet.</p>
      ) : (
        <div className="table-container" style={{ maxHeight: '320px', overflowY: 'auto' }}>
          <table className="data-table">
            <thead><tr><th>When</th><th>Event</th><th>Driver</th><th>Actor</th><th>Detail</th></tr></thead>
            <tbody>
              {audit.map(a => (
                <tr key={a.id}>
                  <td className="text-xs text-secondary whitespace-nowrap font-mono tabular-nums">{new Date(a.created_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                  <td className="text-xs">
                    <span className="flex align-center" style={{ gap: '5px' }}>
                      {a.event === 'pin_locked' && <AlertTriangle size={12} color="var(--brand-red)" />}
                      {EVENT_LABEL[a.event] ?? a.event}
                    </span>
                  </td>
                  <td className="font-mono text-xs">{a.driver_ref ?? '—'}</td>
                  <td className="text-xs text-muted">{a.actor_email ?? '—'}</td>
                  <td className="text-xs text-muted">
                    {a.detail
                      ? Object.entries(a.detail).map(([k, v]) => `${k}: ${v}`).join(' · ')
                      : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
