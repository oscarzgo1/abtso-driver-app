import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
import 'package:supabase_flutter/supabase_flutter.dart' hide AuthState;
import 'package:table_calendar/table_calendar.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../../config/theme.dart';
import '../../../core/network/supabase_service.dart';
import '../../../core/services/entrance_gate.dart';
import 'earnings_export.dart';
import 'home_screen.dart';
import 'shift_provider.dart';
import 'widgets/progress_ring.dart';
import '../../dispatch/load_history_screen.dart';
import '../../auth/presentation/auth_provider.dart';
import '../../legal/presentation/legal_compliance_screen.dart';
import 'dvsa_compliance.dart' as dvsa;

class MainLayout extends ConsumerStatefulWidget {
  const MainLayout({super.key});

  @override
  ConsumerState<MainLayout> createState() => _MainLayoutState();
}

class _MainLayoutState extends ConsumerState<MainLayout> {
  int _currentIndex = 0;
  late final PageController _pageController;
  late final List<Widget> _screens;

  @override
  void initState() {
    super.initState();
    _pageController = PageController(initialPage: _currentIndex);
    _screens = [
      const HomeScreen(),
      const HistoryTab(),
      const SettingsTab(),
    ];
    // Terms & Conditions are accepted via the checkbox on the login screen,
    // before a session exists — there is no in-app gate to enforce here.

    // Persist whether a shift is running so the next cold start can skip the
    // entrance cinematic mid-shift (SOS must stay one tap away). Only real
    // transitions are written: the initial "not loaded yet" null must not
    // overwrite a true left behind by a shift that is still running.
    ref.listenManual<ShiftState>(shiftProvider, (prev, next) {
      if (next.activeShift != null) {
        EntranceGate.recordShiftActive(true);
      } else if (prev?.activeShift != null) {
        EntranceGate.recordShiftActive(false);
      }
    }, fireImmediately: true);
  }

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: PageView(
        controller: _pageController,
        physics: const NeverScrollableScrollPhysics(),
        children: _screens,
      ),
      bottomNavigationBar: AnimatedCustomTabBar(
        currentIndex: _currentIndex,
        onTap: (index) {
          if (_currentIndex != index) {
            setState(() {
              _currentIndex = index;
            });
            _pageController.animateToPage(
              index,
              duration: const Duration(milliseconds: 300),
              curve: Curves.easeOutCubic,
            );
          }
        },
        items: const [
          AnimatedTabItem(
            title: 'Home',
            icon: Icons.explore_outlined,
            activeIcon: Icons.explore_rounded,
          ),
          AnimatedTabItem(
            title: 'History',
            icon: Icons.receipt_long_outlined,
            activeIcon: Icons.receipt_long_rounded,
          ),
          AnimatedTabItem(
            title: 'Settings',
            icon: Icons.tune_outlined,
            activeIcon: Icons.tune_rounded,
          ),
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Custom Fluid Animated Bottom Tab Bar with Micro-interactions
// ─────────────────────────────────────────────────────────────────────────────
class AnimatedTabItem {
  final String title;
  final IconData icon;
  final IconData activeIcon;

  const AnimatedTabItem({
    required this.title,
    required this.icon,
    required this.activeIcon,
  });
}

class AnimatedCustomTabBar extends StatelessWidget {
  final int currentIndex;
  final ValueChanged<int> onTap;
  final List<AnimatedTabItem> items;

  const AnimatedCustomTabBar({
    super.key,
    required this.currentIndex,
    required this.onTap,
    required this.items,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final totalTabs = items.length;
    final alignX = -1.0 + (2.0 / (totalTabs - 1)) * currentIndex;

    return Container(
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF161B26) : Colors.white,
        border: Border(
          top: BorderSide(
            color: isDark ? const Color(0xFF1E293B) : const Color(0xFFE5E7EB),
            width: 1,
          ),
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: isDark ? 0.35 : 0.06),
            blurRadius: 12,
            offset: const Offset(0, -3),
          ),
        ],
      ),
      child: SafeArea(
        top: false,
        child: SizedBox(
          height: 64,
          child: Stack(
            children: [
              // 1. Sliding Bubble / Pill Indicator
              AnimatedAlign(
                alignment: Alignment(alignX, 0),
                duration: const Duration(milliseconds: 320),
                curve: Curves.easeOutBack,
                child: FractionallySizedBox(
                  widthFactor: 1.0 / totalTabs,
                  child: Center(
                    child: Container(
                      height: 44,
                      width: 76,
                      decoration: BoxDecoration(
                        color: const Color(0xFFCC0000).withValues(alpha: isDark ? 0.16 : 0.08),
                        borderRadius: BorderRadius.circular(22),
                        border: Border.all(
                          color: const Color(0xFFCC0000).withValues(alpha: isDark ? 0.28 : 0.14),
                          width: 1,
                        ),
                      ),
                    ),
                  ),
                ),
              ),

              // 2. Sliding top red accent line
              AnimatedAlign(
                alignment: Alignment(alignX, -1.0),
                duration: const Duration(milliseconds: 320),
                curve: Curves.easeOutCubic,
                child: FractionallySizedBox(
                  widthFactor: 1.0 / totalTabs,
                  child: Center(
                    child: Container(
                      height: 3,
                      width: 28,
                      decoration: BoxDecoration(
                        color: const Color(0xFFCC0000),
                        borderRadius: BorderRadius.circular(2),
                      ),
                    ),
                  ),
                ),
              ),

              // 3. Tab Buttons with Springing / Popping Icons
              Row(
                children: List.generate(totalTabs, (index) {
                  final item = items[index];
                  final isSelected = index == currentIndex;

                  return Expanded(
                    child: GestureDetector(
                      behavior: HitTestBehavior.opaque,
                      onTap: () {
                        HapticFeedback.lightImpact();
                        onTap(index);
                      },
                      child: Center(
                        child: AnimatedSlide(
                          offset: isSelected ? const Offset(0, -0.06) : Offset.zero,
                          duration: const Duration(milliseconds: 280),
                          curve: Curves.easeOutBack,
                          child: AnimatedScale(
                            scale: isSelected ? 1.10 : 1.0,
                            duration: const Duration(milliseconds: 280),
                            curve: Curves.easeOutBack,
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Icon(
                                  isSelected ? item.activeIcon : item.icon,
                                  size: 20,
                                  color: isSelected
                                      ? const Color(0xFFCC0000)
                                      : (isDark ? const Color(0xFF888888) : const Color(0xFF6B7280)),
                                ),
                                const SizedBox(height: 3),
                                AnimatedDefaultTextStyle(
                                  duration: const Duration(milliseconds: 200),
                                  style: GoogleFonts.outfit(
                                    fontSize: 11,
                                    fontWeight: isSelected ? FontWeight.w800 : FontWeight.w500,
                                    color: isSelected
                                        ? const Color(0xFFCC0000)
                                        : (isDark ? const Color(0xFF888888) : const Color(0xFF6B7280)),
                                    letterSpacing: 0.2,
                                  ),
                                  child: Text(item.title),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),
                    ),
                  );
                }),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Sleek, high-fidelity History Screen (Dynamic Date Range Picker & Sunday Start)
// ─────────────────────────────────────────────────────────────────────────────
class HistoryTab extends ConsumerStatefulWidget {
  const HistoryTab({super.key});

  @override
  ConsumerState<HistoryTab> createState() => _HistoryTabState();
}

class _HistoryTabState extends ConsumerState<HistoryTab> {
  late DateTime _startDate;
  late DateTime _endDate;
  List<Map<String, dynamic>> _shifts = [];
  bool _isLoading = false;
  RealtimeChannel? _historyShiftsChannel;

  // ── Calendar (item 1) ──────────────────────────────────────────────
  // Replaces the plain showDateRangePicker with an embedded month/week
  // calendar (table_calendar) so a driver can see which days actually
  // have logged shifts at a glance, not just pick a blind date range.
  // Reimplements the visual language of 21st.dev's community calendar
  // pattern natively — that catalogue is React-only and can't run in a
  // Flutter app, so this is a from-scratch Flutter equivalent rather
  // than an import.
  CalendarFormat _calendarFormat = CalendarFormat.week;
  DateTime _focusedDay = DateTime.now();
  DateTime? _rangeStart;
  DateTime? _rangeEnd;

  // ── Progress rings (item 3) ─────────────────────────────────────────
  // Follow whatever range is currently selected (_startDate.._endDate) —
  // pick a day, a week, or a whole month on the calendar and the rings
  // recompute for exactly that period, rather than being pinned to a
  // fixed "this week".
  // The period's own shifts are _shifts (same query) — only the baseline
  // period and fuel receipts need fetching separately.
  List<Map<String, dynamic>> _ringBaselineShifts = [];
  List<Map<String, dynamic>> _ringPeriodFuel = [];
  bool _ringsLoading = false;

  // ── Hours table (telemetry driving hours vs logged working hours) ──
  // A second view for this same _startDate.._endDate range, toggled
  // alongside the shift list rather than added as unbounded extra
  // content — see the SHIFTS/HOURS segmented control in build().
  bool _showHoursTable = false;
  List<Map<String, dynamic>> _hoursGpsPings = [];
  bool _hoursLoading = false;

  // ── DVSA compliance (regulatory standing, not the browsed range) ───
  // Always a fixed rolling ~15-day window ending today, independent of
  // whatever the calendar picker above is set to — "am I legal to keep
  // driving" is a question about now, not about a historical range the
  // driver happens to be browsing.
  List<Map<String, dynamic>> _complianceShifts = [];
  List<Map<String, dynamic>> _complianceGpsPings = [];
  bool _complianceLoading = false;

  static DateTime _sundayOf(DateTime d) => DateTime(d.year, d.month, d.day).subtract(Duration(days: d.weekday % 7));

  @override
  void initState() {
    super.initState();
    // Default weekly views to group days strictly from Sunday to Saturday
    final now = DateTime.now();
    final int daysToSubtract = now.weekday % 7; // Sunday maps to 0, Monday to 1, Saturday to 6
    _startDate = DateTime(now.year, now.month, now.day).subtract(Duration(days: daysToSubtract));
    _endDate = _startDate.add(const Duration(days: 6));
    _reloadForCurrentRange();
    _loadComplianceData();
    _setupHistoryRealtime();
  }

  /// Fixed rolling window (last 15 days, ending today) for the DVSA
  /// section — deliberately not tied to _startDate/_endDate, so changing
  /// the calendar picker for the Shifts/simple-Hours view never shifts
  /// what "am I compliant right now" is being measured against. 15 days
  /// covers this week and last week in full even when today is a Monday.
  Future<void> _loadComplianceData({bool silent = false}) async {
    final driverId = SupabaseService.currentDriverId;
    if (driverId == null) return;
    if (!silent) setState(() => _complianceLoading = true);
    final end = DateTime.now();
    final start = end.subtract(const Duration(days: 15));
    try {
      final results = await Future.wait([
        SupabaseService.fetchDriverShifts(driverId: driverId, startDate: start, endDate: end),
        SupabaseService.fetchDriverGpsPings(driverId: driverId, startDate: start, endDate: end),
      ]);
      if (mounted) {
        setState(() {
          _complianceShifts = results[0];
          _complianceGpsPings = results[1];
          _complianceLoading = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _complianceLoading = false);
    }
  }

  /// The single place that reloads everything driven by _startDate.._endDate
  /// — the shift list/summary card AND the progress rings — so the two
  /// can never drift out of sync with each other. [silent] refreshes keep
  /// the current content on screen (realtime updates, pull-to-refresh)
  /// instead of flashing loading states.
  Future<void> _reloadForCurrentRange({bool silent = false}) async {
    await Future.wait([
      _loadShifts(silent: silent),
      _loadRingsData(silent: silent),
      _loadHoursGps(silent: silent),
    ]);
  }

  /// Raw GPS pings for the selected range — the Hours table's telemetry
  /// source. Fetched alongside the shift list (not derived from it) since
  /// it only needs the driver id and date range, same as _loadShifts.
  Future<void> _loadHoursGps({bool silent = false}) async {
    final driverId = SupabaseService.currentDriverId;
    if (driverId == null) return;
    if (!silent) setState(() => _hoursLoading = true);
    try {
      final pings = await SupabaseService.fetchDriverGpsPings(
        driverId: driverId,
        startDate: _startDate,
        endDate: _endDate,
      );
      if (mounted) setState(() { _hoursGpsPings = pings; _hoursLoading = false; });
    } catch (_) {
      if (mounted) setState(() => _hoursLoading = false);
    }
  }

  /// Fetches the selected period's shifts (for the earnings ring), an
  /// equal-length period immediately before it (as an "average" baseline
  /// to compare against — there's no separate earnings-target field in
  /// the schema, so the driver's own recent period of the same length is
  /// the honest, always-available comparison), and the period's fuel
  /// receipts (for the fuel ring).
  Future<void> _loadRingsData({bool silent = false}) async {
    final driverId = SupabaseService.currentDriverId;
    if (driverId == null) return;
    if (!silent) setState(() => _ringsLoading = true);
    final periodDays = _endDate.difference(_startDate).inDays + 1;
    final baselineEnd = _startDate.subtract(const Duration(days: 1));
    final baselineStart = baselineEnd.subtract(Duration(days: periodDays - 1));
    try {
      final results = await Future.wait([
        SupabaseService.fetchDriverShifts(driverId: driverId, startDate: baselineStart, endDate: baselineEnd),
        SupabaseService.fetchMyFuelReceipts(since: _startDate),
      ]);
      if (mounted) {
        setState(() {
          _ringBaselineShifts = results[0];
          // fetchMyFuelReceipts is "since" only (no upper bound) — trim
          // to the selected period's end here so a range in the past
          // doesn't pick up fuel logged after it.
          _ringPeriodFuel = (results[1]).where((r) {
            final created = DateTime.tryParse(r['created_at']?.toString() ?? '')?.toLocal();
            return created != null && !created.isAfter(DateTime(_endDate.year, _endDate.month, _endDate.day, 23, 59, 59));
          }).toList();
          _ringsLoading = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _ringsLoading = false);
    }
  }

  void _setupHistoryRealtime() {
    final driverId = SupabaseService.currentDriverId;
    if (driverId == null || SupabaseService.isMockMode) return;

    try {
      _historyShiftsChannel = SupabaseService.client
          .channel('history_tab_shifts_$driverId')
          .onPostgresChanges(
            event: PostgresChangeEvent.all,
            schema: 'public',
            table: 'shifts',
            filter: PostgresChangeFilter(
              type: PostgresChangeFilterType.eq,
              column: 'driver_id',
              value: driverId,
            ),
            callback: (_) {
              debugPrint('⚡ Shifts updated via Realtime in HistoryTab. Refreshing...');
              if (mounted) {
                _reloadForCurrentRange(silent: true);
                ref.read(authProvider.notifier).refreshProfile();
              }
            },
          )
          ..subscribe();
    } catch (_) {}
  }

  @override
  void dispose() {
    if (_historyShiftsChannel != null) {
      SupabaseService.client.removeChannel(_historyShiftsChannel!);
      _historyShiftsChannel = null;
    }
    super.dispose();
  }

  Future<void> _loadShifts({bool silent = false}) async {
    final driverId = SupabaseService.currentDriverId;
    if (driverId == null) return;

    if (!silent) {
      setState(() {
        _isLoading = true;
      });
    }

    try {
      final data = await SupabaseService.fetchDriverShifts(
        driverId: driverId,
        startDate: _startDate,
        endDate: _endDate,
      );
      if (mounted) {
        setState(() {
          _shifts = data;
          _isLoading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _isLoading = false;
        });
      }
    }
  }

  /// A day has "activity" if any loaded shift started on it — the
  /// calendar's dot marker. Only checks _shifts (whatever's currently
  /// loaded for the selected range/month), so switching to Month format
  /// and paging to a different month reloads that month's shifts first
  /// (see onPageChanged below) rather than needing a second, separate
  /// marker query.
  List<dynamic> _eventsForDay(DateTime day) {
    final dayOnly = DateTime(day.year, day.month, day.day);
    return _shifts.where((s) {
      final start = DateTime.tryParse(s['start_time']?.toString() ?? '')?.toLocal();
      if (start == null) return false;
      return DateTime(start.year, start.month, start.day) == dayOnly;
    }).toList();
  }

  void _applyRange(DateTime start, DateTime end) {
    setState(() {
      _startDate = DateTime(start.year, start.month, start.day);
      _endDate = DateTime(end.year, end.month, end.day);
      _rangeStart = _startDate;
      _rangeEnd = _endDate;
      _focusedDay = start;
    });
    _reloadForCurrentRange();
  }

  void _jumpToThisWeek() {
    final weekStart = _sundayOf(DateTime.now());
    setState(() {
      _rangeStart = null;
      _rangeEnd = null;
    });
    _applyRange(weekStart, weekStart.add(const Duration(days: 6)));
  }

  /// The calendar itself is unchanged — same TableCalendar, same day
  /// markers, same range selection — only its presentation changed: it
  /// now lives in this bottom sheet instead of expanding inline on the
  /// page, so the page only ever shows the compact icon + range chip.
  void _openCalendarSheet() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (sheetContext) {
        return StatefulBuilder(
          builder: (sheetContext, setModalState) {
            void applyAndRefreshSheet(DateTime start, DateTime end) {
              _applyRange(start, end);
              setModalState(() {});
            }

            return Padding(
              padding: EdgeInsets.only(left: 12, right: 12, top: 12, bottom: 12 + MediaQuery.of(sheetContext).viewInsets.bottom),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(width: 36, height: 4, decoration: BoxDecoration(color: const Color(0xFFE0E0E0), borderRadius: BorderRadius.circular(2))),
                  const SizedBox(height: 8),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      TextButton(
                        onPressed: () {
                          _jumpToThisWeek();
                          setModalState(() {});
                        },
                        child: const Text('THIS WEEK', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: Color(0xFFCC0000))),
                      ),
                      TextButton(
                        onPressed: () => setModalState(() {
                          _calendarFormat = _calendarFormat == CalendarFormat.week ? CalendarFormat.month : CalendarFormat.week;
                        }),
                        child: Text(
                          _calendarFormat == CalendarFormat.week ? 'SHOW MONTH' : 'SHOW WEEK',
                          style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: Color(0xFF666666)),
                        ),
                      ),
                    ],
                  ),
                  TableCalendar(
                    firstDay: DateTime(2025),
                    lastDay: DateTime(2030),
                    focusedDay: _focusedDay,
                    calendarFormat: _calendarFormat,
                    rangeStartDay: _rangeStart,
                    rangeEndDay: _rangeEnd,
                    rangeSelectionMode: RangeSelectionMode.toggledOn,
                    eventLoader: _eventsForDay,
                    startingDayOfWeek: StartingDayOfWeek.sunday,
                    headerStyle: const HeaderStyle(
                      formatButtonVisible: false,
                      titleCentered: true,
                      titleTextStyle: TextStyle(fontSize: 14, fontWeight: FontWeight.w900, color: Color(0xFF333333)),
                      leftChevronIcon: Icon(Icons.chevron_left, color: Color(0xFFCC0000)),
                      rightChevronIcon: Icon(Icons.chevron_right, color: Color(0xFFCC0000)),
                    ),
                    calendarStyle: const CalendarStyle(
                      outsideDaysVisible: false,
                      todayDecoration: BoxDecoration(color: Color(0xFFF5D9D9), shape: BoxShape.circle),
                      todayTextStyle: TextStyle(color: Color(0xFF333333), fontWeight: FontWeight.w800),
                      rangeStartDecoration: BoxDecoration(color: Color(0xFFCC0000), shape: BoxShape.circle),
                      rangeEndDecoration: BoxDecoration(color: Color(0xFFCC0000), shape: BoxShape.circle),
                      withinRangeDecoration: BoxDecoration(color: Color(0xFFF5D9D9), shape: BoxShape.circle),
                      selectedDecoration: BoxDecoration(color: Color(0xFFCC0000), shape: BoxShape.circle),
                      markerDecoration: BoxDecoration(color: Color(0xFFCC0000), shape: BoxShape.circle),
                      markersMaxCount: 1,
                      markerSize: 5,
                      markerMargin: EdgeInsets.only(top: 4),
                    ),
                    onDaySelected: (selected, focused) => applyAndRefreshSheet(selected, selected),
                    onRangeSelected: (start, end, focused) {
                      if (start != null && end != null) {
                        applyAndRefreshSheet(start, end);
                      } else if (start != null) {
                        setState(() {
                          _rangeStart = start;
                          _rangeEnd = null;
                          _focusedDay = start;
                        });
                        setModalState(() {});
                      }
                    },
                    onPageChanged: (focused) {
                      // Month view: load that whole month's shifts up
                      // front so every day's marker dot is correct as
                      // soon as it's on screen, not just the days the
                      // driver has already selected into a range.
                      _focusedDay = focused;
                      if (_calendarFormat == CalendarFormat.month) {
                        final monthStart = DateTime(focused.year, focused.month, 1);
                        final monthEnd = DateTime(focused.year, focused.month + 1, 0);
                        setState(() {
                          _startDate = monthStart;
                          _endDate = monthEnd;
                        });
                        _reloadForCurrentRange();
                      }
                    },
                  ),
                ],
              ),
            );
          },
        );
      },
    );
  }

  // ── Range navigation ──────────────────────────────────────────────
  // Calendar-day arithmetic (DateTime(y, m, d + n)) rather than adding
  // Durations, so stepping across a clock change never lands on 23:00 of
  // the previous day.

  bool get _isFullMonth =>
      _startDate.day == 1 && _endDate == DateTime(_startDate.year, _startDate.month + 1, 0);

  int get _periodDays =>
      DateTime.utc(_endDate.year, _endDate.month, _endDate.day)
          .difference(DateTime.utc(_startDate.year, _startDate.month, _startDate.day))
          .inDays +
      1;

  bool get _isThisWeek {
    final weekStart = _sundayOf(DateTime.now());
    return _startDate == weekStart && _periodDays == 7;
  }

  /// Can't page past the range that contains today.
  bool get _canStepForward {
    final now = DateTime.now();
    return _endDate.isBefore(DateTime(now.year, now.month, now.day));
  }

  void _stepRange(int direction) {
    if (_isFullMonth) {
      final start = DateTime(_startDate.year, _startDate.month + direction, 1);
      _applyRange(start, DateTime(start.year, start.month + 1, 0));
    } else {
      final days = _periodDays * direction;
      _applyRange(
        DateTime(_startDate.year, _startDate.month, _startDate.day + days),
        DateTime(_endDate.year, _endDate.month, _endDate.day + days),
      );
    }
  }

  String get _rangeText {
    if (_periodDays == 1) return DateFormat('EEE d MMM yyyy').format(_startDate);
    if (_isFullMonth) return DateFormat('MMMM yyyy').format(_startDate);
    final sameYear = _startDate.year == _endDate.year;
    final startFmt = DateFormat(sameYear ? 'd MMM' : 'd MMM yyyy');
    return '${startFmt.format(_startDate)} – ${DateFormat('d MMM yyyy').format(_endDate)}';
  }

  String get _periodLabel {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    if (_periodDays == 1) return _startDate == today ? 'Today' : DateFormat('EEEE').format(_startDate);
    if (_isThisWeek) return 'This week';
    if (_isFullMonth) return DateFormat('MMMM').format(_startDate);
    if (_periodDays == 7) return 'Week of ${DateFormat('d MMM').format(_startDate)}';
    return '$_periodDays days';
  }

  bool _isExporting = false;

  Future<void> _exportPeriod({required bool isFixed, required double rateValue}) async {
    if (_isExporting) return;
    final driver = ref.read(authProvider).driver;
    final name = (driver?['full_name'] as String?)?.trim();
    final messenger = ScaffoldMessenger.of(context);
    setState(() => _isExporting = true);
    try {
      await shareEarningsSummary(
        driverName: (name != null && name.isNotEmpty) ? name : 'Driver',
        driverCode: driver?['driver_id']?.toString(),
        start: _startDate,
        end: _endDate,
        shifts: _shifts.map((s) => ShiftPayBreakdown.fromShift(s, isFixed: isFixed, rateValue: rateValue)).toList(),
        isFixed: isFixed,
        rateValue: rateValue,
      );
    } catch (_) {
      messenger.showSnackBar(const SnackBar(
        content: Text('Could not create the earnings summary. Please try again.'),
        backgroundColor: Color(0xFFCC0000),
        behavior: SnackBarBehavior.floating,
      ));
    } finally {
      if (mounted) setState(() => _isExporting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    // Aggregate metrics
    final double totalHours = _shifts.fold(0.0, (sum, s) => sum + ((s['total_hours'] as num?)?.toDouble() ?? 0.0));
    final double totalPay = _shifts.fold(0.0, (sum, s) => sum + ((s['total_pay'] as num?)?.toDouble() ?? 0.0));

    // Derive dynamic rate from driver profile
    final authState = ref.watch(authProvider);
    final driverMap = authState.driver;
    final isFixed = driverMap?['rate_type'] == 'Fixed Shift Rate (Day Rate)' || driverMap?['rate_type'] == 'Fixed';
    final double rateValue = isFixed
        ? ((driverMap?['fixed_rate'] as num?)?.toDouble() ?? 0.0)
        : ((driverMap?['hourly_rate'] as num?)?.toDouble() ?? (driverMap?['mon_fri_rate'] as num?)?.toDouble() ?? 16.0);

    final rates = _shifts
        .map((s) => (s['effective_rate'] as num?)?.toDouble() ?? (s['base_hourly_rate'] as num?)?.toDouble() ?? rateValue)
        .toSet()
        .toList();
    rates.sort();
    final ratesString = isFixed
        ? '£${rateValue.toStringAsFixed(2)} / shift'
        : (rates.isNotEmpty ? rates.map((r) => '£${r.toStringAsFixed(2)} / hr').join(', ') : '£${rateValue.toStringAsFixed(2)} / hr');
    final rateLabel = isFixed ? 'Day rate' : (rates.length > 1 ? 'Hourly rates' : 'Hourly rate');

    final breakdowns = _shifts.map((s) => ShiftPayBreakdown.fromShift(s, isFixed: isFixed, rateValue: rateValue)).toList();

    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        centerTitle: false,
        titleSpacing: 20,
        title: Image.asset('assets/images/tachyo_logo.png', height: 24, fit: BoxFit.contain),
        actions: [
          IconButton(
            tooltip: 'Export earnings summary (PDF)',
            onPressed: _shifts.isEmpty || _isExporting ? null : () => _exportPeriod(isFixed: isFixed, rateValue: rateValue),
            icon: _isExporting
                ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: TachyoTheme.brandRed))
                : Icon(Icons.picture_as_pdf_outlined, size: 22, color: _shifts.isEmpty ? const Color(0xFFCCCCCC) : TachyoTheme.charcoal),
          ),
          Padding(
            padding: const EdgeInsets.only(right: 8),
            child: TextButton.icon(
              onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const LoadHistoryScreen())),
              icon: const Icon(Icons.local_shipping_outlined, size: 20),
              label: const Text('Loads'),
              style: TextButton.styleFrom(
                foregroundColor: TachyoTheme.charcoal,
                textStyle: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700),
              ),
            ),
          ),
        ],
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(1),
          child: Container(height: 1, color: TachyoTheme.border),
        ),
      ),
      body: SafeArea(
        child: RefreshIndicator(
          color: TachyoTheme.brandRed,
          onRefresh: () => Future.wait([
            _reloadForCurrentRange(silent: true),
            _loadComplianceData(silent: true),
          ]),
          child: CustomScrollView(
            physics: const AlwaysScrollableScrollPhysics(),
            slivers: [
              // Range bar — pinned while the rest of the page scrolls. The
              // calendar sheet is unchanged; the arrows just step the same
              // range backwards/forwards by its own length.
              SliverPersistentHeader(
                pinned: true,
                delegate: _PinnedBarDelegate(
                  height: 64,
                  child: _buildRangeBar(),
                ),
              ),

              SliverToBoxAdapter(
                child: _buildSummaryCard(
                  theme,
                  totalPay: totalPay,
                  totalHours: totalHours,
                  rateLabel: rateLabel,
                  ratesString: ratesString,
                ),
              ),

              // ── Shifts / Hours toggle ─────────────────────────────────
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(20, 4, 20, 12),
                  child: Row(
                    children: [
                      Expanded(
                        child: _viewToggleButton(theme, label: 'Logged shifts', selected: !_showHoursTable, onTap: () => setState(() => _showHoursTable = false)),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: _viewToggleButton(theme, label: 'Hours', selected: _showHoursTable, onTap: () => setState(() => _showHoursTable = true)),
                      ),
                    ],
                  ),
                ),
              ),

              if (_showHoursTable)
                SliverToBoxAdapter(child: _buildHoursTable(theme))
              else if (_isLoading)
                SliverPadding(
                  padding: const EdgeInsets.symmetric(horizontal: 20),
                  sliver: SliverList.builder(
                    itemCount: 3,
                    itemBuilder: (context, _) => Container(
                      height: 82,
                      margin: const EdgeInsets.only(bottom: 10),
                      decoration: BoxDecoration(color: TachyoTheme.surface, borderRadius: BorderRadius.circular(16)),
                    ),
                  ),
                )
              else if (_shifts.isEmpty)
                SliverToBoxAdapter(child: _buildEmptyState())
              else
                SliverPadding(
                  padding: const EdgeInsets.symmetric(horizontal: 20),
                  sliver: SliverList.builder(
                    itemCount: breakdowns.length,
                    itemBuilder: (context, index) => _ShiftRow(
                      key: ValueKey(_shifts[index]['id'] ?? index),
                      shift: breakdowns[index],
                      isFixed: isFixed,
                    ),
                  ),
                ),

              const SliverToBoxAdapter(child: SizedBox(height: 28)),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildRangeBar() {
    return Container(
      color: Colors.white,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      child: Row(
        children: [
          IconButton(
            tooltip: 'Previous period',
            onPressed: () => _stepRange(-1),
            icon: const Icon(Icons.chevron_left_rounded, size: 28, color: TachyoTheme.charcoal),
          ),
          Expanded(
            child: Material(
              color: TachyoTheme.surface,
              borderRadius: BorderRadius.circular(24),
              child: InkWell(
                onTap: _openCalendarSheet,
                borderRadius: BorderRadius.circular(24),
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const Icon(Icons.calendar_today_outlined, size: 16, color: TachyoTheme.brandRed),
                      const SizedBox(width: 10),
                      Flexible(
                        child: Text(
                          _rangeText,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w700, color: TachyoTheme.charcoal),
                        ),
                      ),
                      const SizedBox(width: 4),
                      const Icon(Icons.expand_more_rounded, size: 20, color: TachyoTheme.charcoalLight),
                    ],
                  ),
                ),
              ),
            ),
          ),
          IconButton(
            tooltip: 'Next period',
            onPressed: _canStepForward ? () => _stepRange(1) : null,
            icon: Icon(
              Icons.chevron_right_rounded,
              size: 28,
              color: _canStepForward ? TachyoTheme.charcoal : const Color(0xFFCCCCCC),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSummaryCard(
    ThemeData theme, {
    required double totalPay,
    required double totalHours,
    required String rateLabel,
    required String ratesString,
  }) {
    return Container(
      margin: const EdgeInsets.fromLTRB(20, 4, 20, 12),
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: TachyoTheme.surface,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Text(
                _periodLabel,
                style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700, color: TachyoTheme.charcoalMid),
              ),
              const Spacer(),
              if (_ringsLoading || _isLoading)
                const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2, color: TachyoTheme.brandRed)),
            ],
          ),
          const SizedBox(height: 6),
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Expanded(
                child: FittedBox(
                  fit: BoxFit.scaleDown,
                  alignment: Alignment.centerLeft,
                  child: Text(
                    '£${totalPay.toStringAsFixed(2)}',
                    style: const TextStyle(fontSize: 34, fontWeight: FontWeight.w800, color: TachyoTheme.brandRed, letterSpacing: -0.8),
                  ),
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    '${totalHours.toStringAsFixed(1)} h',
                    style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: TachyoTheme.charcoal),
                  ),
                  Text(
                    '${_shifts.length} shift${_shifts.length == 1 ? '' : 's'}',
                    style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: TachyoTheme.charcoalLight),
                  ),
                ],
              ),
            ],
          ),
          const SizedBox(height: 14),
          const Divider(height: 1, color: TachyoTheme.border),
          const SizedBox(height: 12),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                rateLabel,
                style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: TachyoTheme.charcoalLight),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  ratesString,
                  textAlign: TextAlign.right,
                  style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700, color: TachyoTheme.charcoal),
                ),
              ),
            ],
          ),
          // Progress rings — Shifts view only; the Hours view has its own
          // dense DVSA compliance content and doesn't need these too.
          if (!_showHoursTable) ...[
            const SizedBox(height: 18),
            _buildProgressRings(theme),
          ],
        ],
      ),
    );
  }

  Widget _buildEmptyState() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(32, 32, 32, 16),
      child: Column(
        children: [
          const Icon(Icons.event_busy_outlined, size: 40, color: Color(0xFFCCCCCC)),
          const SizedBox(height: 12),
          const Text(
            'No shifts in this period',
            style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: TachyoTheme.charcoal),
          ),
          const SizedBox(height: 4),
          const Text(
            'Use the arrows or the calendar above to pick another range.',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w500, color: TachyoTheme.charcoalLight),
          ),
          if (!_isThisWeek) ...[
            const SizedBox(height: 8),
            TextButton(
              onPressed: _jumpToThisWeek,
              style: TextButton.styleFrom(
                foregroundColor: TachyoTheme.brandRed,
                minimumSize: const Size(48, 48),
                textStyle: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700),
              ),
              child: const Text('Go to this week'),
            ),
          ],
        ],
      ),
    );
  }

  Widget _viewToggleButton(ThemeData theme, {required String label, required bool selected, required VoidCallback onTap}) {
    return Material(
      color: selected ? TachyoTheme.charcoal : Colors.white,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 180),
          height: 46,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: selected ? TachyoTheme.charcoal : const Color(0xFFDDDDDD), width: 1),
          ),
          child: Text(
            label,
            style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w700,
              color: selected ? Colors.white : TachyoTheme.charcoalMid,
            ),
          ),
        ),
      ),
    );
  }


  /// Three rings for "how's this period going" — they now follow
  /// whatever range is selected above (_startDate.._endDate), recomputed
  /// every time that range changes, rather than being pinned to a fixed
  /// week.
  ///
  /// - Fuel: the period's average full-tank MPG (migration 070's engine —
  ///   the same calculated_mpg the admin audit uses) against a 9.0 MPG
  ///   "good economy" reference for a laden HGV. No fill-ups in the
  ///   period shows an honest "no data" ring rather than a fake 0%.
  /// - Earnings: the period's pay so far against an equal-length period
  ///   immediately before it — there's no separate earnings-target field
  ///   anywhere in the schema, so comparing against the driver's own
  ///   immediately-preceding period of the same length is the only
  ///   honest, always-available baseline, and it's explicitly labelled
  ///   as such rather than implying a company target.
  /// - Rest: hours NOT on shift in the period against a proportional
  ///   reference (120h per 7 days, scaled to the period's actual length)
  ///   — a plain "time off the clock" indicator, deliberately not framed
  ///   as WTD/tachograph legal compliance, which the app's own privacy
  ///   policy already disclaims as advisory-only elsewhere.
  Widget _buildProgressRings(ThemeData theme) {
    final periodDays = _periodDays;

    // Fuel
    final fullTankLogs = _ringPeriodFuel.where((r) => r['is_full_tank'] == true && r['calculated_mpg'] != null).toList();
    final hasFuelData = fullTankLogs.isNotEmpty;
    final avgMpg = hasFuelData
        ? fullTankLogs.map((r) => (r['calculated_mpg'] as num).toDouble()).reduce((a, b) => a + b) / fullTankLogs.length
        : 0.0;
    const goodMpgReference = 9.0;
    final fuelProgress = hasFuelData ? (avgMpg / goodMpgReference).clamp(0.0, 1.0) : 0.0;
    final anyTheftFlag = fullTankLogs.any((r) => r['theft_flag'] == true);

    // Earnings
    double sumPay(List<Map<String, dynamic>> shifts) => shifts.fold(0.0, (sum, s) => sum + ((s['total_pay'] as num?)?.toDouble() ?? 0.0));
    final periodPay = sumPay(_shifts);
    final baselinePay = sumPay(_ringBaselineShifts);
    final hasEarningsBaseline = baselinePay > 0;
    final earningsProgress = hasEarningsBaseline ? (periodPay / baselinePay).clamp(0.0, 1.0) : (periodPay > 0 ? 1.0 : 0.0);

    // Rest
    final hoursWorked = _shifts.fold(0.0, (sum, s) => sum + ((s['total_hours'] as num?)?.toDouble() ?? 0.0));
    final periodHours = periodDays * 24.0;
    final restReferenceHours = (120.0 / 7.0) * periodDays;
    final restHours = (periodHours - hoursWorked).clamp(0.0, periodHours);
    final restProgress = restReferenceHours > 0 ? (restHours / restReferenceHours).clamp(0.0, 1.0) : 0.0;

    // Sits inside the summary card, which already carries the period label
    // and loading indicator.
    return Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: [
              ProgressRing(
                progress: fuelProgress,
                isDark: false,
                centerText: hasFuelData ? avgMpg.toStringAsFixed(1) : '—',
                label: hasFuelData ? 'FUEL (MPG)' : 'FUEL\n(no fill-ups)',
                // Higher = better here (closer to/above the 9 MPG
                // reference), the opposite of ProgressRing's default
                // escalation (which reddens as progress climbs, meant
                // for "approaching a limit" rings) — so this is always
                // an explicit colour, never the auto one: green normally,
                // forced red the moment any full-tank fill in this
                // period tripped the theft-detection engine (migration
                // 070), regardless of how good the average otherwise
                // looks.
                color: anyTheftFlag ? const Color(0xFFCC0000) : const Color(0xFF10B981),
              ),
              ProgressRing(
                progress: earningsProgress,
                isDark: false,
                centerText: '£${periodPay.toStringAsFixed(0)}',
                label: hasEarningsBaseline ? 'EARNINGS\nvs prior period' : 'EARNINGS',
                color: const Color(0xFFCC0000),
              ),
              ProgressRing(
                progress: restProgress,
                isDark: false,
                centerText: '${restHours.toStringAsFixed(0)}h',
                label: 'REST\ntime off the clock',
                color: const Color(0xFF3B82F6),
              ),
            ],
    );
  }

  // ── Hours table: telemetry driving hours vs logged working hours ───
  // Driving minutes are derived from real GPS speed pings (the same
  // telemetry source and 0.5 m/s moving threshold the admin dashboard's
  // Driver Hours page uses) — genuinely "what happened", not the shift's
  // logged duration. Working hours are the shift's own total_hours (the
  // payroll-trusted on-duty figure). "Available" is what's left of a
  // fixed daily reference before that limit is reached — advisory only,
  // from GPS telemetry, not a certified tachograph record; this app has
  // no tachograph head fitted to any vehicle.
  static const double _drivingSpeedThresholdMps = 0.5;
  static const int _maxPingGapMinutes = 30;
  static const int _dailyDrivingLimitMinutes = 540; // 9h — EC561 daily driving limit
  static const int _dailyWorkingLimitMinutes = 900; // 15h — daily duty span ceiling

  static double _minutesBetween(String a, String b) =>
      (DateTime.parse(b).difference(DateTime.parse(a))).inSeconds / 60.0;

  /// Total driving minutes in a shift from its GPS pings — sums every gap
  /// where the ping at the end of it shows the driver moving, skipping
  /// any gap too large to trust as continuous (a dropped signal isn't
  /// assumed to be driving).
  static double _shiftDrivingMinutes(List<Map<String, dynamic>> pings) {
    double minutes = 0;
    for (int i = 1; i < pings.length; i++) {
      final gap = _minutesBetween(pings[i - 1]['recorded_at'] as String, pings[i]['recorded_at'] as String);
      if (gap <= 0 || gap > _maxPingGapMinutes) continue;
      final speed = (pings[i]['speed'] as num?)?.toDouble() ?? 0.0;
      if (speed >= _drivingSpeedThresholdMps) minutes += gap;
    }
    return minutes;
  }

  /// The longest stretch of continuous driving in a shift, for the 4h30
  /// break rule — the accumulator only resets on a stop of at least
  /// requiredBreakMin (45 min), the actual qualifying-break length,
  /// unlike the simple "still driving right now" heuristics elsewhere
  /// that reset on much shorter stops.
  static double _shiftLongestContinuousDrivingMinutes(List<Map<String, dynamic>> pings) {
    double current = 0;
    double stationaryRun = 0;
    double longest = 0;
    for (int i = 1; i < pings.length; i++) {
      final gap = _minutesBetween(pings[i - 1]['recorded_at'] as String, pings[i]['recorded_at'] as String);
      if (gap <= 0 || gap > _maxPingGapMinutes) continue;
      final speed = (pings[i]['speed'] as num?)?.toDouble() ?? 0.0;
      if (speed >= _drivingSpeedThresholdMps) {
        current += gap;
        stationaryRun = 0;
        if (current > longest) longest = current;
      } else {
        stationaryRun += gap;
        if (stationaryRun >= dvsa.requiredBreakMin) current = 0;
      }
    }
    return longest;
  }

  /// One row per calendar day in the selected range that actually has a
  /// logged shift, oldest first.
  List<_DayHoursRow> _buildDailyHoursRows() {
    final pingsByShift = <String, List<Map<String, dynamic>>>{};
    for (final p in _hoursGpsPings) {
      final sid = p['shift_id']?.toString();
      if (sid == null) continue;
      (pingsByShift[sid] ??= []).add(p);
    }

    final byDay = <DateTime, List<Map<String, dynamic>>>{};
    for (final s in _shifts) {
      final start = DateTime.tryParse(s['start_time']?.toString() ?? '')?.toLocal();
      if (start == null) continue;
      final dayKey = DateTime(start.year, start.month, start.day);
      (byDay[dayKey] ??= []).add(s);
    }

    final rows = byDay.entries.map((entry) {
      double drivingMinutes = 0;
      double workingMinutes = 0;
      for (final s in entry.value) {
        final shiftId = s['id']?.toString();
        final pings = shiftId != null ? (pingsByShift[shiftId] ?? const []) : const <Map<String, dynamic>>[];
        drivingMinutes += _shiftDrivingMinutes(pings);
        workingMinutes += (((s['total_hours'] as num?)?.toDouble() ?? 0.0)) * 60.0;
      }
      return _DayHoursRow(
        day: entry.key,
        drivingMinutes: drivingMinutes,
        workingMinutes: workingMinutes,
      );
    }).toList()
      ..sort((a, b) => b.day.compareTo(a.day));
    return rows;
  }

  static String _formatHM(double totalMinutes) {
    final m = totalMinutes.round().clamp(0, 1 << 30);
    final h = m ~/ 60;
    final mm = m % 60;
    if (h == 0) return '${mm}m';
    if (mm == 0) return '${h}h';
    return '${h}h ${mm}m';
  }

  Widget _buildHoursTable(ThemeData theme) {
    final rows = _buildDailyHoursRows();
    final dayFormat = DateFormat('EEE d MMM');

    if (_hoursLoading || _isLoading) {
      return const Padding(
        padding: EdgeInsets.only(top: 40),
        child: Center(child: CircularProgressIndicator(color: Color(0xFFCC0000))),
      );
    }
    // Lives inside the History page's single scroll view, so this builds a
    // plain column — no scroll view of its own.
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 4),
      child: rows.isEmpty
          ? Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 24),
                  child: Text(
                    'No shifts logged in this period.',
                    textAlign: TextAlign.center,
                    style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: TachyoTheme.charcoalLight),
                  ),
                ),
                _buildDvsaSection(theme),
              ],
            )
          : _buildHoursTableBody(theme, rows, dayFormat),
    );
  }

  Widget _buildHoursTableBody(ThemeData theme, List<_DayHoursRow> rows, DateFormat dayFormat) {
    Widget headerCell(String text, {bool alignEnd = true}) => Text(
          text,
          textAlign: alignEnd ? TextAlign.right : TextAlign.left,
          style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700, color: TachyoTheme.charcoalLight, height: 1.2),
        );

    Widget valueCell(String text, {Color color = TachyoTheme.charcoal}) => Text(
          text,
          textAlign: TextAlign.right,
          style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700, color: color),
        );

    return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 6),
            margin: const EdgeInsets.only(bottom: 4),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Expanded(flex: 4, child: headerCell('Day', alignEnd: false)),
                Expanded(flex: 3, child: headerCell('Driving')),
                Expanded(flex: 3, child: headerCell('Driving left')),
                Expanded(flex: 3, child: headerCell('Working')),
                Expanded(flex: 3, child: headerCell('Working left')),
              ],
            ),
          ),
          const Divider(height: 1, color: Color(0xFFE0E0E0)),
          ...rows.map((r) {
            final drivingAvail = (_dailyDrivingLimitMinutes - r.drivingMinutes).clamp(0.0, _dailyDrivingLimitMinutes.toDouble());
            final workingAvail = (_dailyWorkingLimitMinutes - r.workingMinutes).clamp(0.0, _dailyWorkingLimitMinutes.toDouble());
            final drivingOver = r.drivingMinutes > _dailyDrivingLimitMinutes;
            final workingOver = r.workingMinutes > _dailyWorkingLimitMinutes;
            return Container(
              padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 4),
              decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: Color(0xFFF0F0F0), width: 1))),
              child: Row(
                children: [
                  Expanded(
                    flex: 4,
                    child: Text(
                      dayFormat.format(r.day),
                      style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700, color: TachyoTheme.charcoal),
                    ),
                  ),
                  Expanded(flex: 3, child: valueCell(_formatHM(r.drivingMinutes), color: drivingOver ? const Color(0xFFCC0000) : const Color(0xFF333333))),
                  Expanded(flex: 3, child: valueCell(_formatHM(drivingAvail), color: const Color(0xFF10B981))),
                  Expanded(flex: 3, child: valueCell(_formatHM(r.workingMinutes), color: workingOver ? const Color(0xFFCC0000) : const Color(0xFF333333))),
                  Expanded(flex: 3, child: valueCell(_formatHM(workingAvail), color: const Color(0xFF10B981))),
                ],
              ),
            );
          }),
          const SizedBox(height: 12),
          const Text(
            'Driving hours are from GPS telemetry (speed readings), not a certified tachograph. '
            '"Left" = ${_dailyDrivingLimitMinutes ~/ 60}h daily driving / ${_dailyWorkingLimitMinutes ~/ 60}h daily working, minus what was logged that day — advisory only.',
            style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w500, color: TachyoTheme.charcoalLight, height: 1.4),
          ),
          const SizedBox(height: 28),
          _buildDvsaSection(theme),
        ],
    );
  }

  /// Builds the ShiftHoursInput list the DVSA engine needs from
  /// _complianceShifts (the fixed 15-day rolling window) plus, if one is
  /// running right now, the live active shift from shiftProvider — a
  /// driver mid-shift needs today's in-progress driving counted, not
  /// just yesterday's completed ones.
  dvsa.DvsaResult? _buildDvsaResult() {
    final pingsByShift = <String, List<Map<String, dynamic>>>{};
    for (final p in _complianceGpsPings) {
      final sid = p['shift_id']?.toString();
      if (sid == null) continue;
      (pingsByShift[sid] ??= []).add(p);
    }

    final inputs = <dvsa.ShiftHoursInput>[];
    for (final s in _complianceShifts) {
      final start = DateTime.tryParse(s['start_time']?.toString() ?? '')?.toLocal();
      final end = DateTime.tryParse(s['end_time']?.toString() ?? '')?.toLocal();
      if (start == null) continue;
      final pings = pingsByShift[s['id']?.toString()] ?? const <Map<String, dynamic>>[];
      inputs.add(dvsa.ShiftHoursInput(
        start: start,
        end: end,
        drivingMinutes: _shiftDrivingMinutes(pings),
        workingMinutes: (((s['total_hours'] as num?)?.toDouble() ?? 0.0)) * 60.0,
        longestContinuousDrivingMinutes: _shiftLongestContinuousDrivingMinutes(pings),
      ));
    }

    final active = ref.read(shiftProvider).activeShift;
    if (active != null && !_complianceShifts.any((s) => s['id']?.toString() == active.id)) {
      final now = DateTime.now();
      final pings = pingsByShift[active.id] ?? const <Map<String, dynamic>>[];
      inputs.add(dvsa.ShiftHoursInput(
        start: active.startTime.toLocal(),
        end: null,
        drivingMinutes: _shiftDrivingMinutes(pings),
        workingMinutes: now.difference(active.startTime.toLocal()).inMinutes.toDouble(),
        longestContinuousDrivingMinutes: _shiftLongestContinuousDrivingMinutes(pings),
      ));
    }

    if (inputs.isEmpty) return null;
    return dvsa.computeDvsaCompliance(inputs, DateTime.now());
  }

  Widget _dvsaStatusChip(String label, Color color) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
        decoration: BoxDecoration(color: color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(999), border: Border.all(color: color.withValues(alpha: 0.4))),
        child: Text(label, style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700, color: color)),
      );

  Widget _dvsaMetricTile(String label, String value, {Color? color}) => Expanded(
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 8),
          margin: const EdgeInsets.symmetric(horizontal: 3),
          decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(10), border: Border.all(color: const Color(0xFFE0E0E0))),
          child: Column(
            children: [
              FittedBox(
                fit: BoxFit.scaleDown,
                child: Text(value, style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: color ?? TachyoTheme.charcoal)),
              ),
              const SizedBox(height: 3),
              Text(label, textAlign: TextAlign.center, style: const TextStyle(fontSize: 10.5, fontWeight: FontWeight.w600, color: TachyoTheme.charcoalLight, height: 1.25)),
            ],
          ),
        ),
      );

  Widget _buildDvsaSection(ThemeData theme) {
    if (_complianceLoading) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 20),
        child: Center(child: CircularProgressIndicator(color: Color(0xFFCC0000), strokeWidth: 2)),
      );
    }
    final result = _buildDvsaResult();
    final week = result?.thisWeek;
    final dayFormat = DateFormat('EEE d MMM');

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Row(
          children: [
            Icon(Icons.gavel_rounded, size: 18, color: Color(0xFFCC0000)),
            SizedBox(width: 8),
            Expanded(
              child: Text('DVSA drivers\' hours compliance', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: TachyoTheme.charcoal)),
            ),
          ],
        ),
        const SizedBox(height: 6),
        const Text(
          'Monitors the assimilated (EU) drivers\' hours rules DVSA enforces: daily/weekly/fortnightly driving limits, '
          'daily and weekly rest, the 4h30 break, and the 60h weekly Working Time cap — from GPS telemetry, advisory '
          'only. Not a certified tachograph record; DVSA roadside checks use the vehicle\'s actual tachograph.',
          style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w500, color: TachyoTheme.charcoalLight, height: 1.4),
        ),
        const SizedBox(height: 14),
        if (result == null || week == null)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 16),
            child: Text('No shifts in the last 15 days to assess.', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: TachyoTheme.charcoalLight)),
          )
        else ...[
          // This week / fortnight summary tiles.
          Row(
            children: [
              _dvsaMetricTile(
                'Week driving\n/ 56h',
                dvsa.formatDvsaMinutes(week.drivingMinutes),
                color: week.weeklyDrivingBreach ? dvsa.dvsaRed : (week.drivingMinutes > dvsa.weeklyDrivingLimitMin * 0.9 ? dvsa.dvsaAmber : dvsa.dvsaGreen),
              ),
              _dvsaMetricTile('Extensions\nused', '${week.extensionsUsed}/${dvsa.maxExtensionsPerWeek}', color: week.extensionsUsed >= dvsa.maxExtensionsPerWeek ? dvsa.dvsaAmber : const Color(0xFF333333)),
              _dvsaMetricTile('Reduced rests\nused', '${week.reducedRestsUsed}/${dvsa.maxReducedRestsPerWeek}', color: week.reducedRestsUsed >= dvsa.maxReducedRestsPerWeek ? dvsa.dvsaAmber : const Color(0xFF333333)),
              _dvsaMetricTile(
                'Week working\n/ 60h',
                dvsa.formatDvsaMinutes(week.workingMinutes),
                color: week.weeklyWorkingBreach ? dvsa.dvsaRed : (week.workingMinutes > dvsa.wtdWeeklyAbsoluteMaxMin * 0.9 ? dvsa.dvsaAmber : dvsa.dvsaGreen),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              _dvsaMetricTile(
                'Fortnight\ndriving / 90h',
                dvsa.formatDvsaMinutes(result.fortnightDrivingMinutes),
                color: result.fortnightBreach ? dvsa.dvsaRed : (result.fortnightDrivingMinutes > dvsa.fortnightlyDrivingLimitMin * 0.9 ? dvsa.dvsaAmber : dvsa.dvsaGreen),
              ),
              _dvsaMetricTile(
                'Weekly rest',
                week.weeklyRestMinutes != null ? dvsa.formatDvsaMinutes(week.weeklyRestMinutes!) : '—',
                color: dvsa.colorForRestStatus(week.weeklyRestStatus),
              ),
              _dvsaMetricTile(
                'Last week\ndriving',
                result.lastWeek != null ? dvsa.formatDvsaMinutes(result.lastWeek!.drivingMinutes) : '—',
              ),
              const Expanded(child: SizedBox()),
            ],
          ),
          const SizedBox(height: 6),
          Align(
            alignment: Alignment.centerLeft,
            child: Padding(
              padding: const EdgeInsets.only(left: 3),
              child: _dvsaStatusChip(
                week.weeklyRestStatus == dvsa.RestStatus.unknown
                    ? 'Weekly rest: not yet taken this week'
                    : week.weeklyRestStatus == dvsa.RestStatus.reduced
                        ? 'Reduced weekly rest — must be topped up by ${DateFormat('d MMM').format(week.weekStart.add(Duration(days: 7 * (dvsa.weeklyRestCompensationWeeks + 1))))}'
                        : dvsa.labelForRestStatus(week.weeklyRestStatus),
                dvsa.colorForRestStatus(week.weeklyRestStatus),
              ),
            ),
          ),
          const SizedBox(height: 16),

          // Per-day breakdown, most recent first.
          const Text('Day by day', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: TachyoTheme.charcoalMid)),
          const SizedBox(height: 8),
          ...result.days.reversed.map((d) {
            return Container(
              margin: const EdgeInsets.only(bottom: 10),
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(14), border: Border.all(color: const Color(0xFFE0E0E0))),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(dayFormat.format(d.day), style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w800, color: TachyoTheme.charcoal)),
                      _dvsaStatusChip(dvsa.labelForDrivingStatus(d.drivingStatus), dvsa.colorForDrivingStatus(d.drivingStatus)),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      Expanded(child: _dvsaFactRow('Driving', dvsa.formatDvsaMinutes(d.drivingMinutes))),
                      Expanded(child: _dvsaFactRow('Working', dvsa.formatDvsaMinutes(d.workingMinutes))),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      Expanded(child: _dvsaFactRow('Rest before', d.restBeforeMinutes != null ? dvsa.formatDvsaMinutes(d.restBeforeMinutes!) : 'No data')),
                      Expanded(child: _dvsaFactRow('4h30 break', d.breakSatisfied ? 'Taken' : 'Overdue')),
                    ],
                  ),
                  const SizedBox(height: 10),
                  // Wrap, not Row: at readable sizes three chips no longer
                  // fit on one line on a narrow phone.
                  Wrap(
                    spacing: 6,
                    runSpacing: 6,
                    children: [
                      _dvsaStatusChip(dvsa.labelForRestStatus(d.restStatus), dvsa.colorForRestStatus(d.restStatus)),
                      _dvsaStatusChip(
                        d.canExtendToday ? 'Can extend to 10h' : 'No extension available',
                        d.canExtendToday ? dvsa.dvsaGreen : dvsa.dvsaMuted,
                      ),
                      if (!d.breakSatisfied) _dvsaStatusChip('Break needed', dvsa.dvsaRed),
                    ],
                  ),
                ],
              ),
            );
          }),
        ],
      ],
    );
  }

  Widget _dvsaFactRow(String label, String value) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 1),
        child: Row(
          children: [
            Text('$label  ', style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w500, color: TachyoTheme.charcoalLight)),
            Flexible(
              child: Text(value, style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: TachyoTheme.charcoal)),
            ),
          ],
        ),
      );
}

