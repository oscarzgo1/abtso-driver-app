import { useState, useMemo } from 'react';
import { X, Lock, Moon, Plus, Minus, Receipt, CheckCircle2, Pencil } from 'lucide-react';

// ============================================================
// Right-hand slide-over drawer replacing the old centered "Edit
// Payroll" modal. Single-shift mode shows full context (driver,
// vehicle, exact times, locked rate); bulk mode (multiple selected
// shifts) shows a reduced context, since a locked rate / exact
// timestamps don't mean anything across a mixed selection.
//
// The drawer does NOT compute total_pay itself — it only collects the
// adjustment values (night out / bonus / deduction / notes / optional
// rate override) and hands them to the caller, which writes them to
// public.shifts. The calculate_shift_financials() trigger (migration
// 048) does the actual arithmetic server-side from the LOCKED rate
// snapshot, which is what guarantees a shift's historical base pay
// can never drift just because this drawer was opened.
// ============================================================

export interface PayrollShiftContext {
  driver_name?: string;
  start_time: string;
  end_time: string | null;
  total_hours: number | null;
  vehicle_number?: string | null;
  applied_rate_type?: 'hourly' | 'fixed_shift' | null;
  applied_rate_amount?: number | null;
  rate_snapshot_timestamp?: string | null;
  total_pay: number | null;
}

export interface PayrollDrawerSaveValues {
  nightOutAmount: number;
  bonusAmount: number;
  bonusNote: string;
  deductionAmount: number;
  deductionReason: string;
  notes: string;
  microShiftOverride: boolean;
  rateOverride: { type: 'hourly' | 'fixed_shift'; amount: number } | null;
}

interface PayrollDrawerProps {
  mode: 'single' | 'bulk';
  driverName: string;
  shiftCount: number;
  shift?: PayrollShiftContext;
  defaultNightOut: number;
  defaultBonus: number;
  defaultBonusNote: string;
  defaultDeduction: number;
  defaultDeductionReason: string;
  defaultNotes: string;
  defaultMicroOverride: boolean;
  isMicroShift: boolean;
  isSaving: boolean;
  onClose: () => void;
  onSave: (values: PayrollDrawerSaveValues) => void;
}

const DEFAULT_NIGHT_OUT_AMOUNT = 25.00; // matches calculate_shift_financials()'s own fallback constant

