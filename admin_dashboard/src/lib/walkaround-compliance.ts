// Per-shift walk-around check compliance, shared by the Walk-Around Checks
// page ("By Shift" view) and the Alert Panel's Walk-Around category so the
// two can never disagree about what counts as missing or rushed.

export type WalkaroundCheckType = 'start_of_shift' | 'end_of_shift';

export interface ComplianceShift {
  id: string;
  driver_id: string;
  driver_name?: string;
  start_time: string;
  end_time: string | null;
  status: string;
  vehicle_number?: string | null;
}

export interface ComplianceCheck {
  id: string;
  shift_id: string | null;
  check_type: WalkaroundCheckType;
  completed_at: string | null;
  duration_seconds: number | null;
}

export type CheckStatus = 'done' | 'rushed' | 'missing' | 'not_due';

export interface CheckState {
  status: CheckStatus;
  check?: ComplianceCheck;
}

export interface ShiftCompliance {
  shift: ComplianceShift;
  start: CheckState;
  end: CheckState;
}

export interface WalkaroundIssue {
  key: string;
  kind: 'missing_start' | 'missing_end' | 'rushed';
  shift: ComplianceShift;
  checkType: WalkaroundCheckType;
  durationSeconds: number | null;
  /** When the issue arose — shift start, shift end, or check completion. */
  at: string;
}

export function computeShiftCompliance(
  shifts: ComplianceShift[],
  checks: ComplianceCheck[],
  options: { targetMinutes: number; since: Date; isFieldRole: (driverId: string) => boolean },
): ShiftCompliance[] {
  const targetSeconds = options.targetMinutes * 60;
  const submitted = new Map<string, ComplianceCheck>();
  for (const c of checks) {
    if (!c.shift_id || !c.completed_at) continue;
    const key = `${c.shift_id}:${c.check_type}`;
    // Keep the most thorough attempt if a driver submitted twice.
    const existing = submitted.get(key);
    if (!existing || (c.duration_seconds ?? 0) > (existing.duration_seconds ?? 0)) submitted.set(key, c);
  }

  const stateFor = (shiftId: string, type: WalkaroundCheckType, due: boolean): CheckState => {
    const check = submitted.get(`${shiftId}:${type}`);
    if (!check) return { status: due ? 'missing' : 'not_due' };
    const rushed = check.duration_seconds !== null && check.duration_seconds < targetSeconds;
    return { status: rushed ? 'rushed' : 'done', check };
  };

  return shifts
    .filter(s => new Date(s.start_time) >= options.since && options.isFieldRole(s.driver_id))
    .sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime())
    .map(shift => {
      const ended = Boolean(shift.end_time) || shift.status === 'completed';
      return {
        shift,
        start: stateFor(shift.id, 'start_of_shift', true),
        end: stateFor(shift.id, 'end_of_shift', ended),
      };
    });
}

export function walkaroundIssues(compliance: ShiftCompliance[]): WalkaroundIssue[] {
  const issues: WalkaroundIssue[] = [];
  for (const { shift, start, end } of compliance) {
    for (const [type, state] of [['start_of_shift', start], ['end_of_shift', end]] as const) {
      if (state.status === 'missing') {
        issues.push({
          key: `${shift.id}:${type}:missing`,
          kind: type === 'start_of_shift' ? 'missing_start' : 'missing_end',
          shift,
          checkType: type,
          durationSeconds: null,
          at: type === 'start_of_shift' ? shift.start_time : (shift.end_time ?? shift.start_time),
        });
      } else if (state.status === 'rushed' && state.check) {
        issues.push({
          key: `${state.check.id}:rushed`,
          kind: 'rushed',
          shift,
          checkType: type,
          durationSeconds: state.check.duration_seconds,
          at: state.check.completed_at ?? shift.start_time,
        });
      }
    }
  }
  return issues.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}

export function formatCheckDuration(seconds: number | null): string {
  if (seconds === null) return '—';
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s`;
}
