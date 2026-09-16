import { useState } from 'react';
import { X, Truck, FileSpreadsheet, User } from 'lucide-react';
import { supabase, isMockMode } from '../App';
import CreatableCombobox from '../components/ui/creatable-combobox';
import CalendarPicker from '../components/ui/calendar-picker';
import CsvImportPanel from './CsvImportPanel';

// ============================================================
// AddAssetModal — the single centered "+ Add Asset" modal, replacing
// the two previously-separate entry points (an inline manual-add panel
// and a standalone "Import CSV" button/modal). Two tabs share this one
// shell: Manual Entry (a single-asset form) and Batch CSV Import
// (CsvImportPanel, unchanged internally, just no longer owns its own
// overlay).
//
// Asset Type / Inspection Type are creatable comboboxes: picking one of
// the standard choices stores the same internal value the rest of the
// app already keys off (vehicle_type 'truck'/'trailer',
// inspection_type 'mot'/'pmi'/...), so existing label/icon lookups
// keep working unchanged. Typing something else (e.g. "Company Van")
// stores that raw text instead — migration 046 widened both columns'
// CHECK constraints from a fixed enum to "non-empty text" specifically
// so this doesn't silently fail at the database.
// ============================================================

const ASSET_TYPE_OPTIONS: { label: string; value: string }[] = [
  { label: 'Tractor Unit', value: 'truck' },
  { label: 'Trailer', value: 'trailer' },
  { label: 'Rigid Truck', value: 'Rigid Truck' },
  { label: 'Company Van', value: 'Company Van' },
];
const INSPECTION_TYPE_OPTIONS: { label: string; value: string }[] = [
  { label: 'MOT', value: 'mot' },
  { label: 'PMI', value: 'pmi' },
  { label: 'Tacho Calibration', value: 'tacho_calibration' },
  { label: 'Roller Brake Test', value: 'roller_brake_test' },
  { label: 'LOLER', value: 'loler' },
];

function resolveComboValue(typedLabel: string, options: { label: string; value: string }[]): string {
  const trimmed = typedLabel.trim();
  const matched = options.find(o => o.label.toLowerCase() === trimmed.toLowerCase());
  return matched ? matched.value : trimmed;
}

interface AddAssetModalProps {
  organizationId: string | null;
  onClose: () => void;
  onSaved: () => void;
}

export default function AddAssetModal({ organizationId, onClose, onSaved }: AddAssetModalProps) {
  const [activeTab, setActiveTab] = useState<'manual' | 'csv'>('manual');

  const [vehicleNumber, setVehicleNumber] = useState('');
  // Deliberately no default — a prefilled exact match (e.g. "Trailer")
  // made the combobox's own suggestion list filter down to just that
  // one entry the moment it opened, which looked like a locked
  // single-choice field rather than "pick one of a few, or type your
  // own". Starting empty means opening it always shows every standard
  // choice.
  const [assetTypeLabel, setAssetTypeLabel] = useState('');
  const [inspectionTypeLabel, setInspectionTypeLabel] = useState('');
  const [dueDate, setDueDate] = useState<Date | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isMockMode || !supabase || !organizationId) return;
    const registration = vehicleNumber.trim();
    setFormError('');
    if (!registration) {
      setFormError('Enter a registration or fleet number.');
      return;
    }
    if (!assetTypeLabel.trim()) {
      setFormError('Enter an asset type.');
      return;
    }
    if (!inspectionTypeLabel.trim()) {
      setFormError('Enter an inspection type.');
      return;
    }
    setIsSaving(true);
    try {
      const { error: insertError } = await supabase.from('vehicles').insert({
        organization_id: organizationId,
        vehicle_number: registration,
        vehicle_type: resolveComboValue(assetTypeLabel, ASSET_TYPE_OPTIONS),
        inspection_type: resolveComboValue(inspectionTypeLabel, INSPECTION_TYPE_OPTIONS),
        inspection_due_date: dueDate ? dueDate.toISOString().slice(0, 10) : null,
      });
      if (insertError) throw insertError;
      onSaved();
      onClose();
    } catch (err: any) {
      setFormError(err?.message ?? 'Could not add the asset.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 998, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
      onClick={onClose}
    >
      <div
        className="glass-panel"
        style={{ width: '720px', maxWidth: '100%', maxHeight: '88vh', display: 'flex', flexDirection: 'column', borderRadius: '18px', background: 'var(--card-bg)', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.35)', border: '1px solid var(--border-color)', overflow: 'hidden' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex align-center justify-between p-16" style={{ borderBottom: '1px solid var(--border-color)' }}>
          <span className="font-black text-primary" style={{ fontSize: '15px' }}>+ Add Asset</span>
          <button type="button" onClick={onClose} aria-label="Close" style={{ background: 'none', border: 0, cursor: 'pointer', color: 'var(--charcoal-light)', display: 'flex' }}>
            <X size={18} />
          </button>
        </div>

        <div className="flex align-center" style={{ gap: '4px', padding: '10px 16px 0' }}>
          {([
            ['manual', 'Manual Entry', User],
            ['csv', 'Batch CSV Import', FileSpreadsheet],
          ] as const).map(([key, label, Icon]) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveTab(key)}
              className="flex align-center text-sm font-bold"
              style={{
                gap: '6px', padding: '10px 14px', borderRadius: '8px 8px 0 0', cursor: 'pointer',
                border: 'none', borderBottom: activeTab === key ? '2px solid var(--brand-red)' : '2px solid transparent',
                background: 'none', color: activeTab === key ? 'var(--charcoal)' : 'var(--charcoal-light)',
              }}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>

        <div className="p-16" style={{ overflowY: 'auto', borderTop: '1px solid var(--border-color)' }}>
          {activeTab === 'manual' ? (
            <form onSubmit={handleSave}>
              {formError && <div className="login-notice login-notice--error mb-16">{formError}</div>}
              <div className="grid grid-cols-2 gap-16 mb-16">
                <div className="input-group" style={{ gridColumn: '1 / -1' }}>
                  <span className="input-label">REGISTRATION / FLEET NUMBER</span>
                  <div className="login-field">
                    <span className="login-field-icon"><Truck size={15} /></span>
                    <input
                      type="text"
                      className="login-input"
                      placeholder="e.g. YK23 ABC"
                      value={vehicleNumber}
                      onChange={(e) => setVehicleNumber(e.target.value)}
                    />
                  </div>
                </div>
                <div className="input-group">
                  <span className="input-label">ASSET TYPE</span>
                  <CreatableCombobox
                    value={assetTypeLabel}
                    onChange={setAssetTypeLabel}
                    options={ASSET_TYPE_OPTIONS.map(o => o.label)}
                    placeholder="Tractor Unit, Trailer, or type your own…"
                  />
                </div>
                <div className="input-group">
                  <span className="input-label">INSPECTION TYPE</span>
                  <CreatableCombobox
                    value={inspectionTypeLabel}
                    onChange={setInspectionTypeLabel}
                    options={INSPECTION_TYPE_OPTIONS.map(o => o.label)}
                    placeholder="MOT, PMI, Tacho… or type your own"
                  />
                </div>
                <div className="input-group">
                  <span className="input-label">DUE DATE</span>
                  <CalendarPicker value={dueDate} onChange={setDueDate} placeholder="Select due date" />
                </div>
              </div>
              <button type="submit" className="btn btn-primary" disabled={isSaving}>
                {isSaving ? 'Saving…' : 'Save Asset'}
              </button>
            </form>
          ) : (
            <CsvImportPanel organizationId={organizationId} onImported={() => { onSaved(); }} />
          )}
        </div>
      </div>
    </div>
  );
}
