// ============================================================
// ABTSO Logistics — Edge Function: Department Sign-Up
// ============================================================
// Self-service registration for the two dashboard departments,
// with no mailbox required anywhere.
//
// SECURITY MODEL
// The department is NOT taken on trust from the request. The
// caller must present the registration code for the department
// they are joining, and that code is verified server-side
// against a Supabase secret. A logistics starter holding the
// logistics code therefore cannot create a payroll admin.
//
// Required secrets (set once, per project):
//   supabase secrets set SIGNUP_CODE_LOGISTICS="..."
//   supabase secrets set SIGNUP_CODE_PAYROLL="..."
// Optional:
//   supabase secrets set SIGNUP_EMAIL_DOMAIN="abtso.co.uk"
//
// The function FAILS CLOSED: if a department's code secret is
// unset, sign-ups for that department are refused outright.
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

/// Constant-time-ish comparison so a wrong code cannot be recovered
/// by measuring how long the rejection took.
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

const CODE_SECRET_BY_ROLE: Record<string, string> = {
  logistics: "SIGNUP_CODE_LOGISTICS",
  payroll_admin: "SIGNUP_CODE_PAYROLL",
};

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
    const secretName = CODE_SECRET_BY_ROLE[role];
    if (!secretName) {
      return json({ error: "Choose a valid department." }, 400);
    }
    if (!code) {
      return json({ error: "A department registration code is required." }, 400);
    }

    // ── 2. Optional domain restriction ──────────────────────
    const allowedDomain = Deno.env.get("SIGNUP_EMAIL_DOMAIN")?.trim();
    if (allowedDomain && !email.endsWith(`@${allowedDomain.toLowerCase()}`)) {
      return json({ error: `Sign-up is limited to @${allowedDomain} addresses.` }, 403);
    }

    // ── 3. Verify the department code (fails closed) ────────
    const expectedCode = Deno.env.get(secretName)?.trim();
    if (!expectedCode) {
      console.error(`Sign-up refused: ${secretName} is not configured.`);
      return json(
        { error: "Sign-up is not configured for this department. Contact your administrator." },
        503,
      );
    }
    if (!safeEqual(code, expectedCode)) {
      // Lengths only — never the values. A length mismatch almost always means
      // the stored secret picked up a label, quotes or a trailing newline when
      // it was set, rather than the code being genuinely wrong.
      console.warn(
        `Invalid ${role} registration code for ${email}: ` +
        `submitted length ${code.length}, configured length ${expectedCode.length}` +
        (code.length === expectedCode.length
          ? " (lengths match — value differs)"
          : " (LENGTH MISMATCH — check how the secret was set)"),
      );
      // Deliberately vague: do not reveal which half was wrong. The details
      // are in the server log line above, which is not reachable by callers.
      return json({ error: "That registration code is not valid for this department." }, 403);
    }

    // ── 4. Service-role client ──────────────────────────────
    const projectUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!projectUrl || !serviceKey) {
      console.error(
        `Missing platform env: SUPABASE_URL=${!!projectUrl}, SUPABASE_SERVICE_ROLE_KEY=${!!serviceKey}`,
      );
      return json({ error: "Server is missing its Supabase credentials." }, 500);
    }

    const supabaseAdmin = createClient(projectUrl, serviceKey);

    // ── 5. Create the confirmed account ─────────────────────
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

    // ── 7. Assign the department the code proved ────────────
    // Keyed by email: the deployed user_roles table has no user_id column.
    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .upsert({ email, role }, { onConflict: "email" });

    if (roleError) {
      // Never leave an account behind without a department.
      await supabaseAdmin.auth.admin.deleteUser(created.user.id);
      console.error("Department assignment failed:", roleError.message);
      return json({ error: `Department assignment failed: ${roleError.message}` }, 400);
    }

    console.log(`Sign-up complete: ${email} joined ${role}`);
    return json({ success: true, email, role });
  } catch (err) {
    console.error("admin-signup error:", err);
    return json({ error: (err as Error).message ?? "Unexpected error" }, 500);
  }
});
