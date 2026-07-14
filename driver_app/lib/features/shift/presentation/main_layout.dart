import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
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

  @override
  void initState() {
    super.initState();
    // Default weekly views to group days strictly from Sunday to Saturday
    final now = DateTime.now();
    final int daysToSubtract = now.weekday % 7; // Sunday maps to 0, Monday to 1, Saturday to 6
    _startDate = DateTime(now.year, now.month, now.day).subtract(Duration(days: daysToSubtract));
    _endDate = _startDate.add(const Duration(days: 6));
    _loadShifts();
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
    
    // Derive profile-aware fallback rate
    final authState = ref.watch(authProvider);
    final rateProfile = authState.driver?['rate_profile'] ?? 'LWR';
    final fallbackRate = rateProfile == 'HIR' ? 17.00 : 16.00;

    final rates = _shifts
        .map((s) => (s['effective_rate'] as num?)?.toDouble() ?? (s['base_hourly_rate'] as num?)?.toDouble() ?? fallbackRate)
        .toSet()
        .toList();
    rates.sort();
    final ratesString = rates.isNotEmpty ? rates.map((r) => '£${r.toStringAsFixed(0)}/HR').join(', ') : '£${fallbackRate.toStringAsFixed(0)}/HR';

    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        centerTitle: true,
        title: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Image.asset('assets/images/abtso_logo.jpg', height: 26, fit: BoxFit.contain),
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
                            final startTime = DateTime.parse(s['start_time']);
                            final dayName = DateFormat('EEEE').format(startTime);
                            final pay = (s['total_pay'] as num?)?.toDouble() ?? 0.0;
                            final hours = (s['total_hours'] as num?)?.toDouble() ?? 0.0;
                            final hasOverride = s['override_rate'] != null;

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
                                children: [
                                  Column(
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
                                        style: theme.textTheme.bodyMedium?.copyWith(fontSize: 11),
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
                                      const SizedBox(height: 2),
                                      Text(
                                        '${hours.toStringAsFixed(1)} Hrs',
                                        style: theme.textTheme.bodyMedium?.copyWith(fontSize: 11),
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
// Premium, minimalist Settings Tab
// ─────────────────────────────────────────────────────────────────────────────
class SettingsTab extends ConsumerWidget {
  const SettingsTab({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final authState = ref.watch(authProvider);
    final theme = Theme.of(context);

    final driverName = authState.driver?['full_name'] ?? 'Driver';
    final driverCode = authState.driver?['driver_id'] ?? 'DRV-001';

    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        centerTitle: true,
        title: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Image.asset('assets/images/abtso_logo.jpg', height: 26, fit: BoxFit.contain),
          ],
        ),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(1),
          child: Container(height: 1, color: const Color(0xFFE0E0E0)),
        ),
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
          children: [
            // Driver card
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: const Color(0xFFF5F5F5),
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: const Color(0xFFE0E0E0), width: 1),
              ),
              child: Row(
                children: [
                  Container(
                    width: 48,
                    height: 48,
                    decoration: BoxDecoration(
                      color: const Color(0xFFCC0000),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: const Icon(Icons.person, color: Colors.white, size: 24),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          driverName.toUpperCase(),
                          style: theme.textTheme.titleLarge?.copyWith(
                            fontWeight: FontWeight.w900, fontSize: 15,
                            color: const Color(0xFF333333),
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          'ID: $driverCode',
                          style: theme.textTheme.bodyMedium?.copyWith(
                            fontSize: 12, color: const Color(0xFF888888),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 28),

            _buildSettingSection(theme, 'APP PREFERENCES'),
            _buildSettingTile(
              context,
              icon: Icons.notifications_none,
              title: 'Push Notifications',
              trailing: Switch(
                value: true,
                onChanged: (_) {},
                activeThumbColor: const Color(0xFFCC0000),
              ),
            ),
            _buildSettingTile(
              context,
              icon: Icons.gps_fixed,
              title: 'GPS Tracking Settings',
              subtitle: 'Optimized background telemetry',
            ),
            const SizedBox(height: 24),

            _buildSettingSection(theme, 'SUPPORT & LEGAL'),
            _buildSettingTile(context, icon: Icons.help_outline, title: 'Help & Dispatch Support'),
            _buildSettingTile(context, icon: Icons.privacy_tip_outlined, title: 'Privacy Policy'),
            _buildSettingTile(context, icon: Icons.info_outline, title: 'App Version', subtitle: 'v1.0.0+1'),
            const SizedBox(height: 32),

            // Logout Button
            ElevatedButton(
              onPressed: () => ref.read(authProvider.notifier).logout(),
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFFCC0000),
                foregroundColor: Colors.white,
                minimumSize: const Size(double.infinity, 48),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                elevation: 0,
              ),
              child: const Text(
                'LOGOUT SESSION',
                style: TextStyle(fontWeight: FontWeight.w700, letterSpacing: 0.8, fontSize: 13),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSettingSection(ThemeData theme, String title) {
    return Padding(
      padding: const EdgeInsets.only(left: 4, bottom: 10),
      child: Text(
        title,
        style: theme.textTheme.bodyMedium?.copyWith(
          fontSize: 10,
          fontWeight: FontWeight.w900,
          letterSpacing: 1.2,
          color: const Color(0xFF888888),
        ),
      ),
    );
  }

  Widget _buildSettingTile(
    BuildContext context, {
    required IconData icon,
    required String title,
    String? subtitle,
    Widget? trailing,
  }) {
    final theme = Theme.of(context);

    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFFE0E0E0), width: 1),
      ),
      child: ListTile(
        leading: Icon(icon, color: const Color(0xFFCC0000), size: 18),
        title: Text(
          title,
          style: theme.textTheme.bodyLarge?.copyWith(
            fontWeight: FontWeight.w600, fontSize: 14, color: const Color(0xFF333333),
          ),
        ),
        subtitle: subtitle != null
            ? Text(
                subtitle,
                style: theme.textTheme.bodyMedium?.copyWith(fontSize: 11),
              )
            : null,
        trailing: trailing ?? const Icon(Icons.chevron_right, color: Color(0xFFBBBBBB), size: 16),
      ),
    );
  }
}

