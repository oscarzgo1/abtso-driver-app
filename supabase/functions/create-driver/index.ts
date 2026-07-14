// ============================================================
// ABTSO Logistics — Edge Function: Create / Delete Driver
// ============================================================
// Admin-only endpoint. Verifies the caller's email against an
// allowlist, then creates or deletes a driver account.
//
// PIN hashing is handled by the PostgreSQL trigger
// `trigger_hash_driver_pin` on the public.drivers table —
// no bcrypt is needed in this function.
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
    // ── 1. Verify Authorization header ──────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing Authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── 2. Verify token & get caller email ──────────────────
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await userClient.auth.getUser();

    if (authError || !user || !user.email) {
      console.error("Token verification failed:", authError?.message);
      return new Response(
        JSON.stringify({ error: "Unauthorized: invalid or expired token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const callerEmail = user.email.toLowerCase().trim();
    console.log("Verified caller email:", callerEmail);

    // ── 3. Check admin allowlist ─────────────────────────────
    const ALLOWED_ADMINS = ["malo@co.uk"];

    if (!ALLOWED_ADMINS.includes(callerEmail)) {
      console.error("Forbidden attempt from:", callerEmail);
      return new Response(
        JSON.stringify({ error: "Forbidden: admin access only" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── 4. Service-role client for DB writes ─────────────────
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ── 5. Parse request body ─────────────────────────────────
    const body = await req.json();
    const { action, driver_id, full_name, phone, pin, hourly_rate, rate_profile, id: driverIdToDelete } = body;

    console.log("Action:", action ?? "create");

    // ── Diagnostic: List all auth users ───────────────────────
    try {
      const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers();
      if (listError) {
        console.error("Diagnostic list users error:", listError.message);
      } else {
        console.log("Registered Auth Users (Count: " + users.length + "):");
        users.forEach((u) => {
          console.log(`- ID: ${u.id}, Email: ${u.email}, Metadata: ${JSON.stringify(u.user_metadata)}`);
        });
      }
    } catch (err) {
      console.error("Diagnostic error:", err);
    }

    // ── 6a. DELETE action ─────────────────────────────────────
    if (action === "delete") {
      if (!driverIdToDelete) {
        return new Response(
          JSON.stringify({ error: "id is required to delete a driver" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // 1. Delete associated idle_alerts
      const { error: deleteAlertsError } = await supabaseAdmin
        .from("idle_alerts")
        .delete()
        .eq("driver_id", driverIdToDelete);
      if (deleteAlertsError) console.warn("Delete alerts warning:", deleteAlertsError.message);

      // 2. Delete associated gps_locations
      const { error: deleteGpsError } = await supabaseAdmin
        .from("gps_locations")
        .delete()
        .eq("driver_id", driverIdToDelete);
      if (deleteGpsError) console.warn("Delete GPS warning:", deleteGpsError.message);

      // 3. Delete associated shifts
      const { error: deleteShiftsError } = await supabaseAdmin
        .from("shifts")
        .delete()
        .eq("driver_id", driverIdToDelete);
      if (deleteShiftsError) console.warn("Delete shifts warning:", deleteShiftsError.message);

      // 4. Delete profile from public.drivers
      const { error: deleteProfileError } = await supabaseAdmin
        .from("drivers")
        .delete()
        .eq("id", driverIdToDelete);

      if (deleteProfileError) {
        console.error("Delete profile error:", deleteProfileError.message);
        return new Response(
          JSON.stringify({ error: `Delete profile failed: ${deleteProfileError.message}` }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // 5. Delete Supabase Auth user
      const { error: deleteAuthError } = await supabaseAdmin.auth.admin.deleteUser(driverIdToDelete);
      if (deleteAuthError) {
        console.log("Auth user delete warning:", deleteAuthError.message);
      }

      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── 6b. CREATE action ──────────────────────────────────────
    if (!driver_id || !full_name || !pin) {
      return new Response(
        JSON.stringify({ error: "driver_id, full_name, and pin are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (pin.trim().length < 6) {
      return new Response(
        JSON.stringify({ error: "PIN must be at least 6 digits" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const cleanDriverId = driver_id.trim().toUpperCase();

    // ── Pre-flight: Check for duplicate driver_id ─────────────
    const { data: existing } = await supabaseAdmin
      .from("drivers")
      .select("driver_id")
      .eq("driver_id", cleanDriverId)
      .maybeSingle();

    if (existing) {
      console.warn("Duplicate driver_id attempt:", cleanDriverId);
      return new Response(
        JSON.stringify({ error: `Driver ID ${cleanDriverId} already exists. Please use a different ID.` }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Synthetic email for Supabase Auth (internal use only)
    const authEmail = `${cleanDriverId.toLowerCase()}@driver.abtso`;

    // ── Create Supabase Auth user ─────────────────────────────
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

    // ── Insert driver profile ─────────────────────────────────
    // Pass plain PIN as pin_hash — the PostgreSQL trigger
    // `trigger_hash_driver_pin` bcrypt-hashes it automatically on INSERT.
    const { data: profile, error: createProfileError } = await supabaseAdmin
      .from("drivers")
      .insert({
        id: authUser.user.id,
        driver_id: cleanDriverId,
        pin_hash: pin.trim(),
        full_name: full_name.trim(),
        phone: phone ? phone.trim() : null,
        hourly_rate: hourly_rate ? parseFloat(hourly_rate) : null,
        rate_profile: rate_profile ? rate_profile.trim() : 'LWR',
        is_active: true,
      })
      .select()
      .single();

    if (createProfileError) {
      console.error("Profile insert error:", createProfileError.message);
      // Roll back auth user to avoid orphan accounts
      await supabaseAdmin.auth.admin.deleteUser(authUser.user.id);
      return new Response(
        JSON.stringify({ error: `Profile creation failed: ${createProfileError.message}` }),
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
    console.error("Unhandled function error:", message);
    return new Response(
      JSON.stringify({ error: `Internal server error: ${message}` }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
