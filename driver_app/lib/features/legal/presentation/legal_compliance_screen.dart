import 'package:flutter/material.dart';

/// The distinct legal documents available in the app. Each one gets its
/// own dedicated entry point (a button in Settings → Legal & Compliance)
/// and its own self-contained screen — a user reading one document never
/// silently scrolls into a different one.
enum LegalDocument { privacyNotice, contractForServices }

extension LegalDocumentLabel on LegalDocument {
  /// Short label used on the Settings button and in the AppBar.
  String get label => switch (this) {
        LegalDocument.privacyNotice => 'Privacy Policy',
        LegalDocument.contractForServices => 'Contract for Services',
      };

  IconData get icon => switch (this) {
        LegalDocument.privacyNotice => Icons.privacy_tip_outlined,
        LegalDocument.contractForServices => Icons.description_outlined,
      };
}

/// One page belonging to a single [document]. To add a page to an
/// existing document, insert a [PolicyPage] among the others that share
/// its [document] value — order is preserved. To add a whole new
/// document: add a case to [LegalDocument] above, give it a label/icon,
/// add its pages here, and add one button for it in Settings → Legal &
/// Compliance (main_layout.dart). Nothing else needs to change.
class PolicyPage {
  final LegalDocument document;
  final String title;
  final String body;

  const PolicyPage({required this.document, required this.title, required this.body});
}

