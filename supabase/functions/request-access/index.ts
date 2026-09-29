// ============================================================
// Edge Function: Request Access (interest buyers)
// ============================================================
// Replaces free self-service company signup. A visitor — from the
// marketing site's contact form or the admin panel's login page —
// leaves their details and becomes an "interest buyer": one row in
// public.access_requests (migration 061). NO organization and NO login
// is created here; the platform owner reviews the request on the admin
// panel's Accounts page and creates the account there
// (platform-accounts function) if it goes ahead.
//
// Public by design (no user session). Abuse limits: a hidden honeypot
// field, length caps on every field, and at most 3 requests per email
// address per 24 hours (extra ones are acknowledged but not stored).
// The response never says whether an email already has an account.
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const FLEET_SIZES = new Set(["1-9", "10-49", "50-149", "150+"]);
const MAX_REQUESTS_PER_DAY = 3;

function clean(value: unknown, max: number): string {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));

    // Honeypot: a field real visitors never see or fill in.
    if (clean(body.website, 200)) {
      return json({ success: true });
    }

    const companyName = clean(body.companyName, 120);
    const contactName = clean(body.contactName, 120);
    const email = clean(body.email, 200).toLowerCase();
    const phone = clean(body.phone, 40);
    const fleetSize = clean(body.fleetSize, 20);
    const message = String(body.message ?? "").trim().slice(0, 2000);
    const source = body.source === "admin_login" ? "admin_login" : "website";

    if (companyName.length < 2) {
      return json({ error: "Enter your company name." }, 400);
    }
    if (contactName.length < 2) {
      return json({ error: "Enter your name." }, 400);
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ error: "Enter a valid work email address." }, 400);
    }

    const projectUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!projectUrl || !serviceKey) {
      console.error("request-access: missing Supabase credentials");
      return json({ error: "The request service isn't configured. Please email hello@tachyo.co.uk." }, 500);
    }
    const admin = createClient(projectUrl, serviceKey);

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count } = await admin
      .from("access_requests")
      .select("id", { count: "exact", head: true })
      .eq("email", email)
      .gte("created_at", since);
    if ((count ?? 0) >= MAX_REQUESTS_PER_DAY) {
      return json({ success: true });
    }

    const { error: insertError } = await admin.from("access_requests").insert({
      company_name: companyName,
      contact_name: contactName,
      email,
      phone: phone || null,
      fleet_size: FLEET_SIZES.has(fleetSize) ? fleetSize : null,
      message: message || null,
      source,
    });

    if (insertError) {
      console.error("request-access insert failed:", insertError.message);
      return json({ error: "We couldn't save your request. Please try again, or email hello@tachyo.co.uk." }, 500);
    }

    console.log(`Access requested: ${companyName} (${source})`);
    return json({ success: true });
  } catch (err) {
    console.error("request-access error:", err);
    return json({ error: "Unexpected error. Please try again." }, 500);
  }
});
