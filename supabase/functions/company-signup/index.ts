// ============================================================
// Edge Function: Company Sign-Up
// ============================================================
// Fully self-service tenant onboarding: registers a brand-new
// organization plus its first payroll_admin account in one step.
//
// Also generates that org's initial logistics/payroll department
// registration codes (used by admin-signup) and returns them —
// along with the org's slug, which doubles as its driver company
// code — in plaintext exactly once. They are stored hashed from
// this point on (see hash_secret() / verify_org_signup_code() in
// migration 033), so this response is the only time they're ever
// visible again short of rotating them from the dashboard.
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const MIN_PASSWORD_LENGTH = 8;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "company";
}

function randomCode(): string {
  // 10 chars, unambiguous alphabet (no 0/O/1/I/L).
  const alphabet = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));

    const companyName = String(body.companyName ?? "").trim();
    const email = String(body.email ?? "").toLowerCase().trim();
    const password = String(body.password ?? "");

    // Depot is optional at signup — a company can always add one later
    // from Team & Access — so only attempt it when all three required
    // fields are present and valid.
    const rawDepot = body.depot && typeof body.depot === "object" ? body.depot : null;
    const depotName = rawDepot ? String(rawDepot.name ?? "").trim() : "";
    const depotLat = rawDepot ? Number(rawDepot.latitude) : NaN;
    const depotLng = rawDepot ? Number(rawDepot.longitude) : NaN;
    const depotAddress = rawDepot ? String(rawDepot.address ?? "").trim() : "";
    const depotRadius = rawDepot ? Number(rawDepot.geofenceRadiusM) : NaN;
    const hasValidDepot = Boolean(
      depotName &&
        Number.isFinite(depotLat) && depotLat >= -90 && depotLat <= 90 &&
        Number.isFinite(depotLng) && depotLng >= -180 && depotLng <= 180,
    );

    if (companyName.length < 2) {
      return json({ error: "Enter your company name." }, 400);
    }
    if (!email.includes("@") || email.length < 5) {
      return json({ error: "Enter a valid email address." }, 400);
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      return json(
        { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` },
        400,
      );
    }

    const projectUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!projectUrl || !serviceKey) {
      console.error("Missing platform env for company-signup");
      return json({ error: "Server is missing its Supabase credentials." }, 500);
    }
    const supabaseAdmin = createClient(projectUrl, serviceKey);

    // ── 1. Resolve a free slug ──────────────────────────────
    const baseSlug = slugify(companyName);
    let slug = baseSlug;
    for (let attempt = 0; attempt < 20; attempt++) {
      const { data: existing } = await supabaseAdmin
        .from("organizations")
        .select("id")
        .eq("slug", slug)
        .maybeSingle();
      if (!existing) break;
      slug = `${baseSlug}-${Math.floor(1000 + Math.random() * 9000)}`;
    }

    // ── 2. Generate + hash the department codes ─────────────
    const logisticsCode = randomCode();
    const payrollCode = randomCode();

    const { data: logisticsHash, error: hashErr1 } = await supabaseAdmin.rpc(
      "hash_secret",
      { p_plain: logisticsCode },
    );
    const { data: payrollHash, error: hashErr2 } = await supabaseAdmin.rpc(
      "hash_secret",
      { p_plain: payrollCode },
    );
    if (hashErr1 || hashErr2 || !logisticsHash || !payrollHash) {
      console.error("Code hashing failed:", hashErr1?.message, hashErr2?.message);
      return json({ error: "Could not generate registration codes." }, 500);
    }

    // ── 3. Create the organization ───────────────────────────
    // trial_ends_at starts the 180-day free testing window (see
    // migration 037): sweep_trial_expirations() blocks portal access
    // once this passes, then purges the org's data 30 days after that.
    const trialEndsAt = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString();

    const { data: org, error: orgError } = await supabaseAdmin
      .from("organizations")
      .insert({
        name: companyName,
        slug,
        plan: "free",
        trial_ends_at: trialEndsAt,
        signup_code_logistics_hash: logisticsHash,
        signup_code_payroll_hash: payrollHash,
      })
      .select("id, slug")
      .single();

    if (orgError || !org) {
      console.error("Organization creation failed:", orgError?.message);
      return json({ error: `Could not create the company: ${orgError?.message}` }, 400);
    }

    // ── 4. Create the first admin account ────────────────────
    const { data: created, error: createError } = await supabaseAdmin.auth.admin
      .createUser({ email, password, email_confirm: true });

    if (createError || !created?.user) {
      await supabaseAdmin.from("organizations").delete().eq("id", org.id);
      const detail = createError?.message ?? "unknown error";
      if (/already|exists|registered/i.test(detail)) {
        return json({ error: `An account already exists for ${email}.` }, 409);
      }
      return json({ error: `Could not create the account: ${detail}` }, 400);
    }

    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .upsert(
        { email, role: "payroll_admin", organization_id: org.id },
        { onConflict: "email" },
      );

    if (roleError) {
      await supabaseAdmin.auth.admin.deleteUser(created.user.id);
      await supabaseAdmin.from("organizations").delete().eq("id", org.id);
      console.error("Department assignment failed:", roleError.message);
      return json({ error: `Company setup failed: ${roleError.message}` }, 400);
    }

    // ── 5. Create the first depot, if one was supplied ────────
    // Non-critical: depots have no auto-org-id trigger the way
    // shifts/gps do, so it's set explicitly here. A failure here
    // doesn't roll back the company — they can add a depot from
    // Team & Access instead.
    let depotCreated = false;
    if (hasValidDepot) {
      const { error: depotError } = await supabaseAdmin.from("depots").insert({
        organization_id: org.id,
        name: depotName,
        address: depotAddress || null,
        latitude: depotLat,
        longitude: depotLng,
        geofence_radius_m: Number.isFinite(depotRadius) && depotRadius > 0 ? depotRadius : 150,
      });
      if (depotError) {
        console.error("Initial depot creation failed:", depotError.message);
      } else {
        depotCreated = true;
      }
    }

    console.log(`Company registered: ${companyName} (${org.slug}) by ${email}`);
    return json({
      success: true,
      companySlug: org.slug,
      logisticsCode,
      payrollCode,
      depotCreated,
    });
  } catch (err) {
    console.error("company-signup error:", err);
    return json({ error: (err as Error).message ?? "Unexpected error" }, 500);
  }
});
