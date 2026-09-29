import { useEffect, useState } from 'react';
import { FileText, PackageCheck } from 'lucide-react';
import { supabase, isMockMode } from '../App';

// Paperwork (POD) + load evidence photos a driver takes at Confirm
// Delivery (migration 060). Paths live in the private delivery-photos
// bucket, so they're resolved to short-lived signed URLs on demand.

interface DeliveryPhotosProps {
  paperworkPath?: string | null;
  evidencePath?: string | null;
  /** Compact = small thumbnails, for table rows. */
  compact?: boolean;
}

export default function DeliveryPhotos({ paperworkPath, evidencePath, compact = false }: DeliveryPhotosProps) {
  const [urls, setUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    const paths = [paperworkPath, evidencePath].filter((p): p is string => !!p);
    if (isMockMode || !supabase || paths.length === 0) return;
    let cancelled = false;
    supabase.storage.from('delivery-photos').createSignedUrls(paths, 3600).then(({ data }) => {
      if (cancelled || !data) return;
      const next: Record<string, string> = {};
      data.forEach((d, i) => { if (d.signedUrl) next[paths[i]] = d.signedUrl; });
      setUrls(next);
    });
    return () => { cancelled = true; };
  }, [paperworkPath, evidencePath]);

  if (!paperworkPath && !evidencePath) return null;

  const tiles = [
    { path: paperworkPath, label: 'Paperwork', icon: <FileText size={12} /> },
    { path: evidencePath, label: 'Load evidence', icon: <PackageCheck size={12} /> },
  ].filter(t => t.path);

  const size = compact ? 36 : 96;

  return (
    <div style={{ marginTop: compact ? 0 : '12px' }}>
      {!compact && <span className="input-label" style={{ display: 'block', marginBottom: '6px' }}>Delivery photos</span>}
      <div className="flex" style={{ gap: compact ? '6px' : '10px' }}>
        {tiles.map(t => {
          const url = urls[t.path!];
          return (
            <a
              key={t.label}
              href={url}
              target="_blank"
              rel="noreferrer"
              title={`${t.label} — open full size`}
              onClick={(e) => e.stopPropagation()}
              style={{
                display: 'block', textDecoration: 'none', width: compact ? size : undefined, flex: compact ? undefined : 1,
                maxWidth: compact ? undefined : '160px', border: '1px solid var(--border-color)', borderRadius: '8px',
                overflow: 'hidden', background: 'var(--card-bg-hover)', pointerEvents: url ? 'auto' : 'none',
              }}
            >
              {url ? (
                <img src={url} alt={t.label} style={{ width: '100%', height: size, objectFit: 'cover', display: 'block' }} />
              ) : (
                <div className="text-xs text-muted flex align-center justify-center" style={{ height: size }}>…</div>
              )}
              {!compact && (
                <span className="flex align-center text-xs text-secondary" style={{ gap: '4px', padding: '5px 8px' }}>
                  {t.icon} {t.label}
                </span>
              )}
            </a>
          );
        })}
      </div>
    </div>
  );
}
