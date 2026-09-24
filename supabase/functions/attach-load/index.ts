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
    const shiftId = typeof body.shift_id === "string" ? body.shift_id.trim() : "";
    const loadReference = typeof body.load_reference === "string" ? body.load_reference.trim() : "";
    const carrierName = typeof body.carrier_name === "string" ? body.carrier_name.trim() : "";

    if (!shiftId) {
      return json({ error: "shift_id is required." }, 400);
    }
    if (!loadReference) {
      return json({ error: "A load reference is required." }, 400);
    }

    // Confirm this shift actually belongs to the calling driver — never
    // trust shift_id alone, or any driver could tag any shift.
    const { data: shift, error: shiftError } = await supabaseAdmin
      .from("shifts")
      .select("id, driver_id")
      .eq("id", shiftId)
      .eq("driver_id", callerId)
      .maybeSingle();

    if (shiftError) {
      return json({ error: `Could not verify shift: ${shiftError.message}` }, 500);
    }
    if (!shift) {
      return json({ error: "That shift doesn't belong to you, or doesn't exist." }, 404);
    }

    // Upsert ONLY load_reference/carrier_name. organization_id is
    // filled by the table's own sync_shift_revenue_fields trigger;
    // revenue_amount is deliberately never referenced here, so an
    // existing admin-set figure (or lack of one) is left untouched.
    const { error: upsertError } = await supabaseAdmin
      .from("shift_revenue")
      .upsert(
        {
          shift_id: shiftId,
          load_reference: loadReference,
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
