# Tachyo Marketing Site

Next.js 16 (App Router) + TypeScript + Tailwind v4. Same brand palette
(Charcoal / Brand Red / White) and Geist Sans as the admin dashboard.

## Local development

```bash
npm install
npm run dev
```

## Pages

- `/` — Home (hero, pain points, features, how-it-works, CTA)
- `/features` — full module-by-module breakdown
- `/pricing` — plan tiers, no invented numbers (see below)
- `/about` — mission and principles
- `/contact` — demo-request form
- `/legal/privacy`, `/legal/terms` — placeholders, see below

## Before this goes live — real things this needs from you

1. **Contact form delivery.** `app/api/contact/route.ts` is wired for
   [Resend](https://resend.com) but has no API key. Set `RESEND_API_KEY`
   and `CONTACT_TO_EMAIL` as environment variables (in Vercel project
   settings, not committed to the repo) once you have a Resend account
   and a real inbox to receive submissions. Until then, submissions are
   only written to the server logs and the form tells the visitor so
   honestly rather than pretending to succeed.

2. **Real contact email.** The Contact page shows `hello@tachyo.co.uk` as
   a placeholder — confirm that's a real, monitored inbox (or change it)
   before launch.

3. **Real pricing.** The Pricing page intentionally shows plan *names*
   (Starter / Growth / Enterprise) with "Custom quote" instead of actual
   numbers — no price points were invented. Add real figures once you
   have them, or keep it quote-based if that's the intended model.

4. **Real legal text.** `/legal/privacy` and `/legal/terms` are plain
   placeholders. The admin dashboard already shows a real Privacy Policy
   & Contract for Services at login — that text belongs here too.

5. **Domain cutover.** This is deployed to its own Vercel project so it
   doesn't touch the live `tachyo.co.uk` (currently serving the admin
   dashboard) until you've reviewed it. Once ready:
   - Add this project to Vercel, attach `tachyo.co.uk` + `www.tachyo.co.uk` to it.
   - Remove those domains from the `admin-dashboard` project and attach
     `app.tachyo.co.uk` there instead.
   - Set `NEXT_PUBLIC_APP_URL=https://app.tachyo.co.uk` here (or leave
     it — that's already the default in `lib/config.ts`).

6. **Testimonials.** None are included. If real client quotes exist
   (with their sign-off to publish), a section can be added — see the
   admin dashboard work earlier in this project for why none were
   fabricated.
