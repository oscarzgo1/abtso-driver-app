import type { Metadata } from "next";
import { LegalPage, LegalSection, Insert } from "@/components/LegalContent";

export const metadata: Metadata = {
  title: "Cookie Policy",
  description: "What cookies and similar technology Tachyo's website and dashboard use.",
};

export default function CookiesPage() {
  return (
    <LegalPage title="Cookie Policy" updated={<Insert>INSERT DATE ON PUBLICATION</Insert>}>
      <LegalSection heading="What we use today">
        <p>
          Tachyo&apos;s website and admin dashboard currently use <strong>no advertising or
          third-party tracking cookies</strong>.
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>The admin dashboard keeps you signed in using your browser&apos;s local storage, not cookies.</li>
          <li>The website does not currently run any analytics or marketing scripts that set cookies.</li>
        </ul>
      </LegalSection>
      <LegalSection heading="If this changes">
        <p>
          If we add analytics or any other non-essential cookie in future, we&apos;ll update this
          policy first and, where required by law, ask for your consent via a cookie banner before
          it&apos;s set.
        </p>
      </LegalSection>
      <LegalSection heading="Contact">
        <p>
          <Insert>INSERT contact email</Insert>
        </p>
      </LegalSection>
    </LegalPage>
  );
}
