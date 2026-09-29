import { NextResponse } from "next/server";
import { SUPABASE_URL } from "@/lib/config";

// Request Access / Book a Demo. Every submission is stored as an
// "interest buyer" through the Supabase request-access Edge Function
// (migration 061), where it shows up on the admin panel's Accounts page
// and in its Alert Panel. No account is created — the Tachyo team sets
// the company up after talking to them.
//
// Needs SUPABASE_ANON_KEY (the project's public anon key — set in Vercel
// env / .env.local). If RESEND_API_KEY and CONTACT_TO_EMAIL are also set,
// a notification email goes out too, but it's optional.

interface ContactPayload {
  name: string;
  company: string;
  email: string;
  phone?: string;
  fleetSize?: string;
  message?: string;
  website?: string;
}

function isValidPayload(body: unknown): body is ContactPayload {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  return (
    typeof b.name === "string" &&
    b.name.trim().length > 1 &&
    typeof b.company === "string" &&
    b.company.trim().length > 1 &&
    typeof b.email === "string" &&
    /\S+@\S+\.\S+/.test(b.email)
  );
}

async function storeInterestBuyer(body: ContactPayload): Promise<{ ok: boolean; error?: string }> {
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!anonKey) return { ok: false, error: "missing SUPABASE_ANON_KEY" };
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/request-access`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${anonKey}`,
        apikey: anonKey,
      },
      body: JSON.stringify({
        companyName: body.company,
        contactName: body.name,
        email: body.email,
        phone: body.phone ?? "",
        fleetSize: body.fleetSize ?? "",
        message: body.message ?? "",
        website: body.website ?? "",
        source: "website",
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.error) {
      return { ok: false, error: data?.error ?? `request-access returned ${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

async function sendNotificationEmail(body: ContactPayload): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const toEmail = process.env.CONTACT_TO_EMAIL;
  if (!apiKey || !toEmail) return false;
  const { name, company, email, phone, fleetSize, message } = body;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        // Set CONTACT_FROM_EMAIL (e.g. "Tachyo Website <no-reply@tachyo.co.uk>") once the
        // domain is verified in Resend; the test sender only delivers to the Resend account owner.
        from: process.env.CONTACT_FROM_EMAIL || "Tachyo Website <onboarding@resend.dev>",
        to: [toEmail],
        reply_to: email,
        subject: `New access request — ${company}`,
        text: [
          `Name: ${name}`,
          `Company: ${company}`,
          `Email: ${email}`,
          phone ? `Phone: ${phone}` : null,
          fleetSize ? `Fleet size: ${fleetSize}` : null,
          "",
          message || "(no message)",
          "",
          "Also saved to the admin panel → Accounts → Interest Buyers.",
        ]
          .filter((line) => line !== null)
          .join("\n"),
      }),
    });
    if (!res.ok) console.error("[contact] Resend API error:", await res.text());
    return res.ok;
  } catch (err) {
    console.error("[contact] Resend request failed:", err);
    return false;
  }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  if (!isValidPayload(body)) {
    return NextResponse.json(
      { error: "Please fill in your name, company and a valid work email." },
      { status: 400 },
    );
  }

  // Honeypot — only bots fill the hidden "website" field.
  if (body.website?.trim()) {
    return NextResponse.json({ success: true });
  }

  const stored = await storeInterestBuyer(body);
  if (!stored.ok) console.error("[contact] Could not store interest buyer:", stored.error);
  const emailed = await sendNotificationEmail(body);

  if (!stored.ok && !emailed) {
    return NextResponse.json(
      { error: "We couldn't send your request just now. Please try again, or email hello@tachyo.co.uk." },
      { status: 502 },
    );
  }
  return NextResponse.json({ success: true });
}
