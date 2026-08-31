import 'package:flutter/material.dart';

/// One page of the Privacy Policy / Terms of Use document.
///
/// This is the only place new policy content needs to go: add one
/// [PolicyPage] per page of the document and it appears automatically,
/// with pagination, in the screen below. Nothing else in this file needs
/// to change when the real policy text is dropped in.
class PolicyPage {
  final String title;
  final String body;

  const PolicyPage({required this.title, required this.body});
}

/// Placeholder content — awaiting the real Privacy Policy & Terms of Use
/// document (title, effective date, section numbers, and body text are all
/// still to be supplied). Replace this list with one [PolicyPage] per page
/// once the final document is provided; everything else on this screen
/// (navigation, pagination, page counter) already works and needs no changes.
const List<PolicyPage> _policyPages = [
  PolicyPage(
    title: 'Document Pending',
    body: 'The Privacy Policy and Terms of Use are being finalised and will '
        'appear here once published.',
  ),
];

class LegalComplianceScreen extends StatefulWidget {
  const LegalComplianceScreen({super.key});

  @override
  State<LegalComplianceScreen> createState() => _LegalComplianceScreenState();
}

class _LegalComplianceScreenState extends State<LegalComplianceScreen> {
  final PageController _pageController = PageController();
  int _currentPage = 0;

  int get _pageCount => _policyPages.length;

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
        title: const Text(
          'Legal & Compliance',
          style: TextStyle(
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
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 4),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    'PAGE ${_currentPage + 1} OF $_pageCount',
                    style: const TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 0.8,
                      color: Color(0xFF8E8E93),
                    ),
                  ),
                  if (_pageCount > 1)
                    Row(
                      mainAxisSize: MainAxisSize.min,
                      children: List.generate(_pageCount, (i) {
                        final isActive = i == _currentPage;
                        return AnimatedContainer(
                          duration: const Duration(milliseconds: 200),
                          margin: const EdgeInsets.only(left: 4),
                          width: isActive ? 16 : 6,
                          height: 6,
                          decoration: BoxDecoration(
                            color: isActive ? const Color(0xFFCC0000) : const Color(0xFFE5E5EA),
                            borderRadius: BorderRadius.circular(3),
                          ),
                        );
                      }),
                    ),
                ],
              ),
            ),

            // ── Paginated policy content ─────────────────────
            Expanded(
              child: PageView.builder(
                controller: _pageController,
                itemCount: _pageCount,
                onPageChanged: (index) => setState(() => _currentPage = index),
                itemBuilder: (context, index) {
                  final page = _policyPages[index];
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

            // ── Prev / Next controls ──────────────────────────
            if (_pageCount > 1)
              Container(
                padding: const EdgeInsets.fromLTRB(20, 12, 20, 16),
                decoration: const BoxDecoration(
                  border: Border(top: BorderSide(color: Color(0xFFE5E5EA), width: 1)),
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: _currentPage > 0 ? () => _goToPage(_currentPage - 1) : null,
                        icon: const Icon(Icons.arrow_back_ios_new_rounded, size: 14),
                        label: const Text('PREVIOUS'),
                        style: OutlinedButton.styleFrom(
                          foregroundColor: const Color(0xFF1C1C1E),
                          side: const BorderSide(color: Color(0xFFBBBBBB)),
                          padding: const EdgeInsets.symmetric(vertical: 12),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                          textStyle: const TextStyle(fontSize: 12, fontWeight: FontWeight.w800, letterSpacing: 0.4),
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: ElevatedButton.icon(
                        onPressed: _currentPage < _pageCount - 1 ? () => _goToPage(_currentPage + 1) : null,
                        icon: const Icon(Icons.arrow_forward_ios_rounded, size: 14),
                        label: const Text('NEXT'),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFFCC0000),
                          foregroundColor: Colors.white,
                          disabledBackgroundColor: const Color(0xFFE0A0A0),
                          disabledForegroundColor: Colors.white.withValues(alpha: 0.85),
                          elevation: 0,
                          padding: const EdgeInsets.symmetric(vertical: 12),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                          textStyle: const TextStyle(fontSize: 12, fontWeight: FontWeight.w800, letterSpacing: 0.4),
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
