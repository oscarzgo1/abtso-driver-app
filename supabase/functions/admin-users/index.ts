// ============================================================
// ABTSO Logistics — Edge Function: Admin User Management
// ============================================================
// Lets a Payroll Admin provision dashboard accounts and reset
// their passwords without anyone needing a real mailbox.
//
// Accounts are created with email_confirm: true, so the address
// is only ever an identifier — no confirmation mail is sent.
//
// Every action requires the caller to be a payroll_admin. The
// department is read from public.user_roles, never from the
// request body, so a logistics user cannot escalate.
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

    // ── 3. Caller must be a payroll_admin ────────────────────
    // Matched on email — the deployed user_roles table is keyed by email
    // and has no user_id column.
    const { data: callerRoles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("email", callerEmail)
      .limit(1);

    if (callerRoles?.[0]?.role !== "payroll_admin") {
      console.warn("Forbidden admin-users call by:", callerEmail);
      return json(
        { error: "Forbidden: only Payroll Admins can manage dashboard accounts." },
        403,
      );
    }

    const body = await req.json().catch(() => ({}));
    const action = body.action ?? "list";

    // ── LIST ─────────────────────────────────────────────────
    if (action === "list") {
      const { data: roles, error: rolesError } = await supabaseAdmin
        .from("user_roles")
        .select("id, email, role, created_at")
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

      return json({ users });
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
        .upsert({ email, role }, { onConflict: "email" });

      if (roleError) {
        // Don't leave an auth user stranded with no department.
        await supabaseAdmin.auth.admin.deleteUser(created.user.id);
        return json({ error: `Department assignment failed: ${roleError.message}` }, 400);
      }

      console.log(`Admin account created: ${email} (${role}) by ${callerEmail}`);
      return json({ success: true, email, role });
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

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    console.error("admin-users error:", err);
    return json({ error: (err as Error).message ?? "Unexpected error" }, 500);
  }
});
