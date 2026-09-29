// Single source of truth for the admin panel's URL. Defaults to the
// planned app.tachyo.co.uk subdomain (see the domain-split decision) —
// override with NEXT_PUBLIC_APP_URL if the cutover hasn't happened yet
// and the dashboard is still live at the root domain.
export const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL || "https://app.tachyo.co.uk";

// Where "Request Access" sends people. Accounts are created by the
// Tachyo team — there's no self-service sign-up — so every new visitor
// goes through this form and lands on the admin panel's Accounts page
// as an "interest buyer".
export const REQUEST_ACCESS_PATH = "/contact";

// Supabase project that stores interest buyers (request-access Edge
// Function). Server-side only — used by app/api/contact/route.ts. The
// anon key comes from SUPABASE_ANON_KEY (Vercel env / .env.local).
export const SUPABASE_URL =
  process.env.SUPABASE_URL || "https://imfgzhxdzxkifuncowrl.supabase.co";

export const SITE_NAME = "Tachyo";
export const SITE_TAGLINE =
  "Dispatch, walk-around checks, proof of delivery, payroll and compliance — one platform for UK haulage.";
