import { TRUCK_MAKES } from '../lib/truck-makes';
import { useState } from 'react';
import { X, Truck, FileSpreadsheet, User, Plus, Trash2, Settings2 } from 'lucide-react';
import { supabase, isMockMode } from '../App';
import CreatableCombobox from '../components/ui/creatable-combobox';
import { EarningsDateRangePicker } from '../components/ui/earnings-date-range-picker';
import InspectionTypeSelect from '../components/InspectionTypeSelect';
import ManageInspectionTypes from '../components/ManageInspectionTypes';
import { useInspectionTypes } from '../lib/inspection-types';
import CsvImportPanel from './CsvImportPanel';

// ============================================================
// AddAssetModal — the single centered "+ Add Asset" modal. Two tabs share
// one shell: Manual Entry and Batch CSV Import.
//
// Every MOT / PMI / tacho / road tax / insurance … is an *inspection*: it
// is picked from one dropdown (no free typing) and given a date range (when
// it started → when it expires), with the same range picker used across the
// dashboard. A unit can have several inspections; each becomes one register
// row. Companies can add their own inspection types (Manage types).
//
// Asset Type is still a creatable combobox: the standard choices store the
// internal value the app keys off (vehicle_type 'truck'/'trailer'), anything
// else (e.g. "Company Van") is stored as typed (migration 046).
// ============================================================

const ASSET_TYPE_OPTIONS: { label: string; value: string }[] = [
  { label: 'Tractor Unit', value: 'truck' },
  { label: 'Trailer', value: 'trailer' },
  { label: 'Rigid Truck', value: 'Rigid Truck' },
  { label: 'Company Van', value: 'Company Van' },
];

function resolveComboValue(typedLabel: string, options: { label: string; value: string }[]): string {
  const trimmed = typedLabel.trim();
  const matched = options.find(o => o.label.toLowerCase() === trimmed.toLowerCase());
  return matched ? matched.value : trimmed;
}

interface DraftInspection { id: number; type: string; from: string; to: string }

interface AddAssetModalProps {
  organizationId: string | null;
  onClose: () => void;
  onSaved: () => void;
}

let draftSeq = 1;