/// Keeps the History range bar pinned under the app bar while the page
/// scrolls.
class _PinnedBarDelegate extends SliverPersistentHeaderDelegate {
  final double height;
  final Widget child;

  const _PinnedBarDelegate({required this.height, required this.child});

  @override
  double get minExtent => height;

  @override
  double get maxExtent => height;

  @override
  Widget build(BuildContext context, double shrinkOffset, bool overlapsContent) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: Colors.white,
        border: overlapsContent || shrinkOffset > 0
            ? const Border(bottom: BorderSide(color: TachyoTheme.border))
            : null,
      ),
      child: child,
    );
  }

  @override
  bool shouldRebuild(_PinnedBarDelegate old) => old.child != child || old.height != height;
}

/// One logged shift: date badge, times and duration, pay, and tags for
/// anything unusual. Tapping expands the pay breakdown the old card showed
/// inline as "(£x Base + £y Extra)".
class _ShiftRow extends StatefulWidget {
  final ShiftPayBreakdown shift;
  final bool isFixed;

  const _ShiftRow({super.key, required this.shift, required this.isFixed});

  @override
  State<_ShiftRow> createState() => _ShiftRowState();
}

class _ShiftRowState extends State<_ShiftRow> {
  bool _expanded = false;

  static String _money(double v) => '£${v.toStringAsFixed(2)}';

