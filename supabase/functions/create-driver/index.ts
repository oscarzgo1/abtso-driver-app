// ============================================================
// ABTSO Logistics — Edge Function: Create / Delete Driver
// ============================================================
// Requires a valid Supabase Auth JWT (any authenticated admin user).
// Uses Service Role Key for all DB writes — bypasses RLS entirely.
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // ── 1. Verify caller has a valid Supabase Auth session ───
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing Authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await userClient.auth.getUser();

    if (authError || !user || !user.email) {
      console.error("JWT verification failed:", authError?.message);
      return new Response(
        JSON.stringify({ error: "Unauthorized: invalid or expired session. Please log out and log back in." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const callerEmail = user.email.toLowerCase().trim();
    console.log("Authenticated caller:", callerEmail);

    // ── 2. Service-role client — bypasses all RLS ────────────
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ── 3. Parse request body ────────────────────────────────
    const body = await req.json();
    const { action, driver_id, full_name, phone, pin, id: targetId } = body;

    console.log("Action:", action ?? "create", "| Caller:", callerEmail);

    // ──────────────────────────────────────────────────────────
    // DELETE action
    // ──────────────────────────────────────────────────────────
    if (action === "delete") {
      if (!targetId) {
        return new Response(
          JSON.stringify({ error: "id is required to delete a driver" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Delete associated records first to avoid FK constraint errors
      await supabaseAdmin.from("idle_alerts").delete().eq("driver_id", targetId);
      await supabaseAdmin.from("gps_locations").delete().eq("driver_id", targetId);
      await supabaseAdmin.from("shifts").delete().eq("driver_id", targetId);
      await supabaseAdmin.from("employee_rates").delete().eq("driver_id", targetId);

      // Delete from public.drivers
      const { error: deleteError } = await supabaseAdmin
        .from("drivers")
        .delete()
        .eq("id", targetId);

      if (deleteError) {
        console.error("Delete error:", deleteError.message);
        return new Response(
          JSON.stringify({ error: `Delete failed: ${deleteError.message}` }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Attempt to delete Supabase Auth user (non-fatal if fails)
      const { error: authDelErr } = await supabaseAdmin.auth.admin.deleteUser(targetId);
      if (authDelErr) console.warn("Auth user delete (non-fatal):", authDelErr.message);

      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ──────────────────────────────────────────────────────────
    // UPDATE action
    // ──────────────────────────────────────────────────────────
    if (action === "update") {
      if (!targetId) {
        return new Response(
          JSON.stringify({ error: "id is required to update an employee profile" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const updatePayload: Record<string, any> = {};
      if (full_name) updatePayload.full_name = full_name.trim();
      if (driver_id) updatePayload.driver_id = driver_id.trim();
      if (phone !== undefined) updatePayload.phone = phone.trim();
      if (pin && pin.trim().length >= 4) updatePayload.pin_hash = pin.trim();

      const { data: updatedDriver, error: updateError } = await supabaseAdmin
        .from("drivers")
        .update(updatePayload)
        .eq("id", targetId)
        .select()
        .single();

      if (updateError) {
        console.error("Update error:", updateError.message);
        return new Response(
          JSON.stringify({ error: `Update failed: ${updateError.message}` }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // If PIN is provided or username changed, update Auth user credentials
      const authUpdates: Record<string, any> = {};
      if (pin && pin.trim().length >= 4) {
        authUpdates.password = pin.trim();
      }
      if (driver_id) {
        const cleanEmail = `${driver_id.trim().toLowerCase()}@driver.abtso`;
        authUpdates.email = cleanEmail;
      }

      if (Object.keys(authUpdates).length > 0) {
        const { error: authErr } = await supabaseAdmin.auth.admin.updateUserById(targetId, authUpdates);
        if (authErr) {
          console.warn("Auth user update (non-fatal):", authErr.message);
        }
      }

      return new Response(
        JSON.stringify({ success: true, driver: updatedDriver }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ──────────────────────────────────────────────────────────
    // CREATE action (default)
    // ──────────────────────────────────────────────────────────
    if (!driver_id || !full_name || !pin) {
      return new Response(
        JSON.stringify({ error: "driver_id, full_name, and pin are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (pin.trim().length < 4) {
      return new Response(
        JSON.stringify({ error: "PIN must be at least 4 digits" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const cleanDriverId = driver_id.trim().toUpperCase();

    // Pre-flight: Check for duplicate driver_id
    const { data: existing } = await supabaseAdmin
      .from("drivers")
      .select("driver_id")
      .eq("driver_id", cleanDriverId)
      .maybeSingle();

    if (existing) {
      return new Response(
        JSON.stringify({ error: `Driver ID ${cleanDriverId} already exists.` }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Synthetic email for Supabase Auth (internal use only)
    const authEmail = `${cleanDriverId.toLowerCase()}@driver.abtso`;

    // Create Supabase Auth user
    const { data: authUser, error: createAuthError } = await supabaseAdmin.auth.admin.createUser({
      email: authEmail,
      password: pin.trim(),
      email_confirm: true,
      user_metadata: {
        full_name: full_name.trim(),
        driver_id: cleanDriverId,
      },
    });

    if (createAuthError) {
      console.error("Auth user creation error:", createAuthError.message);
      return new Response(
        JSON.stringify({ error: `Auth creation failed: ${createAuthError.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Auth user created:", authUser.user.id);

    // Insert driver profile (PIN is stored as-is; DB trigger bcrypt-hashes it)
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("drivers")
      .insert({
        id: authUser.user.id,
        driver_id: cleanDriverId,
        pin_hash: pin.trim(),
        full_name: full_name.trim(),
        phone: phone ? phone.trim() : null,
        is_active: true,
      })
      .select()
      .single();

    if (profileError) {
      console.error("Profile insert error:", profileError.message);
      // Roll back auth user to avoid orphaned accounts
      await supabaseAdmin.auth.admin.deleteUser(authUser.user.id);
      return new Response(
        JSON.stringify({ error: `Profile creation failed: ${profileError.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Driver created successfully:", profile.driver_id);

    return new Response(
      JSON.stringify({ success: true, driver: profile }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Unhandled error:", message);
    return new Response(
      JSON.stringify({ error: `Internal server error: ${message}` }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