/// L.N Haulage legal documents.
const List<PolicyPage> _policyPages = [
  // ── L.N Haulage — App Privacy Notice (last updated 01 September 2026) ──
  PolicyPage(
    document: LegalDocument.privacyNotice,
    title: 'L.N Haulage — App Privacy Notice',
    body: '''Last Updated: 01 September 2026

1. INTRODUCTION & STATUS OF THE PARTIES

This Privacy Notice explains how L.N Haulage ("the Company", "we", "us", or "our") collects, uses, and protects personal data when you use our logistics mobile application ("the App").

This App is strictly designed for use by independent contractors, self-employed individuals, or representatives of Limited (LTD) companies ("Contractor", "you") providing transport and logistics services to the Company under a separate Contract for Services. You are not an employee of the Company, and nothing in this App or this Privacy Notice implies an employment or worker relationship.''',
  ),
  PolicyPage(
    document: LegalDocument.privacyNotice,
    title: '2. Data Controller',
    body: '''For the purposes of the UK General Data Protection Regulation (UK GDPR) and the Data Protection Act 2018, the Data Controller is:

• Company Name: L.N Haulage

• Registered Office: Bankwood Lane, Rossington, Doncaster, United Kingdom

• Contact Email: lnhaluage@gmail.com''',
  ),
  PolicyPage(
    document: LegalDocument.privacyNotice,
    title: '3. The Data We Collect About You',
    body: '''To ensure the proper functioning of the App and to facilitate the logistics services you provide, we collect and process the following categories of data:

• Identity & Account Data: Full name, login credentials, and internal identification numbers. Initial passwords are created and provided by our Accounting/Logistics departments.

• Location Data (GPS): Real-time geographic location data. The App transmits a GPS signal to our servers at intervals of 2 to 10 minutes exclusively while you are logged into the App. The App will not function if location permissions are disabled. The App also registers timestamps and statuses when the device goes out of network coverage.

• Time & Activity Data: Timestamps of when you "Clock In" and "Clock Out". The App actively monitors physical inactivity and generates an automated alert to the Company if the device remains stationary for 50 consecutive minutes during an active session.

• Device & Technical Data (BYOD): Device status, IP address, and basic diagnostics necessary for the App to function securely on your personal device.''',
  ),
  PolicyPage(
    document: LegalDocument.privacyNotice,
    title: '4. Purposes and Lawful Basis for Processing',
    body: '''We process the data listed above based on the following legal grounds under UK GDPR:

• Performance of a Contract (Article 6(1)(b)): Processing Time & Activity Data to calculate fees owed to you and to verify the logistics services rendered.

• Legitimate Interests (Article 6(1)(f)): Processing Location Data (GPS) and Inactivity Alerts is strictly necessary for our legitimate business interests, which include: ensuring cargo safety, optimizing routing, providing delivery estimates, and preventing fraud.''',
  ),
  PolicyPage(
    document: LegalDocument.privacyNotice,
    title: '5. Data Retention and Storage',
    body: '''• Storage Location: All data collected through the App is encrypted and securely stored on Supabase cloud servers located in West-Europe (London, UK). This ensures full compliance with UK data sovereignty laws.

• Retention Period: We retain your GPS and Time & Activity Data for a strict maximum period of 6 months from the date of collection. After this period, the data is automatically and permanently deleted or fully anonymized, unless a longer retention period is required to resolve an ongoing legal dispute or payment query.''',
  ),
  PolicyPage(
    document: LegalDocument.privacyNotice,
    title: '6. Data Security and BYOD Policy',
    body: '''• Internal Access Only: Your data is strictly confidential. It is not shared with any third parties. Access is restricted exclusively to authorized internal personnel within the L.N Haulage Logistics and Accounting departments on a "need-to-know" basis.

• Your Device (BYOD): As an independent contractor, you use your personal mobile phone to access the App. You are solely responsible for securing your device (e.g., using PIN codes, biometric locks) against unauthorized access. L.N Haulage accepts no liability for any data breaches, losses, or damages resulting from your personal device being lost, stolen, or compromised.

• Account Security: You are responsible for keeping your App login credentials confidential. Any activity logged under your account (including "Clock In/Out" times) will be treated as performed by you.''',
  ),
  PolicyPage(
    document: LegalDocument.privacyNotice,
    title: '7. Your Legal Rights',
    body: '''Under the UK GDPR, you have rights including:

• The right to access: You can request copies of your personal data held by us.

• The right to rectification: You can request that we correct any information you believe is inaccurate (e.g., requesting a correction to a "Clock Out" time if the App failed due to network loss).

• The right to object: You can object to processing based on legitimate interests; however, given the nature of the transport contract, this may result in the termination of the Contract for Services, as the App cannot function without this data.''',
  ),

  // ── Contract for Services: Logistics and App Usage Terms (Part 1) ──
  PolicyPage(
    document: LegalDocument.contractForServices,
    title: 'Contract for Services: Logistics and App Usage Terms (Part 1)',
    body: '''Between: L.N Haulage ("The Client") and [Contractor Name/LTD Company] ("The Contractor")

1. STATUS OF THE CONTRACTOR

1.1. The Contractor is engaged as an independent business entity (self-employed or LTD company) to provide logistics and transport services to L.N Haulage.

1.2. Nothing in this Agreement shall create an employer-employee relationship, worker status, partnership, or joint venture between the parties. The Contractor is solely responsible for their own tax and National Insurance contributions (HMRC compliance).''',
  ),
  PolicyPage(
    document: LegalDocument.contractForServices,
    title: '2. Mandatory Use of the L.N Haulage App',
    body: '''2.1. The provision of logistics services requires the mandatory use of the L.N Haulage mobile application ("the App").

2.2. The Contractor agrees to provide their own mobile device (BYOD) and maintain an active mobile data connection at their own expense.

2.3. The Contractor must ensure that Location Services (GPS) are enabled at all times while logged into the App. Failure to allow GPS tracking or intentionally disabling the App during a transport assignment will be deemed a material breach of this Agreement and may result in immediate termination of services or withholding of service fees for unverified routes.''',
  ),
  PolicyPage(
    document: LegalDocument.contractForServices,
    title: '3. Invoicing, Time Logging, and the 50-Minute Inactivity Rule',
    body: '''3.1. The Contractor is responsible for accurately recording their service hours using the "Clock In" and "Clock Out" functions within the App.

3.2. While routine breaks during transit are accounted for in the agreed service fees, the App continuously monitors vehicle movement for logistical efficiency and cargo security.

3.3. Inactivity Alert: If the App registers that the Contractor's device has remained strictly stationary for 50 consecutive minutes during an active session ("Clocked In"), an automated alert is sent to L.N Haulage Administration.

3.4. Fee Adjustments: Upon receiving an Inactivity Alert, the Client's logistics/accounting department reserves the right to review the Contractor's time logs. If the 50-minute inactivity period is deemed unauthorized or unjustified (e.g., not related to traffic, loading delays, or mandated legal driving breaks), the Client retains the right to manually modify the logged hours and adjust the final payment/invoice accordingly.

3.5. Dispute Mechanism: If the Contractor's logged time is adjusted by the Client, the Contractor will be notified. The Contractor has 48 hours to provide a valid operational reason (e.g., breakdown, accident, road closure) to reinstate the deducted time.''',
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
      _policyPages.where((p) => p.document == widget.document).toList();

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

            // ── Numbered page selector — tap any number to jump straight
            // to that page. Swipe also works; there is no Previous/Next
            // button bar.
            if (_pageCount > 1)
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
                child: Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: List.generate(_pageCount, (i) {
                    final isActive = i == _currentPage;
                    return GestureDetector(
                      onTap: () => _goToPage(i),
                      child: AnimatedContainer(
                        duration: const Duration(milliseconds: 200),
                        width: 30,
                        height: 30,
                        alignment: Alignment.center,
                        decoration: BoxDecoration(
                          color: isActive ? const Color(0xFFCC0000) : const Color(0xFFF2F2F6),
                          shape: BoxShape.circle,
                          border: isActive ? null : Border.all(color: const Color(0xFFE5E5EA)),
                        ),
                        child: Text(
                          '${i + 1}',
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w800,
                            color: isActive ? Colors.white : const Color(0xFF6C6C70),
                          ),
                        ),
                      ),
                    );
                  }),
                ),
              ),

            const Divider(height: 1, color: Color(0xFFE5E5EA)),

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
