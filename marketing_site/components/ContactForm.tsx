"use client";

import { useState } from "react";
import type { FormEvent } from "react";

type Status = "idle" | "sending" | "success" | "error";

export function ContactForm() {
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setStatus("sending");
    setErrorMessage("");

    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const body = await res.json();

      if (!res.ok) {
        setStatus("error");
        setErrorMessage(body.error || "Something went wrong. Please try again.");
        return;
      }

      setStatus("success");
      form.reset();
    } catch {
      setStatus("error");
      setErrorMessage("Could not reach the server. Please try again.");
    }
  };

  if (status === "success") {
    return (
      <div className="rounded-2xl border border-brand-red-light bg-brand-red-light p-8 text-center">
        <p className="text-lg font-bold text-charcoal">Thanks — we've got your message.</p>
        <p className="mt-2 text-sm text-charcoal-mid">
          We'll get back to you shortly to set up a time.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Full Name" name="name" required />
        <Field label="Company" name="company" required />
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Work Email" name="email" type="email" required />
        <Field label="Phone (optional)" name="phone" type="tel" />
      </div>
      <div>
        <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-charcoal-light">
          Fleet Size
        </label>
        <select
          name="fleetSize"
          className="w-full rounded-lg border border-border bg-white px-3.5 py-2.5 text-sm text-charcoal focus:border-charcoal focus:outline-none"
          defaultValue=""
        >
          <option value="" disabled>
            Select a range
          </option>
          <option value="1-9">1–9 vehicles</option>
          <option value="10-49">10–49 vehicles</option>
          <option value="50-149">50–149 vehicles</option>
          <option value="150+">150+ vehicles</option>
        </select>
      </div>
      <div>
        <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-charcoal-light">
          What's the biggest gap in how you run dispatch or payroll today?
        </label>
        <textarea
          name="message"
          required
          rows={4}
          className="w-full rounded-lg border border-border bg-white px-3.5 py-2.5 text-sm text-charcoal focus:border-charcoal focus:outline-none"
        />
      </div>

      {status === "error" && (
        <p className="rounded-lg bg-brand-red-light px-4 py-3 text-sm font-semibold text-brand-red">
          {errorMessage}
        </p>
      )}

      <button
        type="submit"
        disabled={status === "sending"}
        className="inline-flex items-center justify-center rounded-lg bg-brand-red px-7 py-3.5 text-base font-bold text-white transition-colors hover:bg-brand-red-dark disabled:opacity-60"
      >
        {status === "sending" ? "Sending…" : "Book a Demo"}
      </button>
    </form>
  );
}

function Field({
  label,
  name,
  type = "text",
  required = false,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-charcoal-light">
        {label}
      </label>
      <input
        type={type}
        name={name}
        required={required}
        className="w-full rounded-lg border border-border bg-white px-3.5 py-2.5 text-sm text-charcoal focus:border-charcoal focus:outline-none"
      />
    </div>
  );
}
