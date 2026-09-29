import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
import '../../../core/network/supabase_service.dart';

/// The driver's own walk-around check history, plus this shift's status
/// and a shortcut to complete a start-of-shift check they skipped.
class WalkaroundHistoryScreen extends StatefulWidget {
  final bool isClockedIn;
  final bool startCheckDone;
  /// Called after this screen pops, to open the start-of-shift check.
  final VoidCallback? onCompleteStartCheck;

  const WalkaroundHistoryScreen({
    super.key,
    required this.isClockedIn,
    required this.startCheckDone,
    this.onCompleteStartCheck,
  });

  @override
  State<WalkaroundHistoryScreen> createState() => _WalkaroundHistoryScreenState();
}

/// Which slice of history the switch-over button shows. 'all' is every
/// check; the other two split by check_type — the same field the badge
/// text already reads, just used to filter here instead of just label.
enum _HistoryFilter { all, safety, endOfShift }

class _WalkaroundHistoryScreenState extends State<WalkaroundHistoryScreen> {
  late Future<List<Map<String, dynamic>>> _checksFuture;
  _HistoryFilter _filter = _HistoryFilter.all;

  @override
  void initState() {
    super.initState();
    _checksFuture = SupabaseService.fetchMyWalkaroundChecks();
  }

  Future<void> _refresh() async {
    setState(() => _checksFuture = SupabaseService.fetchMyWalkaroundChecks());
    await _checksFuture.catchError((_) => <Map<String, dynamic>>[]);
  }

  static String _typeLabel(String? type) => type == 'end_of_shift' ? 'End of shift inspection' : 'Safety check (start of shift)';

