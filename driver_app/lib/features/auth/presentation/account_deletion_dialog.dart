import 'package:flutter/material.dart';
import '../../../core/network/supabase_service.dart';

/// "Request Account Deletion" — shared by the login screen (signed out: the
/// company code and Driver ID typed there identify the account) and the
/// Settings tab (signed in). It only sends a request; nothing is deleted
/// until the company's administrator confirms it in the admin panel.
Future<void> showAccountDeletionRequest(
  BuildContext context, {
  String? companyCode,
  String? driverId,
  required bool signedIn,
}) async {
  final messenger = ScaffoldMessenger.of(context);

  if (!signedIn && (driverId == null || driverId.trim().isEmpty)) {
    messenger.showSnackBar(const SnackBar(
      content: Text('Enter your Company code and Driver ID first, then tap Request Account Deletion.'),
      backgroundColor: Color(0xFF111111),
      behavior: SnackBarBehavior.floating,
    ));
    return;
  }

  final reasonController = TextEditingController();
  final confirmed = await showDialog<bool>(
    context: context,
    builder: (dialogContext) => AlertDialog(
      backgroundColor: Colors.white,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      title: const Text('Request account deletion', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 17)),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'This asks your company to delete your account and everything attached to it: your shifts, '
              'locations, checks, reports, receipts, holidays and rota.\n\n'
              'Your manager will review the request first, and deleting is permanent once they confirm it.',
              style: TextStyle(fontSize: 13.5, height: 1.35),
            ),
            if (!signedIn) ...[
              const SizedBox(height: 10),
              Text(
                'Account: ${(companyCode ?? '').trim().isEmpty ? '' : '${companyCode!.trim()} · '}${driverId!.trim().toUpperCase()}',
                style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w800),
              ),
            ],
            const SizedBox(height: 12),
            TextField(
              controller: reasonController,
              maxLength: 500,
              maxLines: 3,
              minLines: 2,
              decoration: InputDecoration(
                hintText: 'Reason (optional)',
                filled: true,
                fillColor: const Color(0xFFF2F2F7),
                counterText: '',
                contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide.none),
              ),
            ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(dialogContext, false),
          style: TextButton.styleFrom(foregroundColor: Colors.black54),
          child: const Text('Cancel'),
        ),
        ElevatedButton(
          onPressed: () => Navigator.pop(dialogContext, true),
          style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFFCC0000), foregroundColor: Colors.white, elevation: 0),
          child: const Text('Send request', style: TextStyle(fontWeight: FontWeight.w800)),
        ),
      ],
    ),
  );
  final reason = reasonController.text;
  reasonController.dispose();
  if (confirmed != true) return;

  final result = signedIn
      ? await SupabaseService.requestAccountDeletion(reason: reason)
      : await SupabaseService.requestAccountDeletionPublic(companyCode: companyCode ?? '', driverId: driverId!, reason: reason);

  messenger.showSnackBar(SnackBar(
    content: Text(result['success'] == true
        ? 'Request sent. Your company will review it and confirm once your account has been deleted.'
        : (result['error']?.toString() ?? 'Could not send the request.')),
    backgroundColor: result['success'] == true ? const Color(0xFF111111) : const Color(0xFFCC0000),
    behavior: SnackBarBehavior.floating,
    duration: const Duration(seconds: 5),
  ));
}
