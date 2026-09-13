// ============================================================
// Edge Function: Department Sign-Up
// ============================================================
// Self-service registration for a company's two dashboard
// departments, with no mailbox required anywhere.
//
// SECURITY MODEL
// The department is NOT taken on trust from the request. The
// caller must present the registration code for the department
// they are joining *within their company*, and that code is
// verified server-side against the hash stored on that company's
// organizations row (see verify_org_signup_code() in migration
// 033) — never a value the client supplies. A logistics starter
// holding the logistics code therefore cannot create a payroll
// admin, and a code from one company cannot be used to join
// another.
//
// The function FAILS CLOSED: an unknown company code, or a
// company with no code set for that department yet, is refused.
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

const VALID_ROLES = ["logistics", "payroll_admin"];

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));

    const email = String(body.email ?? "").toLowerCase().trim();
    const password = String(body.password ?? "");
    const role = String(body.role ?? "");
    const code = String(body.code ?? "").trim();
    const companyCode = String(body.companyCode ?? "").toLowerCase().trim();

    // ── 1. Shape validation ─────────────────────────────────
    if (!email.includes("@") || email.length < 5) {
      return json({ error: "Enter a valid email address." }, 400);
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      return json(
        { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` },
        400,
      );
    }
    if (!VALID_ROLES.includes(role)) {
      return json({ error: "Choose a valid department." }, 400);
    }
    if (!companyCode) {
      return json({ error: "Enter your company code." }, 400);
    }
    if (!code) {
      return json({ error: "A department registration code is required." }, 400);
    }

    // ── 2. Service-role client ──────────────────────────────
    const projectUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!projectUrl || !serviceKey) {
      console.error(
        `Missing platform env: SUPABASE_URL=${!!projectUrl}, SUPABASE_SERVICE_ROLE_KEY=${!!serviceKey}`,
      );
      return json({ error: "Server is missing its Supabase credentials." }, 500);
    }

    const supabaseAdmin = createClient(projectUrl, serviceKey);

    // ── 3. Verify the company + department code together
    //      (fails closed) ───────────────────────────────────
    const { data: organizationId, error: verifyError } = await supabaseAdmin.rpc(
      "verify_org_signup_code",
      { p_slug: companyCode, p_role: role, p_code: code },
    );

    if (verifyError) {
      console.error("verify_org_signup_code error:", verifyError.message);
      return json({ error: "Could not verify the registration code." }, 500);
    }
    if (!organizationId) {
      // Deliberately vague: do not reveal whether the company code or the
      // department code was the one that didn't match.
      return json(
        { error: "That company or registration code is not valid." },
        403,
      );
    }

    // ── 4. Create the confirmed account ─────────────────────
    // email_confirm skips the confirmation mail: the address is an
    // identifier here, not a delivery channel.
    //
    // Duplicates are caught by createUser itself — no listUsers pre-scan,
    // which needed a full paged walk of every user just to answer one question.
    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (createError || !created?.user) {
      const detail = createError?.message ?? "unknown error";
      console.error("createUser failed:", detail);

      if (/already|exists|registered/i.test(detail)) {
        return json({ error: `An account already exists for ${email}.` }, 409);
      }

      // Reached only after a valid department code was presented, so echoing
      // the underlying reason here does not widen exposure — and without it
      // the caller cannot tell a config fault from a bad request.
      return json({ error: `Could not create the account: ${detail}` }, 400);
    }

    // ── 6. Assign the department + company the code proved ──
    // Keyed by email: the deployed user_roles table has no user_id column.
    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .upsert({ email, role, organization_id: organizationId }, { onConflict: "email" });

    if (roleError) {
      // Never leave an account behind without a department.
      await supabaseAdmin.auth.admin.deleteUser(created.user.id);
      console.error("Department assignment failed:", roleError.message);
      return json({ error: `Department assignment failed: ${roleError.message}` }, 400);
    }

    console.log(`Sign-up complete: ${email} joined ${role} at org ${organizationId}`);
    return json({ success: true, email, role });
  } catch (err) {
    console.error("admin-signup error:", err);
    return json({ error: (err as Error).message ?? "Unexpected error" }, 500);
  }
});
