import { useState, useEffect } from 'react';
import { X, Camera, ZoomIn, ShieldAlert, Search, CheckCircle2 } from 'lucide-react';
import { supabase, isMockMode } from '../App';
import { ImageLightbox } from '../components/ui/image-lightbox';

// ============================================================
// Right-hand inspection drawer for a single defect: driver's
// walkaround note, a real photo gallery with a lightbox, and quick
// triage actions.
//
// incident_reports.photo_urls (migrations 043/044) stores private
// Storage object PATHS ("<org_id>/<driver_id>/<file>"), not public
// URLs — the "defect-photos" bucket is private and RLS-scoped, so
// this resolves each path to a short-lived signed URL on open rather
// than exposing photos via permanent public links.
// ============================================================

export type DefectSeverity = 'critical_vor' | 'advisory_minor';
export type DefectStatus = 'open' | 'acknowledged' | 'closed';

export interface InspectionDefect {
  id: string;
  vehicle_id: string | null;
  vehicle_number?: string;
  category: string;
  categoryLabel: string;
  severity: DefectSeverity;
  status: DefectStatus;
  created_at: string;
  note: string | null;
  driver_name?: string;
  photo_urls: string[];
}

interface DefectInspectionDrawerProps {
  defect: InspectionDefect;
  onClose: () => void;
  onUpdateStatus: (id: string, status: DefectStatus) => void;
  /// Grounds the tagged vehicle directly (vehicles.is_vor = true) — a
  /// separate action from status, since VOR is a property of the asset,
  /// not a workflow state of this one defect report.
  onSetVor: (defectId: string, vehicleId: string | null) => void;
}

export default function DefectInspectionDrawer({ defect, onClose, onUpdateStatus, onSetVor }: DefectInspectionDrawerProps) {
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [signedUrls, setSignedUrls] = useState<string[]>([]);
  const [isLoadingPhotos, setIsLoadingPhotos] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setSignedUrls([]);
    if (isMockMode || !supabase || defect.photo_urls.length === 0) return;
    setIsLoadingPhotos(true);
    supabase.storage
      .from('defect-photos')
      .createSignedUrls(defect.photo_urls, 3600)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (!error && data) {
          setSignedUrls(data.map(d => d.signedUrl).filter((u): u is string => !!u));
        }
      })
      .finally(() => { if (!cancelled) setIsLoadingPhotos(false); });
    return () => { cancelled = true; };
  }, [defect.photo_urls]);

  return (
    <>
      <div
        style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.5)', zIndex: 9998 }}
        onClick={onClose}
      />
      <div
        style={{
          position: 'fixed', top: 0, right: 0, height: '100vh', width: '420px', maxWidth: '100%',
          background: 'var(--card-bg)', borderLeft: '1px solid var(--border-color)', boxShadow: '-16px 0 32px rgba(0,0,0,0.25)',
          zIndex: 9999, display: 'flex', flexDirection: 'column',
        }}
      >
        <div className="p-16 flex align-center justify-between" style={{ borderBottom: '1px solid var(--border-color)' }}>
          <div>
            <span className="font-mono font-bold text-primary" style={{ fontSize: '15px' }}>{defect.vehicle_number ?? 'Unassigned asset'}</span>
            <div className="flex align-center mt-4" style={{ gap: '8px' }}>
              <span className={`badge ${defect.severity === 'critical_vor' ? 'badge-danger' : 'badge-warning'}`}>
                {defect.severity === 'critical_vor' ? 'Critical / VOR' : 'Advisory / Minor'}
              </span>
              <span className="text-xs text-muted">{new Date(defect.created_at).toLocaleString()}</span>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" style={{ background: 'none', border: 0, cursor: 'pointer', color: 'var(--charcoal-light)' }}>
            <X size={18} />
          </button>
        </div>

        <div className="p-16" style={{ overflowY: 'auto', flex: 1 }}>
          <p className="text-xs font-bold text-muted mb-4" style={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}>Reported By</p>
          <p className="text-sm text-primary mb-16">{defect.driver_name ?? 'Unknown driver'} · {defect.categoryLabel}</p>

          <p className="text-xs font-bold text-muted mb-4" style={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}>Walkaround Notes</p>
          <p className="text-sm text-secondary mb-16">{defect.note || 'No notes were recorded with this defect.'}</p>

          <p className="text-xs font-bold text-muted mb-8" style={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}>Photo Evidence</p>
          {defect.photo_urls.length === 0 ? (
            <div className="flex align-center" style={{ gap: '8px', padding: '14px', borderRadius: '10px', background: 'var(--card-bg-hover)' }}>
              <Camera size={16} className="text-muted" />
              <p className="text-xs text-muted m-0">No photos attached to this defect.</p>
            </div>
          ) : isLoadingPhotos ? (
            <p className="text-xs text-muted m-0">Loading photos…</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
              {signedUrls.map((url, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setLightboxUrl(url)}
                  style={{ position: 'relative', aspectRatio: '1', border: 'none', padding: 0, cursor: 'zoom-in', borderRadius: '8px', overflow: 'hidden' }}
                >
                  <img src={url} alt={`Defect evidence ${i + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  <span style={{ position: 'absolute', bottom: '4px', right: '4px', background: 'rgba(0,0,0,0.6)', borderRadius: '4px', padding: '2px' }}>
                    <ZoomIn size={12} color="#fff" />
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="p-16" style={{ borderTop: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <p className="text-xs font-bold text-muted mb-4" style={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}>Triage Action</p>
          <button
            type="button"
            disabled={defect.status === 'acknowledged'}
            onClick={() => onUpdateStatus(defect.id, 'acknowledged')}
            className="btn flex align-center"
            style={{ gap: '6px', justifyContent: 'center' }}
          >
            <Search size={14} /> Mark Under Inspection
          </button>
          <button
            type="button"
            disabled={defect.status === 'closed'}
            onClick={() => onUpdateStatus(defect.id, 'closed')}
            className="btn flex align-center"
            style={{ gap: '6px', justifyContent: 'center' }}
          >
            <CheckCircle2 size={14} /> Mark Rectified
          </button>
          {defect.vehicle_id && (
            <button
              type="button"
              onClick={() => onSetVor(defect.id, defect.vehicle_id)}
              className="btn flex align-center"
              style={{ gap: '6px', justifyContent: 'center', backgroundColor: 'var(--brand-red)', color: '#fff', borderColor: 'var(--brand-red)' }}
            >
              <ShieldAlert size={14} /> Set VOR
            </button>
          )}
        </div>
      </div>

      <ImageLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} alt="Defect evidence, full size" />
    </>
  );
}
