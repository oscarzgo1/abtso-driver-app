import { X } from 'lucide-react';

// Extracted from DefectInspectionDrawer.tsx's original inline lightbox so
// Fuel Receipts (and any future photo-evidence view) shares the exact same
// full-screen viewer instead of a second hand-rolled copy.

interface ImageLightboxProps {
  url: string | null;
  onClose: () => void;
  alt?: string;
}

export function ImageLightbox({ url, onClose, alt = 'Full size photo' }: ImageLightboxProps) {
  if (!url) return null;
  return (
    <div
      style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.9)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close lightbox"
        style={{ position: 'absolute', top: '20px', right: '20px', background: 'none', border: 'none', cursor: 'pointer', color: '#fff' }}
      >
        <X size={28} />
      </button>
      <img src={url} alt={alt} style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain' }} />
    </div>
  );
}
