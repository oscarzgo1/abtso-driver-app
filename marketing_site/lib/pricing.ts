// Single source of truth for what the pricing page charges. Prices are in
// pounds, per driver per month, exactly as shown to customers. A plan with a
// `null` rate has no published price and the pricing page shows "Custom
// quote" for it instead, so nothing here is ever a guess: fill a number in
// only when it's a price Tachyo will honour.
//
// Changing a number here changes the page; nothing else needs touching.

export type Tier = "starter" | "growth" | "enterprise";

export type AnnualDeal =
  | { kind: "none" }
  /** e.g. 10 = the whole year's price is 10% lower than 12 monthly payments. */
  | { kind: "percentOff"; percent: number }
  /** e.g. 2 = pay for 10 months, get 12. */
  | { kind: "monthsFree"; months: number };

export interface PlanPricing {
  /** £ per driver per month. `null` = not published, shows "Custom quote". */
  perDriverMonthly: number | null;
  /** Drivers covered free before the per-driver rate starts. */
  freeDrivers: number;
  /** Fewest drivers ever billed, so a small fleet on this plan still pays this much (0 = no minimum). */
  minBilledDrivers: number;
  annual: AnnualDeal;
}

export const PRICING: Record<Tier, PlanPricing> = {
  starter: { perDriverMonthly: 2, freeDrivers: 5, minBilledDrivers: 0, annual: { kind: "none" } },
  growth: { perDriverMonthly: 6, freeDrivers: 0, minBilledDrivers: 0, annual: { kind: "percentOff", percent: 10 } },
  enterprise: { perDriverMonthly: 10, freeDrivers: 0, minBilledDrivers: 50, annual: { kind: "percentOff", percent: 10 } },
};

/** Free trial offered on every plan, in days. The Terms of Service (clause 7.4),
 * the Refund Policy (clause 1.1) and legal/terms-of-service.md (clause 5.1) quote
 * the same number as plain text, so change those too if this changes. */
export const TRIAL_DAYS = 120;

/** Fleet-size picker on the pricing page. */
export const DRIVERS = { min: 1, max: 100, initial: 10, maxTyped: 5000 } as const;

export const hasPublishedPrices = Object.values(PRICING).some((p) => p.perDriverMonthly !== null);

const toPence = (n: number) => Math.round(n * 100) / 100;

/** Price for one month of a plan at a given fleet size, or `null` when the plan has no published price. */
export function monthlyPrice(tier: Tier, drivers: number): number | null {
  const { perDriverMonthly, freeDrivers, minBilledDrivers } = PRICING[tier];
  if (perDriverMonthly === null) return null;
  const billed = Math.max(minBilledDrivers, Math.max(0, drivers - freeDrivers));
  return toPence(billed * perDriverMonthly);
}

/** Price for a whole year billed annually, with the plan's annual deal applied. */
export function yearlyPrice(tier: Tier, drivers: number): number | null {
  const monthly = monthlyPrice(tier, drivers);
  if (monthly === null) return null;
  const { annual } = PRICING[tier];
  const months =
    annual.kind === "monthsFree" ? 12 - annual.months : annual.kind === "percentOff" ? 12 * (1 - annual.percent / 100) : 12;
  return toPence(monthly * months);
}

/** Short label for the annual deal, or `null` when there isn't one. */
export function annualDealLabel(tier: Tier): string | null {
  const { annual } = PRICING[tier];
  if (annual.kind === "percentOff") return `${annual.percent}% off`;
  if (annual.kind === "monthsFree") return `${annual.months} month${annual.months === 1 ? "" : "s"} free`;
  return null;
}

/** "First 5 drivers free, then £3.00 per driver" / "£9.00 per driver" / "£15.00 per driver, minimum 50 drivers". */
export function rateLine(tier: Tier): string | null {
  const { perDriverMonthly, freeDrivers, minBilledDrivers } = PRICING[tier];
  if (perDriverMonthly === null) return null;
  const rate = `${formatGBP(perDriverMonthly, true)} per driver`;
  if (freeDrivers > 0) return `First ${freeDrivers} drivers free, then ${rate}`;
  return minBilledDrivers > 0 ? `${rate}, minimum ${minBilledDrivers} drivers` : rate;
}

export function formatGBP(amount: number, alwaysPence = false): string {
  const pence = alwaysPence || !Number.isInteger(amount);
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: pence ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(amount);
}