  Widget _tag(String text, {bool filled = false, Color color = TachyoTheme.charcoalMid}) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: filled ? color : color.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        text,
        style: TextStyle(
          fontSize: 11.5,
          fontWeight: FontWeight.w700,
          color: filled ? Colors.white : color,
        ),
      ),
    );
  }

  Widget _breakdownLine(String label, String value, {bool bold = false}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        children: [
          Text(label, style: TextStyle(fontSize: 13.5, fontWeight: bold ? FontWeight.w700 : FontWeight.w500, color: bold ? TachyoTheme.charcoal : TachyoTheme.charcoalMid)),
          const Spacer(),
          Text(value, style: TextStyle(fontSize: 13.5, fontWeight: bold ? FontWeight.w800 : FontWeight.w600, color: TachyoTheme.charcoal)),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final s = widget.shift;
    final timeFmt = DateFormat('HH:mm');
    final durationMinutes = s.isLive
        ? DateTime.now().difference(s.start).inMinutes.toDouble()
        : s.hours * 60;
    final times = '${timeFmt.format(s.start)} – ${s.isLive ? 'now' : timeFmt.format(s.end!)}';

    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Material(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        child: InkWell(
          borderRadius: BorderRadius.circular(16),
          onTap: () => setState(() => _expanded = !_expanded),
          child: Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: s.isLive ? TachyoTheme.brandRed.withValues(alpha: 0.4) : const Color(0xFFE8E8E8)),
            ),
            child: Column(
              children: [
                Row(
                  children: [
                    // Date badge
                    Container(
                      width: 52,
                      height: 58,
                      decoration: BoxDecoration(
                        color: s.isLive ? TachyoTheme.brandRed : TachyoTheme.surface,
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Text(
                            DateFormat('EEE').format(s.start).toUpperCase(),
                            style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w700,
                              letterSpacing: 0.6,
                              color: s.isLive ? Colors.white.withValues(alpha: 0.85) : TachyoTheme.brandRed,
                            ),
                          ),
                          Text(
                            '${s.start.day}',
                            style: TextStyle(
                              fontSize: 21,
                              height: 1.1,
                              fontWeight: FontWeight.w800,
                              color: s.isLive ? Colors.white : TachyoTheme.charcoal,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            times,
                            style: const TextStyle(fontSize: 15.5, fontWeight: FontWeight.w700, color: TachyoTheme.charcoal),
                          ),
                          const SizedBox(height: 5),
                          Wrap(
                            spacing: 6,
                            runSpacing: 4,
                            crossAxisAlignment: WrapCrossAlignment.center,
                            children: [
                              Text(
                                _HistoryTabState._formatHM(durationMinutes),
                                style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: TachyoTheme.charcoalMid),
                              ),
                              if (s.isLive) _tag('Live', filled: true, color: TachyoTheme.brandRed),
                              if (s.nightOut > 0) _tag('Night out +${_money(s.nightOut)}'),
                              if (s.extras > 0) _tag('Extras +${_money(s.extras)}'),
                              if (s.hasOverride) _tag('Rate override', color: TachyoTheme.brandRed),
                            ],
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 8),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Text(
                          _money(s.pay),
                          style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: TachyoTheme.brandRed),
                        ),
                        AnimatedRotation(
                          turns: _expanded ? 0.5 : 0,
                          duration: const Duration(milliseconds: 200),
                          child: const Icon(Icons.expand_more_rounded, size: 22, color: TachyoTheme.charcoalLight),
                        ),
                      ],
                    ),
                  ],
                ),
                AnimatedSize(
                  duration: const Duration(milliseconds: 220),
                  curve: Curves.easeOutCubic,
                  alignment: Alignment.topCenter,
                  child: !_expanded
                      ? const SizedBox(width: double.infinity)
                      : Padding(
                          padding: const EdgeInsets.fromLTRB(4, 12, 4, 2),
                          child: Column(
                            children: [
                              const Divider(height: 1, color: TachyoTheme.border),
                              const SizedBox(height: 8),
                              _breakdownLine(
                                widget.isFixed ? 'Day rate' : 'Rate',
                                widget.isFixed ? '${_money(s.basePay)} / shift' : '${_money(s.rate)} / hr',
                              ),
                              _breakdownLine('Base pay', _money(s.basePay)),
                              if (s.nightOut > 0) _breakdownLine('Night out', _money(s.nightOut)),
                              if (s.extras > 0) _breakdownLine('Extras', _money(s.extras)),
                              _breakdownLine('Total', _money(s.pay), bold: true),
                            ],
                          ),
                        ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _DayHoursRow {
  final DateTime day;
  final double drivingMinutes;
  final double workingMinutes;
  const _DayHoursRow({required this.day, required this.drivingMinutes, required this.workingMinutes});
}

// ─────────────────────────────────────────────────────────────────────────────
// Native iOS-Style Settings Tab
// ─────────────────────────────────────────────────────────────────────────────
class SettingsTab extends ConsumerStatefulWidget {
  const SettingsTab({super.key});

  @override
  ConsumerState<SettingsTab> createState() => _SettingsTabState();
}

class _SettingsTabState extends ConsumerState<SettingsTab> with WidgetsBindingObserver {
  bool _isLocationGranted = false;
  bool _isBackgroundGranted = false;
  String? _supportPhone1;
  String? _supportPhone2;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _checkPermissions();
    _loadSupportContacts();
  }

  /// Loads this driver's own company's support number(s) — see migration
  /// 039. Never falls back to a fixed number here: an org with nothing set
  /// simply shows no Support group, rather than a number that isn't theirs.
  Future<void> _loadSupportContacts() async {
    final driver = ref.read(authProvider).driver;
    final organizationId = driver?['organization_id'] as String?;
    final contacts = await SupabaseService.fetchOrgSupportContacts(organizationId);
    if (mounted) {
      setState(() {
        _supportPhone1 = contacts['support_phone_1'];
        _supportPhone2 = contacts['support_phone_2'];
      });
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _checkPermissions();
    }
  }

  Future<void> _checkPermissions() async {
    try {
      final permission = await Geolocator.checkPermission();
      final hasLocation = (permission == LocationPermission.always || permission == LocationPermission.whileInUse);
      final hasBackground = (permission == LocationPermission.always);

      if (mounted) {
        setState(() {
          _isLocationGranted = hasLocation;
          _isBackgroundGranted = hasBackground;
        });
      }
    } catch (_) {}
  }

  Future<void> _handleOpenSettings() async {
    await Geolocator.openAppSettings();
  }

  Future<void> _openChangePinModal(BuildContext context, String driverUuid) async {
    final pinController = TextEditingController();
    String? localError;
    bool isSaving = false;

    await showDialog(
      context: context,
      builder: (dialogCtx) => StatefulBuilder(
        builder: (context, setModalState) => Dialog(
          backgroundColor: Colors.white,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          insetPadding: const EdgeInsets.symmetric(horizontal: 24),
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text(
                      'Change PIN',
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w800,
                        color: Color(0xFF1C1C1E),
                      ),
                    ),
                    InkWell(
                      onTap: () => Navigator.pop(dialogCtx),
                      child: const Icon(Icons.close, size: 20, color: Color(0xFF8E8E93)),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                const Text(
                  'Enter a new 6-digit PIN for your driver account.',
                  style: TextStyle(fontSize: 13, color: Color(0xFF8E8E93)),
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: pinController,
                  keyboardType: TextInputType.number,
                  maxLength: 6,
                  obscureText: true,
                  autofocus: true,
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                    letterSpacing: 4,
                    color: Color(0xFF1C1C1E),
                  ),
                  decoration: InputDecoration(
                    hintText: 'New 6-digit PIN',
                    hintStyle: const TextStyle(
                      letterSpacing: 0,
                      fontSize: 13,
                      fontWeight: FontWeight.normal,
                      color: Color(0xFFC7C7CC),
                    ),
                    counterText: '',
                    filled: true,
                    fillColor: const Color(0xFFF2F2F7),
                    contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(10),
                      borderSide: const BorderSide(color: Color(0xFFE5E5EA)),
                    ),
                    focusedBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(10),
                      borderSide: const BorderSide(color: Color(0xFF1C1C1E), width: 1.5),
                    ),
                  ),
                ),
                if (localError != null) ...[
                  const SizedBox(height: 8),
                  Text(
                    localError!,
                    style: const TextStyle(color: Color(0xFFFF3B30), fontSize: 12, fontWeight: FontWeight.w600),
                  ),
                ],
                const SizedBox(height: 20),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton(
                        onPressed: isSaving ? null : () => Navigator.pop(dialogCtx),
                        style: OutlinedButton.styleFrom(
                          side: const BorderSide(color: Color(0xFFE5E5EA)),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                          padding: const EdgeInsets.symmetric(vertical: 12),
                        ),
                        child: const Text(
                          'Cancel',
                          style: TextStyle(color: Color(0xFF8E8E93), fontWeight: FontWeight.w600),
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: ElevatedButton(
                        onPressed: isSaving
                            ? null
                            : () async {
                                final pinVal = pinController.text.trim();
                                if (pinVal.length != 6 || int.tryParse(pinVal) == null) {
                                  setModalState(() {
                                    localError = 'Please enter a valid 6-digit PIN';
                                  });
                                  return;
                                }

                                setModalState(() {
                                  isSaving = true;
                                  localError = null;
                                });

                                final messenger = ScaffoldMessenger.of(context);
                                final navigator = Navigator.of(dialogCtx);

                                final res = await SupabaseService.updateDriverPin(
                                  driverIdOrUuid: driverUuid,
                                  newPin: pinVal,
                                );

                                if (!mounted) return;

                                if (res['success'] == true) {
                                  navigator.pop();
                                  messenger.showSnackBar(
                                    SnackBar(
                                      content: const Text(
                                        'PIN updated successfully.',
                                        style: TextStyle(fontWeight: FontWeight.w700, color: Colors.white),
                                      ),
                                      backgroundColor: const Color(0xFF1C1C1E),
                                      behavior: SnackBarBehavior.floating,
                                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                                      duration: const Duration(seconds: 3),
                                    ),
                                  );
                                } else {
                                  setModalState(() {
                                    isSaving = false;
                                    localError = res['error'] ?? 'Failed to update PIN.';
                                  });
                                }
                              },
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFF1C1C1E),
                          foregroundColor: Colors.white,
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                          padding: const EdgeInsets.symmetric(vertical: 12),
                          elevation: 0,
                        ),
                        child: isSaving
                            ? const SizedBox(
                                width: 18,
                                height: 18,
                                child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                              )
                            : const Text(
                                'Save PIN',
                                style: TextStyle(fontWeight: FontWeight.w700),
                              ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  /// Same "did you mean that?" gate as the app-bar logout icon on Home —
  /// this row is styled red/destructive, but previously fired on the very
  /// first tap with no way back short of re-entering full credentials.
  void _confirmLogout(BuildContext context) {
    showDialog(
      context: context,
      builder: (dialogContext) {
        return AlertDialog(
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
          title: const Row(
            children: [
              Icon(Icons.logout_rounded, color: Color(0xFFFF3B30), size: 26),
              SizedBox(width: 12),
              Text('LOG OUT', style: TextStyle(fontWeight: FontWeight.w900, letterSpacing: 0.5, fontSize: 18)),
            ],
          ),
          content: const Text(
            'Are you sure you want to log out? You\'ll need your Company Code, Driver ID, and PIN to sign back in.',
            style: TextStyle(fontSize: 14, height: 1.4),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext),
              child: const Text('CANCEL', style: TextStyle(color: Color(0xFF8E8E93), fontWeight: FontWeight.bold)),
            ),
            ElevatedButton(
              onPressed: () {
                Navigator.pop(dialogContext);
                ref.read(authProvider.notifier).logout();
              },
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFFFF3B30),
                foregroundColor: Colors.white,
                minimumSize: const Size(100, 40),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
              child: const Text('LOG OUT'),
            ),
          ],
        );
      },
    );
  }

  Future<void> _callPhone(String phoneNumber) async {
    final cleanNumber = phoneNumber.replaceAll(RegExp(r'[^0-9+]'), '');
    final uri = Uri.parse('tel:$cleanNumber');
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri);
    } else {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Could not dial $phoneNumber'),
            backgroundColor: const Color(0xFF1C1C1E),
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final authState = ref.watch(authProvider);
    final driverCode = authState.driver?['driver_id'] ?? 'DRV-001';
    final driverUuid = authState.driver?['id'] ?? driverCode;

    return Scaffold(
      backgroundColor: const Color(0xFFF2F2F6),
      appBar: AppBar(
        backgroundColor: const Color(0xFFF2F2F6),
        elevation: 0,
        centerTitle: false,
        automaticallyImplyLeading: false,
        title: const Padding(
          padding: EdgeInsets.only(left: 4, top: 8),
          child: Text(
            'Settings',
            style: TextStyle(
              fontSize: 28,
              fontWeight: FontWeight.w800,
              letterSpacing: -0.5,
              color: Color(0xFF1C1C1E),
            ),
          ),
        ),
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
          children: [
            // ── GROUP 1: PERMISSIONS ──
            // Plain tappable rows, not toggle switches — a switch implies
            // it directly flips the permission, but Android/iOS don't let
            // an app grant its own location permission; every tap here can
            // only ever do one thing (open OS Settings), whichever way it's
            // "switched". Showing the real status as text avoids that
            // mismatch between what the control looks like and what it does.
            _buildSectionHeader('PERMISSIONS'),
            _buildSettingsGroup([
              _buildSettingsRow(
                icon: Icons.location_on_outlined,
                title: 'Location Access (Always)',
                statusLabel: _isLocationGranted ? 'Granted' : 'Not granted',
                statusGranted: _isLocationGranted,
                onTap: _handleOpenSettings,
              ),
              _buildDivider(),
              _buildSettingsRow(
                icon: Icons.sync_outlined,
                title: 'Background Activity',
                statusLabel: _isBackgroundGranted ? 'Granted' : 'Not granted',
                statusGranted: _isBackgroundGranted,
                onTap: _handleOpenSettings,
              ),
            ]),
            const SizedBox(height: 24),

            // ── GROUP 2: SECURITY ──
            _buildSectionHeader('SECURITY'),
            _buildSettingsGroup([
              _buildSettingsRow(
                icon: Icons.lock_outline,
                title: 'Change PIN',
                onTap: () => _openChangePinModal(context, driverUuid),
              ),
            ]),
            const SizedBox(height: 24),

            // ── GROUP 3: SUPPORT ──
            // Only ever shows a row for a number this driver's own company
            // has actually set (migration 039) — never a fixed number that
            // might belong to a different employer.
            if (_supportPhone1 != null || _supportPhone2 != null) ...[
              _buildSectionHeader('SUPPORT'),
              _buildSettingsGroup([
                if (_supportPhone1 != null)
                  _buildSettingsRow(
                    icon: Icons.phone_outlined,
                    title: 'Office: $_supportPhone1',
                    onTap: () => _callPhone(_supportPhone1!),
                  ),
                if (_supportPhone1 != null && _supportPhone2 != null) _buildDivider(),
                if (_supportPhone2 != null)
                  _buildSettingsRow(
                    icon: Icons.phone_outlined,
                    title: 'Office: $_supportPhone2',
                    onTap: () => _callPhone(_supportPhone2!),
                  ),
              ]),
              const SizedBox(height: 24),
            ],

            // ── GROUP 4: LEGAL & COMPLIANCE ──
            // One button per document — each opens straight to that
            // document only, so reading one never silently continues
            // into a different one.
            _buildSectionHeader('LEGAL & COMPLIANCE'),
            _buildSettingsGroup([
              for (var i = 0; i < LegalDocument.values.length; i++) ...[
                if (i > 0) _buildDivider(),
                _buildSettingsRow(
                  icon: LegalDocument.values[i].icon,
                  title: LegalDocument.values[i].label,
                  onTap: () {
                    Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (_) => LegalComplianceScreen(document: LegalDocument.values[i]),
                      ),
                    );
                  },
                ),
              ],
            ]),
            const SizedBox(height: 24),

            // ── GROUP 5: ACCOUNT (DESTRUCTIVE) ──
            _buildSectionHeader('ACCOUNT'),
            _buildSettingsGroup([
              _buildSettingsRow(
                icon: Icons.logout_rounded,
                title: 'Log out',
                isDestructive: true,
                onTap: () => _confirmLogout(context),
              ),
            ]),
            const SizedBox(height: 24),
          ],
        ),
      ),
    );
  }

  Widget _buildSectionHeader(String title) {
    return Padding(
      padding: const EdgeInsets.only(left: 12, bottom: 6),
      child: Text(
        title,
        style: const TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w600,
          letterSpacing: 0.2,
          color: Color(0xFF6C6C70),
        ),
      ),
    );
  }

  Widget _buildSettingsGroup(List<Widget> children) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(10),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        children: children,
      ),
    );
  }

  Widget _buildDivider() {
    return const Divider(
      height: 1,
      thickness: 1,
      indent: 48,
      endIndent: 0,
      color: Color(0xFFE5E5EA),
    );
  }

  Widget _buildSettingsRow({
    required IconData icon,
    required String title,
    VoidCallback? onTap,
    bool isDestructive = false,
    // Set for the two permission rows: shows the real OS-reported status as
    // text (tapping always just opens OS Settings — no in-app control can
    // grant the permission directly, so there's nothing to actually
    // "switch"). Leave both null for a plain chevron row.
    String? statusLabel,
    bool statusGranted = false,
  }) {
    final Color itemColor = isDestructive ? const Color(0xFFFF3B30) : const Color(0xFF1C1C1E);
    final Color iconColor = isDestructive ? const Color(0xFFFF3B30) : const Color(0xFFCC0000);

    return InkWell(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        constraints: const BoxConstraints(minHeight: 48),
        child: Row(
          children: [
            Icon(icon, size: 20, color: iconColor),
            const SizedBox(width: 14),
            Expanded(
              child: Text(
                title,
                style: TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w600,
                  color: itemColor,
                ),
              ),
            ),
            if (statusLabel != null) ...[
              Text(
                statusLabel,
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                  color: statusGranted ? const Color(0xFFCC0000) : const Color(0xFF8E8E93),
                ),
              ),
              const SizedBox(width: 6),
            ],
            if (!isDestructive)
              const Icon(Icons.chevron_right, size: 18, color: Color(0xFFC7C7CC)),
          ],
        ),
      ),
    );
  }
}

