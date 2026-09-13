// Single source of truth for the admin panel's URL. Defaults to the
// planned app.tachyo.co.uk subdomain (see the domain-split decision) —
// override with NEXT_PUBLIC_APP_URL if the cutover hasn't happened yet
// and the dashboard is still live at the root domain.
export const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL || "https://app.tachyo.co.uk";

export const SITE_NAME = "Tachyo";
export const SITE_TAGLINE =
  "Fleet dispatch, payroll, and compliance — unified for UK haulage operators.";