function formatHM(hours: number | null): string {
  if (hours == null) return '—';
  const totalMinutes = Math.max(0, Math.round(hours * 60));
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}
function formatTime24(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}
function formatDateUK(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default function PayrollDrawer({
  mode, driverName, shiftCount, shift,
  defaultNightOut, defaultBonus, defaultBonusNote, defaultDeduction, defaultDeductionReason, defaultNotes, defaultMicroOverride, isMicroShift,
  isSaving, onClose, onSave,
}: PayrollDrawerProps) {
  const [nightOutOn, setNightOutOn] = useState(defaultNightOut > 0);
  const [nightOutAmount, setNightOutAmount] = useState(defaultNightOut > 0 ? defaultNightOut : DEFAULT_NIGHT_OUT_AMOUNT);
  const [bonusAmount, setBonusAmount] = useState(defaultBonus);
  const [bonusNote, setBonusNote] = useState(defaultBonusNote);
  const [deductionAmount, setDeductionAmount] = useState(defaultDeduction);
  const [deductionReason, setDeductionReason] = useState(defaultDeductionReason);
  const [notes, setNotes] = useState(defaultNotes);
  const [microOverride, setMicroOverride] = useState(defaultMicroOverride);

  const [overrideOn, setOverrideOn] = useState(false);
  const [overrideType, setOverrideType] = useState<'hourly' | 'fixed_shift'>(shift?.applied_rate_type ?? 'hourly');
  const [overrideAmount, setOverrideAmount] = useState(shift?.applied_rate_amount != null ? String(shift.applied_rate_amount) : '');

  const effectiveNightOut = nightOutOn ? (Number(nightOutAmount) || 0) : 0;
  const effectiveBonus = Number(bonusAmount) || 0;
  const effectiveDeduction = Number(deductionAmount) || 0;

  // Live reconciliation preview — single-shift mode only, mirrors exactly
  // what the trigger will compute (wage component from the locked, or
  // overridden, rate × hours; flat if fixed).
  const preview = useMemo(() => {
    if (mode !== 'single' || !shift) return null;
    const rateAmount = overrideOn ? (Number(overrideAmount) || 0) : (shift.applied_rate_amount ?? 0);
    const rateType = overrideOn ? overrideType : (shift.applied_rate_type ?? 'hourly');
    const hours = shift.total_hours ?? 0;
    const baseWages = rateType === 'fixed_shift' ? rateAmount : Number((hours * rateAmount).toFixed(2));
    const treatAsZero = isMicroShift && !microOverride;
    const finalGross = treatAsZero ? 0 : Number((baseWages + effectiveNightOut + effectiveBonus - effectiveDeduction).toFixed(2));
    return { baseWages, finalGross, treatAsZero };
  }, [mode, shift, overrideOn, overrideAmount, overrideType, effectiveNightOut, effectiveBonus, effectiveDeduction, isMicroShift, microOverride]);

  const handleSave = () => {
    onSave({
      nightOutAmount: effectiveNightOut,
      bonusAmount: effectiveBonus,
      bonusNote,
      deductionAmount: effectiveDeduction,
      deductionReason,
      notes,
      microShiftOverride: microOverride,
      rateOverride: overrideOn ? { type: overrideType, amount: Number(overrideAmount) || 0 } : null,
    });
  };

  const sectionLabel: React.CSSProperties = { textTransform: 'uppercase', letterSpacing: '0.04em' };

  return (
    <>
      <div
        style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.5)', zIndex: 9998 }}
        onClick={onClose}
      />
      <div
        style={{
          position: 'fixed', top: 0, right: 0, height: '100vh', width: '440px', maxWidth: '100%',
          background: 'var(--card-bg)', borderLeft: '1px solid var(--border-color)', boxShadow: '-16px 0 32px rgba(0,0,0,0.25)',
          zIndex: 9999, display: 'flex', flexDirection: 'column',
        }}
      >
        <div className="p-16 flex align-center justify-between" style={{ borderBottom: '1px solid var(--border-color)' }}>
          <div>
            <span className="font-black text-primary" style={{ fontSize: '15px' }}>Edit Payroll</span>
            <p className="text-xs text-muted m-0 mt-4">{mode === 'bulk' ? `${shiftCount} selected shifts` : driverName}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" style={{ background: 'none', border: 0, cursor: 'pointer', color: 'var(--charcoal-light)' }}>
            <X size={18} />
          </button>
        </div>

        <div className="p-16" style={{ overflowY: 'auto', flex: 1 }}>
          {/* ── Shift Context (single mode only) ── */}
          {mode === 'single' && shift && (
            <div className="mb-16">
              <p className="text-xs font-bold text-muted mb-4" style={sectionLabel}>Shift Context</p>
              <p className="text-sm font-bold text-primary m-0">{driverName}</p>
              <p className="text-xs text-secondary m-0 mt-4">
                {shift.vehicle_number ? (
                  <span className="font-mono uppercase">{shift.vehicle_number}</span>
                ) : (
                  <span className="text-muted">No vehicle assigned</span>
                )}
              </p>
              <p className="text-xs text-secondary m-0 mt-4">{formatDateUK(shift.start_time)}</p>
              <p className="font-mono tabular-nums text-xs text-secondary m-0 mt-4">
                {formatTime24(shift.start_time)} – {shift.end_time ? formatTime24(shift.end_time) : 'Ongoing'}
                {shift.total_hours != null && <span> &bull; {formatHM(shift.total_hours)}</span>}
              </p>
              {isMicroShift && (
                <div className="mt-8 flex align-center" style={{ gap: '6px', padding: '8px 10px', borderRadius: '8px', background: 'var(--card-bg-hover)' }}>
                  <span className="badge badge-accent" style={{ fontSize: '10px' }}>Ignored Test Shift</span>
                  <span className="text-xs text-muted">Under 15 minutes — gross pay is £0.00 unless overridden below.</span>
                </div>
              )}
            </div>
          )}

          {/* ── Rate Info ── */}
          {mode === 'single' && shift && (
            <div className="mb-16">
              <p className="text-xs font-bold text-muted mb-4" style={sectionLabel}>Rate Info</p>
              {shift.rate_snapshot_timestamp && shift.applied_rate_amount != null ? (
                <div className="flex align-center" style={{ gap: '6px' }}>
                  <Lock size={12} className="text-muted" />
                  <span className="text-sm font-semibold font-mono tabular-nums text-primary">
                    £{Number(shift.applied_rate_amount).toFixed(2)}{shift.applied_rate_type === 'fixed_shift' ? ' (Fixed/Shift)' : '/hr'}
                  </span>
                </div>
              ) : (
                <p className="text-xs text-muted m-0">No locked rate yet — this shift hasn&apos;t completed.</p>
              )}
              {shift.rate_snapshot_timestamp && (
                <span className="badge badge-accent mt-4" style={{ fontSize: '10px' }}>
                  Locked from profile on {formatDateUK(shift.rate_snapshot_timestamp)}
                </span>
              )}

              <label className="flex align-center mt-8" style={{ gap: '6px', cursor: 'pointer' }}>
                <input type="checkbox" checked={overrideOn} onChange={(e) => setOverrideOn(e.target.checked)} />
                <span className="text-xs font-bold text-secondary flex align-center" style={{ gap: '4px' }}>
                  <Pencil size={11} /> Override Base Rate
                </span>
              </label>

              {overrideOn && (
                <div className="flex align-center mt-8" style={{ gap: '8px' }}>
                  <select
                    className="select-field"
                    value={overrideType}
                    onChange={(e) => setOverrideType(e.target.value as 'hourly' | 'fixed_shift')}
                    style={{ width: '120px' }}
                  >
                    <option value="hourly">Hourly</option>
                    <option value="fixed_shift">Fixed/Shift</option>
                  </select>
                  <input
                    type="number"
                    step="0.01"
                    className="input-field"
                    placeholder="0.00"
                    value={overrideAmount}
                    onChange={(e) => setOverrideAmount(e.target.value)}
                    style={{ flex: 1 }}
                  />
                </div>
              )}
              {overrideOn && (
                <p className="text-xs m-0 mt-4" style={{ color: '#E65100' }}>
                  This re-locks the rate for this shift going forward — a deliberate, audited correction, not a live profile change.
                </p>
              )}
            </div>
          )}

          {/* ── Allowances & Adjustments ── */}
          <div className="mb-16">
            <p className="text-xs font-bold text-muted mb-8" style={sectionLabel}>Allowances &amp; Adjustments</p>

            <label className="flex align-center justify-between mb-8" style={{ cursor: 'pointer' }}>
              <span className="flex align-center text-sm text-primary font-bold" style={{ gap: '6px' }}>
                <Moon size={13} /> Night Out Allowance
              </span>
              <input type="checkbox" checked={nightOutOn} onChange={(e) => setNightOutOn(e.target.checked)} />
            </label>
            {nightOutOn && (
              <div className="flex align-center mb-8" style={{ gap: '6px' }}>
                <span className="text-xs text-muted">£</span>
                <input
                  type="number" step="0.01" className="input-field"
                  value={nightOutAmount}
                  onChange={(e) => setNightOutAmount(Number(e.target.value))}
                />
              </div>
            )}

            <div className="input-group mb-8">
              <span className="input-label flex align-center" style={{ gap: '4px' }}><Plus size={11} /> MANUAL BONUS (£)</span>
              <input type="number" step="0.01" className="input-field" value={bonusAmount} onChange={(e) => setBonusAmount(Number(e.target.value))} />
              <input
                type="text" className="input-field mt-4" placeholder="e.g. pallet drop incentive, performance bonus…"
                value={bonusNote} onChange={(e) => setBonusNote(e.target.value)}
              />
            </div>

            <div className="input-group mb-8">
              <span className="input-label flex align-center" style={{ gap: '4px' }}><Minus size={11} /> DEDUCTIONS (£)</span>
              <input type="number" step="0.01" className="input-field" value={deductionAmount} onChange={(e) => setDeductionAmount(Number(e.target.value))} />
              <input
                type="text" className="input-field mt-4" placeholder="e.g. parking charge, PCN penalty, fuel discrepancy…"
                value={deductionReason} onChange={(e) => setDeductionReason(e.target.value)}
              />
            </div>

            {isMicroShift && mode === 'single' && (
              <label className="flex align-center" style={{ gap: '6px', cursor: 'pointer' }}>
                <input type="checkbox" checked={microOverride} onChange={(e) => setMicroOverride(e.target.checked)} />
                <span className="text-xs font-bold text-secondary">Pay this shift anyway (genuine work, not a test)</span>
              </label>
            )}
          </div>

          {/* ── Manager Notes ── */}
          <div className="mb-16">
            <p className="text-xs font-bold text-muted mb-4" style={sectionLabel}>Manager Notes</p>
            <textarea
              className="input-field" style={{ width: '100%', minHeight: '60px', resize: 'vertical' }}
              placeholder="Reason for this payroll modification…"
              value={notes} onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {/* ── Live Reconciliation Preview ── */}
          {preview && (
            <div className="p-16" style={{ borderRadius: '10px', background: 'var(--card-bg-hover)' }}>
              <p className="text-xs font-bold text-muted mb-8" style={{ ...sectionLabel, display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Receipt size={11} /> Live Reconciliation Preview
              </p>
              <div className="flex justify-between text-xs text-secondary mb-4"><span>Base Wages</span><span className="font-mono tabular-nums">£{preview.baseWages.toFixed(2)}</span></div>
              <div className="flex justify-between text-xs text-secondary mb-4"><span>Night Out</span><span className="font-mono tabular-nums">+£{effectiveNightOut.toFixed(2)}</span></div>
              <div className="flex justify-between text-xs text-secondary mb-4"><span>Bonus</span><span className="font-mono tabular-nums">+£{effectiveBonus.toFixed(2)}</span></div>
              <div className="flex justify-between text-xs text-secondary mb-8"><span>Deductions</span><span className="font-mono tabular-nums">-£{effectiveDeduction.toFixed(2)}</span></div>
              <div className="flex justify-between" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '8px' }}>
                <span className="text-sm font-bold text-primary">Final Gross Pay</span>
                <span className="font-mono font-black tabular-nums text-primary" style={{ fontSize: '16px' }}>£{preview.finalGross.toFixed(2)}</span>
              </div>
              {preview.treatAsZero && (
                <p className="text-xs m-0 mt-8" style={{ color: '#E65100' }}>Zeroed by the Ignored Test Shift rule — tick the override above to pay it.</p>
              )}
            </div>
          )}
        </div>

        <div className="p-16 flex align-center justify-end" style={{ borderTop: '1px solid var(--border-color)', gap: '8px' }}>
          <button type="button" className="btn" onClick={onClose} disabled={isSaving}>Cancel</button>
          <button
            type="button"
            className="btn flex align-center"
            style={{ gap: '6px', backgroundColor: 'var(--brand-red)', color: '#fff', borderColor: 'var(--brand-red)' }}
            onClick={handleSave}
            disabled={isSaving}
          >
            <CheckCircle2 size={14} /> {isSaving ? 'Saving…' : 'Save & Approve Payroll'}
          </button>
        </div>
      </div>
    </>
  );
}
