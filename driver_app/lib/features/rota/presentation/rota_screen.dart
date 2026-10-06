import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
import '../../../core/network/supabase_service.dart';

/// Weekly rota (migration 094): the employee says which days they will work
/// next week and at what times (or that they're off). It shows in the admin
/// panel under Employees Schedule -> Weekly Rota. Weeks run Sunday to
/// Saturday, matching the pay week.
class RotaScreen extends StatefulWidget {
  const RotaScreen({super.key});

  @override
  State<RotaScreen> createState() => _RotaScreenState();
}

const Color _kRed = Color(0xFFCC0000);
const Color _kInk = Color(0xFF111111);

enum _DayMode { unset, working, off }

class _DayEntry {
  _DayMode mode = _DayMode.unset;
  TimeOfDay? start;
  TimeOfDay? end;
  String note = '';
}

class _RotaScreenState extends State<RotaScreen> {
  late DateTime _weekStart;
  final List<_DayEntry> _days = List.generate(7, (_) => _DayEntry());
  bool _loading = true;
  bool _saving = false;
  String? _error;
  bool _dirty = false;

  static DateTime _sundayOf(DateTime d) {
    final day = DateTime(d.year, d.month, d.day);
    return day.subtract(Duration(days: day.weekday % 7));
  }

  static TimeOfDay _parse(String t) {
    final parts = t.split(':');
    return TimeOfDay(hour: int.parse(parts[0]), minute: int.parse(parts[1]));
  }

  static String _fmtTime(TimeOfDay t) => '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';

