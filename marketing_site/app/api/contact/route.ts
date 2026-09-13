import { NextResponse } from "next/server";

// Sends a demo-request submission by email via Resend. Needs RESEND_API_KEY
// and CONTACT_TO_EMAIL set as real environment variables before this
// actually delivers anything — until then it logs the submission server-
// side and tells the caller plainly that delivery isn't configured yet,
// rather than pretending success. See marketing_site/README.md for setup.

interface ContactPayload {
  name: string;
  company: string;
  email: string;
  phone?: string;
  fleetSize?: string;
  message: string;
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
    /\S+@\S+\.\S+/.test(b.email) &&
    typeof b.message === "string" &&
    b.message.trim().length > 5
  );
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  if (!isValidPayload(body)) {
    return NextResponse.json(
      { error: "Please fill in your name, company, a valid email, and a short message." },
      { status: 400 },
    );
  }

  const apiKey = process.env.RESEND_API_KEY;
  const toEmail = process.env.CONTACT_TO_EMAIL;

  if (!apiKey || !toEmail) {
    console.log("[contact] RESEND_API_KEY/CONTACT_TO_EMAIL not set — submission logged only:", body);
    return NextResponse.json(
      {
        error:
          "This form isn't fully wired up to send email yet (missing server configuration). Your message wasn't lost — it's in the server logs — but please reach out directly for now.",
      },
      { status: 503 },
    );
  }

  const { name, company, email, phone, fleetSize, message } = body;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Tachyo Website <onboarding@resend.dev>",
        to: [toEmail],
        reply_to: email,
        subject: `New demo request — ${company}`,
        text: [
          `Name: ${name}`,
          `Company: ${company}`,
          `Email: ${email}`,
          phone ? `Phone: ${phone}` : null,
          fleetSize ? `Fleet size: ${fleetSize}` : null,
          "",
          message,
        ]
          .filter(Boolean)
          .join("\n"),
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      console.error("[contact] Resend API error:", detail);
      return NextResponse.json({ error: "Could not send your message. Please try again." }, { status: 502 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[contact] Unexpected error:", err);
    return NextResponse.json({ error: "Could not send your message. Please try again." }, { status: 500 });
  }
}
