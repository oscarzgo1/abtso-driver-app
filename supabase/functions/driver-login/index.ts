// ============================================================
// ABTSO Logistics — Edge Function: Driver Login
// ============================================================
// Authenticates drivers with Driver ID + PIN.
// Uses a PostgreSQL RPC (verify_driver_pin) backed by pgcrypto
// to verify the PIN in-database — no bcrypt in JS needed.
// Returns a signed JWT compatible with Supabase RLS.
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { create } from "https://deno.land/x/djwt@v3.0.2/mod.ts";

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
    const { driver_id, pin } = await req.json();

    if (!driver_id || !pin) {
      return new Response(
        JSON.stringify({ error: "Driver ID and PIN are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Login attempt for driver:", driver_id);

    // Service-role client — bypasses RLS for secure PIN verification
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ── Verify PIN via pgcrypto in-database (no JS bcrypt needed) ──
    // The `verify_driver_pin` SQL function compares:
    //   crypt(p_pin, stored_hash) = stored_hash
    // This is compatible with both pgcrypto $2a$ and JS bcryptjs $2b$ hashes.
    const { data: drivers, error: rpcError } = await supabase
      .rpc("verify_driver_pin", {
        p_driver_id: driver_id.toUpperCase(),
        p_pin: pin,
      });

    if (rpcError) {
      console.error("RPC verify_driver_pin error:", rpcError.message);
      return new Response(
        JSON.stringify({ error: "Authentication error. Please try again." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const driver = drivers?.[0] ?? null;

    if (!driver) {
      console.warn("Invalid credentials for driver:", driver_id);
      return new Response(
        JSON.stringify({ error: "Invalid Driver ID or PIN" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!driver.is_active) {
      return new Response(
        JSON.stringify({ error: "Account deactivated. Contact your supervisor." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("PIN verified for driver:", driver.driver_id);

    // ── Generate JWT signed with project JWT secret ──────────
    const jwtSecret = Deno.env.get("JWT_SECRET")!;
    const encoder = new TextEncoder();
    const keyData = encoder.encode(jwtSecret);
    const key = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const now = Math.floor(Date.now() / 1000);
    const expiresIn = 12 * 60 * 60; // 12 hours

    const token = await create(
      { alg: "HS256", typ: "JWT" },
      {
        sub: driver.id,
        role: "authenticated",
        driver_id: driver.driver_id,
        full_name: driver.full_name,
        iss: "supabase",
        iat: now,
        exp: now + expiresIn,
        aud: "authenticated",
      },
      key
    );

    return new Response(
      JSON.stringify({
        token,
        driver: {
          id: driver.id,
          driver_id: driver.driver_id,
          name: driver.full_name,
        },
        expires_at: new Date((now + expiresIn) * 1000).toISOString(),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Login function error:", message);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
