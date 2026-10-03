// ============================================================
// Edge Function: Driver Loads (attach / status / deliver)
// ============================================================
// Drivers never touch shift_loads / shift_revenue directly: both hold
// revenue_amount, the company's billed rate, which must never reach a
// driver's device (migration 035's wall). This function uses the service
// role, verifies the shift belongs to the caller, and only ever reads or
// writes non-financial columns — every select names its columns, never
// "*", so revenue can't come back through it.
//
// Since migration 063 a shift can carry several loads (shift_loads);
// shift_revenue is a trigger-maintained per-shift roll-up.
//   attach  — adds a load (reference + customer/carrier required)
//   status  — the shift's loads, the current (undelivered) one, and the
//             org's load_reminder_minutes. Also returns the older flat
//             fields (load_reference/carrier_name/delivered_at) for app
//             builds from before multi-load.
//   deliver — confirms a load (load_id, or the latest undelivered one)
//             with at least ONE typed proof photo (migration 077:
//             solo_departure / empty_trailer / paper_pod) plus notes.
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const LOAD_COLUMNS = "id, load_reference, carrier_name, delivered_at, created_at";

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
    if (authError || !user) {
      return json({ error: "Unauthorized: invalid or expired session." }, 401);
    }
    const callerId = user.id;

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json();
    const action = typeof body.action === "string" ? body.action : "attach";
    const shiftId = typeof body.shift_id === "string" ? body.shift_id.trim() : "";
    const loadReference = typeof body.load_reference === "string" ? body.load_reference.trim() : "";
    const carrierName = typeof body.carrier_name === "string" ? body.carrier_name.trim() : "";

    if (!["attach", "status", "deliver"].includes(action)) {
      return json({ error: `Unknown action "${action}".` }, 400);
    }
    if (!shiftId) {
      return json({ error: "shift_id is required." }, 400);
    }

    const { data: shift, error: shiftError } = await admin
      .from("shifts")
      .select("id, driver_id, organization_id")
      .eq("id", shiftId)
      .eq("driver_id", callerId)
      .maybeSingle();
    if (shiftError) {
      return json({ error: `Could not verify shift: ${shiftError.message}` }, 500);
    }
    if (!shift) {
      return json({ error: "That shift doesn't belong to you, or doesn't exist." }, 404);
    }

    // Loads & proof of delivery is a plan feature (migration 067). The
    // status read stays open so the app can show what already exists;
    // attaching and delivering need the feature.
    if (action !== "status") {
      const { data: allowed } = await admin.rpc("org_has_feature", {
        p_org: shift.organization_id,
        p_key: "loads_pod",
      });
      if (allowed === false) {
        return json({ error: "Loads and proof of delivery are not included in your plan." }, 403);
      }
    }

    const listLoads = async () => {
      const { data } = await admin
        .from("shift_loads")
        .select(LOAD_COLUMNS)
        .eq("shift_id", shiftId)
        .order("created_at", { ascending: true });
      return data ?? [];
    };

    if (action === "status") {
      const [loads, { data: org }] = await Promise.all([
        listLoads(),
        admin.from("organizations").select("load_reminder_minutes").eq("id", shift.organization_id).maybeSingle(),
      ]);
      const current = [...loads].reverse().find((l) => !l.delivered_at) ?? null;
      const latest = loads[loads.length - 1] ?? null;
      const flat = current ?? latest;
      return json({
        success: true,
        loads,
        current_load_id: current?.id ?? null,
        load_reference: flat?.load_reference ?? null,
        carrier_name: flat?.carrier_name ?? null,
        delivered_at: current ? null : latest?.delivered_at ?? null,
        reminder_minutes: org?.load_reminder_minutes ?? 30,
      });
    }

    if (action === "deliver") {
      const ownPrefix = `${shift.organization_id}/${callerId}/`;
      const POD_TYPES = ["solo_departure", "empty_trailer", "paper_pod"];
      type Proof = { pod_type: string; path: string; lat: number | null; lng: number | null; taken_at: string | null };
      let proofs: Proof[] = [];
      // A signature can stand in for the photos when none can be taken
      // (client feedback, Oct 2026): {pod_type:"signature", first_name,
      // last_name, signature_svg, lat, lng, taken_at}. Stored in
      // delivery_signatures (migration 081), not shipment_proofs.
      let signature: { first: string; last: string; svg: string; lat: number | null; lng: number | null; signedAt: string } | null = null;
      if (Array.isArray(body.proofs)) {
        const entries = body.proofs as Record<string, unknown>[];
        const sigEntries = entries.filter((p) => String(p?.pod_type ?? "") === "signature");
        if (sigEntries.length > 1) {
          return json({ error: "Only one signature per delivery." }, 400);
        }
        if (sigEntries.length === 1) {
          const s = sigEntries[0];
          const first = String(s.first_name ?? "").trim().slice(0, 60);
          const last = String(s.last_name ?? "").trim().slice(0, 60);
          const svg = String(s.signature_svg ?? "");
          if (!first || !last) {
            return json({ error: "Enter the first and last name of the person signing." }, 400);
          }
          if (!svg.startsWith("<svg") || svg.length < 40 || svg.length > 200000 || /<script|onload|onerror|javascript:/i.test(svg)) {
            return json({ error: "The signature is missing or invalid." }, 400);
          }
          signature = {
            first,
            last,
            svg,
            lat: typeof s.lat === "number" ? s.lat : null,
            lng: typeof s.lng === "number" ? s.lng : null,
            signedAt: typeof s.taken_at === "string" ? s.taken_at : new Date().toISOString(),
          };
        }
        proofs = entries.filter((p) => String(p?.pod_type ?? "") !== "signature").map((p: Record<string, unknown>) => ({
          pod_type: String(p.pod_type ?? ""),
          path: String(p.path ?? "").trim(),
          lat: typeof p.lat === "number" ? p.lat : null,
          lng: typeof p.lng === "number" ? p.lng : null,
          taken_at: typeof p.taken_at === "string" ? p.taken_at : null,
        }));
      } else if (typeof body.paperwork_path === "string" && typeof body.evidence_path === "string") {
        // App builds from before migration 077 send the old two fixed photos.
        proofs = [
          { pod_type: "paper_pod", path: body.paperwork_path.trim(), lat: null, lng: null, taken_at: null },
          { pod_type: "empty_trailer", path: body.evidence_path.trim(), lat: null, lng: null, taken_at: null },
        ];
      }
      if (proofs.length < 1 && !signature) {
        return json({ error: "Take at least one proof photo, or get a signature, to confirm delivery." }, 400);
      }
      if (proofs.length > 12) {
        return json({ error: "Too many photos." }, 400);
      }
      for (const p of proofs) {
        if (!POD_TYPES.includes(p.pod_type)) return json({ error: "Unknown proof type." }, 400);
        if (!p.path || !p.path.startsWith(ownPrefix)) return json({ error: "Invalid delivery photo path." }, 400);
      }
      const notes = typeof body.notes === "string" ? body.notes.trim().slice(0, 1000) : "";

      let loadId = typeof body.load_id === "string" ? body.load_id : "";
      if (!loadId) {
        const loads = await listLoads();
        loadId = [...loads].reverse().find((l) => !l.delivered_at)?.id ?? "";
      }
      if (!loadId) {
        return json({ error: "Attach a load before confirming delivery." }, 400);
      }

      // The two older columns stay filled so existing admin readers keep
      // working: the paper POD → paperwork, any other photo → evidence.
      const paper = proofs.find((p) => p.pod_type === "paper_pod")?.path ?? null;
      const other = proofs.find((p) => p.pod_type !== "paper_pod")?.path ?? null;
      const { data: delivered, error: deliverError } = await admin
        .from("shift_loads")
        .update({
          delivered_at: new Date().toISOString(),
          delivery_paperwork_path: paper,
          delivery_evidence_path: other,
          delivery_notes: notes || null,
        })
        .eq("id", loadId)
        .eq("shift_id", shiftId)
        .is("delivered_at", null)
        .select("id, delivered_at")
        .maybeSingle();
      if (deliverError) {
        return json({ error: `Could not confirm delivery: ${deliverError.message}` }, 500);
      }
      if (!delivered) {
        return json({ error: "That load is already confirmed as delivered." }, 400);
      }
      if (proofs.length > 0) {
        const { error: proofError } = await admin.from("shipment_proofs").insert(
          proofs.map((p) => ({
            organization_id: shift.organization_id,
            driver_id: callerId,
            shift_load_id: delivered.id,
            pod_type: p.pod_type,
            photo_path: p.path,
            taken_at: p.taken_at ?? new Date().toISOString(),
            gps_lat: p.lat,
            gps_lng: p.lng,
          })),
        );
        if (proofError) {
          console.error("attach-load: proof insert failed:", proofError.message);
        }
      }
      if (signature) {
        const { error: sigError } = await admin.from("delivery_signatures").insert({
          organization_id: shift.organization_id,
          driver_id: callerId,
          shift_load_id: delivered.id,
          signer_first_name: signature.first,
          signer_last_name: signature.last,
          signature_svg: signature.svg,
          signed_at: signature.signedAt,
          gps_lat: signature.lat,
          gps_lng: signature.lng,
        });
        if (sigError) {
          console.error("attach-load: signature insert failed:", sigError.message);
        }
      }
      return json({ success: true, load_id: delivered.id, delivered_at: delivered.delivered_at });
    }

    // attach
    if (!loadReference) {
      return json({ error: "A load reference is required." }, 400);
    }
    if (!carrierName) {
      return json({ error: "The customer / carrier is required." }, 400);
    }
    // Optional booked times entered by the driver (migration 065).
    // Ignored if unparsable rather than refused, so the load still
    // saves even if the driver mistyped a date.
    const parseIso = (v: unknown): string | null => {
      if (typeof v !== "string" || !v.trim()) return null;
      const d = new Date(v);
      return isNaN(d.getTime()) ? null : d.toISOString();
    };
    // Optional evidence at load start (migration 077): a cargo photo, or the
    // trailer-sealed tick when a photo isn't possible.
    const ownPrefix = `${shift.organization_id}/${callerId}/`;
    const cargoPath = typeof body.cargo_photo_path === "string" && body.cargo_photo_path.startsWith(ownPrefix)
      ? body.cargo_photo_path
      : null;
    const trailerSealed = body.trailer_sealed === true;
    const bookedDeparture = parseIso(body.booked_departure_at);
    const bookedArrival = parseIso(body.booked_delivery_at);
    const { data: created, error: insertError } = await admin
      .from("shift_loads")
      .insert({
        shift_id: shiftId,
        load_reference: loadReference,
        carrier_name: carrierName,
        booked_departure_at: bookedDeparture,
        booked_delivery_at: bookedArrival,
        cargo_photo_path: cargoPath,
        trailer_sealed: trailerSealed,
      })
      .select("id")
      .single();
    if (insertError) {
      return json({ error: `Could not attach the load: ${insertError.message}` }, 500);
    }
    return json({ success: true, load_id: created.id });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("attach-load error:", message);
    return json({ error: `Internal server error: ${message}` }, 500);
  }
});
