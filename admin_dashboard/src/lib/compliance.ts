// ============================================================
// Shared asset roadworthiness logic — the single source of truth for
// Fleet Roadworthiness, the Compliance overview, and anywhere else
// that needs to know whether an asset is legally grounded.
//
// Fixes the earlier bug where an asset "due soon" (e.g. within 48
// hours) was incorrectly shown as VOR Grounded. An asset with a
// future expiry date is NOT legally prohibited from the road yet —
// it only becomes VOR once its inspection has actually lapsed, or it
// carries an unresolved critical physical defect.
// ============================================================

export type ComplianceTier = 'green' | 'amber' | 'red' | 'unknown';

export interface AssetComplianceStatus {
  tier: ComplianceTier;
  label: 'Compliant' | 'Due Soon' | 'VOR Grounded' | 'Not Set';
  daysRemaining: number | null;
}

/**
 * Deterministic roadworthiness status for a single asset.
 *
 * - VOR / Grounded (red): criticalDefectCount > 0, OR daysRemaining <= 0
 *   (overdue). Never triggered by proximity to the due date alone.
 * - Due Soon (amber): 0 < daysRemaining <= thresholdDays.
 * - Compliant (green): daysRemaining > thresholdDays AND no critical defects.
 * - Not Set (unknown): no due date recorded yet.
 */
export function getAssetComplianceStatus(
  dueDate: string | null,
  criticalDefectCount: number,
  thresholdDays: number,
): AssetComplianceStatus {
  const daysRemaining = dueDate == null
    ? null
    : Math.floor((new Date(dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));

  if (criticalDefectCount > 0 || (daysRemaining !== null && daysRemaining <= 0)) {
    return { tier: 'red', label: 'VOR Grounded', daysRemaining };
  }
  if (daysRemaining === null) {
    return { tier: 'unknown', label: 'Not Set', daysRemaining: null };
  }
  if (daysRemaining <= thresholdDays) {
    return { tier: 'amber', label: 'Due Soon', daysRemaining };
  }
  return { tier: 'green', label: 'Compliant', daysRemaining };
}

export const TIER_BADGE_CLASS: Record<ComplianceTier, string> = {
  red: 'badge-danger',
  amber: 'badge-warning',
  green: 'badge-success',
  unknown: 'badge-accent',
};

export function formatDaysRemaining(daysRemaining: number | null): string {
  if (daysRemaining === null) return '—';
  if (daysRemaining === 0) return 'Due today';
  if (daysRemaining < 0) return `${Math.abs(daysRemaining)}d overdue`;
  return `${daysRemaining}d remaining`;
}
