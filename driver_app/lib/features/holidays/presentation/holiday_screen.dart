import 'dart:async';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../../../core/network/supabase_service.dart';

/// Holiday booking for every employee (migration 061): request time off,
/// see what's awaiting approval, approved, or declined, and withdraw a
/// request that hasn't been decided yet. Requests go to the admin panel's
/// Alert Panel and Employee Holidays page for approval.
class HolidayScreen extends StatefulWidget {
  const HolidayScreen({super.key});

  @override
  State<HolidayScreen> createState() => _HolidayScreenState();
}

// Brand palette — red, black, white and neutral greys only.
const Color _kRed = Color(0xFFCC0000);
const Color _kInk = Color(0xFF111111);

const Map<String, String> _kLeaveLabels = {
  'annual': 'Annual leave',
  'unpaid': 'Unpaid leave',
  'other': 'Other leave',
};

class _HolidayScreenState extends State<HolidayScreen> {
  List<Map<String, dynamic>> _holidays = const [];
  bool _loading = true;
  String? _error;
  RealtimeChannel? _channel;

  @override
  void initState() {
    super.initState();
    _load();
    _subscribe();
  }

  @override
  void dispose() {
    final channel = _channel;
    if (channel != null) SupabaseService.client.removeChannel(channel);
    super.dispose();
  }

