<!--
  DRAFT — NOT YET REVIEWED BY A SOLICITOR. See terms-of-service.md for the
  same caveat; it applies equally here. This document is written to
  accurately reflect what the Tachyo platform actually collects and does,
  verified against the real system — not a generic template.
-->

# Tachyo — Privacy Policy

**Last updated: [INSERT DATE ON PUBLICATION]**

This Privacy Policy explains how Tachyo handles personal data. Tachyo plays two different roles depending on whose data is involved, and this policy is split accordingly:

- **Where Tachyo is the controller** — visitors to the Tachyo website, people who contact us, and Tachyo admin/logistics account holders at a Customer company. Section A.
- **Where Tachyo is the processor** — data about a Customer's drivers, shifts, and payroll, processed only on that Customer's instructions under a Data Processing Addendum. Section B.

If you are a driver using the Tachyo Driver App, **your employer or engager is the controller of your data, not Tachyo** — see Section B and the in-app Driver Privacy Notice for what this means in practice.

---

## Section A — Where Tachyo is the controller

### A1. Who we are

**[INSERT REGISTERED COMPANY NAME] Ltd**, company number **[INSERT COMPANY NUMBER]**, registered office **[INSERT REGISTERED OFFICE ADDRESS]**, trading as Tachyo. Contact: **[INSERT: privacy@tachyo.co.uk or equivalent real inbox]**.

### A2. What we collect, and why

| Who | What we collect | Why | Lawful basis |
|---|---|---|---|
| Website visitor | Pages viewed, general analytics (if enabled) | Understand and improve the site | Legitimate interests |
| Contact form / demo request | Name, company, email, phone (optional), fleet size, message | Respond to your enquiry | Legitimate interests / steps to enter a contract |
| Tachyo admin account holder (Customer's staff using the dashboard) | Name, work email, password (hashed), role, login activity | Provide and secure the account, support | Performance of the contract with the Customer; legitimate interests (security) |

### A3. How long we keep it

- Contact form enquiries: kept for as long as reasonably needed to respond and follow up, and not used for any other purpose without your consent.
- Admin account data: kept for the life of the Customer's account, and handled per the trial-expiry and deletion process described in Section B4 once a Customer's account is closed.

### A4. Who we share it with

We use the following processors to run our own website and communications; each is contractually restricted to using data only to provide their service to us:

- **Vercel** — website and application hosting.
- **Supabase** — database, authentication, and hosting (EU West / London region).
- **[INSERT: email delivery provider, e.g. Resend]** — delivering contact-form emails, once configured.

We do not sell personal data, and do not share it with anyone for their own marketing purposes.

### A5. Your rights

You can ask us to access, correct, delete, or restrict the personal data we hold about you as controller, or object to how we use it, by contacting **[INSERT contact email]**. You also have the right to complain to the UK Information Commissioner's Office (ico.org.uk) if you believe we have not handled your data properly.

---

## Section B — Where Tachyo is the processor (Customer, driver, and shift data)

### B1. The short version

If you're a driver, or work for a company that uses Tachyo: **your employer/engager decides what data is collected and why — Tachyo just operates the software on their instructions.** Questions about your own data should go to your employer first; Tachyo will assist them in responding to you, as required by our Data Processing Addendum.

### B2. What the platform collects

Based on what the Tachyo platform actually does today:

- **Identity data**: driver name, internal driver ID, phone number, a PIN used to log into the Driver App (stored as a salted hash — Tachyo never stores or can see the plain PIN).
- **Location data (GPS)**: while a driver is clocked in on an active shift, the Driver App records location at intervals to power the live dispatch map and depot geofencing.
- **Time and shift data**: clock in/out times, shift duration, and depot assignment.
- **Idle and safety alerts**: an automated alert is generated if a driver's device stays stationary for a set period (currently 50 minutes) during an active shift, or if the driver raises an SOS alert.
- **Pay and rate data**: hourly/fixed rates, weekend and Night Out allowance differentials, and computed pay, entered and reviewed by the Customer's admin staff.

### B3. Retention

- **GPS and shift location history**: retained for **12 months** from the date of collection. This period is set to support payroll dispute resolution (verifying a shift's pay against its logged route and hours) and the Customer's own profitability/margin reporting, which looks at historical periods. After 12 months, this data is deleted or anonymised, unless a longer period is needed to resolve an active dispute, complaint, or legal claim.
- **Driver account and pay records**: retained for the life of the Customer's account with Tachyo.
- **On trial expiry**: if a Customer's free trial ends without converting to a paid plan, the Customer's account is suspended after the trial period, and all associated driver, shift, and location data is permanently deleted 30 days after that, unless the Customer converts to a paid plan in the meantime. See the Data Processing Addendum for the full process.

### B4. Security measures

- Multi-factor authentication available on admin accounts.
- Driver PINs stored as salted cryptographic hashes, never in plain text.
- Row-level database security so that one Customer's data is never visible to another Customer, enforced at the database level, not just in the application.
- Data hosted with Supabase in the EU West (London, UK) region.

### B5. Data subject rights

Because your employer/engager is the controller of this data, requests to access, correct, or delete it should go to them. Tachyo will support the Customer in fulfilling such requests within the timeframes required by UK GDPR, as set out in the Data Processing Addendum.

---

## International use

Tachyo is built and hosted in the UK. If you access the Services from outside the UK, your data will still be processed in the UK as described above. **[If Tachyo begins serving Customers based outside the UK, this section needs updating to address the specific transfer and local-law requirements of those countries — not addressed here.]**

## Changes to this policy

We'll update this policy as the Services change, and will highlight material changes to Customer admin accounts.

## Contact

**[INSERT: privacy@tachyo.co.uk or equivalent real inbox]**
