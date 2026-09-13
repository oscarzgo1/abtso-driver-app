import type { Metadata } from "next";
import { LegalPage, LegalSection, Insert } from "@/components/LegalContent";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms governing use of the Tachyo platform by customer businesses.",
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      updated={<Insert>INSERT DATE ON PUBLICATION</Insert>}
      intro={
        <p>
          These Terms are a contract between <Insert>INSERT REGISTERED COMPANY NAME</Insert> Ltd,
          company number <Insert>INSERT COMPANY NUMBER</Insert>, registered office{" "}
          <Insert>INSERT REGISTERED OFFICE ADDRESS</Insert> (&quot;Tachyo&quot;, &quot;we&quot;,
          &quot;us&quot;), trading as Tachyo, and the company or organisation that registers for a
          Tachyo account (&quot;Customer&quot;, &quot;you&quot;). By registering for an account or
          using the Tachyo platform, you confirm you have authority to bind the Customer to these
          Terms.
        </p>
      }
    >
      <LegalSection heading="1. What Tachyo is">
        <p>
          Tachyo is a software-as-a-service platform for road haulage operators, comprising a
          web-based admin dashboard for dispatch, driver management, rates, payroll reconciliation
          and analytics (&quot;Admin Platform&quot;), and a mobile application for the
          Customer&apos;s own drivers to clock in/out and be located while on shift (&quot;Driver
          App&quot;), together the &quot;Services&quot;.
        </p>
        <p>
          Tachyo is a tool. It does not employ, engage, dispatch, insure, or supervise the
          Customer&apos;s drivers, vehicles, or loads, and is not a party to any contract,
          employment, or engagement between the Customer and its drivers.
        </p>
      </LegalSection>

      <LegalSection heading="2. The Customer's account and drivers">
        <p>The Customer is responsible for the accuracy of information it enters into the Services.</p>
        <p>
          <strong>
            The Customer is the employer or engager of its own drivers,
          </strong>{" "}
          and is solely responsible for complying with all applicable employment, worker, and data
          protection law in respect of them — including giving its drivers any notices required
          before enabling location tracking, timekeeping, or other monitoring features. Tachyo
          processes driver data only on the Customer&apos;s instructions, as described in the Data
          Processing Addendum.
        </p>
        <p>
          The Customer is responsible for all activity under its account and for keeping login
          credentials confidential, and must promptly deactivate any account that should no longer
          have access.
        </p>
      </LegalSection>

      <LegalSection heading="3. Acceptable use">
        <p>The Customer must not, and must not permit any user of its account to:</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>use the Services unlawfully or in a way that infringes another&apos;s rights;</li>
          <li>attempt unauthorised access to the Services, other customers&apos; data, or Tachyo&apos;s systems;</li>
          <li>reverse-engineer or decompile the Services, except where the law does not allow this restriction;</li>
          <li>store or transmit unlawfully obtained data or malicious code through the Services;</li>
          <li>resell or provide the Services to any third party outside the Customer&apos;s own organisation.</li>
        </ul>
      </LegalSection>

      <LegalSection heading="4. Fees and the free trial period">
        <p>
          Tachyo is currently made available to new Customers on a free trial basis (currently 180
          days from registration), after which access is suspended unless the Customer converts to
          a paid plan.
        </p>
        <p>
          Where a trial ends without conversion, Tachyo retains the Customer&apos;s data in a
          suspended state for a further period (currently 30 days) before permanent deletion, as
          described in Section 9.
        </p>
        <p>
          Paid plan pricing and billing terms will be set out in a separate order form at the point
          a Customer converts to a paid plan, supplementing (not replacing) these Terms.
        </p>
      </LegalSection>

      <LegalSection heading="5. Intellectual property">
        <p>
          Tachyo and its licensors own all rights in the Services. The Customer retains all rights
          in the data it inputs (&quot;Customer Data&quot;), and grants Tachyo a licence to host,
          process, and display it solely to provide the Services.
        </p>
      </LegalSection>

      <LegalSection heading="6. Availability and support">
        <p>
          Tachyo will use reasonable efforts to keep the Services available, but does not guarantee
          uninterrupted or error-free operation.
        </p>
      </LegalSection>

      <LegalSection heading="7. Liability">
        <p>
          Nothing in these Terms limits or excludes either party&apos;s liability for death or
          personal injury caused by negligence, fraud or fraudulent misrepresentation, or any other
          liability that cannot lawfully be limited or excluded under the laws of England and
          Wales.
        </p>
        <p>
          Subject to the above, Tachyo&apos;s total liability arising out of these Terms shall not
          exceed <Insert>INSERT: liability cap, pending legal advice</Insert>, and Tachyo shall not
          be liable for indirect or consequential loss, or loss arising from the Customer&apos;s own
          failure to give required notices, maintain accurate data, or act on alerts in a timely
          manner.
        </p>
        <p>
          The Customer is solely responsible for decisions it makes using data from the Services,
          including payroll calculations and responses to safety alerts. The Services are a
          decision-support tool, not a substitute for the Customer&apos;s own operational judgement
          and legal compliance.
        </p>
      </LegalSection>

      <LegalSection heading="8. Suspension and termination">
        <p>
          Either party may terminate for convenience on written notice. Tachyo may suspend or
          terminate immediately for uncured breach, trial expiry without conversion, or where
          continued access would expose either party or a third party to legal or security risk.
        </p>
      </LegalSection>

      <LegalSection heading="9. Data protection">
        <p>
          Tachyo processes personal data on the Customer&apos;s behalf (particularly driver data)
          as a processor, under the terms of the{" "}
          <a href="/legal/dpa" className="text-brand-red underline">
            Data Processing Addendum
          </a>
          , which forms part of these Terms. See the{" "}
          <a href="/legal/privacy" className="text-brand-red underline">
            Privacy Policy
          </a>{" "}
          for how Tachyo handles data where it acts as controller in its own right.
        </p>
      </LegalSection>

      <LegalSection heading="10. Governing law">
        <p>
          These Terms are governed by the law of England and Wales, and the courts of England and
          Wales have exclusive jurisdiction over any dispute arising from them.
        </p>
      </LegalSection>

      <LegalSection heading="Contact">
        <p>
          <Insert>INSERT: legal@tachyo.co.uk or equivalent real inbox</Insert>
        </p>
      </LegalSection>
    </LegalPage>
  );
}