  @override
  void initState() {
    super.initState();
    // Default to NEXT week — that is the one people plan.
    _weekStart = _sundayOf(DateTime.now()).add(const Duration(days: 7));
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final rows = await SupabaseService.fetchMyRota(_weekStart);
      if (!mounted) return;
      for (final d in _days) {
        d.mode = _DayMode.unset;
        d.start = null;
        d.end = null;
        d.note = '';
      }
      for (final r in rows) {
        final date = DateTime.parse(r['work_date'].toString());
        final i = date.difference(_weekStart).inDays;
        if (i < 0 || i > 6) continue;
        final e = _days[i];
        if (r['day_off'] == true) {
          e.mode = _DayMode.off;
        } else {
          e.mode = _DayMode.working;
          e.start = r['start_time'] == null ? null : _parse(r['start_time'].toString());
          e.end = r['end_time'] == null ? null : _parse(r['end_time'].toString());
        }
        e.note = (r['note'] ?? '').toString();
      }
      setState(() {
        _loading = false;
        _dirty = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = "Couldn't load your rota. Check your connection and try again.";
      });
    }
  }

  bool get _canGoBack => _weekStart.isAfter(_sundayOf(DateTime.now()));
  bool get _canGoForward => _weekStart.isBefore(_sundayOf(DateTime.now()).add(const Duration(days: 7 * 8)));

  Future<void> _changeWeek(int delta) async {
    if (_dirty) {
      final discard = await showDialog<bool>(
        context: context,
        builder: (c) => AlertDialog(
          title: const Text('Leave without saving?', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 16)),
          content: const Text('Your changes to this week have not been saved.'),
          actions: [
            TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Stay')),
            TextButton(onPressed: () => Navigator.pop(c, true), child: const Text('Discard', style: TextStyle(color: _kRed))),
          ],
        ),
      );
      if (discard != true) return;
    }
    setState(() => _weekStart = _weekStart.add(Duration(days: 7 * delta)));
    _load();
  }

  Future<void> _pickTime(_DayEntry e, bool isStart) async {
    final initial = (isStart ? e.start : e.end) ?? (isStart ? const TimeOfDay(hour: 6, minute: 0) : const TimeOfDay(hour: 16, minute: 0));
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final picked = await showTimePicker(
      context: context,
      initialTime: initial,
      builder: (context, child) => Theme(
        data: Theme.of(context).copyWith(
          colorScheme: isDark
              ? const ColorScheme.dark(primary: _kRed, onPrimary: Colors.white, surface: Color(0xFF1A1A1A), onSurface: Colors.white)
              : const ColorScheme.light(primary: _kRed, onPrimary: Colors.white, surface: Colors.white, onSurface: _kInk),
        ),
        child: MediaQuery(data: MediaQuery.of(context).copyWith(alwaysUse24HourFormat: true), child: child!),
      ),
    );
    if (picked == null) return;
    setState(() {
      if (isStart) {
        e.start = picked;
      } else {
        e.end = picked;
      }
      _dirty = true;
    });
  }

  bool get _complete => _days.every((d) => d.mode != _DayMode.working || (d.start != null && d.end != null));
  bool get _anySet => _days.any((d) => d.mode != _DayMode.unset);

  Future<void> _save() async {
    setState(() {
      _saving = true;
      _error = null;
    });
    final payload = <Map<String, dynamic>>[];
    for (var i = 0; i < 7; i++) {
      final d = _days[i];
      if (d.mode == _DayMode.unset) continue;
      final date = _weekStart.add(Duration(days: i));
      payload.add({
        'date': DateFormat('yyyy-MM-dd').format(date),
        'off': d.mode == _DayMode.off,
        if (d.mode == _DayMode.working) 'start': _fmtTime(d.start!),
        if (d.mode == _DayMode.working) 'end': _fmtTime(d.end!),
        if (d.note.trim().isNotEmpty) 'note': d.note.trim(),
      });
    }
    final result = await SupabaseService.saveMyRota(_weekStart, payload);
    if (!mounted) return;
    setState(() => _saving = false);
    if (result['success'] == true) {
      setState(() => _dirty = false);
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('Rota saved — your office can see it now.', style: TextStyle(fontWeight: FontWeight.bold)),
        backgroundColor: _kInk,
        behavior: SnackBarBehavior.floating,
      ));
    } else {
      setState(() => _error = result['error']?.toString() ?? 'Could not save your rota.');
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final bg = isDark ? const Color(0xFF0D0D0D) : const Color(0xFFF7F7F7);
    final card = isDark ? const Color(0xFF1A1A1A) : Colors.white;
    final border = isDark ? const Color(0xFF333333) : const Color(0xFFE0E0E0);
    final textMain = isDark ? Colors.white : _kInk;
    final textMuted = isDark ? Colors.white54 : Colors.black54;
    final weekEnd = _weekStart.add(const Duration(days: 6));
    final thisWeek = _sundayOf(DateTime.now());
    final weekLabel = _weekStart == thisWeek
        ? 'This week'
        : _weekStart == thisWeek.add(const Duration(days: 7))
            ? 'Next week'
            : 'Week of ${DateFormat('d MMM').format(_weekStart)}';

    return Scaffold(
      backgroundColor: bg,
      appBar: AppBar(
        backgroundColor: isDark ? const Color(0xFF0D0D0D) : Colors.white,
        elevation: 0,
        foregroundColor: textMain,
        title: Text('Weekly Rota', style: GoogleFonts.outfit(fontWeight: FontWeight.w700, fontSize: 16, color: textMain)),
      ),
      body: Column(
        children: [
          Container(
            margin: const EdgeInsets.fromLTRB(16, 12, 16, 0),
            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 4),
            decoration: BoxDecoration(color: card, borderRadius: BorderRadius.circular(12), border: Border.all(color: border)),
            child: Row(
              children: [
                IconButton(onPressed: _canGoBack && !_saving ? () => _changeWeek(-1) : null, icon: const Icon(Icons.chevron_left)),
                Expanded(
                  child: Column(
                    children: [
                      Text(weekLabel, style: TextStyle(fontWeight: FontWeight.w900, fontSize: 14, color: textMain)),
                      Text('${DateFormat('EEE d MMM').format(_weekStart)} – ${DateFormat('EEE d MMM').format(weekEnd)}', style: TextStyle(fontSize: 11.5, color: textMuted)),
                    ],
                  ),
                ),
                IconButton(onPressed: _canGoForward && !_saving ? () => _changeWeek(1) : null, icon: const Icon(Icons.chevron_right)),
              ],
            ),
          ),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator(strokeWidth: 2.5, color: _kRed))
                : ListView(
                    padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
                    children: [
                      Text(
                        'Set each day you know about. Days you leave as "Not set" are not sent.',
                        style: TextStyle(fontSize: 12, color: textMuted),
                      ),
                      const SizedBox(height: 10),
                      for (var i = 0; i < 7; i++) _dayCard(i, card, border, textMain, textMuted, isDark),
                      if (_error != null)
                        Padding(
                          padding: const EdgeInsets.only(top: 6),
                          child: Text(_error!, style: const TextStyle(color: _kRed, fontWeight: FontWeight.w700, fontSize: 12.5)),
                        ),
                    ],
                  ),
          ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 12),
              child: ElevatedButton(
                onPressed: _saving || _loading || !_dirty || !_complete || !_anySet ? null : _save,
                style: ElevatedButton.styleFrom(
                  backgroundColor: _kRed,
                  foregroundColor: Colors.white,
                  disabledBackgroundColor: isDark ? Colors.white12 : Colors.black12,
                  elevation: 0,
                  minimumSize: const Size(double.infinity, 48),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                ),
                child: _saving
                    ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.white))
                    : Text(!_complete ? 'ADD START AND FINISH TIMES' : 'SAVE ROTA', style: const TextStyle(fontWeight: FontWeight.w900, letterSpacing: 0.3)),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _dayCard(int i, Color card, Color border, Color textMain, Color textMuted, bool isDark) {
    final e = _days[i];
    final date = _weekStart.add(Duration(days: i));
    final fieldBg = isDark ? const Color(0xFF262626) : const Color(0xFFF5F5F5);

    Widget modeChip(String label, _DayMode mode) => ChoiceChip(
          label: Text(label),
          selected: e.mode == mode,
          onSelected: _saving
              ? null
              : (_) => setState(() {
                    e.mode = mode;
                    _dirty = true;
                  }),
          selectedColor: mode == _DayMode.off ? (isDark ? Colors.white24 : _kInk) : _kRed,
          backgroundColor: fieldBg,
          showCheckmark: false,
          side: BorderSide.none,
          visualDensity: VisualDensity.compact,
          labelStyle: TextStyle(fontWeight: FontWeight.w800, fontSize: 12, color: e.mode == mode ? Colors.white : textMain),
        );

    Widget timeButton(String label, TimeOfDay? value, bool isStart) => Expanded(
          child: Material(
            color: fieldBg,
            borderRadius: BorderRadius.circular(10),
            child: InkWell(
              borderRadius: BorderRadius.circular(10),
              onTap: _saving ? null : () => _pickTime(e, isStart),
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
                child: Row(
                  children: [
                    Icon(Icons.schedule, size: 16, color: value == null ? textMuted : _kRed),
                    const SizedBox(width: 8),
                    Text(
                      value == null ? label : _fmtTime(value),
                      style: TextStyle(fontWeight: FontWeight.w800, fontSize: 13.5, color: value == null ? textMuted : textMain),
                    ),
                  ],
                ),
              ),
            ),
          ),
        );

    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(color: card, borderRadius: BorderRadius.circular(12), border: Border.all(color: border)),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(child: Text(DateFormat('EEEE d MMM').format(date), style: TextStyle(fontWeight: FontWeight.w900, fontSize: 13.5, color: textMain))),
                Wrap(spacing: 6, children: [
                  modeChip('Working', _DayMode.working),
                  modeChip('Day off', _DayMode.off),
                ]),
              ],
            ),
            if (e.mode == _DayMode.working) ...[
              const SizedBox(height: 10),
              Row(children: [
                timeButton('Start', e.start, true),
                const SizedBox(width: 8),
                timeButton('Finish', e.end, false),
              ]),
              const SizedBox(height: 8),
              TextFormField(
                key: ValueKey('note-${_weekStart.millisecondsSinceEpoch}-$i-${_loading ? 1 : 0}'),
                initialValue: e.note,
                enabled: !_saving,
                maxLength: 200,
                onChanged: (v) => setState(() {
                  e.note = v;
                  _dirty = true;
                }),
                style: TextStyle(color: textMain, fontWeight: FontWeight.w600, fontSize: 13),
                decoration: InputDecoration(
                  hintText: 'Note (optional), e.g. Leeds depot',
                  hintStyle: TextStyle(color: textMuted, fontWeight: FontWeight.w500, fontSize: 13),
                  filled: true,
                  fillColor: fieldBg,
                  counterText: '',
                  isDense: true,
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide.none),
                  contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
                ),
              ),
            ] else if (e.mode == _DayMode.off) ...[
              const SizedBox(height: 6),
              Text('Not working', style: TextStyle(fontSize: 12, color: textMuted)),
            ],
          ],
        ),
      ),
    );
  }
}