  void _subscribe() {
    final driverId = SupabaseService.currentDriverId;
    if (SupabaseService.isMockMode || driverId == null) return;
    // Approvals/declines land live while the screen is open.
    _channel = SupabaseService.client
        .channel('my_holidays_$driverId')
        .onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'employee_holidays',
          filter: PostgresChangeFilter(type: PostgresChangeFilterType.eq, column: 'driver_id', value: driverId),
          callback: (_) => _load(),
        )
      ..subscribe();
  }

  Future<void> _load() async {
    try {
      final rows = await SupabaseService.fetchMyHolidays();
      if (!mounted) return;
      setState(() {
        _holidays = rows;
        _loading = false;
        _error = null;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = "Couldn't load your holidays. Pull down to try again.";
      });
    }
  }

  static DateTime _date(dynamic iso) => DateTime.parse(iso.toString());

  static int _days(Map<String, dynamic> h) => _date(h['end_date']).difference(_date(h['start_date'])).inDays + 1;

  static String _range(Map<String, dynamic> h) {
    final start = _date(h['start_date']);
    final end = _date(h['end_date']);
    final fmt = DateFormat('EEE d MMM');
    if (start == end) return DateFormat('EEE d MMM yyyy').format(start);
    final sameYear = start.year == end.year;
    return '${sameYear ? fmt.format(start) : DateFormat('EEE d MMM yyyy').format(start)} – ${DateFormat('EEE d MMM yyyy').format(end)}';
  }

  DateTime get _today {
    final now = DateTime.now();
    return DateTime(now.year, now.month, now.day);
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final bg = isDark ? const Color(0xFF0D0D0D) : const Color(0xFFF7F7F7);
    final card = isDark ? const Color(0xFF1A1A1A) : Colors.white;
    final border = isDark ? const Color(0xFF333333) : const Color(0xFFE0E0E0);
    final textMain = isDark ? Colors.white : _kInk;
    final textMuted = isDark ? Colors.white54 : Colors.black54;

    final today = _today;
    final upcoming = _holidays
        .where((h) => (h['status'] == 'pending' || h['status'] == 'approved') && !_date(h['end_date']).isBefore(today))
        .toList()
      ..sort((a, b) => _date(a['start_date']).compareTo(_date(b['start_date'])));
    final history = _holidays.where((h) => !upcoming.contains(h)).toList();

    final approvedThisYear = _holidays
        .where((h) => h['status'] == 'approved' && _date(h['start_date']).year == today.year)
        .fold<int>(0, (sum, h) => sum + _days(h));
    final pendingCount = _holidays.where((h) => h['status'] == 'pending').length;

    return Scaffold(
      backgroundColor: bg,
      appBar: AppBar(
        backgroundColor: isDark ? const Color(0xFF0D0D0D) : Colors.white,
        elevation: 0,
        foregroundColor: textMain,
        title: Text('Holidays', style: GoogleFonts.outfit(fontWeight: FontWeight.w700, fontSize: 16, color: textMain)),
      ),
      body: RefreshIndicator(
        color: _kRed,
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
          children: [
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(color: card, borderRadius: BorderRadius.circular(14), border: Border.all(color: border)),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(child: _stat('$approvedThisYear', 'Days approved in ${today.year}', textMain, textMuted)),
                      Container(width: 1, height: 34, color: border),
                      const SizedBox(width: 16),
                      Expanded(child: _stat('$pendingCount', 'Awaiting approval', pendingCount > 0 ? _kRed : textMain, textMuted)),
                    ],
                  ),
                  const SizedBox(height: 14),
                  ElevatedButton.icon(
                    onPressed: _openRequestSheet,
                    icon: const Icon(Icons.beach_access_outlined, size: 18),
                    label: const Text('REQUEST HOLIDAY', style: TextStyle(fontWeight: FontWeight.w900, letterSpacing: 0.3)),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: _kRed,
                      foregroundColor: Colors.white,
                      elevation: 0,
                      minimumSize: const Size(double.infinity, 48),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Your manager approves or declines each request — you\'ll see the decision here.',
                    style: TextStyle(fontSize: 11.5, color: textMuted),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 20),
            if (_loading)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 40),
                child: Center(child: CircularProgressIndicator(strokeWidth: 2.5, color: _kRed)),
              )
            else if (_error != null)
              _message(_error!, textMuted)
            else if (_holidays.isEmpty)
              _message('No holidays yet. Tap "Request holiday" to book some time off.', textMuted)
            else ...[
              if (upcoming.isNotEmpty) ...[
                _sectionLabel('UPCOMING', textMuted),
                for (final h in upcoming) _holidayRow(h, card, border, textMain, textMuted, isDark),
                const SizedBox(height: 12),
              ],
              if (history.isNotEmpty) ...[
                _sectionLabel('PAST & CLOSED', textMuted),
                for (final h in history) _holidayRow(h, card, border, textMain, textMuted, isDark),
              ],
            ],
          ],
        ),
      ),
    );
  }

  Widget _stat(String value, String label, Color valueColor, Color muted) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(value, style: TextStyle(fontSize: 22, fontWeight: FontWeight.w900, color: valueColor)),
          Text(label, style: TextStyle(fontSize: 11.5, color: muted)),
        ],
      );

  Widget _sectionLabel(String text, Color color) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Text(text, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w900, letterSpacing: 0.6, color: color)),
      );

  Widget _message(String text, Color color) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 40),
        child: Text(text, textAlign: TextAlign.center, style: TextStyle(fontSize: 13, color: color)),
      );

  Widget _holidayRow(Map<String, dynamic> h, Color card, Color border, Color textMain, Color textMuted, bool isDark) {
    final status = h['status']?.toString() ?? 'approved';
    final days = _days(h);
    final (label, fg, bgColor) = switch (status) {
      'pending' => ('AWAITING APPROVAL', isDark ? Colors.white : _kInk, isDark ? Colors.white12 : const Color(0xFFEDEDED)),
      'declined' => ('DECLINED', _kRed, _kRed.withValues(alpha: 0.1)),
      'cancelled' => ('CANCELLED', isDark ? Colors.white54 : Colors.black45, isDark ? Colors.white10 : const Color(0xFFF2F2F2)),
      _ => ('APPROVED', Colors.white, isDark ? const Color(0xFF333333) : _kInk),
    };
    final note = (h['note'] as String?)?.trim();
    final reviewNote = (h['review_note'] as String?)?.trim();

    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: card,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: status == 'pending' ? (isDark ? Colors.white38 : Colors.black26) : border),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(_range(h), style: TextStyle(fontWeight: FontWeight.w800, fontSize: 13.5, color: textMain)),
                      const SizedBox(height: 3),
                      Text(
                        '${_kLeaveLabels[h['leave_type']] ?? 'Leave'} · $days day${days == 1 ? '' : 's'}',
                        style: TextStyle(fontSize: 12, color: textMuted),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(color: bgColor, borderRadius: BorderRadius.circular(6)),
                  child: Text(label, style: TextStyle(fontSize: 10, fontWeight: FontWeight.w900, letterSpacing: 0.4, color: fg)),
                ),
              ],
            ),
            if (note != null && note.isNotEmpty) ...[
              const SizedBox(height: 8),
              Text('“$note”', style: TextStyle(fontSize: 12, fontStyle: FontStyle.italic, color: textMuted)),
            ],
            if (status == 'declined' && reviewNote != null && reviewNote.isNotEmpty) ...[
              const SizedBox(height: 8),
              Text('Reason: $reviewNote', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: _kRed)),
            ],
            if (status == 'pending') ...[
              const SizedBox(height: 4),
              Align(
                alignment: Alignment.centerRight,
                child: TextButton(
                  onPressed: () => _confirmCancel(h),
                  style: TextButton.styleFrom(foregroundColor: textMuted, padding: const EdgeInsets.symmetric(horizontal: 8), minimumSize: const Size(0, 32)),
                  child: const Text('Cancel request', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 12)),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Future<void> _confirmCancel(Map<String, dynamic> h) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Cancel this request?', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 16)),
        content: Text('${_range(h)} will be withdrawn. You can send a new request any time.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            style: TextButton.styleFrom(foregroundColor: Colors.black54),
            child: const Text('Keep it'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            style: ElevatedButton.styleFrom(backgroundColor: _kRed, foregroundColor: Colors.white, elevation: 0),
            child: const Text('Cancel request', style: TextStyle(fontWeight: FontWeight.w800)),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    final messenger = ScaffoldMessenger.of(context);
    final result = await SupabaseService.cancelHolidayRequest(h['id'] as String);
    messenger.showSnackBar(SnackBar(
      content: Text(result['success'] == true ? 'Request cancelled.' : (result['error']?.toString() ?? 'Could not cancel the request.')),
      backgroundColor: result['success'] == true ? _kInk : _kRed,
      behavior: SnackBarBehavior.floating,
    ));
    if (result['success'] == true) unawaited(_load());
  }

  Future<void> _openRequestSheet() async {
    final sent = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Theme.of(context).brightness == Brightness.dark ? const Color(0xFF0D0D0D) : Colors.white,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (_) => const _HolidayRequestSheet(),
    );
    if (sent == true && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('Request sent — your manager will approve or decline it.', style: TextStyle(fontWeight: FontWeight.bold)),
        backgroundColor: _kInk,
        behavior: SnackBarBehavior.floating,
      ));
      unawaited(_load());
    }
  }
}

