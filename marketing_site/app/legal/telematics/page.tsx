import type { Metadata } from "next";
import { LegalPortalShell, LegalClause, type LegalPortalSection } from "@/components/LegalPortal";

export const metadata: Metadata = {
  title: "Telematics & GPS Policy",
  description: "Tachyo LTD's Driver Telematics, GPS & Mobile App Policy — hardware permissions, active-duty tracking scope, and signal limitations.",
};

const sections: LegalPortalSection[] = [
  { id: "hardware-permissions", label: "1. Hardware permissions & OS architecture" },
  { id: "duty-scope", label: "2. Active duty scope & edge dropping" },
  { id: "attenuation", label: "3. Signal attenuation" },
  { id: "camera-ocr", label: "4. Camera, walkaround proof & OCR" },
  { id: "security", label: "5. Security & credential integrity" },
];

export default function TelematicsPage() {
  return (
    <LegalPortalShell
      activeSlug="telematics"
      title="Driver Telematics, GPS & Mobile App Policy"
      updated="16 September 2026"
      sections={sections}
      intro={
        <div className="flex flex-col gap-1">
          <p className="font-mono text-xs font-bold uppercase tracking-wide text-charcoal-light">
            Document Reference: TCH-UK-TEL-2026-V1
          </p>
          <p>
            Statutory Alignment: UK GDPR, Data Protection Act 2018, Road Traffic Act 1988,
            Transport Act 1968.
          </p>
        </div>
      }
    >
      <LegalClause id="hardware-permissions" heading="1. Hardware-level location permissions & operating system architecture">
        <p><strong>1.1 Low-Level Hardware Permissions:</strong></p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            (a) Operation of the mobile application mandates the granting of high-precision Global Navigation Satellite System (GNSS/GPS) access permissions at the operating system level:
            <ul className="list-disc space-y-1.5 pl-5 mt-1.5">
              <li>Apple iOS: CoreLocation framework authorization set to &quot;Always Allow&quot; or &quot;While Using the App&quot;;</li>
              <li>Google Android: ACCESS_FINE_LOCATION and ACCESS_BACKGROUND_LOCATION permissions.</li>
            </ul>
          </li>
          <li>(b) Operating System Autonomy: The Customer and Driver acknowledge that mobile operating systems independently control hardware power states, antenna polling intervals, and permission dialogs.</li>
        </ul>
        <p><strong>1.2 Distinction Between OS Permission and App Duty State:</strong></p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>(a) Granting background location permissions to the device operating system enables the software container to execute location polling when the application interface is minimized.</li>
          <li>(b) Hardware De-coupling: Revocation of physical satellite querying can only be executed by the end-user directly through device system settings (Settings → Tachyo → Location → Never).</li>
        </ul>
      </LegalClause>

      <LegalClause id="duty-scope" heading="2. Active duty tracking scope & edge gateway dropping">
        <p><strong>2.1 Strict Shift-Bound Processing Window:</strong></p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>(a) Telematics data processing, geographic vector calculations, and database persistence occur strictly and exclusively during an active duty shift.</li>
          <li>(b) An active duty shift is initiated programmatically when the driver completes the digital check-in sequence (&quot;Start Shift&quot; / &quot;Asset Coupling&quot;) and concludes definitively when the driver executes &quot;End Shift&quot;.</li>
        </ul>
        <p><strong>2.2 Post-Shift Packet Dropping at Edge Perimeter:</strong></p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>(a) Any stray GNSS telemetry packets transmitted by a device hardware background process while in an inactive or uncoupled shift state are dropped at the API edge gateway without ingestion, persistence, or display.</li>
          <li>(b) Tachyo LTD covenants that it maintains zero historical database records, analytical profiles, or real-time maps of driver geographic positioning outside active operational shift logs.</li>
        </ul>
      </LegalClause>

      <LegalClause id="attenuation" heading="3. Atmospheric, subterranean & hardware signal attenuation">
        <p><strong>3.1 Environmental Attenuation Factors:</strong> The accuracy, continuity, and availability of telematics data points are subject to external technical and atmospheric constraints beyond Tachyo LTD&apos;s control, including:</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>(a) Signal blockage caused by transit through tunnels, subterranean loading bays, metal-clad logistics distribution hubs, or deep urban topography;</li>
          <li>(b) Battery preservation protocols enforced by mobile operating systems (e.g., Apple iOS Low Power Mode, Android Doze Mode, OEM memory managers);</li>
          <li>(c) Mobile cellular network dropouts, SIM card data starvation, or regional roaming latency.</li>
        </ul>
        <p><strong>3.2 Tachograph & Driving Hours Primacy:</strong></p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>(a) Calculations displayed on the mobile interface (e.g., 4.5-hour continuous driving counters, 6.0-hour Working Time Directive meters) are mathematical estimators derived from mobile motion vectors.</li>
          <li>(b) In the event of any divergence between Tachyo mobile software telemetry and the digital vehicle tachograph unit (VU / Smart Tacho 2), the calibrated on-board vehicle tachograph and driver smart card maintain absolute legal precedence under Retained Regulation (EC) 561/2006.</li>
          <li>(c) Tachyo LTD accepts zero liability for roadside DVSA driving hours infringements resulting from telemetry drift, lost pings, or device power depletion.</li>
        </ul>
      </LegalClause>

      <LegalClause id="camera-ocr" heading="4. Device camera permissions, walkaround proof & fuel receipt OCR">
        <p><strong>4.1 Limited Optical Access Scope:</strong></p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>(a) Device camera hardware access permissions are utilized solely to capture contemporaneous evidence of vehicle roadworthiness defects during daily walkaround checks and physical fuel pump purchase dockets.</li>
          <li>(b) The application does not maintain automated background camera access, video streaming capability, or facial recognition biometric processing.</li>
        </ul>
        <p><strong>4.2 EXIF Metadata & Geostamp Verification:</strong></p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>(a) Photographs submitted through the walkaround defect inspection workflow automatically extract embedded EXIF metadata, capturing exact device timestamps and geographic coordinates at the moment of shutter actuation.</li>
          <li>(b) This metadata is processed to provide the Transport Manager with auditable cryptographic proof that the physical inspection was performed in proximity to the commercial asset, fulfilling DVSA Guide to Maintaining Roadworthiness evidentiary expectations.</li>
        </ul>
        <p><strong>4.3 Commercial Fuel Receipts & OCR Limitations:</strong></p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>(a) Photographic captures of fuel and AdBlue dockets are processed via optical machine vision solely to extract transactional integers (litres dispensed, total value in £ GBP, VAT numbers).</li>
          <li>(b) Drivers and dispatch staff must manually verify parsed figures against the raw receipt image. Tachyo LTD disclaims liability for fiscal or HMRC VAT filing errors resulting from folded, faded, or illegible paper dockets.</li>
        </ul>
      </LegalClause>

      <LegalClause id="security" heading="5. Driver app security & credential integrity">
        <p>
          <strong>5.1 Prohibition of Account Sharing:</strong> Drivers shall not disclose
          authentication credentials or share active mobile sessions with any other driver.
        </p>
        <p>
          <strong>5.2 Vehicle Registration Association:</strong> The driver is strictly
          responsible for ensuring that the vehicle registration mark (VRM) entered during mobile
          check-in accurately matches the physical tractor unit and trailer coupled during the
          shift.
        </p>
        <p>
          <strong>5.3 Tampering & Mock Locations:</strong> The use of mock-location developer
          tools, GPS spoofing software, or modified operating system kernels
          (jailbreaking/rooting) is strictly prohibited and results in immediate automated account
          suspension and formal notification to the Operator Licence holder.
        </p>
      </LegalClause>
    </LegalPortalShell>
  );
}
