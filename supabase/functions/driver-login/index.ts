// ============================================================
// Edge Function: Driver Login
// ============================================================
// Driver ID + PIN. Wrong-PIN lock-out (migration 065): 15 free tries per
// rolling day, then 1 → 5 → 15 minutes; a successful login clears the
// counter but keeps the current level so repeated slow guessing still
// hits the wall. A locked account is refused up front without touching
// the PIN check.
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { create } from "https://deno.land/x/djwt@v3.0.2/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function lockedMessage(until: string, level: number) {
  const ms = new Date(until).getTime() - Date.now();
  const mins = Math.max(1, Math.ceil(ms / 60000));
  return `Too many wrong PINs. Try again in ${mins} minute${mins === 1 ? '' : 's'}.` +
    (level >= 2 ? ' If you\'ve forgotten it, tap "Forgot PIN".' : '');
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { driver_id, pin } = await req.json();
    if (!driver_id || !pin) {
      return new Response(JSON.stringify({ error: "Driver ID and PIN are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Look up the driver first so we can refuse a locked account without
    // touching the PIN check.
    const { data: driverRow } = await supabase
      .from("drivers")
      .select("id, organization_id, pin_status, pin_locked_until, pin_lock_level")
      .eq("driver_id", driver_id.toUpperCase())
      .maybeSingle();

    if (driverRow?.pin_locked_until && new Date(driverRow.pin_locked_until) > new Date()) {
      return new Response(JSON.stringify({ error: lockedMessage(driverRow.pin_locked_until, driverRow.pin_lock_level) }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (driverRow?.pin_status === 'pending') {
      return new Response(JSON.stringify({ error: "Your PIN hasn't been set up yet. Use your activation code first.", pin_pending: true }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: drivers, error: rpcError } = await supabase
      .rpc("verify_driver_pin", { p_driver_id: driver_id.toUpperCase(), p_pin: pin });
    if (rpcError) {
      console.error("verify_driver_pin error:", rpcError.message);
      return new Response(JSON.stringify({ error: "Authentication error. Please try again." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const row = drivers?.[0];
    if (!row) {
      if (driverRow) {
        const { data: state } = await supabase.rpc("register_pin_failure", { p_driver_id: driverRow.id });
        const s = state?.[0];
        if (s?.locked_until) {
          return new Response(JSON.stringify({ error: lockedMessage(s.locked_until, s.lock_level) }),
            { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        await supabase.rpc("record_audit", {
          p_org_id: driverRow.organization_id, p_event: "login_failed", p_actor_email: null,
          p_driver_id: driverRow.id, p_driver_ref: driver_id.toUpperCase(), p_detail: null,
        });
        const remaining = typeof s?.attempts_remaining === "number" ? s.attempts_remaining : null;
        return new Response(JSON.stringify({
          error: remaining !== null && remaining <= 3 && remaining > 0
            ? `Wrong PIN. ${remaining} attempt${remaining === 1 ? '' : 's'} before this account is locked.`
            : "Wrong Driver ID or PIN.",
        }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ error: "Wrong Driver ID or PIN." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    await supabase.rpc("clear_pin_failures", { p_driver_id: row.id });
    await supabase.rpc("record_audit", {
      p_org_id: row.organization_id, p_event: "login_ok", p_actor_email: null,
      p_driver_id: row.id, p_driver_ref: driver_id.toUpperCase(), p_detail: null,
    });

    const secret = Deno.env.get("SUPABASE_JWT_SECRET");
    if (!secret) throw new Error("SUPABASE_JWT_SECRET not set");
    const key = await crypto.subtle.importKey(
      "raw", new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
    const jwt = await create({ alg: "HS256", typ: "JWT" }, {
      sub: row.id, email: `${row.driver_id}@driver.tachyo`, role: "authenticated",
      aud: "authenticated", exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30,
    }, key);

    return new Response(JSON.stringify({ token: jwt, driver: row }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("driver-login error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message ?? "Server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
