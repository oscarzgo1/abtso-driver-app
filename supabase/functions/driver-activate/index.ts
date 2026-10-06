// ============================================================
// Edge Function: Driver Activate
// ============================================================
// Drivers use a one-time activation code (migration 065) to set their
// own 6-digit PIN. Only the driver ever knows it — admins can't set or
// see it, only issue a fresh code from the panel.
//
// Two actions:
//   verify   — { driver_id, code }   → confirms the code without using
//                it, so the app can show the "Choose your PIN" screen.
//   set_pin  — { driver_id, code, pin } → consumes the code, hashes the
//                PIN and clears any lock-out state. The rules for easy
//                PINs live in is_pin_easy() so every channel is the same.
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "");
    const driverIdRaw = String(body.driver_id ?? "").trim().toUpperCase();
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    if (action === "forgot") {
      if (!driverIdRaw) return json({ error: "Enter your Driver ID." }, 400);
      // driver_id is only unique per company, so the company code from the
      // login screen narrows it down. Without it we only act when the ID is
      // unambiguous. Either way the response is the same, so this never
      // reveals which Driver IDs are real.
      const companySlug = String(body.company_code ?? "").trim().toLowerCase();
      let query = admin.from("drivers").select("id, organization_id, organizations!inner(slug)").eq("driver_id", driverIdRaw);
      if (companySlug) query = query.eq("organizations.slug", companySlug);
      const { data: candidates } = await query;
      const driverRow = candidates && candidates.length === 1 ? candidates[0] : null;
      if (driverRow) {
        // Only one open request per driver.
        const { data: existing } = await admin
          .from("driver_pin_reset_requests")
          .select("id")
          .eq("driver_id", driverRow.id)
          .is("handled_at", null)
          .maybeSingle();
        if (!existing) {
          await admin.from("driver_pin_reset_requests").insert({ driver_id: driverRow.id });
        }
        await admin.rpc("record_audit", {
          p_org_id: driverRow.organization_id, p_event: "pin_reset_requested",
          p_actor_email: null, p_driver_id: driverRow.id, p_driver_ref: driverIdRaw, p_detail: null,
        });
      }
      return json({ success: true });
    }

    const code = String(body.code ?? "").trim().toUpperCase();
    if (!driverIdRaw || !code) return json({ error: "Enter your Driver ID and activation code." }, 400);

    // driver_id is only unique per company (drivers_org_driver_id_key), so
    // two customers can both have e.g. JOHN.SMITH. The activation code is
    // what identifies the driver: check open codes across every match.
    const { data: candidates } = await admin
      .from("drivers")
      .select("id, organization_id, pin_status, is_active")
      .eq("driver_id", driverIdRaw);
    if (!candidates || candidates.length === 0) return json({ error: "That Driver ID isn't recognised." }, 404);

    const { data: openCodes } = await admin
      .from("driver_activation_codes")
      .select("id, driver_id, code_hash, expires_at")
      .in("driver_id", candidates.map((c) => c.id))
      .is("consumed_at", null)
      .is("cancelled_at", null)
      .gt("expires_at", new Date().toISOString());

    let match: { id: string; driverId: string } | null = null;
    for (const c of openCodes ?? []) {
      const { data: ok } = await admin.rpc("verify_secret", { p_plain: code, p_hash: c.code_hash });
      if (ok === true) { match = { id: c.id as string, driverId: c.driver_id as string }; break; }
    }
    if (!match) return json({ error: "That activation code isn't valid, or it's expired. Ask your manager for a new one." }, 401);
    const driverRow = candidates.find((c) => c.id === match!.driverId)!;
    if (driverRow.is_active === false) {
      return json({ error: "This account has been deactivated. Contact your manager." }, 403);
    }

    if (action === "verify") {
      return json({ ok: true });
    }
    if (action !== "set_pin") return json({ error: `Unknown action "${action}".` }, 400);

    const pin = String(body.pin ?? "").trim();
    if (!/^\d{6}$/.test(pin)) return json({ error: "Your PIN must be 6 digits." }, 400);
    const { data: easy } = await admin.rpc("is_pin_easy", { p_pin: pin });
    if (easy === true) return json({ error: "That PIN is too easy to guess. Pick a mix of digits." }, 400);

    // pin_hash column has a trigger that bcrypts the value on write.
    const { error: pinError } = await admin
      .from("drivers")
      .update({ pin_hash: pin, pin_status: 'set', pin_set_at: new Date().toISOString() })
      .eq("id", driverRow.id);
    if (pinError) return json({ error: `Could not save your PIN: ${pinError.message}` }, 500);

    const { error: authError } = await admin.auth.admin.updateUserById(driverRow.id, { password: pin });
    if (authError) return json({ error: `Could not save your PIN: ${authError.message}` }, 500);
    await admin.from("driver_activation_codes").update({ consumed_at: new Date().toISOString() }).eq("id", match.id);
    await admin.rpc("clear_pin_failures", { p_driver_id: driverRow.id });
    await admin.rpc("record_audit", {
      p_org_id: driverRow.organization_id, p_event: driverRow.pin_status === 'pending' ? 'pin_created' : 'pin_reset',
      p_actor_email: null, p_driver_id: driverRow.id, p_driver_ref: driverIdRaw, p_detail: null,
    });

    return json({ success: true });
  } catch (err) {
    console.error("driver-activate error:", err);
    return json({ error: (err as Error).message ?? "Server error" }, 500);
  }
});