class _HolidayRequestSheet extends StatefulWidget {
  const _HolidayRequestSheet();

  @override
  State<_HolidayRequestSheet> createState() => _HolidayRequestSheetState();
}

class _HolidayRequestSheetState extends State<_HolidayRequestSheet> {
  DateTimeRange? _range;
  String _leaveType = 'annual';
  final _noteController = TextEditingController();
  bool _sending = false;
  String? _error;

  @override
  void dispose() {
    _noteController.dispose();
    super.dispose();
  }

  Future<void> _pickDates() async {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final picked = await showDateRangePicker(
      context: context,
      firstDate: today,
      lastDate: today.add(const Duration(days: 366)),
      initialDateRange: _range,
      helpText: 'SELECT YOUR HOLIDAY DATES',
      saveText: 'DONE',
      builder: (context, child) => Theme(
        data: Theme.of(context).copyWith(
          colorScheme: isDark
              ? const ColorScheme.dark(primary: _kRed, onPrimary: Colors.white, surface: Color(0xFF1A1A1A), onSurface: Colors.white)
              : const ColorScheme.light(primary: _kRed, onPrimary: Colors.white, surface: Colors.white, onSurface: _kInk),
        ),
        child: child!,
      ),
    );
    if (picked != null) {
      setState(() {
        _range = picked;
        _error = null;
      });
    }
  }

