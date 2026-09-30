// ============================================================
// Edge Function: Platform Accounts (platform owner only)
// ============================================================
// The one step of account management that needs the service role:
// creating a customer's company and its first admin login — either from
// an interest buyer's access request (migration 061) or directly.
//
// The approval click still requires a human (you) on the Accounts page —
// that gate is deliberate, replacing what used to be free self-service
// signup. What used to happen AFTER that click was manual: a random
// temp password shown once, for the platform owner to phone/email
// across themselves. That handoff is now automated: generateLink mints
// a genuine one-time Supabase invite link (same mechanism as password
// reset), which is emailed straight to the new admin via Resend — the
// same RESEND_API_KEY/REPORT_FROM_EMAIL secrets analytics-report
// already uses for weekly reports, so no new email infra is needed.
// Clicking it signs them in and drops them on the same "set your
// password" screen must_change_password already drives for provisioned
// accounts — no separate onboarding UI needed either.
//
// If RESEND_API_KEY isn't configured, the link is still returned in the
// response (emailSent: false) so the platform owner can copy/paste it
// manually rather than the flow silently failing.
//
// Everything else on the Accounts page (listing, suspend/reactivate,
// plan, request stage/notes) goes through the platform_* SQL functions,
// which check is_platform_admin() themselves.
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const PLANS = new Set(["starter", "growth", "enterprise"]);
// An admin panel that hasn't been updated yet may still send the old names.
const LEGACY_PLANS: Record<string, string> = { free: "starter", standard: "growth", premium: "enterprise" };

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "company";
}

const APP_SIGN_IN_URL = "https://app.tachyo.co.uk";

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

