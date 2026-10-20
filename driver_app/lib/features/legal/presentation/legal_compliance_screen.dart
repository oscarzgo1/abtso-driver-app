import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

/// The legal documents drivers can read in the app. Each one gets its own
/// entry point (Settings → Legal & Compliance) and its own self-contained
/// screen — a user reading one document never silently scrolls into a
/// different one.
///
/// These pages are short, plain-English versions written for drivers. The
/// full, current documents live on the website (see [LegalDocumentLabel.url])
/// and are the governing text; update both when a policy changes. Customer
/// documents (Customer Terms, Data Processing Addendum) are deliberately not
/// shown here — drivers are not a party to them.
enum LegalDocument { privacyNotice, appTermsOfUse, telematicsPolicy }

extension LegalDocumentLabel on LegalDocument {
  /// Short label used on the Settings button and in the AppBar.
  String get label => switch (this) {
        LegalDocument.privacyNotice => 'Driver Privacy Notice',
        LegalDocument.appTermsOfUse => 'App Terms of Use',
        LegalDocument.telematicsPolicy => 'Telematics & GPS Policy',
      };

  IconData get icon => switch (this) {
        LegalDocument.privacyNotice => Icons.privacy_tip_outlined,
        LegalDocument.appTermsOfUse => Icons.description_outlined,
        LegalDocument.telematicsPolicy => Icons.gps_fixed_outlined,
      };

  /// The full, governing version of this document on the website.
  String get url => switch (this) {
        LegalDocument.privacyNotice => 'https://tachyo.co.uk/legal/driver-privacy',
        LegalDocument.appTermsOfUse => 'https://tachyo.co.uk/legal/driver-terms',
        LegalDocument.telematicsPolicy => 'https://tachyo.co.uk/legal/telematics',
      };
}

/// One page belonging to a single [document]. To add a page to an
/// existing document, insert a [PolicyPage] among the others that share
/// its [document] value — order is preserved. To add a whole new
/// document: add a case to [LegalDocument] above, give it a label, icon
/// and url, and add its pages here. Settings and the login review pick it
/// up automatically.
class PolicyPage {
  final LegalDocument document;
  final String title;
  final String body;

  const PolicyPage({required this.document, required this.title, required this.body});
}

