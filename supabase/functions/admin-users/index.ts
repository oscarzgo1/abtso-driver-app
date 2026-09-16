// ============================================================
// Edge Function: Admin User Management
// ============================================================
// Lets a company's Payroll Admin provision dashboard accounts,
// reset their passwords, and rotate department signup codes —
// all scoped to the caller's own organization. Nothing here ever
// reads or writes another company's rows.
//
// Accounts are created with email_confirm: true, so the address
// is only ever an identifier — no confirmation mail is sent.
//
// Every action requires the caller to be a payroll_admin. The
// department and organization are read from public.user_roles,
// never from the request body, so a logistics user cannot
// escalate and a caller cannot act on another company's data.
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const VALID_ROLES = ["logistics", "payroll_admin"];
const MIN_PASSWORD_LENGTH = 8;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/// Looks up an auth user by email address across paged results.
async function findAuthUserByEmail(admin: any, email: string) {
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);

    const match = data.users.find(
      (u: any) => (u.email ?? "").toLowerCase().trim() === email,
    );
    if (match) return match;

    if (data.users.length < 200) break;
  }
  return null;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // ── 1. Verify caller has a valid Supabase Auth session ───
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Missing Authorization header" }, 401);
    }

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user }, error: authError } = await userClient.auth.getUser();

    if (authError || !user || !user.email) {
      return json(
        { error: "Unauthorized: invalid or expired session. Please log out and log back in." },
        401,
      );
    }

    const callerEmail = user.email.toLowerCase().trim();

    // ── 2. Service-role client — bypasses all RLS ────────────
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ── 3. Caller must belong to the org, as either role ──────
    // Matched on email — the deployed user_roles table is keyed by email
    // and has no user_id column. Most of this function stays restricted to
    // payroll_admin below; logistics is only let through for the narrow
    // set of actions in LOGISTICS_ALLOWED_ACTIONS.
    const { data: callerRoles } = await supabaseAdmin
      .from("user_roles")
      .select("role, organization_id")
      .eq("email", callerEmail)
      .limit(1);

    const callerRole = callerRoles?.[0]?.role;
    if (callerRole !== "payroll_admin" && callerRole !== "logistics") {
      console.warn("Forbidden admin-users call by:", callerEmail);
      return json({ error: "Forbidden." }, 403);
    }

    const callerOrgId = callerRoles![0].organization_id;

    const body = await req.json().catch(() => ({}));
    const action = body.action ?? "list";

    // Both roles can own the driver-support phone numbers — dispatch is
    // usually a logistics concern day-to-day — so those two actions are
    // let through for logistics too. Everything else here (staff accounts,
    // registration codes, alert thresholds) stays payroll-admin-only.
    const LOGISTICS_ALLOWED_ACTIONS = new Set(["get-org-info", "update-support-contacts"]);
    if (callerRole !== "payroll_admin" && !LOGISTICS_ALLOWED_ACTIONS.has(action)) {
      console.warn(`Forbidden admin-users action "${action}" by:`, callerEmail);
      return json(
        { error: "Forbidden: only Payroll Admins can manage dashboard accounts." },
        403,
      );
    }

    // ── LIST ─────────────────────────────────────────────────
    if (action === "list") {
      const { data: roles, error: rolesError } = await supabaseAdmin
        .from("user_roles")
        .select("id, email, role, created_at")
        .eq("organization_id", callerOrgId)
        .order("created_at", { ascending: true });

      if (rolesError) return json({ error: rolesError.message }, 400);

      // Enrich with sign-in activity so an unused account is visible.
      const { data: authList } = await supabaseAdmin.auth.admin.listUsers({
        page: 1,
        perPage: 200,
      });

      const byEmail = new Map<string, any>();
      for (const u of authList?.users ?? []) {
        if (u.email) byEmail.set(u.email.toLowerCase().trim(), u);
      }

      const users = (roles ?? []).map((r: any) => {
        const authUser = byEmail.get((r.email ?? "").toLowerCase().trim());
        return {
          ...r,
          has_login: !!authUser,
          last_sign_in_at: authUser?.last_sign_in_at ?? null,
          must_change_password: !!authUser?.user_metadata?.must_change_password,
        };
      });

      const { data: org } = await supabaseAdmin
        .from("organizations")
        .select("name, slug, plan, support_phone_1, support_phone_2")
        .eq("id", callerOrgId)
        .single();

      return json({ users, organization: org ? { ...org, id: callerOrgId } : null });
    }

    // ── CREATE ───────────────────────────────────────────────
    if (action === "create") {
      const email = String(body.email ?? "").toLowerCase().trim();
      const password = String(body.password ?? "");
      const role = String(body.role ?? "");

      if (!email || !email.includes("@")) {
        return json({ error: "A valid email address is required." }, 400);
      }
      if (password.length < MIN_PASSWORD_LENGTH) {
        return json(
          { error: `Temporary password must be at least ${MIN_PASSWORD_LENGTH} characters.` },
          400,
        );
      }
      if (!VALID_ROLES.includes(role)) {
        return json({ error: "Department must be logistics or payroll_admin." }, 400);
      }

      const existing = await findAuthUserByEmail(supabaseAdmin, email);
      if (existing) {
        return json({ error: `An account already exists for ${email}.` }, 409);
      }

      // email_confirm skips the confirmation mail entirely — the address
      // is an identifier here, not a delivery channel.
      const { data: created, error: createError } = await supabaseAdmin.auth.admin
        .createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { must_change_password: true },
        });

      if (createError || !created?.user) {
        return json({ error: createError?.message ?? "Could not create the account." }, 400);
      }

      const { error: roleError } = await supabaseAdmin
        .from("user_roles")
        .upsert({ email, role, organization_id: callerOrgId }, { onConflict: "email" });

      if (roleError) {
        // Don't leave an auth user stranded with no department.
        await supabaseAdmin.auth.admin.deleteUser(created.user.id);
        return json({ error: `Department assignment failed: ${roleError.message}` }, 400);
      }

      console.log(`Admin account created: ${email} (${role}) by ${callerEmail}`);
      return json({ success: true, email, role });
    }

    // ── ROTATE SIGNUP CODE ────────────────────────────────────
    // Regenerates a company's logistics or payroll department
    // registration code. The new plaintext code is returned exactly
    // once — only its hash is kept from this point on (see
    // hash_secret() in migration 033), matching how the original
    // codes were generated at company sign-up.
    if (action === "rotate-code") {
      const codeType = String(body.codeType ?? "");
      if (codeType !== "logistics" && codeType !== "payroll") {
        return json({ error: "codeType must be 'logistics' or 'payroll'." }, 400);
      }

      const alphabet = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
      const bytes = crypto.getRandomValues(new Uint8Array(10));
      const newCode = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");

      const { data: newHash, error: hashError } = await supabaseAdmin.rpc(
        "hash_secret",
        { p_plain: newCode },
      );
      if (hashError || !newHash) {
        return json({ error: "Could not generate a new code." }, 500);
      }

      const column = codeType === "logistics"
        ? "signup_code_logistics_hash"
        : "signup_code_payroll_hash";

      const { error: updateError } = await supabaseAdmin
        .from("organizations")
        .update({ [column]: newHash })
        .eq("id", callerOrgId);

      if (updateError) {
        return json({ error: `Could not rotate the code: ${updateError.message}` }, 400);
      }

      console.log(`${codeType} signup code rotated for org ${callerOrgId} by ${callerEmail}`);
      return json({ success: true, codeType, code: newCode });
    }

    // ── GET ORG INFO ─────────────────────────────────────────
    // A lighter read than "list" — just this org's own name/slug/plan/
    // support numbers, no staff roster. Available to logistics as well as
    // payroll admins (see LOGISTICS_ALLOWED_ACTIONS above), since either
    // role can own the driver-support phone numbers.
    if (action === "get-org-info") {
      const { data: org, error: orgError } = await supabaseAdmin
        .from("organizations")
        .select("name, slug, plan, support_phone_1, support_phone_2")
        .eq("id", callerOrgId)
        .single();

      if (orgError) return json({ error: orgError.message }, 400);

      return json({ organization: { ...org, id: callerOrgId } });
    }

    // ── UPDATE SUPPORT CONTACTS ────────────────────────────────
    // The phone number(s) the driver app shows under Settings → Support,
    // scoped to the caller's own organization (see migration 039). Either
    // field can be cleared by sending an empty string; the driver app only
    // renders a row for whichever one(s) are actually set.
    if (action === "update-support-contacts") {
      const phone1 = typeof body.supportPhone1 === "string" ? body.supportPhone1.trim() : "";
      const phone2 = typeof body.supportPhone2 === "string" ? body.supportPhone2.trim() : "";

      const { error: updateError } = await supabaseAdmin
        .from("organizations")
        .update({
          support_phone_1: phone1 || null,
          support_phone_2: phone2 || null,
        })
        .eq("id", callerOrgId);

      if (updateError) {
        return json({ error: `Could not save support contacts: ${updateError.message}` }, 400);
      }

      console.log(`Support contacts updated for org ${callerOrgId} by ${callerEmail}`);
      return json({ success: true, supportPhone1: phone1 || null, supportPhone2: phone2 || null });
    }

    // ── RESET PASSWORD ───────────────────────────────────────
    if (action === "reset-password") {
      const email = String(body.email ?? "").toLowerCase().trim();
      const password = String(body.password ?? "");

      if (!email) return json({ error: "email is required." }, 400);
      if (password.length < MIN_PASSWORD_LENGTH) {
        return json(
          { error: `Temporary password must be at least ${MIN_PASSWORD_LENGTH} characters.` },
          400,
        );
      }

      const target = await findAuthUserByEmail(supabaseAdmin, email);
      if (!target) {
        return json({ error: `No account found for ${email}.` }, 404);
      }

      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
        target.id,
        { password, user_metadata: { ...target.user_metadata, must_change_password: true } },
      );

      if (updateError) return json({ error: updateError.message }, 400);

      console.log(`Password reset for ${email} by ${callerEmail}`);
      return json({ success: true, email });
    }

    // ── UPDATE ALERT SETTINGS ─────────────────────────────────
    // Per-organization flag/idle/night-out/MOT thresholds (migrations
    // 038, 040) — replaces the values that used to be hardcoded
    // identically for every company on the platform.
    if (action === "update-alert-settings") {
      const longShiftFlagHours = Number(body.longShiftFlagHours);
      const idleAlertMinutes = Number(body.idleAlertMinutes);
      const nightOutMinGapHours = Number(body.nightOutMinGapHours);
      const nightOutMaxGapHours = Number(body.nightOutMaxGapHours);
      const complianceAlertLeadDays = Number(body.complianceAlertLeadDays);

      if (!Number.isFinite(longShiftFlagHours) || longShiftFlagHours <= 0) {
        return json({ error: "Long-shift flag threshold must be a positive number of hours." }, 400);
      }
      if (!Number.isInteger(idleAlertMinutes) || idleAlertMinutes <= 0) {
        return json({ error: "Idle alert threshold must be a positive whole number of minutes." }, 400);
      }
      if (!Number.isFinite(nightOutMinGapHours) || nightOutMinGapHours < 0) {
        return json({ error: "Night-out minimum gap must be zero or a positive number of hours." }, 400);
      }
      if (!Number.isFinite(nightOutMaxGapHours) || nightOutMaxGapHours <= nightOutMinGapHours) {
        return json({ error: "Night-out maximum gap must be greater than the minimum gap." }, 400);
      }
      if (!Number.isInteger(complianceAlertLeadDays) || complianceAlertLeadDays <= 0) {
        return json({ error: "MOT alert lead time must be a positive whole number of days." }, 400);
      }

      // allow_driver_night_out_requests (migration 050) is optional in
      // the body — only included in the update when the caller actually
      // sent it, so a plain "Save Thresholds" submit (which never sends
      // this key) can't accidentally revert an admin's separate toggle.
      const updatePayload: Record<string, unknown> = {
        long_shift_flag_hours: longShiftFlagHours,
        idle_alert_minutes: idleAlertMinutes,
        night_out_min_gap_hours: nightOutMinGapHours,
        night_out_max_gap_hours: nightOutMaxGapHours,
        compliance_alert_lead_days: complianceAlertLeadDays,
      };
      if (typeof body.allowDriverNightOutRequests === "boolean") {
        updatePayload.allow_driver_night_out_requests = body.allowDriverNightOutRequests;
      }

      const { error: updateError } = await supabaseAdmin
        .from("organizations")
        .update(updatePayload)
        .eq("id", callerOrgId);

      if (updateError) {
        return json({ error: `Could not save alert settings: ${updateError.message}` }, 400);
      }

      console.log(`Alert settings updated for org ${callerOrgId} by ${callerEmail}`);
      return json({
        success: true,
        settings: { longShiftFlagHours, idleAlertMinutes, nightOutMinGapHours, nightOutMaxGapHours, complianceAlertLeadDays },
      });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    console.error("admin-users error:", err);
    return json({ error: (err as Error).message ?? "Unexpected error" }, 500);
  }
});