// deno-lint-ignore no-explicit-any
async function findAuthUserByEmail(admin: any, email: string) {
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    // deno-lint-ignore no-explicit-any
    const match = data.users.find((u: any) => (u.email ?? "").toLowerCase().trim() === email);
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
    if (authError || !user?.email) {
      return json({ error: "Unauthorized: please sign in again." }, 401);
    }
    const callerEmail = user.email.toLowerCase().trim();

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: platformRow } = await admin
      .from("platform_admins")
      .select("email")
      .eq("email", callerEmail)
      .maybeSingle();
    if (!platformRow) {
      console.warn("Forbidden platform-accounts call by:", callerEmail);
      return json({ error: "Forbidden." }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "");

    // ── Permanently delete a company and everything in it ───────
    // The SQL side (platform_delete_account, migration 080) does the
    // actual data deletion and is called on userClient — it's SECURITY
    // DEFINER but still checks is_platform_admin()/current_org_id() off
    // the caller's own JWT, which only exists on that client, not the
    // service-role one. It returns every driver/admin auth id the org
    // had; those are only deletable from Supabase Auth here, with the
    // service role.
    if (action === "delete-account") {
      const organizationId = String(body.organizationId ?? "");
      const confirmName = String(body.confirmName ?? "");
      if (!organizationId) return json({ error: "organizationId is required." }, 400);

      const { data: rows, error: rpcError } = await userClient.rpc("platform_delete_account", {
        p_organization_id: organizationId,
        p_confirm_name: confirmName,
      });
      if (rpcError) {
        return json({ error: rpcError.message }, 400);
      }
      const authIds: string[] = rows?.[0]?.deleted_auth_ids ?? [];
      let authDeleteFailures = 0;
      for (const id of authIds) {
        const { error: delErr } = await admin.auth.admin.deleteUser(id);
        if (delErr) {
          authDeleteFailures++;
          console.warn("platform-accounts delete-account: auth user delete failed (non-fatal):", id, delErr.message);
        }
      }
      console.log(`Account deleted (org ${organizationId}) by platform admin ${callerEmail}: ${authIds.length} auth users, ${authDeleteFailures} failed`);
      return json({ success: true, authUsersRemoved: authIds.length - authDeleteFailures, authUsersFailed: authDeleteFailures });
    }

    if (action !== "create-account") {
      return json({ error: `Unknown action "${action}".` }, 400);
    }

    // ── Resolve the request (optional) ───────────────────────
    const requestId = typeof body.requestId === "string" ? body.requestId : "";
    let request: { id: string; company_name: string; email: string; stage: string } | null = null;
    if (requestId) {
      const { data, error } = await admin
        .from("access_requests")
        .select("id, company_name, email, stage")
        .eq("id", requestId)
        .maybeSingle();
      if (error || !data) {
        return json({ error: "That request no longer exists." }, 404);
      }
      if (data.stage === "approved") {
        return json({ error: "An account has already been created for this request." }, 409);
      }
      request = data;
    }

    const companyName = String(body.companyName ?? request?.company_name ?? "").trim().slice(0, 120);
    const email = String(body.adminEmail ?? request?.email ?? "").toLowerCase().trim();
    const requestedPlan = LEGACY_PLANS[String(body.plan)] ?? String(body.plan);
    const plan = PLANS.has(requestedPlan) ? requestedPlan : "starter";

    if (companyName.length < 2) {
      return json({ error: "Enter the company name." }, 400);
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ error: "Enter a valid email for the company's first admin." }, 400);
    }

    const { data: existingRole } = await admin
      .from("user_roles")
      .select("email")
      .eq("email", email)
      .maybeSingle();
    if (existingRole || await findAuthUserByEmail(admin, email)) {
      return json({ error: `${email} already has a Tachyo login — use a different email for this company.` }, 409);
    }

    // ── Free slug ────────────────────────────────────────────
    const baseSlug = slugify(companyName);
    let slug = baseSlug;
    for (let attempt = 0; attempt < 20; attempt++) {
      const { data: taken } = await admin.from("organizations").select("id").eq("slug", slug).maybeSingle();
      if (!taken) break;
      slug = `${baseSlug}-${Math.floor(1000 + Math.random() * 9000)}`;
    }

    // ── Company ──────────────────────────────────────────────
    // Department registration codes are left unset (admin-signup fails
    // closed); the customer creates staff logins or generates codes from
    // Settings once they're in.
    const { data: org, error: orgError } = await admin
      .from("organizations")
      .insert({ name: companyName, slug, plan, is_active: true })
      .select("id, slug")
      .single();
    if (orgError || !org) {
      console.error("platform-accounts: organization insert failed:", orgError?.message);
      return json({ error: `Could not create the company: ${orgError?.message ?? "unknown error"}` }, 400);
    }

    // ── First admin login ────────────────────────────────────
    // generateLink(type: 'invite') both creates the auth user (in
    // unconfirmed state — no password set yet) and mints a genuine,
    // one-time Supabase verification link, the same underlying
    // mechanism as password reset. must_change_password in user
    // metadata means the moment they click it and land signed-in on
    // app.tachyo.co.uk, the existing "set your password" screen takes
    // over automatically — no new onboarding UI needed.
    const { data: created, error: createError } = await admin.auth.admin.generateLink({
      type: "invite",
      email,
      options: {
        data: { must_change_password: true },
        redirectTo: APP_SIGN_IN_URL,
      },
    });
    if (createError || !created?.user || !created.properties?.action_link) {
      await admin.from("organizations").delete().eq("id", org.id);
      return json({ error: `Could not create the login: ${createError?.message ?? "unknown error"}` }, 400);
    }
    const actionLink = created.properties.action_link;

    const { error: roleError } = await admin
      .from("user_roles")
      .upsert({ email, role: "payroll_admin", organization_id: org.id }, { onConflict: "email" });
    if (roleError) {
      await admin.auth.admin.deleteUser(created.user.id);
      await admin.from("organizations").delete().eq("id", org.id);
      return json({ error: `Could not assign the admin role: ${roleError.message}` }, 400);
    }

    if (request) {
      const now = new Date().toISOString();
      await admin
        .from("access_requests")
        .update({ stage: "approved", organization_id: org.id, reviewed_at: now, reviewed_by: callerEmail, updated_at: now })
        .eq("id", request.id);
    }

    // ── Email the invite ─────────────────────────────────────
    // Same Resend setup as analytics-report's weekly emails. If it
    // isn't configured, the account still exists and works — the link
    // just comes back in the response instead, for the platform owner
    // to send manually rather than the whole flow silently failing.
    const resendKey = Deno.env.get("RESEND_API_KEY");
    const from = Deno.env.get("REPORT_FROM_EMAIL") ?? "Tachyo <onboarding@resend.dev>";
    // Replies go to a real, monitored inbox rather than the no-reply sender.
    const replyTo = Deno.env.get("REPLY_TO_EMAIL") ?? "hello@tachyo.co.uk";
    let emailSent = false;
    if (resendKey) {
      const html = `<div style="font-family:Arial,sans-serif;color:#222;max-width:560px">
<p style="color:#CC0000;font-weight:900;margin:0">tachyo.</p>
<h2 style="margin:12px 0 4px">Welcome to Tachyo, ${esc(companyName)}</h2>
<p style="margin:0 0 20px">Your account is ready. Click below to set your password and sign in — this link works once and expires soon, so use it straight away.</p>
<p style="margin:0 0 24px"><a href="${actionLink}" style="background:#CC0000;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:800;display:inline-block">Set your password &amp; sign in</a></p>
<p style="color:#888;font-size:12px;margin-top:20px">If the button doesn't work, paste this link into your browser:<br>${esc(actionLink)}</p>
</div>`;
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: [email], reply_to: replyTo, subject: "Your Tachyo account is ready", html }),
      });
      emailSent = res.ok;
      if (!res.ok) console.error("platform-accounts: invite email failed:", res.status, await res.text().catch(() => ""));
    } else {
      console.log(`Invite link (not emailed, RESEND_API_KEY missing) for ${email}: ${actionLink}`);
    }

    console.log(`Account created: ${companyName} (${org.slug}) by platform admin ${callerEmail}, invite emailed: ${emailSent}`);
    return json({ success: true, companyName, companySlug: org.slug, email, emailSent, actionLink });
  } catch (err) {
    console.error("platform-accounts error:", err);
    return json({ error: (err as Error).message ?? "Unexpected error" }, 500);
  }
});
