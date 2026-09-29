// ============================================================
// Edge Function: Analytics reports (migration 063)
// ============================================================
//   share  — public. { token } → the frozen report snapshot behind a
//            partner share link, if the link exists, isn't revoked and
//            hasn't expired. Nothing else is ever returned.
//   weekly — run by pg_cron every Sunday morning (x-cron-secret header).
//            For each company with the weekly email switched on, works
//            out the week just finished (Sun–Sat): true profit, revenue,
//            costs, margin vs target, vs the week before, top and bottom
//            drivers — and emails it through Resend. Needs the
//            RESEND_API_KEY secret (and optionally REPORT_FROM_EMAIL);
//            without it the summary is logged and nothing is sent.
// Same maths as the admin panel's lib/true-cost.ts (ex VAT: fuel
// receipts are gross and have VAT removed; ledger costs are ex VAT).
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const DAY = 86_400_000;
const VAT = 0.2;
const CATEGORY_LABEL: Record<string, string> = {
  vehicle_finance: "Vehicle finance / lease", insurance: "Insurance", maintenance: "Maintenance & tyres",
  tolls: "Tolls, Dart & ferries", trailer_hire: "Trailer hire", overheads: "Office overheads",
  agency_fees: "Agency fees", subcontractor: "Subcontractors", other: "Other costs",
};

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;

function parseDay(d: string) {
  const [y, m, day] = d.split("-").map(Number);
  return Date.UTC(y, m - 1, day);
}
function costInRange(c: Row, start: number, end: number) {
  const cs = parseDay(c.start_date);
  const ce = c.end_date ? parseDay(c.end_date) + DAY : Infinity;
  if (c.frequency === "one_off") return cs >= start && cs < end ? Number(c.amount) : 0;
  const from = Math.max(start, cs);
  const to = Math.min(end, ce);
  if (to <= from) return 0;
  const perDay = c.frequency === "monthly" ? (Number(c.amount) * 12) / 365 : Number(c.amount) / 365;
  return perDay * ((to - from) / DAY);
}

// deno-lint-ignore no-explicit-any
async function weekSummary(admin: any, orgId: string, start: number, end: number, oncostPct: number, costs: Row[]) {
  const { data: shifts } = await admin
    .from("shifts")
    .select("id, driver_id, total_pay, total_hours, drivers(full_name), shift_revenue(revenue_amount)")
    .eq("organization_id", orgId)
    .eq("status", "completed")
    .gte("start_time", new Date(start).toISOString())
    .lt("start_time", new Date(end).toISOString());
  const list: Row[] = (shifts ?? []).filter((s: Row) => (s.total_hours ?? 0) >= 0.25);
  const ids = list.map((s) => s.id);
  const { data: fuel } = ids.length
    ? await admin.from("fuel_receipts").select("shift_id, total_cost").eq("status", "approved").in("shift_id", ids)
    : { data: [] };
  const fuelByShift = new Map<string, number>();
  for (const f of fuel ?? []) fuelByShift.set(f.shift_id, (fuelByShift.get(f.shift_id) ?? 0) + (Number(f.total_cost) || 0) / (1 + VAT));

  let revenue = 0, payroll = 0, fuelTotal = 0, unrated = 0;
  const drivers = new Map<string, { name: string; profit: number; hours: number }>();
  for (const s of list) {
    const rev = Array.isArray(s.shift_revenue) ? s.shift_revenue[0] : s.shift_revenue;
    const r = rev?.revenue_amount === null || rev?.revenue_amount === undefined ? null : Number(rev.revenue_amount);
    const pay = Number(s.total_pay) || 0;
    const f = fuelByShift.get(s.id) ?? 0;
    if (r === null) unrated += 1; else revenue += r;
    payroll += pay;
    fuelTotal += f;
    const d = drivers.get(s.driver_id) ?? { name: s.drivers?.full_name ?? "Unknown", profit: 0, hours: 0 };
    d.profit += (r ?? 0) - pay * (1 + oncostPct / 100) - f;
    d.hours += Number(s.total_hours) || 0;
    drivers.set(s.driver_id, d);
  }
  const fixedByCategory: Record<string, number> = {};
  let fixed = 0;
  for (const c of costs) {
    if (c.status !== "approved") continue;
    const v = costInRange(c, start, end);
    if (v <= 0) continue;
    fixed += v;
    fixedByCategory[c.category] = (fixedByCategory[c.category] ?? 0) + v;
  }
  const oncost = payroll * oncostPct / 100;
  const profit = revenue - payroll - oncost - fuelTotal - fixed;
  return {
    revenue, payroll, oncost, fuel: fuelTotal, fixed, fixedByCategory, profit, unrated,
    shifts: list.length, marginPct: revenue > 0 ? (profit / revenue) * 100 : null,
    drivers: [...drivers.values()].sort((a, b) => b.profit - a.profit),
  };
}

