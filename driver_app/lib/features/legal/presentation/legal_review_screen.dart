import 'package:flutter/material.dart';
import 'legal_compliance_screen.dart';

/// Consolidated legal review for the login/onboarding screen — a single
/// continuous vertical scroll through every document in [policyPages]
/// (Master SaaS Terms, Privacy Notice, DPA, Telematics Policy), each
/// under its own sticky section header. Deliberately not the paginated
/// swipe-through-one-document-at-a-time LegalComplianceScreen used by
/// Settings → Legal & Compliance — that one stays for a driver revisiting
/// a single policy later; this one is for reading through everything
/// once, top-to-bottom.
///
/// No forced "scroll to the bottom to continue" gate and no bottom
/// sticky action bar — closing or accepting is a plain header button,
/// available immediately. A driver who already knows the terms
/// shouldn't have to scroll past four documents to get back to login.
///
/// Reuses the exact same real legal text as LegalComplianceScreen (via
/// the shared `policyPages` list) rather than duplicating it — nothing
/// here is separately-maintained copy that could drift out of sync.
///
/// A spec that asked for this screen named 5 documents, including a
/// standalone "Commercial Refund & Data Purge Policy". The real legal
/// text only has 4 documents; the refund/data-purge terms already live
/// inside sections of the Master SaaS Terms and the DPA (both have their
/// own "Termination & Data Purge" clauses) rather than as a separate
/// instrument, so this screen presents the 4 real documents rather than
/// inventing a 5th one with fabricated legal text.
class LegalReviewScreen extends StatelessWidget {
  const LegalReviewScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final bg = isDark ? const Color(0xFF0F172A) : Colors.white;
    final headerBg = isDark ? const Color(0xFF1E293B) : const Color(0xFFF8FAFC);
    final titleColor = isDark ? Colors.white : const Color(0xFF1C1C1E);
    final bodyColor = isDark ? Colors.white70 : const Color(0xFF3A3A3C);
    final subtleColor = isDark ? Colors.white60 : const Color(0xFF8E8E93);
    final dividerColor = isDark ? const Color(0xFF1E293B) : const Color(0xFFF1F5F9);

    return Scaffold(
      backgroundColor: bg,
      appBar: AppBar(
        backgroundColor: bg,
        elevation: 0,
        centerTitle: true,
        automaticallyImplyLeading: false,
        title: Text(
          'Legal Terms & Policies',
          style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: titleColor),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text(
              'Accept & Close',
              style: TextStyle(color: Color(0xFFCC0000), fontWeight: FontWeight.w800, fontSize: 13),
            ),
          ),
          IconButton(
            icon: Icon(Icons.close_rounded, size: 20, color: titleColor),
            tooltip: 'Close',
            onPressed: () => Navigator.pop(context, false),
          ),
        ],
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(1),
          child: Container(height: 1, color: dividerColor),
        ),
      ),
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 12, 20, 4),
              child: Text(
                'Every policy that governs your use of the Tachyo driver app, in one continuous scroll.',
                style: TextStyle(fontSize: 12, height: 1.4, color: subtleColor),
              ),
            ),
            Expanded(
              child: CustomScrollView(
                slivers: [
                  const SliverToBoxAdapter(child: SizedBox(height: 8)),
                  for (final document in LegalDocument.values) ...[
                    SliverPersistentHeader(
                      pinned: true,
                      delegate: _StickyDocumentHeader(document: document, background: headerBg, color: titleColor),
                    ),
                    SliverList(
                      delegate: SliverChildBuilderDelegate(
                        (context, index) {
                          final page = policyPages.where((p) => p.document == document).toList()[index];
                          return Padding(
                            padding: const EdgeInsets.fromLTRB(20, 16, 20, 8),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  page.title,
                                  style: TextStyle(fontSize: 14.5, fontWeight: FontWeight.w800, letterSpacing: -0.1, color: titleColor),
                                ),
                                const SizedBox(height: 8),
                                Text(
                                  page.body,
                                  style: TextStyle(fontSize: 12.5, height: 1.55, color: bodyColor),
                                ),
                              ],
                            ),
                          );
                        },
                        childCount: policyPages.where((p) => p.document == document).length,
                      ),
                    ),
                    SliverToBoxAdapter(
                      child: Container(height: 8, color: dividerColor, margin: const EdgeInsets.only(top: 8)),
                    ),
                  ],
                  SliverToBoxAdapter(
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(20, 20, 20, 32),
                      child: Text(
                        "That's every policy.",
                        textAlign: TextAlign.center,
                        style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w600, color: subtleColor),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _StickyDocumentHeader extends SliverPersistentHeaderDelegate {
  final LegalDocument document;
  final Color background;
  final Color color;

  _StickyDocumentHeader({required this.document, required this.background, required this.color});

  @override
  double get minExtent => 48;

  @override
  double get maxExtent => 48;

  @override
  Widget build(BuildContext context, double shrinkOffset, bool overlapsContent) {
    return Container(
      height: 48,
      padding: const EdgeInsets.symmetric(horizontal: 20),
      color: background,
      alignment: Alignment.centerLeft,
      child: Row(
        children: [
          Icon(document.icon, size: 16, color: const Color(0xFFCC0000)),
          const SizedBox(width: 10),
          Text(
            document.label.toUpperCase(),
            style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w900, letterSpacing: 0.6, color: color),
          ),
        ],
      ),
    );
  }

  @override
  bool shouldRebuild(covariant _StickyDocumentHeader oldDelegate) =>
      oldDelegate.document != document || oldDelegate.background != background || oldDelegate.color != color;
}
