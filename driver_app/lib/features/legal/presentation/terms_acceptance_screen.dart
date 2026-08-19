import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../auth/presentation/auth_provider.dart';

class TermsAcceptanceScreen extends ConsumerStatefulWidget {
  const TermsAcceptanceScreen({super.key});

  @override
  ConsumerState<TermsAcceptanceScreen> createState() => _TermsAcceptanceScreenState();
}

class _TermsAcceptanceScreenState extends ConsumerState<TermsAcceptanceScreen> {
  bool _isSubmitting = false;
  String? _errorMessage;

  Future<void> _handleAccept() async {
    setState(() {
      _isSubmitting = true;
      _errorMessage = null;
    });

    final res = await ref.read(authProvider.notifier).acceptTerms();

    if (!mounted) return;

    if (res['success'] == true) {
      context.goNamed('home');
    } else {
      setState(() {
        _isSubmitting = false;
        _errorMessage = res['error'] ?? 'Error saving acceptance. Please check connection.';
      });
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(_errorMessage!),
          backgroundColor: const Color(0xFFCC0000),
          behavior: SnackBarBehavior.floating,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      child: Scaffold(
        backgroundColor: Colors.white,
        appBar: AppBar(
          backgroundColor: Colors.white,
          elevation: 0,
          automaticallyImplyLeading: false,
          centerTitle: true,
          title: Image.asset(
            'assets/images/abtso_logo_transparent.png',
            height: 28,
            fit: BoxFit.contain,
          ),
          bottom: PreferredSize(
            preferredSize: const Size.fromHeight(1),
            child: Container(height: 1, color: const Color(0xFFE5E5EA)),
          ),
        ),
        body: SafeArea(
          child: Column(
            children: [
              // Scrollable Legal Content
              Expanded(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 20),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'MANDATORY DRIVER COMPLIANCE',
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w900,
                          letterSpacing: 1.2,
                          color: Color(0xFFCC0000),
                        ),
                      ),
                      const SizedBox(height: 6),
                      const Text(
                        'PRIVACY POLICY & TERMS OF USE',
                        style: TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.w900,
                          letterSpacing: -0.3,
                          color: Color(0xFF1C1C1E),
                        ),
                      ),
                      const SizedBox(height: 4),
                      const Text(
                        'Effective Date: August 19, 2026',
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          color: Color(0xFF8E8E93),
                        ),
                      ),
                      const SizedBox(height: 20),
                      _buildLegalSection(
                        title: '1. Data Protection and Privacy',
                        content:
                            'In accordance with the UK General Data Protection Regulation (UK GDPR) and the Data Protection Act 2018, ABTSO Logistics acts as the Data Controller. The processing of personal data, including real-time geolocation tracking and encrypted authentication credentials, is conducted under Article 6(1)(b) (performance of a contract) and Article 6(1)(f) (legitimate interests) of the UK GDPR. GPS data is strictly processed to calculate remuneration, ensure fleet security, and manage logistics operations effectively.',
                      ),
                      const SizedBox(height: 16),
                      _buildLegalSection(
                        title: '2. Employee Monitoring and Workplace Rights',
                        content:
                            'Pursuant to the Employment Rights Act 1996 and balancing the right to privacy under Article 8 of the Human Rights Act 1998, ABTSO Logistics enforces geolocation monitoring exclusively during active shift hours. Continuous background tracking is a fundamental operational requirement for accurate payroll calculation and is terminated immediately upon the cessation of an active shift.',
                      ),
                      const SizedBox(height: 16),
                      _buildLegalSection(
                        title: '3. System Integrity and Intellectual Property',
                        content:
                            'The ABTSO Logistics mobile application constitutes proprietary software protected under the Copyright, Designs and Patents Act 1988. Any unauthorized access, manipulation of application data (including GPS spoofing), or reverse engineering constitutes a direct breach of the Computer Misuse Act 1990. Such actions will result in immediate termination of system access and potential disciplinary or legal action.',
                      ),
                      const SizedBox(height: 16),
                      _buildLegalSection(
                        title: '4. Limitation of Liability',
                        content:
                            'ABTSO Logistics accepts no liability for financial discrepancies or loss of earnings arising from the user\'s intentional disruption of application services. This includes, but is not limited to, manually revoking background location permissions, engaging severe battery optimization protocols, or force-closing the application during active duty, which fundamentally impairs the software\'s ability to record shift metrics accurately.',
                      ),
                      const SizedBox(height: 24),
                      const Center(
                        child: Text(
                          'By proceeding, you formally acknowledge that you have read, understood, and agreed to be bound by the statutory terms outlined above.',
                          textAlign: TextAlign.center,
                          style: TextStyle(
                            fontSize: 12,
                            height: 1.4,
                            fontWeight: FontWeight.w600,
                            color: Color(0xFF6C6C70),
                          ),
                        ),
                      ),
                      const SizedBox(height: 12),
                    ],
                  ),
                ),
              ),

              // Bottom Fixed Acceptance Action
              Container(
                padding: const EdgeInsets.fromLTRB(20, 14, 20, 16),
                decoration: const BoxDecoration(
                  color: Colors.white,
                  border: Border(
                    top: BorderSide(color: Color(0xFFE5E5EA), width: 1),
                  ),
                ),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    ElevatedButton(
                      onPressed: _isSubmitting ? null : _handleAccept,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF1C1C1E),
                        foregroundColor: Colors.white,
                        minimumSize: const Size(double.infinity, 50),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                        elevation: 0,
                      ),
                      child: _isSubmitting
                          ? const SizedBox(
                              width: 22,
                              height: 22,
                              child: CircularProgressIndicator(
                                strokeWidth: 2.5,
                                color: Colors.white,
                              ),
                            )
                          : const Text(
                              'I AGREE AND ACCEPT',
                              style: TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w900,
                                letterSpacing: 0.8,
                              ),
                            ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildLegalSection({required String title, required String content}) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: const Color(0xFFF9F9FB),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: const Color(0xFFE5E5EA), width: 1),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: const TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w800,
              color: Color(0xFF1C1C1E),
            ),
          ),
          const SizedBox(height: 6),
          Text(
            content,
            style: const TextStyle(
              fontSize: 12.5,
              height: 1.5,
              color: Color(0xFF3A3A3C),
            ),
          ),
        ],
      ),
    );
  }
}