  static String _duration(int? seconds) {
    if (seconds == null) return '—';
    return '${seconds ~/ 60}m ${(seconds % 60).toString().padLeft(2, '0')}s';
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final bg = isDark ? const Color(0xFF0D0D0D) : const Color(0xFFF7F7F7);
    final card = isDark ? const Color(0xFF1A1A1A) : Colors.white;
    final border = isDark ? const Color(0xFF333333) : const Color(0xFFE0E0E0);
    final textMain = isDark ? Colors.white : const Color(0xFF0D0D0D);
    final textMuted = isDark ? Colors.white54 : Colors.black54;

    return Scaffold(
      backgroundColor: bg,
      appBar: AppBar(
        backgroundColor: isDark ? const Color(0xFF0D0D0D) : Colors.white,
        elevation: 0,
        foregroundColor: textMain,
        title: Text('Walk-around checks', style: GoogleFonts.outfit(fontWeight: FontWeight.w700, fontSize: 16, color: textMain)),
      ),
      body: RefreshIndicator(
        onRefresh: _refresh,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
          children: [
            if (widget.isClockedIn) _buildShiftStatus(isDark, card, border, textMain, textMuted),
            const SizedBox(height: 16),
            Text('HISTORY', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w900, letterSpacing: 0.6, color: textMuted)),
            const SizedBox(height: 8),
            FutureBuilder<List<Map<String, dynamic>>>(
              future: _checksFuture,
              builder: (context, snapshot) {
                if (snapshot.connectionState != ConnectionState.done) {
                  return const Padding(padding: EdgeInsets.symmetric(vertical: 40), child: Center(child: CircularProgressIndicator(strokeWidth: 2.5)));
                }
                if (snapshot.hasError) {
                  return _message("Couldn't load your checks. Pull down to try again.", textMuted);
                }
                final allChecks = snapshot.data ?? const [];
                if (allChecks.isEmpty) {
                  return _message('No walk-around checks yet. Completed checks will appear here.', textMuted);
                }
                final safetyCount = allChecks.where((c) => c['check_type'] != 'end_of_shift').length;
                final endCount = allChecks.length - safetyCount;
                final checks = switch (_filter) {
                  _HistoryFilter.all => allChecks,
                  _HistoryFilter.safety => allChecks.where((c) => c['check_type'] != 'end_of_shift').toList(),
                  _HistoryFilter.endOfShift => allChecks.where((c) => c['check_type'] == 'end_of_shift').toList(),
                };
                return Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    _buildFilterSwitch(isDark, card, border, textMain, textMuted, allChecks.length, safetyCount, endCount),
                    const SizedBox(height: 12),
                    if (checks.isEmpty)
                      _message('No checks in this category yet.', textMuted)
                    else
                      for (final check in checks) _buildCheckRow(check, isDark, card, border, textMain, textMuted),
                  ],
                );
              },
            ),
          ],
        ),
      ),
    );
  }

  Widget _message(String text, Color color) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 40),
        child: Text(text, textAlign: TextAlign.center, style: TextStyle(fontSize: 13, color: color)),
      );

  Widget _buildShiftStatus(bool isDark, Color card, Color border, Color textMain, Color textMuted) {
    final done = widget.startCheckDone;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(color: card, borderRadius: BorderRadius.circular(14), border: Border.all(color: border)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(done ? Icons.check_circle : Icons.error_outline, color: done ? (isDark ? Colors.white : const Color(0xFF111111)) : const Color(0xFFCC0000), size: 22),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  done ? 'Safety check completed for this shift' : 'Safety check not done for this shift',
                  style: TextStyle(fontWeight: FontWeight.w800, fontSize: 14, color: textMain),
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            done
                ? 'Your end-of-shift inspection is done when you clock out.'
                : 'Complete it now — a missing check is flagged to your manager.',
            style: TextStyle(fontSize: 12.5, color: textMuted),
          ),
          if (!done && widget.onCompleteStartCheck != null) ...[
            const SizedBox(height: 12),
            ElevatedButton.icon(
              onPressed: () {
                Navigator.of(context).pop();
                widget.onCompleteStartCheck!();
              },
              icon: const Icon(Icons.fact_check_outlined, size: 18),
              label: const Text('Complete check now', style: TextStyle(fontWeight: FontWeight.w800)),
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFFCC0000),
                foregroundColor: Colors.white,
                minimumSize: const Size(double.infinity, 46),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
            ),
          ],
        ],
      ),
    );
  }

  /// The "switch-over" button from the full checks list to just Safety
  /// (start-of-shift) or just End of Inspection — one segmented control
  /// covers all three, rather than three separate filter buttons.
  Widget _buildFilterSwitch(bool isDark, Color card, Color border, Color textMain, Color textMuted, int allCount, int safetyCount, int endCount) {
    Widget segment(_HistoryFilter value, String label, int count) {
      final selected = _filter == value;
      return Expanded(
        child: GestureDetector(
          onTap: () => setState(() => _filter = value),
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 180),
            padding: const EdgeInsets.symmetric(vertical: 10),
            decoration: BoxDecoration(
              color: selected ? const Color(0xFFCC0000) : Colors.transparent,
              borderRadius: BorderRadius.circular(10),
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  label,
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w800,
                    color: selected ? Colors.white : textMuted,
                  ),
                ),
                const SizedBox(height: 1),
                Text(
                  '$count',
                  style: TextStyle(
                    fontSize: 10.5,
                    fontWeight: FontWeight.w700,
                    color: selected ? Colors.white70 : textMuted.withValues(alpha: 0.7),
                  ),
                ),
              ],
            ),
          ),
        ),
      );
    }

    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(color: card, borderRadius: BorderRadius.circular(14), border: Border.all(color: border)),
      child: Row(
        children: [
          segment(_HistoryFilter.all, 'Full History', allCount),
          segment(_HistoryFilter.safety, 'Safety', safetyCount),
          segment(_HistoryFilter.endOfShift, 'End of Inspection', endCount),
        ],
      ),
    );
  }

  Widget _buildCheckRow(Map<String, dynamic> check, bool isDark, Color card, Color border, Color textMain, Color textMuted) {
    final started = DateTime.tryParse(check['started_at']?.toString() ?? '')?.toLocal();
    final isDraft = check['completed_at'] == null;
    final defects = check['overall_result'] == 'defects_found';
    final vehicle = (check['vehicle'] as Map?)?['vehicle_number']?.toString();
    final trailer = (check['trailer'] as Map?)?['vehicle_number']?.toString() ?? check['custom_trailer_number']?.toString();
    final unit = [vehicle, trailer].whereType<String>().map((s) => s.toUpperCase()).join(' / ');

    final (badgeText, badgeColor) = isDraft
        ? ('DRAFT', const Color(0xFF888888))
        : defects
            ? ('DEFECTS', const Color(0xFFCC0000))
            : ('PASSED', isDark ? Colors.white : const Color(0xFF111111));

    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Material(
        color: card,
        borderRadius: BorderRadius.circular(12),
        child: InkWell(
          borderRadius: BorderRadius.circular(12),
          onTap: () => _showCheckDetails(check, isDark, textMain, textMuted),
          child: Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(borderRadius: BorderRadius.circular(12), border: Border.all(color: border)),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(_typeLabel(check['check_type']?.toString()), style: TextStyle(fontWeight: FontWeight.w800, fontSize: 13.5, color: textMain)),
                      const SizedBox(height: 3),
                      Text(
                        [
                          if (started != null) DateFormat('EEE d MMM, HH:mm').format(started),
                          if (unit.isNotEmpty) unit,
                          if (!isDraft) _duration((check['duration_seconds'] as num?)?.toInt()),
                        ].join(' · '),
                        style: TextStyle(fontSize: 12, color: textMuted),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(color: badgeColor.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(6)),
                  child: Text(badgeText, style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w900, letterSpacing: 0.4, color: badgeColor)),
                ),
                Icon(Icons.chevron_right, size: 18, color: textMuted),
              ],
            ),
          ),
        ),
      ),
    );
  }

  void _showCheckDetails(Map<String, dynamic> check, bool isDark, Color textMain, Color textMuted) {
    final items = (check['items'] as List? ?? const []).whereType<Map>().toList();
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: isDark ? const Color(0xFF0D0D0D) : Colors.white,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (sheetContext) => DraggableScrollableSheet(
        expand: false,
        initialChildSize: 0.75,
        maxChildSize: 0.95,
        builder: (_, controller) => ListView(
          controller: controller,
          padding: const EdgeInsets.fromLTRB(20, 20, 20, 32),
          children: [
            Text(_typeLabel(check['check_type']?.toString()), style: TextStyle(fontWeight: FontWeight.w900, fontSize: 16, color: textMain)),
            if ((check['defect_note'] as String?)?.isNotEmpty ?? false) ...[
              const SizedBox(height: 8),
              Text('Defects: ${check['defect_note']}', style: const TextStyle(fontSize: 13, color: Color(0xFFCC0000), fontWeight: FontWeight.w700)),
            ],
            const SizedBox(height: 12),
            for (final item in items)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 7),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(child: Text(item['label']?.toString() ?? '', style: TextStyle(fontSize: 13, color: textMain))),
                    const SizedBox(width: 12),
                    Text(_itemValue(item), style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: _itemColor(item, textMuted, textMain))),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }

  static String _itemValue(Map item) {
    final value = item['value'];
    switch (item['type']) {
      case 'photo':
        return (value is String && value.isNotEmpty) ? 'Photo taken' : 'No photo';
      case 'checkbox':
        return value == true ? 'OK' : '—';
      case 'passFail':
        return value == 'pass' ? 'Pass' : value == 'fail' ? 'Fail' : '—';
      default:
        return (value is String && value.trim().isNotEmpty) ? value.trim() : '—';
    }
  }

  static Color _itemColor(Map item, Color muted, Color isDarkText) {
    final value = item['value'];
    if (value == 'fail') return const Color(0xFFCC0000);
    if (value == true || value == 'pass' || (item['type'] == 'photo' && value is String && value.isNotEmpty)) return isDarkText;
    return muted;
  }
}
