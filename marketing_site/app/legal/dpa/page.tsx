import type { Metadata } from "next";
import { LegalPage, LegalSection, Insert } from "@/components/LegalContent";

export const metadata: Metadata = {
  title: "Data Processing Addendum",
  description: "The terms governing Tachyo's processing of customer driver data as a UK GDPR data processor.",
};

export default function DpaPage() {
  return (
    <LegalPage
      title="Data Processing Addendum"
      updated={<Insert>INSERT DATE ON PUBLICATION</Insert>}
      intro={
        <p>
          This Data Processing Addendum (&quot;DPA&quot;) forms part of the{" "}
          <a href="/legal/terms" className="text-brand-red underline">
            Terms of Service
          </a>{" "}
          between Tachyo and the Customer, and applies whenever Tachyo processes personal data on
          the Customer&apos;s behalf as a processor — principally, data about the Customer&apos;s
          drivers.
        </p>
      }
    >
      <LegalSection heading="1. Roles">
        <p>
          For personal data about the Customer&apos;s drivers, shifts, and pay: the{" "}
          <strong>Customer is the controller</strong>, and <strong>Tachyo is the processor</strong>.
          The Customer determines the purposes and means of processing; Tachyo processes that data
          only as instructed.
        </p>
      </LegalSection>

      <LegalSection heading="2. Subject matter and duration">
        <p>
          <strong>Subject matter:</strong> provision of the Tachyo Services. <strong>Duration:</strong>{" "}
          the life of the Customer&apos;s account, plus the post-termination retention described
          below. <strong>Nature and purpose:</strong> dispatch, timekeeping, payroll calculation
          support, safety alerting, and related fleet-management functions.{" "}
          <strong>Data subjects:</strong> the Customer&apos;s drivers and other staff added to the
          platform. <strong>Categories of data:</strong> identity data, location/GPS data, shift
          and timekeeping data, pay/rate data.
        </p>
      </LegalSection>

      <LegalSection heading="3. Tachyo's obligations as processor">
        <p>Tachyo shall:</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>process personal data only on the Customer&apos;s documented instructions, unless required otherwise by UK law;</li>
          <li>ensure anyone authorised to process the data is subject to a duty of confidentiality;</li>
          <li>implement appropriate technical and organisational security measures (hashed credentials, row-level data isolation, MFA availability);</li>
          <li>not engage a new sub-processor without prior notice to the Customer and an opportunity to object;</li>
          <li>assist the Customer in responding to data subject requests (access, rectification, erasure, restriction, objection, portability);</li>
          <li>assist the Customer with security, breach notification, and data protection impact assessment obligations;</li>
          <li>notify the Customer without undue delay after becoming aware of a personal data breach affecting their data;</li>
          <li>delete or return all personal data at the end of the Services, except where UK law requires retention;</li>
          <li>make available information necessary to demonstrate compliance and allow for reasonable audits.</li>
        </ul>
      </LegalSection>

      <LegalSection heading="4. Retention and deletion on account closure">
        <p>
          GPS/location and shift history is retained for 12 months from collection, for
          payroll-dispute and reporting purposes. If a Customer&apos;s trial ends without
          converting to a paid plan, the account is suspended at trial expiry, and — unless
          converted in the meantime — all driver, shift, rate, and location data, together with
          associated login accounts, is permanently deleted 30 days after suspension. The
          Customer&apos;s organisation record itself is kept afterward only as an inactive marker,
          with no operational or personal data.
        </p>
        <p>
          <Insert>
            INSERT: the deletion/return process for a Customer who terminates a PAID account
            outside the trial-expiry flow — not yet defined, since paid plans have not launched
          </Insert>
        </p>
      </LegalSection>

      <LegalSection heading="5. International transfers">
        <p>
          Personal data is hosted and processed in the UK (Supabase, EU West / London region).
        </p>
      </LegalSection>

      <LegalSection heading="6. Current sub-processors">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="py-2 pr-4 font-bold text-charcoal">Sub-processor</th>
                <th className="py-2 pr-4 font-bold text-charcoal">Purpose</th>
                <th className="py-2 font-bold text-charcoal">Location</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border">
                <td className="py-2 pr-4">Supabase</td>
                <td className="py-2 pr-4">Database, authentication, hosting</td>
                <td className="py-2">EU West (London, UK)</td>
              </tr>
              <tr>
                <td className="py-2 pr-4">Vercel</td>
                <td className="py-2 pr-4">Web application hosting</td>
                <td className="py-2">
                  <Insert>INSERT: confirm hosting region/edge configuration</Insert>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </LegalSection>

      <LegalSection heading="7. Liability">
        <p>Liability under this DPA is subject to the limitations set out in the Terms of Service.</p>
      </LegalSection>
    </LegalPage>
  );
}
