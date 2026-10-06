// Shared bits of the Authorization History (migration 097): the permanent,
// signed record of a unit being authorised for road use (or grounded) by hand.

export interface LedgerEntry {
  id: string;
  registration: string;
  action: 'return_to_service' | 'ground';
  previous_issues: string[];
  reason: string;
  approver_first_name: string;
  approver_last_name: string;
  signature_svg: string;
  approved_by_email: string | null;
  approved_at: string;
  /** When the fix was made (automatic = signing time, or set by the department). */
  fixed_at?: string | null;
  /** New expiry dates set while authorising, e.g. a Roller Brake Test. */
  renewals?: { type: string; old_due: string | null; start: string; new_due: string }[];
}

export const ACTION_LABEL: Record<string, string> = {
  return_to_service: 'Authorised for road use',
  ground: 'Grounded (VOR)',
};

export const signatureSrc = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

export const fullWhen = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