/// Driver-facing legal pages. Public — the login screen's consolidated
/// vertical-scroll review (legal_review_screen.dart) reuses this exact
/// same text rather than duplicating it.
const List<PolicyPage> policyPages = [
  // ── Driver Privacy Notice ─────────────────────────────────
  PolicyPage(
    document: LegalDocument.privacyNotice,
    title: 'Who is responsible for your data',
    body: '''You use this app because the company you drive for ("your employer", even if you are agency or self-employed) uses Tachyo to run dispatch, shifts, checks and pay.

Your employer decides what is collected and why. In data protection law your employer is the "controller".

Tachyo provides and looks after the app on your employer's instructions. In data protection law Tachyo is the "processor". Tachyo has no contract with you about your work, your pay or how you are managed.

For questions about why your data is collected or how it is used, ask your employer first. Tachyo will help them answer. Questions about the app itself: privacy@tachyo.co.uk''',
  ),
  PolicyPage(
    document: LegalDocument.privacyNotice,
    title: 'What the app collects',
    body: '''• You: your name, driver ID, phone number and company code, as set up by your employer; a PIN you choose (stored only in scrambled form that nobody at Tachyo can read); and when you accepted the app terms.
• Your shifts: when you clock in and out, the depot, the vehicle and trailer you chose, and any loads or notes you add.
• Your location during a shift (see the next page).
• Checks and reports: your walkaround answers, defect notes and photographs, and any incident reports. Notes are seen by your employer, so only include what is needed to describe what happened.
• Fuel, AdBlue and parking claims: what you type in (litres, cost, vendor, odometer), photographs of the receipt and dashboard, and where your phone was when you sent it.
• Deliveries: proof-of-delivery photographs with the time and place, and, where a recipient signs on your phone, their first name, last name and signature.
• Rota and holidays: shifts you are rostered for, whether you confirmed them, and holiday requests.
• Alerts: idle or GPS-offline events during a shift, and SOS alerts you send.
• Pay: your employer may record your pay rates and extras in Tachyo, and Tachyo works out pay figures from your hours and those rates.

The app does not use your face to identify you, does not record sound or video, and does not read your contacts, messages or other apps.''',
  ),
  PolicyPage(
    document: LegalDocument.privacyNotice,
    title: 'Your location',
    body: '''• Location is collected only while you are clocked in. It starts when you clock in and stops when you clock out.
• The app records latitude, longitude, speed, accuracy and the time, and sends one position about every three minutes.
• While tracking is on, Android shows a notification and iPhone shows a blue location indicator.
• On iPhone, motion sensors are used on the phone only, to tell if you are moving or parked. That is not sent to your employer.
• Your employer can see where clocked-in drivers are and review the route of earlier shifts.

The full details are in the Telematics & GPS Policy.''',
  ),
  PolicyPage(
    document: LegalDocument.privacyNotice,
    title: 'How your employer may use it',
    body: '''Your employer's office staff can use the app's data to:
• see where clocked-in drivers are and review the route of a shift;
• dispatch and confirm loads and deliveries;
• check vehicle safety checks and defects;
• review and approve fuel, AdBlue and parking claims;
• get alerts if a vehicle is idle for longer than their limit, if your phone has stopped sending location while you are clocked in, or if you press SOS; and
• work out hours, pay and the cost of running vehicles.

Pay-related settings: your employer can switch on settings that deduct idle time or time without GPS from your paid hours, or end your shift automatically after a loss of GPS signal. These are off unless your employer turns them on, and your employer should tell you which apply. A fuel or parking claim that is not reviewed within 10 hours is approved automatically.

People make the decisions. Tachyo does not decide to discipline, dismiss or pay you. Alerts and flags only point your employer to something to look at; they are not proof that you did anything wrong. If an automatic calculation affects your pay or your job, you can ask your employer to have a person review it, explain it, and listen to your side.

SOS tells your employer's dispatch where you are. It does not call the emergency services. In an emergency call 999.''',
  ),
  PolicyPage(
    document: LegalDocument.privacyNotice,
    title: 'Who sees it and how long it is kept',
    body: '''Who can see it:
• Your employer's authorised staff, through the Tachyo admin dashboard.
• Tachyo staff do not look at your data as a matter of routine. They may access it to give your employer support, to keep the service working and secure, or where the law requires it, and are bound by confidentiality.
• Tachyo's service providers that host and run the service. Your data is stored in the UK.
• Mapping services receive your device's IP address and the map area when a map is shown.
• Authorities such as DVSA, the police or a court, only through your employer or where the law requires.
We do not sell your data or use it for advertising.

How long it is kept: your employer decides how long it keeps each kind of record. Your employer may have to keep some records for legal reasons: vehicle safety and defect records for at least 15 months, working-time records for two years, and pay records generally for six years.

Photographs you upload (defect and walkaround photographs, delivery proofs and receipts) can form part of those records. They are kept in restricted private storage for 24 months from the day they were uploaded, even if your account is deleted, and are then deleted.''',
  ),
  PolicyPage(
    document: LegalDocument.privacyNotice,
    title: 'Your rights',
    body: '''You have the right to ask to see your data, have it corrected, have it deleted in some situations, restrict or object to how it is used, and receive a copy in a portable form. You also have rights in relation to decisions made by automated means.

• How to ask: ask your employer, who is responsible for answering within one month. If you contact Tachyo instead, we will pass your request to your employer's administrator within three business days and tell you we have.
• Deleting your account: use "Request Account Deletion" in Settings or on the sign-in screen. Your employer's administrator confirms the request.
• Complaints: you can complain to the Information Commissioner's Office at ico.org.uk or on 0303 123 1113. You can raise a concern with your employer first.

The full notice is on the website: tachyo.co.uk/legal/driver-privacy''',
  ),

  // ── App Terms of Use ──────────────────────────────────────
  PolicyPage(
    document: LegalDocument.appTermsOfUse,
    title: 'About these terms',
    body: '''These terms are between you, the driver using the Tachyo Driver app, and Tachyo. They cover your use of the app only. They are not an employment or engagement contract: your work, pay and terms are agreed between you and your employer, and Tachyo is not part of that.

Your employer (or the company you drive for) is Tachyo's customer and has given you access. By using the app you accept these terms.

We give you a personal, non-exclusive, non-transferable, revocable licence to use the app on your phone for your work for your employer, while your employer keeps your account active. You must not copy, modify, reverse-engineer, resell or share the app, or use it for anything other than that work.''',
  ),
  PolicyPage(
    document: LegalDocument.appTermsOfUse,
    title: 'Your account',
    body: '''• Your account is for you only. Keep your PIN confidential and do not let anyone else use your account or phone while you are signed in. Activity under your account, including clock-in and clock-out times, is treated as done by you.
• Choose a PIN that is hard to guess, and tell your employer straight away if you think someone else knows it.
• Your employer controls your account and can deactivate it at any time.
• The app needs the phone permissions described in the Telematics & GPS Policy. If you turn them off, features such as clocking in may not work. That does not change what you owe your employer, which is a matter between you and them.''',
  ),
  PolicyPage(
    document: LegalDocument.appTermsOfUse,
    title: 'Road safety and honest records',
    body: '''Do not hold or use your phone, or this app, while driving. Clock in or out, complete checks, photograph receipts and handle loads only when the vehicle is safely stopped and it is legal to do so. Nothing in the app asks you to take a risk.

The app is not a navigation, tachograph or emergency system. Hours counters are estimates; the tachograph and driver card are the legal record. The SOS button alerts your employer's dispatch team only. In an emergency, call 999.

Use the app honestly. Do not falsify clock-in and clock-out times, locations, walkaround checks, receipts, delivery proofs or signatures, and do not use mock-location or GPS-spoofing tools or tamper with the app. The app rejects locations the phone reports as simulated. What your employer does about a breach is a matter between you and them.''',
  ),
  PolicyPage(
    document: LegalDocument.appTermsOfUse,
    title: 'Availability and liability',
    body: '''We provide the app as it is and will use reasonable care to keep it working, but we do not promise it will always be available or error-free, for example because of your phone, your signal or planned maintenance. For help, contact your employer first, or support@tachyo.co.uk.

Nothing in these terms limits or excludes our liability for death or personal injury caused by our negligence, for fraud, or for anything else that cannot be limited by law. Otherwise, to the extent the law allows, we are not liable to you for losses caused by your phone or network, by events outside our control, or by decisions your employer makes (for example about pay, shifts or discipline). We are not liable for indirect or consequential loss.

Your licence ends when your employer deactivates your account or ends its agreement with us, or if you breach these terms. You can stop using the app at any time and ask for your account to be deleted.''',
  ),
  PolicyPage(
    document: LegalDocument.appTermsOfUse,
    title: 'Apple, Google and general',
    body: '''These terms are between you and Tachyo only, not with Apple Inc. or Google LLC (the "Stores"). Tachyo, not the Stores, is responsible for the app and its content, and for any claims about it. The Stores have no obligation to provide maintenance or support. You must also comply with the terms of your phone's platform and Store, and you confirm you are not in a country subject to a government embargo or listed as a restricted party. If you downloaded the app from the Apple App Store, Apple and its subsidiaries are third-party beneficiaries of these terms and may enforce them against you.

We may update these terms and will tell you in the app. These terms are governed by the law of England and Wales; you may also bring a claim in the courts of the part of the UK where you live, and you keep any rights the law gives you that cannot be excluded.

The full terms are on the website: tachyo.co.uk/legal/driver-terms''',
  ),

  // ── Telematics & GPS Policy ───────────────────────────────
  PolicyPage(
    document: LegalDocument.telematicsPolicy,
    title: 'Permissions the app needs',
    body: '''• Location: to record your route during a shift the app needs location permission, including background location so it keeps working while the screen is off or another app is in front. On Android this includes a location foreground service (with a persistent notification while a shift is active), permission to run while the screen is off, a request to be excluded from battery optimisation, and permission to restart tracking after the phone restarts. On iPhone, location access is set to "While Using" or "Always", with background location, and iOS shows its blue location indicator.
• Camera and photos: used only when you choose to take or attach a photograph.
• Notifications: used for reminders and notices from the app. They are generated on your phone; the app does not use a third-party push-notification service.
• Motion sensors (iPhone): used on the phone itself to tell whether the vehicle is moving or parked. Not sent to us or your employer.

Your phone's operating system, not the app, controls the location hardware and the permission prompts. You can withdraw a permission in your phone's settings at any time, but the app may then be unable to record a shift.''',
  ),
  PolicyPage(
    document: LegalDocument.telematicsPolicy,
    title: 'When location is collected',
    body: '''• Location tracking starts when you clock in and stops when you clock out. The app does not track your location before you clock in or after you clock out.
• The app records latitude, longitude, speed, accuracy and the time. It keeps the phone's location running during the shift so that it works reliably in the background, but sends one position to the server about every three minutes. The phone may also record a position at the moment you submit a receipt, a delivery photo or a signature.
• If your phone restarts or the app is closed during a shift, the app tries to resume tracking so the shift is not lost. Tracking stops for good when you clock out.
• While tracking is on, Android shows a notification and iPhone shows a blue location indicator, so you can always tell tracking is on.
• The app compares the phone's position with the depot locations your employer has set up, for example to show whether you are within range of a depot when you clock in.
• Every position the app records belongs to a shift. The live map shows drivers who are currently clocked in, and your employer's administrators can look back at the route of earlier shifts until that data is deleted.''',
  ),
  PolicyPage(
    document: LegalDocument.telematicsPolicy,
    title: 'Accuracy and limits',
    body: '''Accuracy, continuity and timeliness of location depend on things outside our control: signal blockage in tunnels, underground or covered loading bays and built-up areas; phone battery-saving features; mobile signal and data; the phone and its settings; and the phone being switched off, out of battery, or the app being force-closed.

Because positions are sent about every three minutes, a route drawn from them is an approximation. It does not show exact paths, stops or speed between points.

Any driving-time or working-time counter in the app is an estimate. The digital tachograph and driver card are the legal record; if they differ, they take precedence. Tachyo is not responsible for a drivers' hours infringement caused by an inaccurate estimate, a lost position or a flat battery.

An employer must not rely on location or sensor data alone to decide pay or discipline.''',
  ),
  PolicyPage(
    document: LegalDocument.telematicsPolicy,
    title: 'What employers can do',
    body: '''Depending on the employer's plan and settings, administrators can use location and shift data to see clocked-in drivers on a live map and review the journey history of a shift; check that a delivery proof, signature, fuel receipt or parking claim was submitted near where it should be; receive an alert if a vehicle has been stationary for longer than the employer's idle threshold; receive an alert if no location has arrived from a clocked-in driver for longer than the employer's threshold ("GPS offline"); and receive an SOS alert, with your location, if you press SOS.

Actions the employer can switch on: by default an idle or GPS-offline alert is only an alert. The employer can instead choose to deduct the idle or offline stretch from paid hours, and, for GPS-offline events, to end the shift automatically at the last received position after a set time. The app can tell you when this happens, if the employer leaves that notice on. Ask your employer which settings apply to you.

These actions follow rules the employer chose; Tachyo does not decide to discipline or pay anyone.

SOS notifies your employer's dispatch team and sends your location. It does not call the emergency services. In an emergency, call 999.''',
  ),
  PolicyPage(
    document: LegalDocument.telematicsPolicy,
    title: 'Camera, photos and your controls',
    body: '''The camera opens only when you tap to take a photograph for a walkaround defect, fuel or AdBlue receipt, dashboard reading, parking receipt or proof of delivery. The app has no background access to the camera, does not record video or audio, and does not use facial recognition.

With a photo the app stores the photograph, the time and, for receipts, deliveries and signatures, the phone's location at that moment. Photographs are kept in private storage that only you and your employer's authorised users can open. You type in the litres, cost, vendor and odometer reading for a fuel or AdBlue receipt; the app does not currently read figures from the photograph automatically. A claim your employer has not reviewed within 10 hours is approved automatically. Where a recipient signs on your phone, the app records their first name, last name and drawn signature.

Do not share your PIN, do not use mock-location or GPS-spoofing tools, and do not tamper with the app.

Your controls: clock out to stop tracking; withdraw location permission in your phone settings (the app may warn you, may be unable to start or continue a shift, and your employer may see that tracking stopped); ask your employer to see, correct or delete your data; ask the app to delete your account; and complain to the Information Commissioner's Office (ico.org.uk).

The full policy is on the website: tachyo.co.uk/legal/telematics''',
  ),
];

