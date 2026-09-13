import type { Metadata } from "next";
import { LegalPage, LegalSection, Insert } from "@/components/LegalContent";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How Tachyo collects, uses, and protects personal data across the website, admin dashboard, and driver app.",
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      updated={<Insert>INSERT DATE ON PUBLICATION</Insert>}
      intro={
        <p>
          Tachyo plays two different roles depending on whose data is involved, so this policy is
          split accordingly: <strong>Section A</strong> covers where Tachyo is the controller
          (website visitors, people who contact us, and admin account holders at a customer
          company); <strong>Section B</strong> covers where Tachyo is the processor (data about a
          customer&apos;s drivers, shifts, and payroll, processed only on that customer&apos;s
          instructions). If you&apos;re a driver using the Tachyo Driver App, your employer is the
          controller of your data, not Tachyo — see the in-app Driver Privacy Notice.
        </p>
      }
    >
      <LegalSection heading="Section A — Where Tachyo is the controller">
        <p>
          <strong>Who we are:</strong> <Insert>INSERT REGISTERED COMPANY NAME</Insert> Ltd, company
          number <Insert>INSERT COMPANY NUMBER</Insert>, registered office{" "}
          <Insert>INSERT REGISTERED OFFICE ADDRESS</Insert>, trading as Tachyo. Contact:{" "}
          <Insert>INSERT: privacy@tachyo.co.uk or equivalent real inbox</Insert>.
        </p>
        <p>
          <strong>Website visitors:</strong> pages viewed and general analytics, if enabled — to
          understand and improve the site.
        </p>
        <p>
          <strong>Contact form / demo requests:</strong> name, company, email, phone (optional),
          fleet size, and message — to respond to your enquiry.
        </p>
        <p>
          <strong>Admin account holders</strong> (a customer&apos;s staff using the dashboard):
          name, work email, password (stored hashed), role, and login activity — to provide and
          secure the account.
        </p>
        <p>
          <strong>Who we share it with:</strong> Vercel (hosting), Supabase (database,
          authentication, hosting — EU West / London region), and{" "}
          <Insert>INSERT: email delivery provider, e.g. Resend</Insert> for contact-form email
          delivery, once configured. We do not sell personal data.
        </p>
        <p>
          <strong>Your rights:</strong> you can ask us to access, correct, delete, or restrict data
          we hold about you as controller, or object to how we use it, by contacting us. You can
          also complain to the UK Information Commissioner&apos;s Office (ico.org.uk).
        </p>
      </LegalSection>

      <LegalSection heading="Section B — Where Tachyo is the processor">
        <p>
          If you&apos;re a driver, or work for a company that uses Tachyo: your employer decides
          what data is collected and why — Tachyo just operates the software on their
          instructions. Questions about your own data should go to your employer first; Tachyo
          will assist them in responding to you, as required by our Data Processing Addendum.
        </p>
        <p>
          <strong>What the platform collects:</strong> driver identity (name, internal driver ID,
          phone number), a PIN used to log into the Driver App (stored as a salted hash — Tachyo
          never stores or can see the plain PIN), GPS location while a driver is clocked in on an
          active shift, clock in/out times, automated idle alerts (50 minutes stationary) and SOS
          alerts, and pay/rate data entered by the customer&apos;s admin staff.
        </p>
        <p>
          <strong>Retention:</strong> GPS and shift location history is retained for{" "}
          <strong>12 months</strong> from collection, to support payroll dispute resolution and
          the customer&apos;s own profitability/margin reporting over historical periods. After 12
          months it&apos;s deleted or anonymised, unless a longer period is needed for an active
          dispute or legal claim. Driver account and pay records are retained for the life of the
          customer&apos;s account. If a customer&apos;s free trial ends without converting to a
          paid plan, the account is suspended, and all associated driver, shift, and location data
          is permanently deleted 30 days later unless they convert in the meantime.
        </p>
        <p>
          <strong>Security:</strong> multi-factor authentication available on admin accounts,
          driver PINs stored as salted cryptographic hashes, row-level database security so one
          customer&apos;s data is never visible to another, and hosting with Supabase in the EU
          West (London, UK) region.
        </p>
        <p>
          <strong>Data subject rights:</strong> because the customer is the controller of this
          data, requests to access, correct, or delete it should go to them. Tachyo supports the
          customer in fulfilling such requests within the timeframes required by UK GDPR, as set
          out in the Data Processing Addendum.
        </p>
      </LegalSection>

      <LegalSection heading="International use">
        <p>
          Tachyo is built and hosted in the UK. If you access the Services from outside the UK,
          your data is still processed in the UK as described above.
        </p>
      </LegalSection>

      <LegalSection heading="Changes to this policy">
        <p>
          We&apos;ll update this policy as the Services change, and will highlight material
          changes to customer admin accounts.
        </p>
      </LegalSection>

      <LegalSection heading="Contact">
        <p>
          <Insert>INSERT: privacy@tachyo.co.uk or equivalent real inbox</Insert>
        </p>
      </LegalSection>
    </LegalPage>
  );
}
