// ============================================================
// Edge Function: Create / Update / Delete Driver
// ============================================================
// Requires a valid Supabase Auth JWT (any authenticated admin user).
// Uses Service Role Key for all DB writes — bypasses RLS entirely.
//
// Drivers are scoped to the caller's own organization: driver_id is
// only unique *within* a company (see migration 033), and each
// driver's synthetic Supabase Auth email is built from their
// company's slug (`<driverId>@<orgSlug>.driver.internal`) so two
// companies can each have their own "DRV-001" without colliding.
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

    // ── 2b. Resolve the caller's own company ─────────────────
    const { data: callerRole } = await supabaseAdmin
      .from("user_roles")
      .select("organization_id")
      .eq("email", callerEmail)
      .limit(1)
      .maybeSingle();

    const callerOrgId = callerRole?.organization_id;
    if (!callerOrgId) {
      return new Response(
        JSON.stringify({ error: "Your account is not assigned to a company." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: callerOrg } = await supabaseAdmin
      .from("organizations")
      .select("slug")
      .eq("id", callerOrgId)
      .single();

    const orgSlug = callerOrg?.slug;
    if (!orgSlug) {
      return new Response(
        JSON.stringify({ error: "Could not resolve your company." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── 3. Parse request body ────────────────────────────────
    const body = await req.json();
    const { action, driver_id, phone, id: targetId } = body;
    // "john o'brien-smith" -> "John O'Brien-Smith" — normalised here too,
    // not just client-side, so a name is always stored capitalised
    // regardless of caller (admin panel form validation can't be trusted
    // as the only guard on data actually written to the DB).
    const full_name: string | undefined = typeof body.full_name === "string"
      ? body.full_name.trim().replace(/\s+/g, " ").toLowerCase().replace(/(^|[\s\-'])([a-z])/g, (_m: string, sep: string, ch: string) => sep + ch.toUpperCase())
      : body.full_name;
    // Admins no longer choose a PIN (migration 065). If an old admin
    // panel still sends `pin`, we ignore it and issue an activation
    // code instead.

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

      // Delete from public.drivers — scoped to the caller's own company so
      // an id from another organization can't be targeted.
      const { error: deleteError, count: deleteCount } = await supabaseAdmin
        .from("drivers")
        .delete({ count: "exact" })
        .eq("id", targetId)
        .eq("organization_id", callerOrgId);

      if (!deleteError && deleteCount === 0) {
        return new Response(
          JSON.stringify({ error: "Driver not found in your company." }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

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

      const { data: updatedDriver, error: updateError } = await supabaseAdmin
        .from("drivers")
        .update(updatePayload)
        .eq("id", targetId)
        .eq("organization_id", callerOrgId)
        .select()
        .single();

      if (updateError) {
        console.error("Update error:", updateError.message);
        return new Response(
          JSON.stringify({ error: `Update failed: ${updateError.message}` }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Only the driver_id can change here — PIN resets go through
      // `reset_pin` which issues a new activation code.
      const authUpdates: Record<string, any> = {};
      if (driver_id) {
        const cleanEmail = `${driver_id.trim().toLowerCase()}@${orgSlug}.driver.internal`;
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
    // RESET PIN action — cancel any old code, issue a fresh one.
    // ──────────────────────────────────────────────────────────
    if (action === "reset_pin") {
      if (!targetId) {
        return new Response(
          JSON.stringify({ error: "id is required to reset a driver's PIN" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const { data: driver } = await supabaseAdmin
        .from("drivers").select("id, organization_id, driver_id")
        .eq("id", targetId).eq("organization_id", callerOrgId).maybeSingle();
      if (!driver) {
        return new Response(
          JSON.stringify({ error: "Driver not found in your company." }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      // Call as the authenticated admin so is_org_admin() passes.
      const { data: code, error: codeErr } = await userClient.rpc("issue_driver_activation_code", { p_driver_id: targetId, p_reason: "reset_admin" });
      if (codeErr) {
        return new Response(
          JSON.stringify({ error: `Could not issue an activation code: ${codeErr.message}` }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({ success: true, activation_code: code, driver_id: driver.driver_id }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ──────────────────────────────────────────────────────────
    // CREATE action (default) — no PIN. An activation code is issued
    // and shown once so the driver can set their own PIN.
    // ──────────────────────────────────────────────────────────
    if (!driver_id || !full_name) {
      return new Response(
        JSON.stringify({ error: "driver_id and full_name are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const cleanDriverId = driver_id.trim().toUpperCase();

    // Pre-flight: Check for duplicate driver_id — scoped to the caller's own
    // company, since driver_id is only unique per organization (migration 033).
    const { data: existing } = await supabaseAdmin
      .from("drivers")
      .select("driver_id")
      .eq("driver_id", cleanDriverId)
      .eq("organization_id", callerOrgId)
      .maybeSingle();

    if (existing) {
      return new Response(
        JSON.stringify({ error: `Driver ID ${cleanDriverId} already exists in your company.` }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Synthetic email for Supabase Auth (internal use only) — namespaced by
    // company slug so two companies can each have their own "DRV-001". The
    // auth account exists so the pin_hash column can be tied to it, but its
    // password is a throwaway — the driver's real 6-digit PIN is set through
    // driver-activate with the activation code below.
    const authEmail = `${cleanDriverId.toLowerCase()}@${orgSlug}.driver.internal`;
    const throwaway = crypto.randomUUID();
    const { data: authUser, error: createAuthError } = await supabaseAdmin.auth.admin.createUser({
      email: authEmail,
      password: throwaway,
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

    // pin_hash stays a placeholder until the driver activates. pin_status
    // is 'pending' by default (migration 065).
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("drivers")
      .insert({
        id: authUser.user.id,
        organization_id: callerOrgId,
        driver_id: cleanDriverId,
        pin_hash: '',
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
      // Plan employee limit (migration 067) — pass its message through as-is.
      if (profileError.message.includes("Your plan allows")) {
        return new Response(
          JSON.stringify({ error: profileError.message }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({ error: `Profile creation failed: ${profileError.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Issue the driver's first activation code so the admin can pass it on.
    const { data: activationCode, error: codeErr } = await userClient
      .rpc("issue_driver_activation_code", { p_driver_id: authUser.user.id, p_reason: "created" });
    if (codeErr) {
      console.error("Activation code error:", codeErr.message);
      // Not fatal — the admin can request another from the panel — but
      // report it so they know why the modal shows no code.
      return new Response(
        JSON.stringify({ success: true, driver: profile, activation_code_error: codeErr.message }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Driver created successfully:", profile.driver_id);

    return new Response(
      JSON.stringify({ success: true, driver: profile, activation_code: activationCode }),
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
