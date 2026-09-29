import { Check, Lock, Mail } from 'lucide-react';
import { UPGRADE_EMAIL, type Entitlements } from '../lib/entitlements';

// Settings → Your plan. Read-only on purpose: no prices, no card form, no
// buying. A company sees what it has and how much of it it's using; the
// Tachyo team changes plans from the platform Accounts page.

function UsageRow({ label, used, limit }: { label: string; used: number; limit: number | null }) {
  const ratio = limit ? Math.min(1, used / limit) : 0;
  const full = limit !== null && used >= limit;
  return (
    <div style={{ padding: '10px 0', borderTop: '1px solid var(--border-color)' }}>
      <div className="flex items-center justify-between text-xs" style={{ marginBottom: limit ? '6px' : 0 }}>
        <span className="text-secondary font-bold">{label}</span>
        <span className="font-mono tabular-nums" style={{ color: full ? 'var(--brand-red)' : 'var(--charcoal)', fontWeight: 800 }}>
          {limit === null ? `${used} · no limit` : `${used} of ${limit}`}
        </span>
      </div>
      {limit !== null && (
        <div style={{ height: '6px', borderRadius: '3px', background: 'var(--border-color)', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${ratio * 100}%`, background: full ? 'var(--brand-red)' : 'var(--charcoal)' }} />
        </div>
      )}
    </div>
  );
}

export default function PlanSettings({ entitlements, companyName }: { entitlements: Entitlements | null; companyName?: string }) {
  if (!entitlements) {
    return (
      <div>
        <div className="settings-panel-header"><p>Your plan</p><p>Loading…</p></div>
      </div>
    );
  }
  const locked = entitlements.catalog.filter(f => !f.included);
  const subject = encodeURIComponent(`Plan enquiry${companyName ? ` — ${companyName}` : ''}`);

  return (
    <div>
      <div className="settings-panel-header">
        <p>Your plan</p>
        <p>What your company's plan includes.</p>
      </div>

      <div className="glass-card" style={{ padding: '16px 18px', marginBottom: '16px' }}>
        <p className="text-xs font-bold text-muted uppercase m-0" style={{ letterSpacing: '0.08em' }}>Current plan</p>
        <p className="font-black m-0" style={{ fontSize: '24px', color: 'var(--charcoal)' }}>{entitlements.plan_label}</p>
        {entitlements.tagline && <p className="text-xs text-secondary m-0 mt-4">{entitlements.tagline}</p>}
      </div>

      <h4 className="font-bold text-xs text-muted mb-4" style={{ textTransform: 'uppercase', letterSpacing: '0.02em' }}>Usage</h4>
      <div style={{ marginBottom: '20px' }}>
        <UsageRow label="Active employees" used={entitlements.usage.employees} limit={entitlements.limits.employees} />
        <UsageRow label="Depots" used={entitlements.usage.depots} limit={entitlements.limits.depots} />
      </div>

      <h4 className="font-bold text-xs text-muted mb-8" style={{ textTransform: 'uppercase', letterSpacing: '0.02em' }}>Features</h4>
      <div className="flex flex-col" style={{ gap: '6px' }}>
        {entitlements.catalog.map(f => (
          <div
            key={f.key}
            className="flex items-start"
            style={{ gap: '10px', padding: '10px 12px', border: '1px solid var(--border-color)', borderRadius: '8px', opacity: f.included ? 1 : 0.65 }}
          >
            <span style={{ marginTop: '2px', color: f.included ? 'var(--charcoal)' : 'var(--charcoal-light)' }}>
              {f.included ? <Check size={15} strokeWidth={3} /> : <Lock size={14} />}
            </span>
            <div style={{ minWidth: 0 }}>
              <p className="text-sm font-bold text-primary m-0">{f.label}</p>
              {f.description && <p className="text-xs text-muted m-0 mt-4">{f.description}</p>}
            </div>
            {!f.included && <span className="badge badge-accent" style={{ marginLeft: 'auto', flexShrink: 0 }}>Not in plan</span>}
          </div>
        ))}
      </div>

      {locked.length > 0 && (
        <a
          href={`mailto:${UPGRADE_EMAIL}?subject=${subject}`}
          className="btn flex items-center"
          style={{ gap: '8px', marginTop: '18px', padding: '10px 16px', width: 'fit-content', fontWeight: 800, backgroundColor: 'var(--brand-red)', color: '#fff', borderColor: 'var(--brand-red)', textDecoration: 'none' }}
        >
          <Mail size={15} /> Talk to us about upgrading
        </a>
      )}
      <p className="text-xs text-muted mt-12">Plan changes are made by the Tachyo team and take effect straight away. Questions: {UPGRADE_EMAIL}</p>
    </div>
  );
}
