import 'package:flutter/material.dart';

class LegalComplianceScreen extends StatelessWidget {
  const LegalComplianceScreen({super.key});

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
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'PRIVACY POLICY & TERMS OF USE',
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w900,
                  letterSpacing: -0.2,
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
              const SizedBox(height: 24),
              _buildLegalSection(
                title: '1. Data Protection and Privacy',
                content:
                    'In accordance with the UK General Data Protection Regulation (UK GDPR) and the Data Protection Act 2018, ABTSO Logistics acts as the Data Controller. The processing of personal data, including real-time geolocation tracking and encrypted authentication credentials, is conducted under Article 6(1)(b) (performance of a contract) and Article 6(1)(f) (legitimate interests) of the UK GDPR. GPS data is strictly processed to calculate remuneration, ensure fleet security, and manage logistics operations effectively.',
              ),
              const SizedBox(height: 20),
              _buildLegalSection(
                title: '2. Employee Monitoring and Workplace Rights',
                content:
                    'Pursuant to the Employment Rights Act 1996 and balancing the right to privacy under Article 8 of the Human Rights Act 1998, ABTSO Logistics enforces geolocation monitoring exclusively during active shift hours. Continuous background tracking is a fundamental operational requirement for accurate payroll calculation and is terminated immediately upon the cessation of an active shift.',
              ),
              const SizedBox(height: 20),
              _buildLegalSection(
                title: '3. System Integrity and Intellectual Property',
                content:
                    'The ABTSO Logistics mobile application constitutes proprietary software protected under the Copyright, Designs and Patents Act 1988. Any unauthorized access, manipulation of application data (including GPS spoofing), or reverse engineering constitutes a direct breach of the Computer Misuse Act 1990. Such actions will result in immediate termination of system access and potential disciplinary or legal action.',
              ),
              const SizedBox(height: 20),
              _buildLegalSection(
                title: '4. Limitation of Liability',
                content:
                    'ABTSO Logistics accepts no liability for financial discrepancies or loss of earnings arising from the user\'s intentional disruption of application services. This includes, but is not limited to, manually revoking background location permissions, engaging severe battery optimization protocols, or force-closing the application during active duty, which fundamentally impairs the software\'s ability to record shift metrics accurately.',
              ),
              const Center(
                child: Column(
                  children: [
                    Divider(color: Color(0xFFE5E5EA), height: 1),
                    SizedBox(height: 16),
                    Text(
                      'ABTSO Logistics & Transport Ltd',
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                        color: Color(0xFF8E8E93),
                      ),
                    ),
                    SizedBox(height: 2),
                    Text(
                      'Registered in England & Wales • Statutory Driver Compliance',
                      style: TextStyle(
                        fontSize: 10,
                        color: Color(0xFFAAAAAA),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 24),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildLegalSection({required String title, required String content}) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFFF9F9FB),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFFE5E5EA), width: 1),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: const TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w800,
              color: Color(0xFF1C1C1E),
            ),
          ),
          const SizedBox(height: 8),
          Text(
            content,
            style: const TextStyle(
              fontSize: 13,
              height: 1.55,
              color: Color(0xFF3A3A3C),
            ),
          ),
        ],
      ),
    );
  }
}