class LegalComplianceScreen extends StatefulWidget {
  /// Which document to open. Defaults to the Privacy Notice so the
  /// existing pre-login "Terms & Conditions and Privacy Policy" link
  /// (which doesn't specify one) keeps behaving exactly as before.
  final LegalDocument document;

  const LegalComplianceScreen({super.key, this.document = LegalDocument.privacyNotice});

  @override
  State<LegalComplianceScreen> createState() => _LegalComplianceScreenState();
}

class _LegalComplianceScreenState extends State<LegalComplianceScreen> {
  final PageController _pageController = PageController();
  int _currentPage = 0;

  /// Only this document's pages — swiping past the last one simply stops
  /// there, rather than silently continuing into a different document.
  late final List<PolicyPage> _pages =
      policyPages.where((p) => p.document == widget.document).toList();

  int get _pageCount => _pages.length;

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }

  void _goToPage(int index) {
    if (index < 0 || index >= _pageCount) return;
    _pageController.animateToPage(
      index,
      duration: const Duration(milliseconds: 280),
      curve: Curves.easeOutCubic,
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        centerTitle: true,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new_rounded, size: 18, color: Color(0xFF1C1C1E)),
          onPressed: () => Navigator.pop(context),
        ),
        title: Text(
          widget.document.label,
          style: const TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.w700,
            color: Color(0xFF1C1C1E),
          ),
        ),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(1),
          child: Container(height: 1, color: const Color(0xFFE5E5EA)),
        ),
      ),
      body: SafeArea(
        child: Column(
          children: [
            // ── Page counter ─────────────────────────────────
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 10),
              child: Text(
                'PAGE ${_currentPage + 1} OF $_pageCount',
                style: const TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 0.8,
                  color: Color(0xFF8E8E93),
                ),
              ),
            ),

            // ── Dot page indicator — tap a dot to jump straight to that
            // page, or just swipe left/right through the document. No
            // Previous/Next button bar.
            if (_pageCount > 1)
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
                child: Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: List.generate(_pageCount, (i) {
                    final isActive = i == _currentPage;
                    return GestureDetector(
                      onTap: () => _goToPage(i),
                      child: Padding(
                        padding: const EdgeInsets.all(4),
                        child: AnimatedContainer(
                          duration: const Duration(milliseconds: 200),
                          width: isActive ? 9 : 7,
                          height: isActive ? 9 : 7,
                          decoration: BoxDecoration(
                            color: isActive ? const Color(0xFF8E8E93) : const Color(0xFFD1D1D6),
                            shape: BoxShape.circle,
                          ),
                        ),
                      ),
                    );
                  }),
                ),
              ),

            const Divider(height: 1, color: Color(0xFFE5E5EA)),

            // ── Full document on the website ────────────────────
            Align(
              alignment: Alignment.centerRight,
              child: TextButton.icon(
                onPressed: () => launchUrl(Uri.parse(widget.document.url), mode: LaunchMode.externalApplication),
                icon: const Icon(Icons.open_in_new_rounded, size: 14, color: Color(0xFFCC0000)),
                label: const Text(
                  'Read the full document online',
                  style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: Color(0xFFCC0000)),
                ),
              ),
            ),

            // ── Paginated document content ─────────────────────
            Expanded(
              child: PageView.builder(
                controller: _pageController,
                itemCount: _pageCount,
                onPageChanged: (index) => setState(() => _currentPage = index),
                itemBuilder: (context, index) {
                  final page = _pages[index];
                  return SingleChildScrollView(
                    padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          page.title,
                          style: const TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.w900,
                            letterSpacing: -0.2,
                            color: Color(0xFF1C1C1E),
                          ),
                        ),
                        const SizedBox(height: 16),
                        Text(
                          page.body,
                          style: const TextStyle(
                            fontSize: 13,
                            height: 1.55,
                            color: Color(0xFF3A3A3C),
                          ),
                        ),
                      ],
                    ),
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}
