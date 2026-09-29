// ============================================================
// Edge Function: Company Sign-Up — CLOSED
// ============================================================
// Self-service company registration used to give any visitor a working
// admin panel for free. It's been replaced (migration 061) by:
//   • request-access    — visitors leave their details as an "interest
//                         buyer"; no account is created.
//   • platform-accounts — the platform owner creates the company and its
//                         first admin login from the Accounts page.
// This endpoint stays deployed only so older cached admin panels get a
// clear message instead of a network error.
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve((req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  return new Response(
    JSON.stringify({
      error: "Self-service sign-up has closed. Request access at tachyo.co.uk/contact and our team will set up your account.",
    }),
    { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
