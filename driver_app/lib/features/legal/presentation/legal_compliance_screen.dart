import 'package:flutter/material.dart';

/// The distinct legal documents available in the app. Each one gets its
/// own dedicated entry point (a button in Settings → Legal & Compliance)
/// and its own self-contained screen — a user reading one document never
/// silently scrolls into a different one.
///
/// DRAFT CONTENT — not yet reviewed by a solicitor. See legal/*.md at the
/// repo root for the canonical versions and the caveats that apply to
/// all of them. Tachyo is a SaaS platform: the driver's employer is the
/// controller of their data (decides what's tracked and why); Tachyo is
/// the processor that builds and runs the app on the employer's
/// instructions. `appTermsOfUse` is deliberately NOT an employment or
/// engagement contract — that stays entirely between the driver and
/// their employer, outside this app.
enum LegalDocument { privacyNotice, appTermsOfUse }

extension LegalDocumentLabel on LegalDocument {
  /// Short label used on the Settings button and in the AppBar.
  String get label => switch (this) {
        LegalDocument.privacyNotice => 'Privacy Policy',
        LegalDocument.appTermsOfUse => 'App Terms of Use',
      };

  IconData get icon => switch (this) {
        LegalDocument.privacyNotice => Icons.privacy_tip_outlined,
        LegalDocument.appTermsOfUse => Icons.description_outlined,
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

/// Tachyo driver-facing legal documents.
const List<PolicyPage> _policyPages = [
  // ── Driver Privacy Notice ──
  PolicyPage(
    document: LegalDocument.privacyNotice,
    title: 'Driver Privacy Notice',
    body: '''Last Updated: [INSERT DATE ON PUBLICATION]

WHO'S RESPONSIBLE FOR YOUR DATA

You're using this app because the company you drive for ("your employer") uses Tachyo to run dispatch and payroll. Your employer decides what's tracked and why — Tachyo just builds and operates the app on their instructions. In data protection terms, your employer is the "controller" of your data, and Tachyo is a "processor".

If you have a question about how your data is used, your first point of contact should be your employer. Tachyo will help them answer it.''',
  ),
  PolicyPage(
    document: LegalDocument.privacyNotice,
    title: 'What This App Collects',
    body: '''• Your name, driver ID, and phone number, as entered by your employer.

• A PIN you set to log in. Tachyo stores this as a scrambled (hashed) value it can't reverse — nobody at Tachyo can see your actual PIN.

• Your location, while you're clocked in on an active shift — used to show your employer's dispatch team where you are, confirm you're at the right depot, and calculate your shift accurately.

• Clock in/out times.

• An automatic alert if your device stays completely still for 50 minutes while you're clocked in (this helps flag things like breakdowns or unplanned long stops), or if you raise an SOS alert.

Location tracking only happens while you are clocked in on a shift — not before you clock in or after you clock out.''',
  ),
  PolicyPage(
    document: LegalDocument.privacyNotice,
    title: 'How Long It\'s Kept',
    body: '''Your location and shift history is kept for 12 months, mainly so that if there's ever a dispute about a shift's pay, or your employer wants to review performance over time, the record is still available. After 12 months it's deleted or anonymised, unless it's still needed for an active dispute.''',
  ),
  PolicyPage(
    document: LegalDocument.privacyNotice,
    title: 'Who Can See It',
    body: '''Your employer's dispatch and payroll staff, through the admin dashboard. Tachyo staff do not routinely access your data, and only do so to provide technical support, under the same confidentiality obligations as your employer's own staff.''',
  ),
  PolicyPage(
    document: LegalDocument.privacyNotice,
    title: 'Your Rights',
    body: '''You can ask to see, correct, or ask about deleting your data — start with your employer, since they control it. You also have the right to complain to the UK Information Commissioner's Office (ico.org.uk).

Questions about the app itself: [INSERT contact email]''',
  ),

  // ── App Terms of Use ──
  PolicyPage(
    document: LegalDocument.appTermsOfUse,
    title: 'Driver App — Terms of Use (Part 1)',
    body: '''Last Updated: [INSERT DATE ON PUBLICATION]

These Terms of Use are between you (the driver using this app) and Tachyo, and cover your use of the Tachyo Driver App itself. They are not, and are not intended to be, an employment or engagement contract — your working relationship, pay, and terms of engagement are agreed entirely between you and your employer, separately from this app.

USING THE APP

• You're given access to this app by your employer, and your account should only be used by you.

• Keep your PIN confidential. Activity logged under your account (including clock in/out times) is treated as carried out by you.

• Use the app honestly — don't try to falsify clock in/out times, location, or other records.

• The app requires location access to function while you're clocked in; if you disable it, features like clock-in and live dispatch tracking won't work. This doesn't change your obligations to your employer, which are set separately between you and them.''',
  ),
  PolicyPage(
    document: LegalDocument.appTermsOfUse,
    title: 'Driver App — Terms of Use (Part 2)',
    body: '''WHAT TACHYO PROVIDES

Tachyo provides the app "as is" and will use reasonable efforts to keep it working, but doesn't guarantee it will always be available or error-free (for example, due to your own network connectivity, device issues, or planned maintenance).

YOUR DATA

See the separate Driver Privacy Notice in this app for how your data is collected and used.

LIABILITY

To the extent permitted by law, Tachyo is not liable for losses arising from your use of your own personal device, network connectivity issues outside Tachyo's control, or decisions your employer makes using data from the app. Nothing here limits liability for death or personal injury caused by negligence, fraud, or anything else that can't lawfully be limited.

CHANGES AND CONTACT

We may update these Terms of Use from time to time; continued use of the app after an update means you accept the change. Questions: [INSERT contact email]''',
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
