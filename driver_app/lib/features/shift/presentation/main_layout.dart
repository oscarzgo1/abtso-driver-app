import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
import 'package:supabase_flutter/supabase_flutter.dart' hide AuthState;
import 'package:url_launcher/url_launcher.dart';
import '../../../core/network/supabase_service.dart';
import 'home_screen.dart';
import '../../auth/presentation/auth_provider.dart';

class MainLayout extends ConsumerStatefulWidget {
  const MainLayout({super.key});

  @override
  ConsumerState<MainLayout> createState() => _MainLayoutState();
}

class _MainLayoutState extends ConsumerState<MainLayout> {
  int _currentIndex = 0;

  late final List<Widget> _screens;

  @override
  void initState() {
    super.initState();
    _screens = [
      const HomeScreen(),
      const HistoryTab(),
      const SettingsTab(),
    ];
  }

  @override
  Widget build(BuildContext context) {

    return Scaffold(
      body: IndexedStack(
        index: _currentIndex,
        children: _screens,
      ),
      bottomNavigationBar: Container(
        decoration: const BoxDecoration(
          color: Colors.white,
          border: Border(
            top: BorderSide(color: Color(0xFFE0E0E0), width: 1),
          ),
        ),
        child: BottomNavigationBar(
          currentIndex: _currentIndex,
          onTap: (index) {
            setState(() {
              _currentIndex = index;
            });
          },
          backgroundColor: Colors.white,
          selectedItemColor: const Color(0xFFCC0000),   // Brand red
          unselectedItemColor: const Color(0xFF888888),  // Charcoal light
          selectedLabelStyle: GoogleFonts.outfit(fontWeight: FontWeight.w700, fontSize: 11),
          unselectedLabelStyle: GoogleFonts.outfit(fontWeight: FontWeight.w500, fontSize: 11),
          type: BottomNavigationBarType.fixed,
          elevation: 0,
          items: const [
            BottomNavigationBarItem(
              icon: Padding(
                padding: EdgeInsets.only(bottom: 3),
                child: Icon(Icons.navigation_outlined, size: 18),
              ),
              activeIcon: Padding(
                padding: EdgeInsets.only(bottom: 3),
                child: Icon(Icons.navigation, size: 18),
              ),
              label: 'Home',
            ),
            BottomNavigationBarItem(
              icon: Padding(
                padding: EdgeInsets.only(bottom: 3),
                child: Icon(Icons.history_outlined, size: 18),
              ),
              activeIcon: Padding(
                padding: EdgeInsets.only(bottom: 3),
                child: Icon(Icons.history, size: 18),
              ),
              label: 'History',
            ),
            BottomNavigationBarItem(
              icon: Padding(
                padding: EdgeInsets.only(bottom: 3),
                child: Icon(Icons.settings_outlined, size: 18),
              ),
              activeIcon: Padding(
                padding: EdgeInsets.only(bottom: 3),
                child: Icon(Icons.settings, size: 18),
              ),
              label: 'Settings',
            ),
          ],
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

  @override
  void initState() {
    super.initState();
    // Default weekly views to group days strictly from Sunday to Saturday
    final now = DateTime.now();
    final int daysToSubtract = now.weekday % 7; // Sunday maps to 0, Monday to 1, Saturday to 6
    _startDate = DateTime(now.year, now.month, now.day).subtract(Duration(days: daysToSubtract));
    _endDate = _startDate.add(const Duration(days: 6));
    _loadShifts();
    _setupHistoryRealtime();
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
                _loadShifts();
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

  Future<void> _loadShifts() async {
    final driverId = SupabaseService.currentDriverId;
    if (driverId == null) return;

    setState(() {
      _isLoading = true;
    });

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

  Future<void> _selectDateRange() async {
    final pickedRange = await showDateRangePicker(
      context: context,
      firstDate: DateTime(2025),
      lastDate: DateTime(2030),
      initialDateRange: DateTimeRange(start: _startDate, end: _endDate),
      builder: (context, child) {
        return Theme(
          data: ThemeData.light().copyWith(
            colorScheme: const ColorScheme.light(
              primary: Color(0xFFCC0000), // brand red
              onPrimary: Colors.white,
              onSurface: Color(0xFF333333),
            ),
            textButtonTheme: TextButtonThemeData(
              style: TextButton.styleFrom(foregroundColor: const Color(0xFFCC0000)),
            ),
          ),
          child: child!,
        );
      },
    );

    if (pickedRange != null) {
      setState(() {
        _startDate = pickedRange.start;
        _endDate = pickedRange.end;
      });
      _loadShifts();
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final dateFormat = DateFormat('d MMM yyyy');
    final shiftDateFormat = DateFormat('d MMM');
    final rangeText = '${dateFormat.format(_startDate)} – ${dateFormat.format(_endDate)}';

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
        ? '£${rateValue.toStringAsFixed(2)}/SHIFT'
        : (rates.isNotEmpty ? rates.map((r) => '£${r.toStringAsFixed(2)}/HR').join(', ') : '£${rateValue.toStringAsFixed(2)}/HR');

    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        centerTitle: true,
        title: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Image.asset('assets/images/abtso_logo_transparent.png', height: 26, fit: BoxFit.contain),
          ],
        ),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(1),
          child: Container(height: 1, color: const Color(0xFFE0E0E0)),
        ),
      ),
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Period Range Selection Header
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 8),
              child: InkWell(
                onTap: _selectDateRange,
                borderRadius: BorderRadius.circular(12),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: const Color(0xFFBBBBBB), width: 1.5),
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Row(
                        children: [
                          const Icon(Icons.calendar_today_outlined, size: 16, color: Color(0xFFCC0000)),
                          const SizedBox(width: 12),
                          Text(
                            rangeText.toUpperCase(),
                            style: theme.textTheme.bodyMedium?.copyWith(
                              fontSize: 12,
                              fontWeight: FontWeight.w900,
                              color: const Color(0xFF333333),
                            ),
                          ),
                        ],
                      ),
                      const Icon(Icons.arrow_drop_down, color: Color(0xFF888888)),
                    ],
                  ),
                ),
              ),
            ),

            // Summary Metrics Card
            Container(
              margin: const EdgeInsets.fromLTRB(20, 8, 20, 12),
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: const Color(0xFFF5F5F5),
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: const Color(0xFFE0E0E0), width: 1),
              ),
              child: Column(
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'PERIOD EARNINGS',
                            style: theme.textTheme.bodyMedium?.copyWith(
                              fontSize: 9,
                              fontWeight: FontWeight.w900,
                              letterSpacing: 1.0,
                              color: const Color(0xFF888888),
                            ),
                          ),
                          const SizedBox(height: 6),
                          Text(
                            '£${totalPay.toStringAsFixed(2)}',
                            style: theme.textTheme.displayMedium?.copyWith(
                              fontSize: 26,
                              fontWeight: FontWeight.w900,
                              color: const Color(0xFFCC0000),
                            ),
                          ),
                        ],
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: const Color(0xFFE0E0E0), width: 1),
                        ),
                        child: Column(
                          children: [
                            Text(
                              totalHours.toStringAsFixed(1),
                              style: theme.textTheme.titleLarge?.copyWith(
                                fontWeight: FontWeight.w900,
                                color: const Color(0xFF333333),
                              ),
                            ),
                            Text(
                              'HOURS',
                              style: theme.textTheme.bodyMedium?.copyWith(
                                fontSize: 8,
                                fontWeight: FontWeight.w900,
                                color: const Color(0xFF888888),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  const Divider(color: Color(0xFFE0E0E0), thickness: 1),
                  const SizedBox(height: 8),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        'WEEKLY RATE',
                        style: theme.textTheme.bodyMedium?.copyWith(
                          fontSize: 9,
                          fontWeight: FontWeight.w900,
                          color: const Color(0xFF888888),
                        ),
                      ),
                      Text(
                        ratesString,
                        style: theme.textTheme.bodyMedium?.copyWith(
                          fontSize: 11,
                          fontWeight: FontWeight.w900,
                          color: const Color(0xFF333333),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),

            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 4),
              child: Text(
                'LOGGED SHIFTS',
                style: theme.textTheme.bodyMedium?.copyWith(
                  fontSize: 10,
                  fontWeight: FontWeight.w900,
                  letterSpacing: 1.0,
                  color: const Color(0xFF888888),
                ),
              ),
            ),

            Expanded(
              child: _isLoading
                  ? const Center(
                      child: CircularProgressIndicator(
                        color: Color(0xFFCC0000),
                      ),
                    )
                  : _shifts.isEmpty
                      ? Center(
                          child: Text(
                            'NO SHIFTS LOGGED IN THIS PERIOD',
                            style: theme.textTheme.bodyMedium?.copyWith(
                              fontSize: 11,
                              fontWeight: FontWeight.w800,
                              color: const Color(0xFF888888),
                            ),
                          ),
                        )
                      : ListView.builder(
                          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
                          itemCount: _shifts.length,
                          itemBuilder: (context, index) {
                            final s = _shifts[index];
                            final startTime = DateTime.parse(s['start_time']).toLocal();
                            final endTime = s['end_time'] != null ? DateTime.parse(s['end_time']).toLocal() : null;
                            final dayName = DateFormat('EEEE').format(startTime);

                            final startTimeStr = DateFormat('HH:mm').format(startTime);
                            final endTimeStr = endTime != null ? DateFormat('HH:mm').format(endTime) : 'Ongoing';
                            final timeRangeStr = '$startTimeStr - $endTimeStr';

                            final pay = (s['total_pay'] as num?)?.toDouble() ?? 0.0;
                            final hours = (s['total_hours'] as num?)?.toDouble() ?? (endTime != null ? (endTime.difference(startTime).inMinutes / 60.0) : 0.0);
                            final hasOverride = s['override_rate'] != null;

                            // Financial breakdown calculation
                            final double shiftEffRate = (s['effective_rate'] as num?)?.toDouble() 
                                ?? (s['base_hourly_rate'] as num?)?.toDouble() 
                                ?? rateValue;

                            final double nightOut = (s['night_out_amount'] as num?)?.toDouble() 
                                ?? (s['night_out_allowance'] as num?)?.toDouble() 
                                ?? (s['night_out_status'] == 'approved' ? 25.0 : 0.0);

                            final double extraAmt = (s['extra_amount'] as num?)?.toDouble() 
                                ?? (s['extras_amount'] as num?)?.toDouble() 
                                ?? (s['extras'] as num?)?.toDouble() 
                                ?? 0.0;

                            final double extraPay = nightOut + extraAmt;
                            final double basePay = isFixed 
                                ? rateValue 
                                : (extraPay > 0 ? (pay - extraPay) : (hours * shiftEffRate));

                            return Container(
                              margin: const EdgeInsets.only(bottom: 10),
                              padding: const EdgeInsets.all(16),
                              decoration: BoxDecoration(
                                color: Colors.white,
                                borderRadius: BorderRadius.circular(12),
                                border: Border.all(color: const Color(0xFFE0E0E0), width: 1),
                              ),
                              child: Row(
                                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                crossAxisAlignment: CrossAxisAlignment.center,
                                children: [
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          dayName.toUpperCase(),
                                          style: theme.textTheme.titleMedium?.copyWith(
                                            fontSize: 13,
                                            fontWeight: FontWeight.w900,
                                            color: const Color(0xFF333333),
                                          ),
                                        ),
                                        const SizedBox(height: 2),
                                        Text(
                                          shiftDateFormat.format(startTime),
                                          style: theme.textTheme.bodyMedium?.copyWith(
                                            fontSize: 11,
                                            color: const Color(0xFF666666),
                                            fontWeight: FontWeight.w600,
                                          ),
                                        ),
                                        const SizedBox(height: 2),
                                        Text(
                                          timeRangeStr,
                                          style: theme.textTheme.bodyMedium?.copyWith(
                                            fontSize: 11,
                                            color: const Color(0xFF888888),
                                            fontWeight: FontWeight.w700,
                                          ),
                                        ),
                                        if (hasOverride) ...[
                                          const SizedBox(height: 6),
                                          Container(
                                            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                            decoration: BoxDecoration(
                                              border: Border.all(color: const Color(0xFFCC0000), width: 1),
                                              borderRadius: BorderRadius.circular(6),
                                            ),
                                            child: const Text(
                                              'RATE OVERRIDE',
                                              style: TextStyle(
                                                color: Color(0xFFCC0000),
                                                fontSize: 8,
                                                fontWeight: FontWeight.w900,
                                              ),
                                            ),
                                          ),
                                        ],
                                      ],
                                    ),
                                  ),
                                  Column(
                                    crossAxisAlignment: CrossAxisAlignment.end,
                                    children: [
                                      Text(
                                        '£${pay.toStringAsFixed(2)}',
                                        style: theme.textTheme.titleLarge?.copyWith(
                                          fontSize: 16,
                                          fontWeight: FontWeight.w900,
                                          color: const Color(0xFFCC0000),
                                        ),
                                      ),
                                      if (extraPay > 0) ...[
                                        const SizedBox(height: 2),
                                        Text(
                                          '(£${basePay.toStringAsFixed(2)} Base + £${extraPay.toStringAsFixed(2)} Extra)',
                                          style: theme.textTheme.bodySmall?.copyWith(
                                            fontSize: 10,
                                            fontWeight: FontWeight.w700,
                                            color: const Color(0xFF666666),
                                          ),
                                        ),
                                      ],
                                      const SizedBox(height: 2),
                                      Text(
                                        '${hours.toStringAsFixed(1)} Hrs',
                                        style: theme.textTheme.bodyMedium?.copyWith(
                                          fontSize: 11,
                                          color: const Color(0xFF888888),
                                          fontWeight: FontWeight.w600,
                                        ),
                                      ),
                                    ],
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

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _checkPermissions();
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

  Future<void> _handleOpenSettings(bool _) async {
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
            _buildSectionHeader('PERMISSIONS'),
            _buildSettingsGroup([
              _buildSettingsRow(
                icon: Icons.location_on_outlined,
                title: 'Location Access (Always)',
                isToggle: true,
                toggleValue: _isLocationGranted,
                onToggle: _handleOpenSettings,
              ),
              _buildDivider(),
              _buildSettingsRow(
                icon: Icons.battery_charging_full_outlined,
                title: 'Background Activity',
                isToggle: true,
                toggleValue: _isBackgroundGranted,
                onToggle: _handleOpenSettings,
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
            _buildSectionHeader('SUPPORT'),
            _buildSettingsGroup([
              _buildSettingsRow(
                icon: Icons.phone_outlined,
                title: 'Office: +44 7724 320498',
                onTap: () => _callPhone('+44 7724 320498'),
              ),
              _buildDivider(),
              _buildSettingsRow(
                icon: Icons.phone_outlined,
                title: 'Office: +44 7751 735184',
                onTap: () => _callPhone('+44 7751 735184'),
              ),
            ]),
            const SizedBox(height: 24),

            // ── GROUP 4: ACCOUNT (DESTRUCTIVE) ──
            _buildSectionHeader('ACCOUNT'),
            _buildSettingsGroup([
              _buildSettingsRow(
                icon: Icons.logout_rounded,
                title: 'Log out',
                isDestructive: true,
                onTap: () => ref.read(authProvider.notifier).logout(),
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
    bool isToggle = false,
    bool toggleValue = false,
    ValueChanged<bool>? onToggle,
    bool isDestructive = false,
  }) {
    final Color itemColor = isDestructive ? const Color(0xFFFF3B30) : const Color(0xFF1C1C1E);
    final Color iconColor = isDestructive ? const Color(0xFFFF3B30) : const Color(0xFF3A3A3C);

    return InkWell(
      onTap: isToggle ? () => onToggle?.call(!toggleValue) : onTap,
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
            if (isToggle)
              Switch.adaptive(
                value: toggleValue,
                activeTrackColor: const Color(0xFF34C759),
                activeThumbColor: Colors.white,
                inactiveTrackColor: const Color(0xFFE5E5EA),
                onChanged: onToggle,
              )
            else if (!isDestructive)
              const Icon(Icons.chevron_right, size: 18, color: Color(0xFFC7C7CC)),
          ],
        ),
      ),
    );
  }
}

