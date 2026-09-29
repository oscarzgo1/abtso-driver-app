import { Lock, Mail } from 'lucide-react';
import { UPGRADE_EMAIL } from '../lib/entitlements';

// Shown in place of a page the company's plan doesn't include. Nothing is
// broken and nothing is lost: the data stays in the account, and the page
// comes back the moment the plan (or a per-company override) includes it.

export default function LockedFeature({ featureLabel, planLabel, companyName }: { featureLabel: string; planLabel: string; companyName?: string }) {
  const subject = encodeURIComponent(`Upgrade request — ${featureLabel}${companyName ? ` (${companyName})` : ''}`);
  return (
    <div className="flex-1 flex items-center justify-center" style={{ minHeight: '60vh' }}>
      <div className="glass-card" style={{ maxWidth: '460px', width: '100%', padding: '36px 32px', textAlign: 'center' }}>
        <span
          className="flex items-center justify-center"
          style={{ width: '54px', height: '54px', borderRadius: '50%', background: 'var(--card-bg-hover)', margin: '0 auto 16px', color: 'var(--brand-red)' }}
        >
          <Lock size={24} />
        </span>
        <h2 className="text-xl font-black text-primary m-0">{featureLabel}</h2>
        <p className="text-sm text-secondary" style={{ margin: '10px 0 4px' }}>
          This isn't included in your <strong className="text-primary">{planLabel}</strong> plan.
        </p>
        <p className="text-xs text-muted m-0">Your data is safe — this page unlocks as soon as your plan includes it.</p>
        <a
          href={`mailto:${UPGRADE_EMAIL}?subject=${subject}`}
          className="btn flex items-center justify-center"
          style={{ gap: '8px', marginTop: '22px', padding: '11px 18px', fontWeight: 800, backgroundColor: 'var(--brand-red)', color: '#fff', borderColor: 'var(--brand-red)', textDecoration: 'none' }}
        >
          <Mail size={15} /> Talk to us about upgrading
        </a>
        <p className="text-xs text-muted m-0 mt-8">{UPGRADE_EMAIL}</p>
      </div>
    </div>
  );
}