  Future<void> _submit() async {
    final range = _range;
    if (range == null) {
      setState(() => _error = 'Choose your holiday dates first.');
      return;
    }
    setState(() {
      _sending = true;
      _error = null;
    });
    final result = await SupabaseService.requestHoliday(
      start: range.start,
      end: range.end,
      leaveType: _leaveType,
      note: _noteController.text,
    );
    if (!mounted) return;
    if (result['success'] == true) {
      Navigator.pop(context, true);
    } else {
      setState(() {
        _sending = false;
        _error = result['error']?.toString() ?? 'Could not send your request.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final textMain = isDark ? Colors.white : _kInk;
    final textMuted = isDark ? Colors.white60 : Colors.black54;
    final fieldBg = isDark ? const Color(0xFF1A1A1A) : const Color(0xFFF5F5F5);
    final range = _range;
    final days = range == null ? 0 : range.end.difference(range.start).inDays + 1;
    final fmt = DateFormat('EEE d MMM');

    return Padding(
      padding: EdgeInsets.only(left: 20, right: 20, top: 20, bottom: 20 + MediaQuery.of(context).viewInsets.bottom),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.beach_access_outlined, color: _kRed, size: 24),
                const SizedBox(width: 10),
                Text('REQUEST HOLIDAY', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 16, letterSpacing: 0.5, color: textMain)),
              ],
            ),
            const SizedBox(height: 4),
            Text('Pick your dates — your manager approves it from the Tachyo office panel.', style: TextStyle(fontSize: 12.5, color: textMuted)),
            const SizedBox(height: 18),
            Text('DATES', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w900, letterSpacing: 0.6, color: textMuted)),
            const SizedBox(height: 6),
            Material(
              color: fieldBg,
              borderRadius: BorderRadius.circular(12),
              child: InkWell(
                borderRadius: BorderRadius.circular(12),
                onTap: _sending ? null : _pickDates,
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
                  child: Row(
                    children: [
                      const Icon(Icons.date_range_outlined, size: 20, color: _kRed),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Text(
                          range == null
                              ? 'Choose first and last day'
                              : range.start == range.end
                                  ? fmt.format(range.start)
                                  : '${fmt.format(range.start)}  →  ${fmt.format(range.end)}',
                          style: TextStyle(fontWeight: FontWeight.w800, fontSize: 14, color: range == null ? textMuted : textMain),
                        ),
                      ),
                      if (range != null)
                        Text('$days day${days == 1 ? '' : 's'}', style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 12.5, color: _kRed)),
                    ],
                  ),
                ),
              ),
            ),
            const SizedBox(height: 16),
            Text('TYPE', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w900, letterSpacing: 0.6, color: textMuted)),
            const SizedBox(height: 6),
            Wrap(
              spacing: 8,
              children: [
                for (final entry in _kLeaveLabels.entries)
                  ChoiceChip(
                    label: Text(entry.value),
                    selected: _leaveType == entry.key,
                    onSelected: _sending ? null : (_) => setState(() => _leaveType = entry.key),
                    selectedColor: _kRed,
                    backgroundColor: fieldBg,
                    showCheckmark: false,
                    side: BorderSide.none,
                    labelStyle: TextStyle(
                      fontWeight: FontWeight.w800,
                      fontSize: 12.5,
                      color: _leaveType == entry.key ? Colors.white : textMain,
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 16),
            Text('NOTE (OPTIONAL)', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w900, letterSpacing: 0.6, color: textMuted)),
            const SizedBox(height: 6),
            TextField(
              controller: _noteController,
              enabled: !_sending,
              maxLength: 500,
              maxLines: 2,
              minLines: 1,
              style: TextStyle(color: textMain, fontWeight: FontWeight.w600),
              decoration: InputDecoration(
                hintText: 'e.g. Family holiday, wedding',
                hintStyle: TextStyle(color: textMuted, fontWeight: FontWeight.w500),
                filled: true,
                fillColor: fieldBg,
                counterText: '',
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
                contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              ),
            ),
            if (_error != null) ...[
              const SizedBox(height: 10),
              Text(_error!, style: const TextStyle(color: _kRed, fontWeight: FontWeight.w700, fontSize: 12.5)),
            ],
            const SizedBox(height: 16),
            ElevatedButton(
              onPressed: _sending || range == null ? null : _submit,
              style: ElevatedButton.styleFrom(
                backgroundColor: _kRed,
                foregroundColor: Colors.white,
                disabledBackgroundColor: isDark ? Colors.white12 : Colors.black12,
                elevation: 0,
                minimumSize: const Size(double.infinity, 48),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
              child: _sending
                  ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.white))
                  : Text(range == null ? 'CHOOSE DATES TO CONTINUE' : 'SEND REQUEST', style: const TextStyle(fontWeight: FontWeight.w900, letterSpacing: 0.3)),
            ),
          ],
        ),
      ),
    );
  }
}