export default function AddAssetModal({ organizationId, onClose, onSaved }: AddAssetModalProps) {
  const [activeTab, setActiveTab] = useState<'manual' | 'csv'>('manual');
  const { types, custom, reload } = useInspectionTypes(organizationId);
  const [manageOpen, setManageOpen] = useState(false);

  const [vehicleNumber, setVehicleNumber] = useState('');
  // Deliberately no default, so opening the combobox always lists every choice.
  const [assetTypeLabel, setAssetTypeLabel] = useState('');
  const [inspections, setInspections] = useState<DraftInspection[]>([{ id: draftSeq++, type: '', from: '', to: '' }]);
  // Fuel theft/anomaly detection (migration 055) needs a real per-vehicle
  // capacity; optional here, null skips that check until it's set.
  const [fuelTankCapacity, setFuelTankCapacity] = useState('');
  const [make, setMake] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const patch = (id: number, p: Partial<DraftInspection>) => setInspections(list => list.map(i => (i.id === id ? { ...i, ...p } : i)));

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isMockMode || !supabase || !organizationId) return;
    const registration = vehicleNumber.trim();
    setFormError('');
    if (!registration) { setFormError('Enter a registration or fleet number.'); return; }
    if (!assetTypeLabel.trim()) { setFormError('Enter an asset type.'); return; }
    if (inspections.length === 0) { setFormError('Add at least one inspection.'); return; }
    for (const i of inspections) {
      if (!i.type) { setFormError('Choose an inspection type for every inspection.'); return; }
      if (!i.to) { setFormError('Pick the date range (start and expiry) for every inspection.'); return; }
    }
    if (new Set(inspections.map(i => i.type)).size !== inspections.length) { setFormError('Each inspection type can only be added once per asset.'); return; }

    setIsSaving(true);
    try {
      const vehicleType = resolveComboValue(assetTypeLabel, ASSET_TYPE_OPTIONS);
      const tank = fuelTankCapacity.trim() ? parseInt(fuelTankCapacity, 10) : null;
      const { error: insertError } = await supabase.from('vehicles').insert(inspections.map(i => ({
        organization_id: organizationId,
        vehicle_number: registration,
        vehicle_type: vehicleType,
        inspection_type: i.type,
        inspection_start_date: i.from || null,
        inspection_due_date: i.to,
        fuel_tank_capacity_litres: tank,
        make: make || null,
      })));
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
    <>
    <div
      className="modal-overlay"
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 998, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
      onClick={onClose}
    >
      <div
        className="glass-panel modal-content"
        style={{ width: '720px', maxWidth: '100%', maxHeight: '90vh', display: 'flex', flexDirection: 'column', borderRadius: '18px', background: 'var(--card-bg)', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.35)', border: '1px solid var(--border-color)', overflow: 'hidden' }}
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
                    <input type="text" className="login-input" placeholder="e.g. YK23 ABC" value={vehicleNumber} onChange={(e) => setVehicleNumber(e.target.value)} />
                  </div>
                </div>
                <div className="input-group">
                  <span className="input-label">ASSET TYPE</span>
                  <CreatableCombobox value={assetTypeLabel} onChange={setAssetTypeLabel} options={ASSET_TYPE_OPTIONS.map(o => o.label)} placeholder="Tractor Unit, Trailer, or type your own…" />
                </div>
                <div className="input-group">
                  <span className="input-label">MAKE — OPTIONAL (SHOWN IN LIVE TRACKING)</span>
                  <select className="input-field" value={make} onChange={(e) => setMake(e.target.value)}>
                    <option value="">Not set</option>
                    {TRUCK_MAKES.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div className="input-group">
                  <span className="input-label">FUEL TANK CAPACITY (L) — OPTIONAL</span>
                  <input type="number" className="input-field" placeholder="e.g. 450" value={fuelTankCapacity} onChange={(e) => setFuelTankCapacity(e.target.value)} />
                </div>
              </div>

              <div className="flex align-center justify-between" style={{ marginBottom: '8px', gap: '8px', flexWrap: 'wrap' }}>
                <span className="input-label" style={{ margin: 0 }}>INSPECTIONS &amp; DOCUMENTS</span>
                <button type="button" className="comp-edit-btn" onClick={() => setManageOpen(true)}><Settings2 size={12} /> Manage types</button>
              </div>
              <div className="flex flex-col" style={{ gap: '10px', marginBottom: '12px' }}>
                {inspections.map((i, idx) => (
                  <div key={i.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.2fr) auto', gap: '10px', alignItems: 'end', padding: '10px', border: '1px solid var(--border-color)', borderRadius: '10px', background: 'var(--card-bg-hover)' }}>
                    <div style={{ minWidth: 0 }}>
                      <span className="input-label">TYPE</span>
                      <InspectionTypeSelect types={types} value={i.type} onChange={(k) => patch(i.id, { type: k })} />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <span className="input-label">START → EXPIRY</span>
                      <EarningsDateRangePicker startDate={i.from} endDate={i.to} onChange={(from, to) => patch(i.id, { from, to })} />
                    </div>
                    <button
                      type="button"
                      aria-label={`Remove inspection ${idx + 1}`}
                      title="Remove"
                      disabled={inspections.length === 1}
                      onClick={() => setInspections(list => list.filter(x => x.id !== i.id))}
                      style={{ background: 'none', border: '1px solid var(--border-color)', borderRadius: '8px', width: 34, height: 34, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: inspections.length === 1 ? 'not-allowed' : 'pointer', color: 'var(--charcoal-light)', opacity: inspections.length === 1 ? 0.4 : 1 }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
              <button type="button" className="comp-edit-btn" style={{ marginBottom: '16px' }} onClick={() => setInspections(list => [...list, { id: draftSeq++, type: '', from: '', to: '' }])}>
                <Plus size={12} /> Add another inspection
              </button>

              <div>
                <button type="submit" className="btn btn-primary" disabled={isSaving}>
                  {isSaving ? 'Saving…' : 'Save Asset'}
                </button>
              </div>
            </form>
          ) : (
            <CsvImportPanel organizationId={organizationId} onImported={() => { onSaved(); }} />
          )}
        </div>
      </div>
    </div>
    {manageOpen && <ManageInspectionTypes organizationId={organizationId} custom={custom} onClose={() => setManageOpen(false)} onChanged={reload} />}
    </>
  );
}