const money = (v: number) => `${v < 0 ? "−" : ""}£${Math.abs(v).toLocaleString("en-GB", { maximumFractionDigits: 0 })}`;
const esc = (v: string) => v.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = await req.json().catch(() => ({}));

    if (body.action === "share") {
      const token = String(body.token ?? "");
      if (!/^[a-f0-9]{48}$/.test(token)) return json({ error: "This link isn't valid." }, 404);
      const { data } = await admin
        .from("analytics_share_links")
        .select("label, report, created_at, expires_at, revoked_at")
        .eq("token", token)
        .maybeSingle();
      if (!data || data.revoked_at || (data.expires_at && new Date(data.expires_at) < new Date())) {
        return json({ error: "This report link has expired or been withdrawn." }, 404);
      }
      return json({ label: data.label, report: data.report, created_at: data.created_at });
    }

    if (body.action === "weekly") {
      const secret = Deno.env.get("CRON_SECRET");
      if (!secret || req.headers.get("x-cron-secret") !== secret) return json({ error: "Forbidden" }, 403);

      // Week just finished: Sunday 00:00 → Saturday 24:00 (UTC).
      const now = new Date();
      const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
      const end = today - now.getUTCDay() * DAY;
      const start = end - 7 * DAY;

      const { data: settings } = await admin
        .from("org_analytics_settings")
        .select("organization_id, employer_oncost_percent, target_margin_percent, weekly_report_emails")
        .eq("weekly_report_enabled", true);

      const resendKey = Deno.env.get("RESEND_API_KEY");
      const from = Deno.env.get("REPORT_FROM_EMAIL") ?? "Tachyo Reports <onboarding@resend.dev>";
      // Replies go to a real, monitored inbox rather than the no-reply sender.
      const replyTo = Deno.env.get("REPLY_TO_EMAIL") ?? "hello@tachyo.co.uk";
      const results: Row[] = [];

      for (const s of settings ?? []) {
        const emails: string[] = s.weekly_report_emails ?? [];
        if (emails.length === 0) continue;
        // Reports & exports is a plan feature (migration 067).
        const { data: entitled } = await admin.rpc("org_has_feature", { p_org: s.organization_id, p_key: "report_exports" });
        if (entitled === false) continue;
        const [{ data: org }, { data: costs }] = await Promise.all([
          admin.from("organizations").select("name, is_active").eq("id", s.organization_id).maybeSingle(),
          admin.from("org_costs").select("*").eq("organization_id", s.organization_id),
        ]);
        if (!org?.is_active) continue;
        const oncost = Number(s.employer_oncost_percent) || 0;
        const cur = await weekSummary(admin, s.organization_id, start, end, oncost, costs ?? []);
        const prev = await weekSummary(admin, s.organization_id, start - 7 * DAY, start, oncost, costs ?? []);
        const label = `${new Date(start).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} – ${new Date(end - DAY).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`;
        const target = Number(s.target_margin_percent);
        const diff = cur.profit - prev.profit;
        const rows = [
          ["Revenue", cur.revenue], ["Payroll", -cur.payroll], ...(cur.oncost > 0 ? [["Employer NI & pension", -cur.oncost]] : []),
          ["Fuel & AdBlue", -cur.fuel], ...Object.entries(cur.fixedByCategory).map(([k, v]) => [CATEGORY_LABEL[k] ?? k, -(v as number)]),
        ] as [string, number][];
        const html = `<div style="font-family:Arial,sans-serif;color:#222;max-width:560px">
<p style="color:#CC0000;font-weight:900;margin:0">tachyo.</p>
<h2 style="margin:4px 0">${esc(org.name ?? "Your fleet")} — week ${esc(label)}</h2>
<p style="font-size:28px;font-weight:900;margin:8px 0;color:${cur.profit < 0 ? "#CC0000" : "#111"}">${money(cur.profit)} true profit</p>
<p style="margin:0 0 12px">${cur.marginPct === null ? "No rated revenue yet" : `${cur.marginPct.toFixed(1)}% margin (target ${target}%)`} · ${diff >= 0 ? "up" : "down"} ${money(Math.abs(diff))} on the week before · ${cur.shifts} shifts${cur.unrated ? ` · <b style="color:#CC0000">${cur.unrated} awaiting a rate</b>` : ""}</p>
<table style="border-collapse:collapse;width:100%">${rows.map(([k, v]) => `<tr><td style="padding:4px 0;border-bottom:1px solid #eee">${esc(k)}</td><td style="text-align:right;border-bottom:1px solid #eee;color:${v < 0 ? "#CC0000" : "#111"}">${money(v)}</td></tr>`).join("")}</table>
${cur.drivers.length ? `<h3 style="margin:18px 0 6px">Drivers</h3><p style="margin:0">Top: <b>${esc(cur.drivers[0].name)}</b> (${money(cur.drivers[0].profit)})${cur.drivers.length > 1 ? ` · Lowest: <b>${esc(cur.drivers[cur.drivers.length - 1].name)}</b> (${money(cur.drivers[cur.drivers.length - 1].profit)})` : ""}</p>` : ""}
<p style="color:#888;font-size:12px;margin-top:20px">Figures exclude VAT. Full detail in Tachyo → Analytics.</p></div>`;

        if (!resendKey) {
          console.log(`weekly report (not sent, RESEND_API_KEY missing) for ${org.name}:`, JSON.stringify({ profit: cur.profit, revenue: cur.revenue }));
          results.push({ org: org.name, sent: false, reason: "email not configured" });
          continue;
        }
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from, to: emails, reply_to: replyTo, subject: `Weekly fleet report — ${label}`, html }),
        });
        results.push({ org: org.name, sent: res.ok, status: res.status });
      }
      return json({ success: true, week: { start: new Date(start).toISOString(), end: new Date(end).toISOString() }, results });
    }

    return json({ error: "Unknown action." }, 400);
  } catch (err) {
    console.error("analytics-report error:", err);
    return json({ error: (err as Error).message ?? "Unexpected error" }, 500);
  }
});
