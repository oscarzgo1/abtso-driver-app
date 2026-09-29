import { useEffect, useState } from 'react';
import { buildReportHtml, type ReportSnapshot } from '../lib/report-html';

// Public, read-only view of a partner share link (…/?share=<token>).
// No login: the analytics-report function returns only the frozen report
// snapshot behind a valid, unexpired, unrevoked link.

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export default function SharedReport({ token }: { token: string }) {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      setError('This report viewer is not configured.');
      return;
    }
    fetch(`${SUPABASE_URL}/functions/v1/analytics-report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SUPABASE_ANON_KEY}`, apikey: SUPABASE_ANON_KEY },
      body: JSON.stringify({ action: 'share', token }),
    })
      .then(async res => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok || !body.report) throw new Error(body.error ?? 'This report link is not available.');
        document.title = `${body.label} — Tachyo`;
        setHtml(buildReportHtml(body.report as ReportSnapshot));
      })
      .catch((err: Error) => setError(err.message));
  }, [token]);

  if (error) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter, Arial, sans-serif', padding: '24px', background: '#fff' }}>
        <div style={{ textAlign: 'center', maxWidth: '420px' }}>
          <p style={{ color: '#CC0000', fontWeight: 900, margin: 0 }}>tachyo.</p>
          <h1 style={{ fontSize: '20px', margin: '8px 0' }}>Report unavailable</h1>
          <p style={{ color: '#666', margin: 0 }}>{error}</p>
        </div>
      </div>
    );
  }
  if (!html) {
    return <div style={{ padding: '40px', fontFamily: 'Inter, Arial, sans-serif', color: '#888' }}>Loading report…</div>;
  }
  return <iframe title="Shared report" srcDoc={html} sandbox="allow-same-origin" style={{ width: '100vw', height: '100vh', border: 'none', background: '#fff' }} />;
}
