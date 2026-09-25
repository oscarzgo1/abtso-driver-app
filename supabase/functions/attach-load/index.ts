// ============================================================
// Edge Function: Driver Load Attachment
// ============================================================
// Lets a driver tag their own active shift with a load reference /
// customer name — nothing else. This exists ONLY because of the hard
// wall migration 035 built on purpose: public.shift_revenue has NO
// driver-facing RLS policy at all, specifically so a driver's own
// select-star queries can never return revenue_amount (the company's
// billed rate) to their device. That wall must stay intact.
//
// This function uses the service-role client to write JUST
// load_reference/carrier_name for the caller's own shift — it never
// accepts a revenue_amount from the request body (even if one is
// sent, it's ignored), and never selects/returns the row back to the
// caller, so revenue_amount can never transit through this endpoint
// in either direction. An admin still rates the load's £ value
// afterward from the Shipments ledger, exactly as today.
//
// Also serves "status" (the shift's load + delivery state and the
// org's load_reminder_minutes, for the app's stationary reminder) and
// "deliver" (stamps shift_revenue.delivered_at, migration 059).
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Missing Authorization header" }, 401);
    }

    // Verify the caller's own session — this is the driver's JWT, not
    // an admin's; auth.uid() for a driver equals drivers.id directly
    // (see create-driver, which sets id: authUser.user.id on insert).
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return json({ error: "Unauthorized: invalid or expired session." }, 401);
    }
    const callerId = user.id;

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();
    // "attach" (default, the original behaviour), "status" (read the
    // shift's load + the org's reminder setting) or "deliver" (confirm
    // the attached load was delivered).
    const action = typeof body.action === "string" ? body.action : "attach";
    const shiftId = typeof body.shift_id === "string" ? body.shift_id.trim() : "";
    const loadReference = typeof body.load_reference === "string" ? body.load_reference.trim() : "";
    const carrierName = typeof body.carrier_name === "string" ? body.carrier_name.trim() : "";

    if (!["attach", "status", "deliver"].includes(action)) {
      return json({ error: `Unknown action "${action}".` }, 400);
    }
    if (!shiftId) {
      return json({ error: "shift_id is required." }, 400);
    }
    if (action === "attach" && !loadReference) {
      return json({ error: "A load reference is required." }, 400);
    }

    // Confirm this shift actually belongs to the calling driver — never
    // trust shift_id alone, or any driver could tag any shift.
    const { data: shift, error: shiftError } = await supabaseAdmin
      .from("shifts")
      .select("id, driver_id, organization_id")
      .eq("id", shiftId)
      .eq("driver_id", callerId)
      .maybeSingle();

    if (shiftError) {
      return json({ error: `Could not verify shift: ${shiftError.message}` }, 500);
    }
    if (!shift) {
      return json({ error: "That shift doesn't belong to you, or doesn't exist." }, 404);
    }

    // Every select below names its columns explicitly — never "*" —
    // so revenue_amount can't come back through this endpoint.
    if (action === "status") {
      const [{ data: load }, { data: org }] = await Promise.all([
        supabaseAdmin.from("shift_revenue").select("load_reference, carrier_name, delivered_at").eq("shift_id", shiftId).maybeSingle(),
        supabaseAdmin.from("organizations").select("load_reminder_minutes").eq("id", shift.organization_id).maybeSingle(),
      ]);
      return json({
        success: true,
        load_reference: load?.load_reference ?? null,
        carrier_name: load?.carrier_name ?? null,
        delivered_at: load?.delivered_at ?? null,
        reminder_minutes: org?.load_reminder_minutes ?? 30,
      });
    }

    if (action === "deliver") {
      const { data: delivered, error: deliverError } = await supabaseAdmin
        .from("shift_revenue")
        .update({ delivered_at: new Date().toISOString() })
        .eq("shift_id", shiftId)
        .not("load_reference", "is", null)
        .select("delivered_at")
        .maybeSingle();
      if (deliverError) {
        return json({ error: `Could not confirm delivery: ${deliverError.message}` }, 500);
      }
      if (!delivered) {
        return json({ error: "Attach a load before confirming delivery." }, 400);
      }
      return json({ success: true, delivered_at: delivered.delivered_at });
    }

    // Upsert ONLY load_reference/carrier_name (and reset delivered_at —
    // a newly attached load hasn't been delivered yet). organization_id
    // is filled by the table's own sync_shift_revenue_fields trigger;
    // revenue_amount is deliberately never referenced here, so an
    // existing admin-set figure (or lack of one) is left untouched.
    const { error: upsertError } = await supabaseAdmin
      .from("shift_revenue")
      .upsert(
        {
          shift_id: shiftId,
          load_reference: loadReference,
          delivered_at: null,
          ...(carrierName ? { carrier_name: carrierName } : {}),
        },
        { onConflict: "shift_id" }
      );

    if (upsertError) {
      return json({ error: `Could not attach the load: ${upsertError.message}` }, 500);
    }

    return json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("attach-load error:", message);
    return json({ error: `Internal server error: ${message}` }, 500);
  }
});
