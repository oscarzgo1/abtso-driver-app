import '../../dispatch/assigned_load_banner.dart';
import '../../dispatch/proof_capture.dart';
import '../../dispatch/load_history_screen.dart';
import 'dart:async';
import 'dart:math' as math;
import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:maplibre/maplibre.dart' as ml;
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart' hide AuthState;
import '../../../config/theme.dart';
import '../../auth/presentation/auth_provider.dart';
import 'shift_provider.dart';
import 'walkaround_check_screen.dart';
import 'walkaround_history_screen.dart';
import 'asset_picker.dart';
import '../../holidays/presentation/holiday_screen.dart';
import '../../rota/presentation/rota_screen.dart';
import '../../../core/network/supabase_service.dart';
import '../../../core/utils/role_helper.dart';
import '../../../core/network/entitlements_provider.dart';
import '../../../core/services/tracking_guard.dart';
import 'tracking_setup_sheet.dart';

/// True once this app launch has looked for tracking notices (see _showLaunchNotices).
bool _gpsNoticesCheckedThisLaunch = false;


class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key});

  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

/// OpenFreeMap "Liberty": a free, keyless vector style (commercial use
/// allowed) with Google-Maps-like colours — coloured roads, parks, water,
/// building footprints, road and place labels and POI icons. Rendered by
/// MapLibre (maplibre-gl-js on web, the native SDKs on Android/iOS).
const String _kMapStyleUrl = 'https://tiles.openfreemap.org/styles/liberty';

/// A circle of [radiusM] metres around a point as a polygon ring, for the
/// depot geofences (MapLibre circle layers are sized in pixels, not metres).
List<ml.Geographic> _geofenceRing(double lat, double lon, double radiusM, {int steps = 48}) {
  // A depot set to a huge radius (e.g. "clock in from anywhere") would make a
  // ring with impossible coordinates, so past 100 km it is drawn as a small
  // marker ring. Clock-in itself still uses the real radius.
  if (radiusM >= 100000) radiusM = 300;
  final dLat = radiusM / 111320.0;
  final dLon = radiusM / (111320.0 * math.cos(lat * math.pi / 180));
  return [
    for (var i = 0; i <= steps; i++)
      ml.Geographic(
        lon: lon + dLon * math.cos(2 * math.pi * i / steps),
        lat: lat + dLat * math.sin(2 * math.pi * i / steps),
      ),
  ];
}

class _HomeScreenState extends ConsumerState<HomeScreen> with TickerProviderStateMixin, WidgetsBindingObserver {
  Timer? _shiftDurationTimer;
  Duration _elapsedTime = Duration.zero;
  ml.MapController? _mapController;
  late AnimationController _iconAnimationController;

  RealtimeChannel? _driverProfileChannel;
  RealtimeChannel? _shiftsChannel;
  RealtimeChannel? _orgSettingsChannel;

  // ── Live tracking health (Always-location, GPS, battery) ──────────
  // A driver who lets the phone stop Tachyo in the background stops being
  // tracked, so the app checks on launch and every time it comes back to
  // the foreground, and shows the setup sheet until it's fixed.
  bool _trackingUnhealthy = false;
  bool _trackingSheetOpen = false;
  // Events already shown to this driver. Kept on the phone (not just in this
  // screen's memory) so coming back to Home never repeats an old alert.
  Set<String>? _shownGpsNotices;
  bool _gpsNoticeBusy = false;

  /// Wired into ShiftNotifier.trackingPrompt so clock-in can ask for the
  /// permissions with the sheet's direct-to-settings buttons.
  Future<bool> _promptTrackingSetup() async {
    if (!mounted || _trackingSheetOpen) return false;
    _trackingSheetOpen = true;
    try {
      final policy = ref.read(shiftProvider.notifier).gpsPolicy;
      return await TrackingSetupSheet.show(context, mandatory: true, policy: policy);
    } finally {
      _trackingSheetOpen = false;
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) _checkTrackingOnResume();
  }

  Future<void> _checkTrackingOnResume() async {
    if (kIsWeb || !mounted) return;
    final hasShift = ref.read(shiftProvider).activeShift != null;
    final health = await TrackingGuard.check();
    if (!mounted) return;
    setState(() => _trackingUnhealthy = hasShift && !health.healthy);
    if (!hasShift) return;

    await ref.read(shiftProvider.notifier).refreshGpsPolicy();

    if (!health.healthy && mounted) {
      await _promptTrackingSetup();
      final again = await TrackingGuard.check();
      if (mounted) setState(() => _trackingUnhealthy = !again.healthy);
    }
  }

  String get _gpsNoticePrefsKey => 'shown_gps_notices_${SupabaseService.currentDriverId ?? 'anon'}';

  Future<Set<String>> _loadShownGpsNotices() async {
    final cached = _shownGpsNotices;
    if (cached != null) return cached;
    final prefs = await SharedPreferences.getInstance();
    return _shownGpsNotices = (prefs.getStringList(_gpsNoticePrefsKey) ?? const <String>[]).toSet();
  }

  Future<void> _rememberGpsNotice(String key) async {
    final seen = await _loadShownGpsNotices();
    seen.add(key);
    // Only the recent ones matter (the server returns the last 12 hours).
    final trimmed = seen.length > 60 ? seen.toList().sublist(seen.length - 60) : seen.toList();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setStringList(_gpsNoticePrefsKey, trimmed);
  }

  /// Tells the driver what happened while the app was closed. Runs once per
  /// app launch (a cold start, i.e. the app had been killed), never when the
  /// app merely comes back from the background or the home screen is rebuilt.
  Future<void> _showLaunchNotices() async {
    if (_gpsNoticesCheckedThisLaunch || kIsWeb || !mounted) return;
    _gpsNoticesCheckedThisLaunch = true;
    if (!SupabaseService.isAuthenticated) return;
    await ref.read(shiftProvider.notifier).refreshGpsPolicy();
    await _showPendingGpsNotices();
  }

  /// Shows each tracking event (tracking stopped, or idle) to the driver once.
  Future<void> _showPendingGpsNotices() async {
    if (_gpsNoticeBusy || !mounted) return;
    _gpsNoticeBusy = true;
    try {
      final events = await SupabaseService.fetchRecentGpsEvents();
      for (final event in events.reversed) {
        if (!mounted) break;
        await _showOfflineNotice(event);
      }
    } finally {
      _gpsNoticeBusy = false;
    }
  }

  /// Tells the driver, once per event, what happened to their time (only if
  /// the company chose to notify): tracking stopped, or they were idle.
  Future<void> _showOfflineNotice(Map<String, dynamic> event) async {
    final policy = ref.read(shiftProvider.notifier).gpsPolicy;
    final isIdle = event['kind']?.toString() == 'idle';
    if (isIdle ? !policy.idleNotifyDriver : !policy.notifyDriver) return;
    final started = DateTime.tryParse(event['started_at']?.toString() ?? '')?.toLocal();
    if (started == null) return;
    final key = '${isIdle ? 'idle' : 'offline'}|${started.toIso8601String()}';
    final seen = await _loadShownGpsNotices();
    if (seen.contains(key) || !mounted) return;
    await _rememberGpsNotice(key);

    final resolved = DateTime.tryParse(event['resolved_at']?.toString() ?? '')?.toLocal();
    final fmt = DateFormat('HH:mm');
    final minutes = ((resolved ?? DateTime.now()).difference(started).inMinutes).clamp(0, 100000);
    final action = event['action_taken']?.toString() ?? 'alert';
    final String title;
    final String body;
    if (isIdle) {
      final span = '${fmt.format(started)}${resolved != null ? ' – ${fmt.format(resolved)}' : ''}';
      if (action == 'time_frozen') {
        title = 'Your time was paused — idle';
        body = 'You were stationary for $minutes min ($span). That time is paused and will not be paid.';
      } else {
        title = 'You were idle';
        body = 'You were stationary for $minutes min ($span). Your manager has been alerted.';
      }
    } else if (action == 'clocked_out') {
      title = 'You were clocked out';
      body = 'Tachyo stopped tracking you at ${fmt.format(started)}, so your shift was ended automatically at that time. Keep Tachyo running to avoid this.';
    } else if (action == 'time_frozen') {
      title = 'Your time was paused';
      body = 'Tachyo stopped tracking you at ${fmt.format(started)}'
          '${resolved != null ? ' until ${fmt.format(resolved)} ($minutes min)' : ''}. That time is paused and will not be paid.';
    } else {
      title = 'Tracking stopped';
      body = 'Tachyo stopped tracking you at ${fmt.format(started)}'
          '${resolved != null ? ' until ${fmt.format(resolved)} ($minutes min)' : ''}. Your manager was alerted.';
    }
    if (!mounted) return;
    await showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(title, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 18)),
        content: Text(body, style: const TextStyle(fontSize: 14, height: 1.4)),
        actions: [TextButton(onPressed: () => Navigator.of(ctx).pop(), child: const Text('OK'))],
      ),
    );
  }

  Widget _buildTrackingBanner() {
    return Material(
      color: TachyoTheme.brandRed,
      child: InkWell(
        onTap: _promptTrackingSetup,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
          child: Row(
            children: [
              const Icon(Icons.gps_off_rounded, size: 18, color: Colors.white),
              const SizedBox(width: 10),
              const Expanded(
                child: Text(
                  'Tracking is limited — fix your phone settings',
                  style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 13),
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(8)),
                child: const Text('Fix now', style: TextStyle(color: TachyoTheme.brandRed, fontWeight: FontWeight.w800, fontSize: 12)),
              ),
            ],
          ),
        ),
      ),
    );
  }

  /// Whether the Action Hub shows "Request Night Out" at all (migration
  /// 050's organizations.allow_driver_night_out_requests). Defaults
  /// false — hidden — until the org row actually resolves true.
  bool _allowNightOutRequests = false;

  /// Aggressive fresh read of driver profile, active shift, and depots from database
  Future<void> fetchDashboardData() async {
    final driverId = SupabaseService.currentDriverId;
    if (driverId == null) return;
    debugPrint('🔄 Aggressively fetching fresh dashboard data for driver $driverId...');
    await ref.read(authProvider.notifier).refreshProfile();
    await ref.read(shiftProvider.notifier).loadActiveShift();
    await ref.read(shiftProvider.notifier).fetchDepots();
    await _loadOrgSettings();
  }

  Future<void> _loadOrgSettings() async {
    final organizationId = ref.read(authProvider).driver?['organization_id'] as String?;
    if (organizationId == null) return;
    final allowed = await SupabaseService.fetchAllowNightOutRequests(organizationId);
    if (mounted && allowed != _allowNightOutRequests) {
      setState(() => _allowNightOutRequests = allowed);
    }
  }

  void _setupRealtimeListeners(String driverId) {
    _cleanupRealtimeListeners();
    if (SupabaseService.isMockMode) return;

    try {
      debugPrint('📡 Setting up Realtime channels for driver: $driverId');

      // 1. Driver Profile Realtime (Rates, Agency, Rate Type, etc.)
      _driverProfileChannel = SupabaseService.client
          .channel('driver_profile_updates_$driverId')
          .onPostgresChanges(
            event: PostgresChangeEvent.all,
            schema: 'public',
            table: 'drivers',
            filter: PostgresChangeFilter(
              type: PostgresChangeFilterType.eq,
              column: 'id',
              value: driverId,
            ),
            callback: (PostgresChangePayload payload) {
              debugPrint('⚡ Profile updated via Realtime: ${payload.newRecord}. Refreshing data...');
              fetchDashboardData();
            },
          )
          ..subscribe();

      // 2. Driver Shifts Realtime (Clock in/out, Admin manual edits, Flags, Night Out, Extras)
      _shiftsChannel = SupabaseService.client
          .channel('driver_shifts_updates_$driverId')
          .onPostgresChanges(
            event: PostgresChangeEvent.all,
            schema: 'public',
            table: 'shifts',
            filter: PostgresChangeFilter(
              type: PostgresChangeFilterType.eq,
              column: 'driver_id',
              value: driverId,
            ),
            callback: (PostgresChangePayload payload) {
              debugPrint('⚡ Shifts updated via Realtime: ${payload.newRecord}. Refreshing data...');
              fetchDashboardData();
            },
          )
          ..subscribe();

      // 3. Org Settings Realtime — so flipping "Allow Drivers to Request
      // Night Out" in the admin panel hides/shows the Action Hub option
      // immediately, without the driver needing to relaunch the app.
      final organizationId = ref.read(authProvider).driver?['organization_id'] as String?;
      if (organizationId != null) {
        _orgSettingsChannel = SupabaseService.client
            .channel('org_settings_updates_$organizationId')
            .onPostgresChanges(
              event: PostgresChangeEvent.update,
              schema: 'public',
              table: 'organizations',
              filter: PostgresChangeFilter(
                type: PostgresChangeFilterType.eq,
                column: 'id',
                value: organizationId,
              ),
              callback: (PostgresChangePayload payload) {
                final allowed = payload.newRecord['allow_driver_night_out_requests'] == true;
                if (mounted && allowed != _allowNightOutRequests) {
                  setState(() => _allowNightOutRequests = allowed);
                }
              },
            )
            ..subscribe();
      }
    } catch (e) {
      debugPrint('Realtime channel subscription error: $e');
    }
  }

  void _cleanupRealtimeListeners() {
    if (_driverProfileChannel != null) {
      SupabaseService.client.removeChannel(_driverProfileChannel!);
      _driverProfileChannel = null;
    }
    if (_shiftsChannel != null) {
      SupabaseService.client.removeChannel(_shiftsChannel!);
      _shiftsChannel = null;
    }
    if (_orgSettingsChannel != null) {
      SupabaseService.client.removeChannel(_orgSettingsChannel!);
      _orgSettingsChannel = null;
    }
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    ref.read(shiftProvider.notifier).trackingPrompt = _promptTrackingSetup;

    _iconAnimationController = AnimationController(
      duration: const Duration(milliseconds: 300),
      vsync: this,
    );

    // Check authentication on launch and initialize realtime subscriptions
    Future.microtask(() async {
      if (!mounted) return;
      final auth = ref.read(authProvider);
      if (auth.status != AuthStatus.authenticated && !SupabaseService.isAuthenticated) {
        context.goNamed('login');
      } else {
        await ref.read(shiftProvider.notifier).initialize();
        await fetchDashboardData();
        final driverId = SupabaseService.currentDriverId ?? auth.driver?['id'];
        if (driverId != null) {
          _setupRealtimeListeners(driverId.toString());
        }
      }

      if (ref.read(shiftProvider).activeShift != null) {
        _iconAnimationController.value = 1.0;
        unawaited(_checkTrackingOnResume());
      }
      unawaited(_showLaunchNotices());
    });

    // Tick active shift elapsed timer — also resets to zero when clocked out
    _shiftDurationTimer = Timer.periodic(const Duration(seconds: 1), (_) {
      _updateTimerTick();
    });
  }

  void _updateTimerTick() {
    if (!mounted) return;
    final activeShift = ref.read(shiftProvider).activeShift;
    if (activeShift != null) {
      final now = DateTime.now().toUtc();
      final start = activeShift.startTime.toUtc();
      final diff = now.difference(start);
      final elapsed = diff.isNegative ? Duration.zero : diff;
      setState(() {
        _elapsedTime = elapsed;
      });
    } else {
      if (_elapsedTime != Duration.zero) {
        setState(() {
          _elapsedTime = Duration.zero;
        });
      }
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _cleanupRealtimeListeners();
    _shiftDurationTimer?.cancel();
    _iconAnimationController.dispose();
    super.dispose();
  }

  String _formatDuration(Duration duration) {
    final cleanDuration = duration.isNegative ? Duration.zero : duration;
    String twoDigits(int n) => n.toString().padLeft(2, '0');
    final hours = twoDigits(cleanDuration.inHours);
    final minutes = twoDigits(cleanDuration.inMinutes.remainder(60));
    final seconds = twoDigits(cleanDuration.inSeconds.remainder(60));
    return '$hours:$minutes:$seconds';
  }

  void _showCompletedShiftModal(BuildContext context, dynamic completedShift) {
    final currencyFormat = NumberFormat.currency(locale: 'en_GB', symbol: '£');
    final dateFormat = DateFormat('EEEE, d MMM yyyy');
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    final authState = ref.read(authProvider);
    final driverMap = authState.driver;
    final isFixed = driverMap?['rate_type'] == 'Fixed Shift Rate (Day Rate)' || driverMap?['rate_type'] == 'Fixed';
    final double rateValue = isFixed
        ? ((driverMap?['fixed_rate'] as num?)?.toDouble() ?? 0.0)
        : ((driverMap?['hourly_rate'] as num?)?.toDouble() ?? (driverMap?['mon_fri_rate'] as num?)?.toDouble() ?? 16.0);
    final rateSuffix = isFixed ? '/SHIFT' : '/HR';
    final double effRate = (completedShift.effectiveRate as num?)?.toDouble() ?? (completedShift.baseHourlyRate as num?)?.toDouble() ?? rateValue;

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (context) {
        return Container(
          decoration: BoxDecoration(
            color: theme.scaffoldBackgroundColor,
            borderRadius: const BorderRadius.only(
              topLeft: Radius.circular(24),
              topRight: Radius.circular(24),
            ),
            border: Border.all(
              color: isDark ? const Color(0xFF1E293B) : const Color(0xFFE2E8F0),
              width: 1.5,
            ),
          ),
          padding: const EdgeInsets.fromLTRB(28, 28, 28, 48),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                'SHIFT COMPLETED',
                style: theme.textTheme.displayMedium?.copyWith(
                  fontSize: 20,
                  fontWeight: FontWeight.w900,
                  color: isDark ? Colors.white : Colors.black,
                  letterSpacing: 0.5,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                dateFormat.format(DateTime.now()).toUpperCase(),
                style: theme.textTheme.bodyMedium?.copyWith(fontSize: 11, letterSpacing: 0.5),
              ),
              const SizedBox(height: 24),
              
              // Shift Info Grid
              _buildSummaryRow(context, 'BASE RATE', '£${effRate.toStringAsFixed(2)}$rateSuffix'),
              const Divider(height: 24, thickness: 1),
              _buildSummaryRow(context, 'TOTAL HOURS', '${completedShift.totalHours?.toStringAsFixed(2) ?? '0.00'} HRS'),
              if (completedShift.nightOutAmount > 0 || completedShift.nightOutStatus == 'approved') ...[
                const Divider(height: 24, thickness: 1),
                _buildSummaryRow(
                  context,
                  'NIGHT OUT ALLOWANCE',
                  currencyFormat.format(completedShift.nightOutAmount > 0 ? completedShift.nightOutAmount : 25.00),
                ),
              ],
              const Divider(height: 24, thickness: 1),
              _buildSummaryRow(
                context, 
                'TOTAL GROSS PAY', 
                currencyFormat.format(completedShift.totalPay ?? 0.00),
                highlighted: true,
              ),
              
              if (completedShift.overrideRate != null) ...[
                const SizedBox(height: 16),
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    border: Border.all(color: TachyoTheme.success, width: 1.5),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.star, color: TachyoTheme.success, size: 18),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          'WEEKEND RATE OVERRIDE APPLIED (£18.00/HR)',
                          style: theme.textTheme.bodyMedium?.copyWith(
                            color: TachyoTheme.success,
                            fontWeight: FontWeight.w800,
                            fontSize: 11,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],

              const SizedBox(height: 32),
              ElevatedButton(
                onPressed: () => Navigator.pop(context),
                child: const Text('DISMISS'),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _buildSummaryRow(BuildContext context, String label, String value, {bool highlighted = false}) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
          label,
          style: theme.textTheme.bodyMedium?.copyWith(
            fontWeight: FontWeight.w800,
            fontSize: 11,
            letterSpacing: 0.5,
          ),
        ),
        Text(
          value,
          style: theme.textTheme.titleLarge?.copyWith(
            fontWeight: FontWeight.w900,
            color: highlighted
                ? TachyoTheme.success
                : (isDark ? Colors.white : Colors.black),
            fontSize: highlighted ? 20 : 15,
          ),
        ),
      ],
    );
  }

  /// The shift's coupled trailer as a picker-style map — a fleet vehicle
  /// row, or a typed non-fleet trailer (migration 060) — or null.
  Map<String, dynamic>? _shiftTrailer(dynamic shift, List<Map<String, dynamic>> vehicles) {
    final String? trailerId = shift?.trailerId as String?;
    if (trailerId != null) {
      for (final v in vehicles) {
        if (v['id'] == trailerId) return v;
      }
    }
    final String? custom = shift?.customTrailerNumber as String?;
    if (custom != null && custom.isNotEmpty) {
      return {'id': null, 'vehicle_number': custom, 'vehicle_type': 'trailer', 'custom': true};
    }
    return null;
  }

  Future<Map<String, dynamic>?> _showSearchableAssetPicker(
    BuildContext context, {
    required String title,
    required String subtitle,
    required List<Map<String, dynamic>> vehicles,
    String? typeFilter,
    bool allowClear = false,
    String? signOffContext,
  }) =>
      showSearchableAssetPicker(
        context,
        title: title,
        subtitle: subtitle,
        vehicles: vehicles,
        typeFilter: typeFilter,
        allowClear: allowClear,
        allowCustomTrailer: typeFilter == 'trailer',
        signOffContext: signOffContext,
        driverName: ref.read(authProvider).driver?['full_name'] as String?,
        shiftId: ref.read(shiftProvider).activeShift?.id,
      );

  /// Compact floating status pill — replaces the old tall, full-width
  /// banners. Frosted dark pill, optional tap action (the "no tractor"
  /// pill routes to Couple/Decouple; the GPS-error and offline-sync
  /// pills are purely informational).
  Widget _buildStatusPill({
    required IconData icon,
    required String label,
    Color tone = const Color(0xFF0F172A),
    VoidCallback? onTap,
  }) {
    final pill = ClipRRect(
      borderRadius: BorderRadius.circular(999),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 8, sigmaY: 8),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
          decoration: BoxDecoration(
            color: tone.withValues(alpha: 0.9),
            borderRadius: BorderRadius.circular(999),
            boxShadow: [
              BoxShadow(color: Colors.black.withValues(alpha: 0.15), blurRadius: 6, offset: const Offset(0, 2)),
            ],
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, size: 13, color: Colors.white),
              const SizedBox(width: 6),
              Flexible(
                child: Text(
                  label,
                  style: const TextStyle(color: Colors.white, fontSize: 11.5, fontWeight: FontWeight.w600),
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              if (onTap != null) ...[
                const SizedBox(width: 4),
                const Icon(Icons.chevron_right, size: 14, color: Colors.white70),
              ],
            ],
          ),
        ),
      ),
    );
    if (onTap == null) return pill;
    return GestureDetector(onTap: onTap, child: pill);
  }

  void _handleRecenter() {
    final pos = ref.read(shiftProvider).currentPosition;
    if (pos != null) {
      _mapController?.animateCamera(
        center: ml.Geographic(lon: pos.longitude, lat: pos.latitude),
        zoom: 15.5,
        nativeDuration: const Duration(milliseconds: 700),
        webSpeed: 1.6,
      );
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: const Text('Acquiring GPS location...'),
          backgroundColor: const Color(0xFF1C1C1E),
          behavior: SnackBarBehavior.floating,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
          duration: const Duration(seconds: 2),
        ),
      );
    }
  }

  /// A single accidental tap on the app-bar logout icon used to end the
  /// session immediately with no way back short of re-entering Company
  /// Code + Driver ID + 6-digit PIN — this confirms first, matching the
  /// same dialog pattern already used for SOS below.
  void _handleLogoutAction(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    showDialog(
      context: context,
      builder: (dialogContext) {
        return AlertDialog(
          backgroundColor: isDark ? const Color(0xFF0F172A) : Colors.white,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(20),
            side: BorderSide(
              color: isDark ? const Color(0xFF1E293B) : const Color(0xFFE2E8F0),
              width: 1.5,
            ),
          ),
          title: const Row(
            children: [
              Icon(Icons.logout_rounded, color: Color(0xFF333333), size: 26),
              SizedBox(width: 12),
              Text(
                'LOG OUT',
                style: TextStyle(fontWeight: FontWeight.w900, letterSpacing: 0.5, fontSize: 18),
              ),
            ],
          ),
          content: const Text(
            'Are you sure you want to log out? You\'ll need your Company Code, Driver ID, and PIN to sign back in.',
            style: TextStyle(fontSize: 14, height: 1.4),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext),
              child: Text(
                'CANCEL',
                style: TextStyle(color: isDark ? Colors.white60 : Colors.black54, fontWeight: FontWeight.bold),
              ),
            ),
            ElevatedButton(
              onPressed: () {
                Navigator.pop(dialogContext);
                _cleanupRealtimeListeners();
                ref.read(authProvider.notifier).logout();
                context.goNamed('login');
              },
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFFCC0000),
                foregroundColor: Colors.white,
                minimumSize: const Size(100, 40),
                padding: const EdgeInsets.symmetric(horizontal: 16),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
              child: const Text('LOG OUT'),
            ),
          ],
        );
      },
    );
  }

  /// Incident reporting: tap a category, then confirm which vehicle it
  /// concerns — the admin panel needs the asset, not just the category,
  /// to know which truck/trailer to act on. Tapping a vehicle fires the
  /// submission immediately (single direct insert, no queueing), so this
  /// stays a fast two-tap flow with no added delay before it reaches the
  /// admin panel. The vehicle list is fetched as soon as the sheet opens
  /// (in parallel with its slide-up animation and the category step),
  /// not after the category tap, so it's normally already loaded by the
  /// time the driver reaches the vehicle step. Reachable any time (not
  /// gated on being clocked in) since an incident can happen off-shift too.
  void _handleReportIncidentAction(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final noteController = TextEditingController();
    bool isSubmitting = false;
    final selectedPhotos = <XFile>[];
    // Bytes read once at pick time, parallel to selectedPhotos — the
    // web build (driver.tachyo.co.uk) can't use dart:io.File to read an
    // XFile back later, so the bytes are captured up front and reused
    // for both the thumbnail preview and the upload itself.
    final selectedPhotoBytes = <Uint8List>[];
    // Parallel to selectedPhotos/selectedPhotoBytes — each upload starts
    // the moment that photo is picked (see pickPhoto below), so submit()
    // just awaits whatever's still in flight instead of uploading every
    // photo one after another only once the driver taps Submit.
    final selectedUploads = <Future<String?>>[];
    final picker = ImagePicker();
    String? selectedCategory;
    String? selectedCategoryLabel;

    final organizationId = ref.read(authProvider).driver?['organization_id'] as String?;
    final vehiclesFuture = organizationId != null
        ? SupabaseService.fetchOrgVehicles(organizationId)
        : Future.value(<Map<String, dynamic>>[]);

    const categories = [
      ('Vehicle Damage', 'vehicle_damage', Icons.car_crash_outlined),
      ('Near Miss', 'near_miss', Icons.warning_amber_rounded),
      ('Collision', 'collision', Icons.report_gmailerrorred_outlined),
      ('Mechanical Fault', 'mechanical_fault', Icons.build_outlined),
      ('Other', 'other', Icons.more_horiz_rounded),
    ];

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: isDark ? const Color(0xFF0F172A) : Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (sheetContext) {
        return StatefulBuilder(
          builder: (sheetContext, setSheetState) {
            Future<void> pickPhoto(ImageSource source) async {
              final picked = await picker.pickImage(source: source, imageQuality: 80, maxWidth: 1600);
              if (picked == null) return;
              final bytes = await picked.readAsBytes();
              setSheetState(() {
                selectedPhotos.add(picked);
                selectedPhotoBytes.add(bytes);
              });
              final driverId = ref.read(authProvider).driver?['id'] as String?;
              selectedUploads.add(
                organizationId != null && driverId != null
                    ? SupabaseService.uploadDefectPhoto(organizationId: organizationId, driverId: driverId, bytes: bytes, fileName: picked.name)
                    : Future.value(null),
              );
            }

            Future<void> submit(String category, {String? vehicleId, String? trailerId}) async {
              final messenger = ScaffoldMessenger.of(context);
              final driverId = ref.read(authProvider).driver?['id'] as String?;
              if (driverId == null || isSubmitting) return;

              setSheetState(() => isSubmitting = true);
              // Everything below is wrapped in try/finally — previously,
              // any unexpected exception here (a bad cast, a dropped
              // connection mid-upload, anything) left isSubmitting stuck
              // at true forever with no error shown, silently no-opping
              // every future tap on this sheet ("nothing happens when I
              // click"). The finally block guarantees it always resets,
              // and the catch surfaces the real error instead of hiding it.
              try {
                final pos = ref.read(shiftProvider).currentPosition;

                // Upload whatever photos were attached first — a photo
                // that fails to upload is dropped rather than blocking the
                // report itself from going through, but that previously
                // happened with zero indication to the driver: the report
                // would submit clean and an admin reviewing it later would
                // see no evidence photo with no way to tell "driver didn't
                // attach one" from "attaching it silently failed". Track
                // the failure count (and the real reason, via
                // SupabaseService.lastUploadError) so the driver is told.
                final photoPaths = <String>[];
                String? lastPhotoError;
                if (organizationId != null) {
                  // Every upload was already started back in pickPhoto,
                  // in parallel — awaited together here, not re-uploaded
                  // one at a time.
                  final resolved = await Future.wait(List.generate(
                    selectedPhotos.length,
                    (i) => i < selectedUploads.length
                        ? selectedUploads[i]
                        : SupabaseService.uploadDefectPhoto(organizationId: organizationId, driverId: driverId, bytes: selectedPhotoBytes[i], fileName: selectedPhotos[i].name),
                  ));
                  for (final path in resolved) {
                    if (path != null) {
                      photoPaths.add(path);
                    } else {
                      lastPhotoError = SupabaseService.lastUploadError;
                    }
                  }
                }
                final failedPhotoCount = selectedPhotos.length - photoPaths.length;

                final success = await SupabaseService.submitIncidentReport(
                  driverId: driverId,
                  category: category,
                  vehicleId: vehicleId,
                  trailerId: trailerId,
                  note: noteController.text,
                  latitude: pos?.latitude,
                  longitude: pos?.longitude,
                  photoPaths: photoPaths,
                );
                if (sheetContext.mounted) Navigator.pop(sheetContext);
                final message = !success
                    ? 'Could not send the report — try again.'
                    : failedPhotoCount > 0
                        ? 'Incident reported, but $failedPhotoCount photo${failedPhotoCount == 1 ? '' : 's'} failed to upload'
                            '${lastPhotoError != null ? ' ($lastPhotoError)' : ''}. Try attaching again from the report if needed.'
                        : 'Incident reported. Thanks.';
                messenger.showSnackBar(
                  SnackBar(
                    content: Text(message, style: const TextStyle(fontWeight: FontWeight.bold)),
                    backgroundColor: success && failedPhotoCount == 0 ? const Color(0xFF111111) : const Color(0xFFFF3333),
                    behavior: SnackBarBehavior.floating,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                );
              } catch (e) {
                debugPrint('Incident report submit failed: $e');
                messenger.showSnackBar(
                  SnackBar(
                    content: Text('Something went wrong sending the report: $e', style: const TextStyle(fontWeight: FontWeight.bold)),
                    backgroundColor: const Color(0xFFFF3333),
                    behavior: SnackBarBehavior.floating,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                );
              } finally {
                if (sheetContext.mounted) setSheetState(() => isSubmitting = false);
              }
            }

            Widget buildCategoryStep() {
              return Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      const Icon(Icons.report_outlined, color: Color(0xFFCC0000), size: 26),
                      const SizedBox(width: 12),
                      Text(
                        'REPORT AN INCIDENT',
                        style: TextStyle(
                          fontWeight: FontWeight.w900,
                          letterSpacing: 0.5,
                          fontSize: 16,
                          color: isDark ? Colors.white : Colors.black87,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'Tap a category, then confirm the vehicle.',
                    style: TextStyle(fontSize: 12.5, color: isDark ? Colors.white60 : Colors.black54),
                  ),
                  const SizedBox(height: 16),
                  Wrap(
                    spacing: 10,
                    runSpacing: 10,
                    children: [
                      for (final (label, value, icon) in categories)
                        OutlinedButton.icon(
                          onPressed: () => setSheetState(() {
                            selectedCategory = value;
                            selectedCategoryLabel = label;
                          }),
                          icon: Icon(icon, size: 18, color: const Color(0xFFCC0000)),
                          label: Text(
                            label,
                            style: TextStyle(
                              fontWeight: FontWeight.w700,
                              fontSize: 13,
                              color: isDark ? Colors.white : Colors.black87,
                            ),
                          ),
                          style: OutlinedButton.styleFrom(
                            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                            side: const BorderSide(color: Color(0xFFCC0000), width: 1.5),
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                          ),
                        ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  TextField(
                    controller: noteController,
                    maxLines: 2,
                    decoration: InputDecoration(
                      hintText: 'Add a note (optional)',
                      filled: true,
                      fillColor: isDark ? const Color(0xFF1E293B) : const Color(0xFFF1F5F9),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide: BorderSide.none,
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      TextButton.icon(
                        onPressed: () => pickPhoto(ImageSource.camera),
                        icon: const Icon(Icons.camera_alt_outlined, size: 18),
                        label: const Text('Take Photo'),
                      ),
                      TextButton.icon(
                        onPressed: () => pickPhoto(ImageSource.gallery),
                        icon: const Icon(Icons.photo_library_outlined, size: 18),
                        label: const Text('Choose Photo'),
                      ),
                    ],
                  ),
                  if (selectedPhotos.isNotEmpty) ...[
                    const SizedBox(height: 4),
                    SizedBox(
                      height: 64,
                      child: ListView.separated(
                        scrollDirection: Axis.horizontal,
                        itemCount: selectedPhotos.length,
                        separatorBuilder: (_, __) => const SizedBox(width: 8),
                        itemBuilder: (_, i) => Stack(
                          clipBehavior: Clip.none,
                          children: [
                            ClipRRect(
                              borderRadius: BorderRadius.circular(10),
                              child: Image.memory(selectedPhotoBytes[i], width: 64, height: 64, fit: BoxFit.cover),
                            ),
                            Positioned(
                              top: -6,
                              right: -6,
                              child: GestureDetector(
                                onTap: () => setSheetState(() {
                                  selectedPhotos.removeAt(i);
                                  selectedPhotoBytes.removeAt(i);
                                  selectedUploads.removeAt(i);
                                }),
                                child: Container(
                                  padding: const EdgeInsets.all(2),
                                  decoration: const BoxDecoration(color: Color(0xFFCC0000), shape: BoxShape.circle),
                                  child: const Icon(Icons.close, size: 14, color: Colors.white),
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ],
              );
            }

            Widget buildVehicleRow(Map<String, dynamic> vehicle) {
              final isTruck = vehicle['vehicle_type'] == 'truck';
              return Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Material(
                  color: isDark ? const Color(0xFF1E293B) : const Color(0xFFF1F5F9),
                  borderRadius: BorderRadius.circular(12),
                  child: InkWell(
                    borderRadius: BorderRadius.circular(12),
                    onTap: isSubmitting
                        ? null
                        : () => submit(selectedCategory!, vehicleId: vehicle['id'] as String),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
                      child: Row(
                        children: [
                          Icon(
                            isTruck ? Icons.local_shipping_outlined : Icons.rv_hookup_outlined,
                            size: 20,
                            color: const Color(0xFFCC0000),
                          ),
                          const SizedBox(width: 12),
                          Text(
                            vehicle['vehicle_number'] as String,
                            style: TextStyle(
                              fontWeight: FontWeight.w700,
                              fontSize: 14,
                              color: isDark ? Colors.white : Colors.black87,
                            ),
                          ),
                          const Spacer(),
                          Icon(Icons.chevron_right, size: 18, color: isDark ? Colors.white38 : Colors.black38),
                        ],
                      ),
                    ),
                  ),
                ),
              );
            }

            Widget buildVehicleStep() {
              final activeShift = ref.read(shiftProvider).activeShift;

              return Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      IconButton(
                        onPressed: isSubmitting ? null : () => setSheetState(() => selectedCategory = null),
                        icon: Icon(Icons.arrow_back, color: isDark ? Colors.white : Colors.black87),
                        padding: EdgeInsets.zero,
                        constraints: const BoxConstraints(),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              selectedCategoryLabel ?? '',
                              style: TextStyle(
                                fontWeight: FontWeight.w900,
                                letterSpacing: 0.5,
                                fontSize: 15,
                                color: isDark ? Colors.white : Colors.black87,
                              ),
                            ),
                            Text(
                              'Which vehicle is this about?',
                              style: TextStyle(fontSize: 12.5, color: isDark ? Colors.white60 : Colors.black54),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  FutureBuilder<List<Map<String, dynamic>>>(
                    future: vehiclesFuture,
                    builder: (context, snapshot) {
                      if (snapshot.connectionState != ConnectionState.done) {
                        return const Padding(
                          padding: EdgeInsets.symmetric(vertical: 24),
                          child: Center(child: CircularProgressIndicator(strokeWidth: 2.5)),
                        );
                      }
                      final vehicles = snapshot.data ?? const [];
                      if (vehicles.isEmpty) {
                        // No fleet registered yet — never let that block a
                        // safety report from reaching the admin panel.
                        return Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'No vehicles are registered for your company yet.',
                              style: TextStyle(fontSize: 13, color: isDark ? Colors.white60 : Colors.black54),
                            ),
                            const SizedBox(height: 12),
                            OutlinedButton(
                              onPressed: isSubmitting ? null : () => submit(selectedCategory!),
                              style: OutlinedButton.styleFrom(
                                side: const BorderSide(color: Color(0xFFCC0000), width: 1.5),
                                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                              ),
                              child: const Text(
                                'Send report anyway',
                                style: TextStyle(fontWeight: FontWeight.w700, color: Color(0xFFCC0000)),
                              ),
                            ),
                          ],
                        );
                      }

                      // Defaults to the currently coupled tractor/trailer —
                      // surfaced as one-tap quick options — but a search
                      // across the whole fleet is always available for a
                      // spare/uncoupled/yard asset.
                      Map<String, dynamic>? findById(String? id) {
                        if (id == null) return null;
                        for (final v in vehicles) {
                          if (v['id'] == id) return v;
                        }
                        return null;
                      }
                      final coupledTractor = findById(activeShift?.vehicleId);
                      final coupledTrailer = _shiftTrailer(activeShift, vehicles);

                      return Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          if (coupledTractor != null) ...[
                            Padding(
                              padding: const EdgeInsets.only(bottom: 8),
                              child: Text('CURRENTLY COUPLED', style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w800, letterSpacing: 0.5, color: isDark ? Colors.white38 : Colors.black38)),
                            ),
                            buildVehicleRow(coupledTractor),
                          ],
                          if (coupledTrailer != null) buildVehicleRow(coupledTrailer),
                          if (coupledTractor != null || coupledTrailer != null) const SizedBox(height: 4),
                          OutlinedButton.icon(
                            onPressed: isSubmitting
                                ? null
                                : () async {
                                    final picked = await _showSearchableAssetPicker(
                                      context,
                                      title: 'SEARCH FLEET',
                                      subtitle: 'Report on any tractor or trailer, including a spare parked in the yard.',
                                      vehicles: vehicles,
                                    );
                                    if (picked == null || picked.isEmpty) return;
                                    final isTractor = picked['vehicle_type'] == 'truck';
                                    submit(
                                      selectedCategory!,
                                      vehicleId: isTractor ? picked['id'] as String : null,
                                      trailerId: !isTractor ? picked['id'] as String : null,
                                    );
                                  },
                            icon: const Icon(Icons.search, size: 16, color: Color(0xFFCC0000)),
                            label: const Text('Search Fleet Asset', style: TextStyle(fontWeight: FontWeight.w700, color: Color(0xFFCC0000))),
                            style: OutlinedButton.styleFrom(
                              side: const BorderSide(color: Color(0xFFCC0000), width: 1.5),
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                              minimumSize: const Size(double.infinity, 44),
                            ),
                          ),
                          const SizedBox(height: 8),
                          TextButton(
                            onPressed: isSubmitting ? null : () => submit(selectedCategory!),
                            child: Text('Send report without an asset', style: TextStyle(fontWeight: FontWeight.w700, color: isDark ? Colors.white54 : Colors.black45)),
                          ),
                        ],
                      );
                    },
                  ),
                ],
              );
            }

            return Padding(
              padding: EdgeInsets.only(
                left: 20, right: 20, top: 20,
                bottom: 20 + MediaQuery.of(sheetContext).viewInsets.bottom,
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  selectedCategory == null ? buildCategoryStep() : buildVehicleStep(),
                  if (isSubmitting) ...[
                    const SizedBox(height: 16),
                    const Center(child: CircularProgressIndicator(strokeWidth: 2.5)),
                  ],
                ],
              ),
            );
          },
        );
      },
    );
  }

  /// Reusable "pick a tractor / pick a trailer" row for both the clock-in
  /// sheet and the couple/decouple sheet — shows the current selection's
  /// registration (mono/uppercase/bold, per design guidelines) or an
  /// empty-state prompt, and opens the searchable picker on tap.
  Widget _buildCouplingRow({
    required BuildContext context,
    required bool isDark,
    required String label,
    required IconData icon,
    required String? selectedVehicleNumber,
    required VoidCallback onTap,
  }) {
    return Material(
      color: isDark ? const Color(0xFF1E293B) : const Color(0xFFF1F5F9),
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
          child: Row(
            children: [
              Icon(icon, size: 20, color: const Color(0xFFCC0000)),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      label,
                      style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w800, letterSpacing: 0.5, color: isDark ? Colors.white60 : Colors.black54),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      selectedVehicleNumber != null ? selectedVehicleNumber.toUpperCase() : 'Tap to select',
                      style: TextStyle(
                        fontFamily: selectedVehicleNumber != null ? 'monospace' : null,
                        fontWeight: FontWeight.w800,
                        fontSize: 14,
                        letterSpacing: selectedVehicleNumber != null ? 0.5 : 0,
                        color: selectedVehicleNumber != null ? (isDark ? Colors.white : Colors.black87) : (isDark ? Colors.white38 : Colors.black38),
                      ),
                    ),
                  ],
                ),
              ),
              Icon(Icons.chevron_right, size: 18, color: isDark ? Colors.white38 : Colors.black38),
            ],
          ),
        ),
      ),
    );
  }

  /// Unified Action Hub — one consolidated bottom sheet for all four
  /// operational actions, opened from the single AppBar "Quick actions"
  /// icon. Brought back after a brief detour through a permanently
  /// docked 4-tile bar under the map, which took up too much fixed
  /// screen space — this sheet keeps the map's full height and only
  /// appears when actually needed. Rows that don't apply yet (e.g.
  /// clocked out) render disabled with an explanatory subtitle rather
  /// than disappearing, so the hub's shape doesn't shift depending on
  /// state.
  void _handleActionHub(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final state = ref.read(shiftProvider);
    final isClockedIn = state.activeShift != null;
    final activeShift = state.activeShift;
    final organizationId = ref.read(authProvider).driver?['organization_id'] as String?;
    final vehiclesFuture = organizationId != null
        ? SupabaseService.fetchOrgVehicles(organizationId)
        : Future.value(<Map<String, dynamic>>[]);
    // The row callbacks below must open their own sheet/do async work
    // against the screen's own long-lived context, not whatever context
    // FutureBuilder hands its builder — that inner one belongs to this
    // Action Hub sheet and goes defunct the moment it's popped, which
    // buildActionRow's onTap does *before* calling onSelect(). A row's
    // onSelect (e.g. Log Fuel's ScaffoldMessenger.of(context), called
    // later from that sheet's own Submit button) was crashing with an
    // uncaught null/defunct-element error — outside any try/catch, so
    // tapping Submit looked like it silently did nothing.
    final hubContext = context;

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: isDark ? const Color(0xFF0F172A) : Colors.white,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (sheetContext) {
        String? openCategory = (ref.read(shiftProvider).activeShift != null &&
                requiresFieldChecks(ref.read(authProvider).driver) &&
                !ref.read(shiftProvider).completedWalkarounds.contains('start_of_shift'))
            ? 'vehicle'
            : null;
        Widget buildActionRow({
          required IconData icon,
          required String title,
          required String subtitle,
          required VoidCallback? onSelect,
        }) {
          final enabled = onSelect != null;
          final titleColor = enabled ? (isDark ? Colors.white : Colors.black87) : (isDark ? Colors.white38 : Colors.black38);
          final iconColor = enabled ? const Color(0xFFCC0000) : (isDark ? Colors.white24 : Colors.black26);
          return Material(
            color: Colors.transparent,
            child: InkWell(
              onTap: enabled
                  ? () {
                      Navigator.pop(sheetContext);
                      onSelect();
                    }
                  : null,
              borderRadius: BorderRadius.circular(12),
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 8),
                child: Row(
                  children: [
                    Container(
                      width: 38,
                      height: 38,
                      decoration: BoxDecoration(color: iconColor.withValues(alpha: 0.12), shape: BoxShape.circle),
                      alignment: Alignment.center,
                      child: Icon(icon, size: 18, color: iconColor),
                    ),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(title, style: TextStyle(fontWeight: FontWeight.w800, fontSize: 14, color: titleColor)),
                          const SizedBox(height: 2),
                          Text(subtitle, style: TextStyle(fontSize: 11.5, color: isDark ? Colors.white54 : Colors.black54)),
                        ],
                      ),
                    ),
                    if (enabled) Icon(Icons.chevron_right, size: 18, color: isDark ? Colors.white38 : Colors.black38),
                  ],
                ),
              ),
            ),
          );
        }

        return FutureBuilder<List<Map<String, dynamic>>>(
          future: vehiclesFuture,
          builder: (context, snapshot) {
            final vehicles = snapshot.data ?? const [];
            Map<String, dynamic>? findById(String? id) {
              if (id == null) return null;
              for (final v in vehicles) {
                if (v['id'] == id) return v;
              }
              return null;
            }

            final tractor = findById(activeShift?.vehicleId);
            final trailer = _shiftTrailer(activeShift, vehicles);
            final unitsSubtitle = !isClockedIn
                ? 'Clock in to couple a vehicle'
                : (tractor == null && trailer == null)
                    ? 'Unassigned (tap to pair)'
                    : [
                        if (tractor != null) (tractor['vehicle_number'] as String).toUpperCase(),
                        if (trailer != null) (trailer['vehicle_number'] as String).toUpperCase(),
                      ].join(' / ');

            final isFieldRole = requiresFieldChecks(ref.read(authProvider).driver);
            // Loads & proof of delivery is a plan feature (migration 067);
            // when the plan doesn't include it those two actions aren't shown.
            final hasLoads = hasFeature(ref.read(entitlementsProvider).valueOrNull, 'loads_pod');
            final startCheckDone = state.completedWalkarounds.contains('start_of_shift');
            final loadReference = state.loadReference;
            final loadDeliveredAt = state.loadDeliveredAt;
            final attachLoadSubtitle = !isClockedIn
                ? 'Clock in to attach a load'
                : loadReference == null
                    ? "Tag what you're carrying on this shift"
                    : loadDeliveredAt == null
                        ? 'Carrying $loadReference · ${state.loadCount} load${state.loadCount == 1 ? '' : 's'} this shift — add another'
                        : '${state.loadCount} load${state.loadCount == 1 ? '' : 's'} delivered — attach your next one';
            final deliverySubtitle = !isClockedIn
                ? 'Clock in first'
                : loadReference == null
                    ? 'Attach a load first'
                    : loadDeliveredAt == null
                        ? 'Load $loadReference — mark it as delivered'
                        : 'Delivered at ${DateFormat('HH:mm').format(loadDeliveredAt.toLocal())}';

            final nightOutStatus = activeShift?.nightOutStatus;
            final canRequestNightOut = isClockedIn && (nightOutStatus == 'none' || nightOutStatus == null);
            final nightOutSubtitle = !isClockedIn
                ? 'Clock in to request'
                : switch (nightOutStatus) {
                    'pending' => 'Already requested — awaiting review',
                    'approved' => 'Approved for this shift',
                    'rejected' => 'Request was declined',
                    _ => 'Away from home tonight',
                  };

            final vehicleRows = <Widget>[
                  if (isFieldRole && isClockedIn && !startCheckDone)
                    buildActionRow(
                      icon: Icons.fact_check_outlined,
                      title: 'Complete Walk-Around Check',
                      subtitle: 'Not done for this shift yet — complete it now',
                      onSelect: () => _startWalkAroundDuringShift(hubContext),
                    ),
                  if (isFieldRole)
                    buildActionRow(
                      icon: Icons.history,
                      title: 'Walk-Around History',
                      subtitle: !isClockedIn
                          ? 'View your completed checks'
                          : startCheckDone
                              ? 'Completed for this shift ✓ — view your checks'
                              : 'Not done for this shift — view or complete',
                      onSelect: () => _openWalkaroundHistory(hubContext),
                    ),
                  if (isFieldRole)
                    buildActionRow(
                      icon: Icons.local_shipping_outlined,
                      title: 'Assigned Units',
                      subtitle: unitsSubtitle,
                      onSelect: isClockedIn ? () => _handleCoupleDecoupleAction(hubContext) : null,
                    ),
                  buildActionRow(
                    icon: Icons.warning_amber_rounded,
                    title: 'Report Defect / Incident',
                    subtitle: 'Damage, near miss, collision, mechanical fault',
                    onSelect: () => _handleReportIncidentAction(hubContext),
                  ),
            ];
            final loadRows = <Widget>[
                  if (isFieldRole && hasLoads) ...[
                    buildActionRow(
                      icon: Icons.inventory_2_outlined,
                      title: 'Attach Load',
                      subtitle: attachLoadSubtitle,
                      onSelect: isClockedIn ? () => _handleAttachLoadAction(hubContext) : null,
                    ),
                    buildActionRow(
                      icon: Icons.task_alt,
                      title: 'Confirm Delivery',
                      subtitle: deliverySubtitle,
                      onSelect: isClockedIn && loadReference != null && loadDeliveredAt == null
                          ? () => _handleConfirmDeliveryAction(hubContext)
                          : null,
                    ),
                  ],
                  if (isFieldRole && hasLoads)
                    buildActionRow(
                      icon: Icons.history,
                      title: 'Load History',
                      subtitle: 'Your completed loads',
                      onSelect: () => Navigator.of(hubContext).push(MaterialPageRoute(builder: (_) => const LoadHistoryScreen())),
                    ),
            ];
            final expenseRows = <Widget>[
                  buildActionRow(
                    icon: Icons.local_gas_station_outlined,
                    title: 'Log Fuel & AdBlue',
                    subtitle: isClockedIn ? 'Diesel or AdBlue, with a receipt photo' : 'Clock in to log fuel',
                    onSelect: isClockedIn ? () => _handleFuelReceiptAction(hubContext) : null,
                  ),
                  buildActionRow(
                    icon: Icons.local_parking_outlined,
                    title: 'Overnight Parking',
                    subtitle: 'Claim back a paid parking receipt',
                    onSelect: () => _handleParkingExpenseAction(hubContext),
                  ),
            ];
            final timeRows = <Widget>[
                  buildActionRow(
                    icon: Icons.beach_access_outlined,
                    title: 'Book Holiday',
                    subtitle: 'Request time off and track approval',
                    onSelect: () => Navigator.of(hubContext).push(MaterialPageRoute(builder: (_) => const HolidayScreen())),
                  ),
                  buildActionRow(
                    icon: Icons.calendar_view_week_outlined,
                    title: 'Weekly Rota',
                    subtitle: 'Add the days and hours you will work',
                    onSelect: () => Navigator.of(hubContext).push(MaterialPageRoute(builder: (_) => const RotaScreen())),
                  ),
                  // Conditional on the org's own Settings -> Alerts toggle
                  // (migration 050) — completely absent from the hub, not
                  // just disabled, when the company doesn't run a Night
                  // Out allowance scheme.
                  if (_allowNightOutRequests)
                    buildActionRow(
                      icon: Icons.bedtime_outlined,
                      title: 'Request Night Out',
                      subtitle: nightOutSubtitle,
                      onSelect: canRequestNightOut
                          ? () async {
                              final messenger = ScaffoldMessenger.of(hubContext);
                              final success = await ref.read(shiftProvider.notifier).requestNightOut();
                              if (success) {
                                messenger.showSnackBar(
                                  const SnackBar(
                                    content: Text('Night Out request submitted.'),
                                    backgroundColor: Color(0xFF333333),
                                  ),
                                );
                              }
                            }
                          : null,
                    ),
            ];

            // Quick Actions grouped into categories (accordion, one open at
            // a time) so the sheet isn't one long list. Every row inside is
            // exactly the same button as before; only the grouping is new.
            Widget buildCategory({
              required String id,
              required IconData icon,
              required String title,
              required String subtitle,
              required List<Widget> rows,
              required void Function(VoidCallback) rebuild,
              bool attention = false,
            }) {
              if (rows.isEmpty) return const SizedBox.shrink();
              final open = openCategory == id;
              return Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Container(
                  decoration: BoxDecoration(
                    color: isDark ? const Color(0xFF1E293B) : const Color(0xFFF8F8F8),
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: open ? const Color(0xFFCC0000).withValues(alpha: 0.5) : (isDark ? Colors.white12 : const Color(0xFFE5E5E5))),
                  ),
                  child: Column(
                    children: [
                      InkWell(
                        borderRadius: BorderRadius.circular(14),
                        onTap: () => rebuild(() => openCategory = open ? null : id),
                        child: Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                          child: Row(
                            children: [
                              Container(
                                width: 40,
                                height: 40,
                                decoration: const BoxDecoration(color: Color(0xFFCC0000), shape: BoxShape.circle),
                                alignment: Alignment.center,
                                child: Icon(icon, size: 20, color: Colors.white),
                              ),
                              const SizedBox(width: 14),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Row(children: [
                                      Text(title, style: TextStyle(fontWeight: FontWeight.w900, fontSize: 14.5, color: isDark ? Colors.white : Colors.black87)),
                                      if (attention) ...[
                                        const SizedBox(width: 8),
                                        Container(width: 8, height: 8, decoration: const BoxDecoration(color: Color(0xFFCC0000), shape: BoxShape.circle)),
                                      ],
                                    ]),
                                    const SizedBox(height: 2),
                                    Text(subtitle, style: TextStyle(fontSize: 11.5, color: isDark ? Colors.white54 : Colors.black54)),
                                  ],
                                ),
                              ),
                              AnimatedRotation(
                                turns: open ? 0.5 : 0,
                                duration: const Duration(milliseconds: 180),
                                child: Icon(Icons.expand_more, color: isDark ? Colors.white54 : Colors.black45),
                              ),
                            ],
                          ),
                        ),
                      ),
                      if (open) Padding(padding: const EdgeInsets.fromLTRB(4, 0, 4, 8), child: Column(children: rows)),
                    ],
                  ),
                ),
              );
            }

            // Scrolls once the list outgrows the screen — a dozen rows no
            // longer fit on smaller phones.
            return StatefulBuilder(builder: (hubCtx, setHubState) => ConstrainedBox(
              constraints: BoxConstraints(maxHeight: MediaQuery.of(sheetContext).size.height * 0.88),
              child: SingleChildScrollView(
              padding: EdgeInsets.only(left: 12, right: 12, top: 16, bottom: 16 + MediaQuery.of(sheetContext).viewInsets.bottom),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 8),
                    child: Text(
                      'QUICK ACTIONS',
                      style: TextStyle(fontWeight: FontWeight.w900, fontSize: 13, letterSpacing: 0.6, color: isDark ? Colors.white : Colors.black87),
                    ),
                  ),
                  const SizedBox(height: 8),
                  buildCategory(id: 'vehicle', icon: Icons.fact_check_outlined, title: 'Vehicle & Checks', subtitle: 'Walk-around checks, assigned units, defects', rebuild: setHubState, rows: vehicleRows, attention: isFieldRole && isClockedIn && !startCheckDone),
                  buildCategory(id: 'loads', icon: Icons.inventory_2_outlined, title: 'Loads', subtitle: 'Attach, deliver and review your loads', rebuild: setHubState, rows: loadRows),
                  buildCategory(id: 'expenses', icon: Icons.receipt_long_outlined, title: 'Fuel & Expenses', subtitle: 'Fuel and AdBlue, overnight parking', rebuild: setHubState, rows: expenseRows),
                  buildCategory(id: 'time', icon: Icons.event_available_outlined, title: 'Time Off & Shift', subtitle: 'Holiday and night out requests', rebuild: setHubState, rows: timeRows),
                ],
              ),
              ),
            ));
          },
        );
      },
    );
  }

  /// Clock-in coupling selection: Tractor Unit and Trailer are two
  /// independent fields (spec: "Decoupled Tractor & Trailer Coupling"),
  /// each feeding shifts.vehicle_id / shifts.trailer_id (migration
  /// 045/047/049) as a best-effort initial value for the Profitability
  /// ledger — an admin can still correct either later. Neither is
  /// required: "CLOCK IN" always works with whatever's selected (including
  /// nothing), and starting fully uncoupled is the explicit "Assign Later"
  /// path — the Quick Actions hub's Assigned Units row is how a driver
  /// closes that out afterwards.
  void _handleClockInVehicleSelection(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final organizationId = ref.read(authProvider).driver?['organization_id'] as String?;
    final vehiclesFuture = organizationId != null
        ? SupabaseService.fetchOrgVehicles(organizationId)
        : Future.value(<Map<String, dynamic>>[]);

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: isDark ? const Color(0xFF0F172A) : Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (sheetContext) {
        // Declared outside StatefulBuilder's builder: anything declared
        // inside it is recreated as null on every setSheetState, which
        // wiped each pick the moment the sheet redrew.
        Map<String, dynamic>? selectedTractor;
        Map<String, dynamic>? selectedTrailer;

        return StatefulBuilder(
          builder: (sheetContext, setSheetState) {
            return FutureBuilder<List<Map<String, dynamic>>>(
              future: vehiclesFuture,
              builder: (context, snapshot) {
                final vehicles = snapshot.data ?? const [];
                return Padding(
                  padding: EdgeInsets.only(
                    left: 20, right: 20, top: 20,
                    bottom: 20 + MediaQuery.of(sheetContext).viewInsets.bottom,
                  ),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          const Icon(Icons.local_shipping_outlined, color: Color(0xFFCC0000), size: 26),
                          const SizedBox(width: 12),
                          Text(
                            'COUPLE YOUR VEHICLE',
                            style: TextStyle(fontWeight: FontWeight.w900, letterSpacing: 0.5, fontSize: 16, color: isDark ? Colors.white : Colors.black87),
                          ),
                        ],
                      ),
                      const SizedBox(height: 4),
                      Text(
                        "Select the tractor and/or trailer you're taking out today, or skip and assign later.",
                        style: TextStyle(fontSize: 12.5, color: isDark ? Colors.white60 : Colors.black54),
                      ),
                      const SizedBox(height: 16),
                      if (snapshot.connectionState != ConnectionState.done)
                        const Padding(
                          padding: EdgeInsets.symmetric(vertical: 24),
                          child: Center(child: CircularProgressIndicator(strokeWidth: 2.5)),
                        )
                      else ...[
                        _buildCouplingRow(
                          context: context,
                          isDark: isDark,
                          label: 'TRACTOR UNIT',
                          icon: Icons.local_shipping_outlined,
                          selectedVehicleNumber: selectedTractor?['vehicle_number'] as String?,
                          onTap: () async {
                            final picked = await _showSearchableAssetPicker(
                              context,
                              title: 'TRACTOR UNIT',
                              subtitle: 'Search or select the tractor you\'re taking out.',
                              vehicles: vehicles,
                              typeFilter: 'truck',
                              signOffContext: 'coupling',
                            );
                            if (picked != null && picked.isNotEmpty) {
                              setSheetState(() => selectedTractor = picked);
                            }
                          },
                        ),
                        const SizedBox(height: 10),
                        _buildCouplingRow(
                          context: context,
                          isDark: isDark,
                          label: 'TRAILER',
                          icon: Icons.rv_hookup_outlined,
                          selectedVehicleNumber: selectedTrailer?['vehicle_number'] as String?,
                          onTap: () async {
                            final picked = await _showSearchableAssetPicker(
                              context,
                              title: 'TRAILER',
                              subtitle: 'Search or select the trailer you\'re taking out.',
                              vehicles: vehicles,
                              typeFilter: 'trailer',
                              signOffContext: 'coupling',
                            );
                            if (picked != null && picked.isNotEmpty) {
                              setSheetState(() => selectedTrailer = picked);
                            }
                          },
                        ),
                        const SizedBox(height: 18),
                        ElevatedButton(
                          // A tractor must be picked before clocking in —
                          // you can't walk around a vehicle nobody
                          // selected. Trailer stays optional; the
                          // walk-around screen itself is what states
                          // plainly whether one's coupled.
                          onPressed: selectedTractor == null
                              ? null
                              : () {
                                  Navigator.pop(sheetContext);
                                  _startWalkAroundThenClockIn(
                                    context,
                                    tractor: selectedTractor!,
                                    trailer: selectedTrailer,
                                  );
                                },
                          style: ElevatedButton.styleFrom(
                            backgroundColor: const Color(0xFFCC0000),
                            disabledBackgroundColor: isDark ? Colors.white12 : Colors.black12,
                            foregroundColor: Colors.white,
                            minimumSize: const Size(double.infinity, 46),
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                          ),
                          child: const Text('START WALK-AROUND CHECK', style: TextStyle(fontWeight: FontWeight.w900, letterSpacing: 0.3, fontSize: 12.5)),
                        ),
                        const SizedBox(height: 8),
                        // Skipping is allowed for when something goes wrong
                        // on the day — the check then shows as missing in
                        // the admin panel and can still be done from Quick
                        // Actions during the shift.
                        OutlinedButton(
                          onPressed: selectedTractor == null
                              ? null
                              : () {
                                  Navigator.pop(sheetContext);
                                  _clockInSkippingWalkAround(
                                    context,
                                    tractor: selectedTractor!,
                                    trailer: selectedTrailer,
                                  );
                                },
                          style: OutlinedButton.styleFrom(
                            foregroundColor: isDark ? Colors.white70 : Colors.black87,
                            side: BorderSide(color: isDark ? Colors.white24 : Colors.black26),
                            minimumSize: const Size(double.infinity, 46),
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                          ),
                          child: const Text('SKIP CHECK & CLOCK IN', style: TextStyle(fontWeight: FontWeight.w800, letterSpacing: 0.3, fontSize: 12.5)),
                        ),
                        if (selectedTractor == null) ...[
                          const SizedBox(height: 8),
                          Text(
                            'Select a tractor to continue.',
                            textAlign: TextAlign.center,
                            style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w600, color: isDark ? Colors.white38 : Colors.black38),
                          ),
                        ],
                      ],
                    ],
                  ),
                );
              },
            );
          },
        );
      },
    );
  }

  /// Starting the safety check IS clocking in: the shift begins the moment
  /// the check opens (so the time spent on the check counts), and the
  /// check is then done against that live shift. Backing out of the check
  /// leaves the driver clocked in with the check still to do — the same
  /// state as skipping it — and it shows as missing in the admin panel
  /// until it's completed.
  Future<void> _startWalkAroundThenClockIn(
    BuildContext context, {
    required Map<String, dynamic> tractor,
    Map<String, dynamic>? trailer,
  }) async {
    final driverId = SupabaseService.currentDriverId;
    final organizationId = ref.read(authProvider).driver?['organization_id'] as String?;
    if (driverId == null || organizationId == null) return;
    final notifier = ref.read(shiftProvider.notifier);
    await notifier.clockIn(
      vehicleId: tractor['id'] as String,
      trailerId: trailer?['id'] as String?,
      customTrailerNumber: isCustomTrailer(trailer) ? trailer!['vehicle_number'] as String? : null,
    );
    // Clock-in can fail (e.g. no GPS fix) — the provider already shows why.
    if (ref.read(shiftProvider).activeShift == null || !context.mounted) return;
    await _startWalkAroundDuringShift(context);
  }

  /// Clock-in with the chosen vehicle but without the start-of-shift
  /// check — it stays open as a Quick Actions item for the shift and shows
  /// as missing in the admin panel until it's done.
  Future<void> _clockInSkippingWalkAround(
    BuildContext context, {
    required Map<String, dynamic> tractor,
    Map<String, dynamic>? trailer,
  }) async {
    final messenger = ScaffoldMessenger.of(context);
    await ref.read(shiftProvider.notifier).clockIn(
          vehicleId: tractor['id'] as String,
          trailerId: trailer?['id'] as String?,
          customTrailerNumber: isCustomTrailer(trailer) ? trailer!['vehicle_number'] as String? : null,
        );
    if (ref.read(shiftProvider).activeShift == null) return;
    messenger.showSnackBar(
      const SnackBar(
        content: Text('Clocked in. Your walk-around check is still to do — find it in Quick Actions.', style: TextStyle(fontWeight: FontWeight.bold)),
        backgroundColor: Color(0xFF333333),
        behavior: SnackBarBehavior.floating,
      ),
    );
  }

  /// A start-of-shift check the driver skipped at clock-in, done later
  /// from Quick Actions. The shift already exists, so it's linked on
  /// insert rather than backfilled.
  Future<void> _startWalkAroundDuringShift(BuildContext context) async {
    final driverId = SupabaseService.currentDriverId;
    final activeShift = ref.read(shiftProvider).activeShift;
    final organizationId = ref.read(authProvider).driver?['organization_id'] as String?;
    if (driverId == null || activeShift == null || organizationId == null) return;

    final vehicles = await SupabaseService.fetchOrgVehicles(organizationId);
    Map<String, dynamic>? findById(String? id) {
      if (id == null) return null;
      for (final v in vehicles) {
        if (v['id'] == id) return v;
      }
      return null;
    }

    var tractor = findById(activeShift.vehicleId);
    final trailer = _shiftTrailer(activeShift, vehicles);
    if (!context.mounted) return;
    if (tractor == null) {
      final picked = await _showSearchableAssetPicker(
        context,
        title: 'TRACTOR UNIT',
        subtitle: 'No tractor is recorded for this shift — select the one you are checking.',
        vehicles: vehicles,
        typeFilter: 'truck',
        signOffContext: 'coupling',
      );
      if (picked == null || picked.isEmpty) return;
      tractor = picked;
    }
    if (!context.mounted) return;

    final resolvedTractor = tractor;
    final messenger = ScaffoldMessenger.of(context);
    Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => WalkAroundCheckScreen(
        driverId: driverId,
        organizationId: organizationId,
        checkType: 'start_of_shift',
        vehicleId: resolvedTractor['id'] as String,
        vehicleNumber: resolvedTractor['vehicle_number'] as String,
        trailerId: trailer?['id'] as String?,
        trailerNumber: trailer?['vehicle_number'] as String?,
        shiftId: activeShift.id,
        onComplete: (checkId, checkedTrailer) async {
          final notifier = ref.read(shiftProvider.notifier);
          notifier.markWalkaroundCompleted('start_of_shift');
          await _syncShiftTrailer(checkedTrailer);
          messenger.showSnackBar(
            const SnackBar(
              content: Text('Walk-around check submitted.', style: TextStyle(fontWeight: FontWeight.bold)),
              backgroundColor: Color(0xFF111111),
              behavior: SnackBarBehavior.floating,
            ),
          );
        },
      ),
    ));
  }

  /// Couples the trailer confirmed on a mid-shift walk-around check to
  /// the shift when it differs from what's recorded.
  Future<void> _syncShiftTrailer(Map<String, dynamic>? trailer) async {
    final shift = ref.read(shiftProvider).activeShift;
    if (shift == null) return;
    final notifier = ref.read(shiftProvider.notifier);
    if (trailer == null) {
      if (shift.trailerId != null || shift.customTrailerNumber != null) {
        await notifier.updateCoupling(clearTrailer: true);
      }
      return;
    }
    if (isCustomTrailer(trailer)) {
      final number = (trailer['vehicle_number'] as String).toUpperCase();
      if (shift.trailerId != null || shift.customTrailerNumber != number) {
        await notifier.updateCoupling(customTrailerNumber: number);
      }
    } else if (trailer['id'] != shift.trailerId) {
      await notifier.updateCoupling(trailerId: trailer['id'] as String);
    }
  }

  void _openWalkaroundHistory(BuildContext context) {
    final state = ref.read(shiftProvider);
    final isClockedIn = state.activeShift != null;
    final startCheckDone = state.completedWalkarounds.contains('start_of_shift');
    Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => WalkaroundHistoryScreen(
        isClockedIn: isClockedIn,
        startCheckDone: startCheckDone,
        onCompleteStartCheck: isClockedIn && !startCheckDone ? () => _startWalkAroundDuringShift(context) : null,
      ),
    ));
  }

  /// Clock-out entry point. Every employee chooses the end-of-shift
  /// inspection or to skip it (the skipped check then shows as missing
  /// in the admin panel).
  Future<void> _handleClockOut(BuildContext context) async {
    if (!requiresFieldChecks(ref.read(authProvider).driver) ||
        ref.read(shiftProvider).completedWalkarounds.contains('end_of_shift')) {
      await ref.read(shiftProvider.notifier).clockOut();
      return;
    }
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final choice = await showDialog<String>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        backgroundColor: isDark ? const Color(0xFF1E293B) : Colors.white,
        title: const Text('End-of-shift inspection', style: TextStyle(fontWeight: FontWeight.w900)),
        content: const Text('Complete the vehicle inspection before clocking out. You can skip it if something prevents you — it will be flagged for your manager.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dialogContext), child: const Text('Cancel')),
          TextButton(onPressed: () => Navigator.pop(dialogContext, 'skip'), child: const Text('Skip & clock out')),
          ElevatedButton(
            onPressed: () => Navigator.pop(dialogContext, 'inspect'),
            style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFFCC0000), foregroundColor: Colors.white),
            child: const Text('Start inspection', style: TextStyle(fontWeight: FontWeight.w800)),
          ),
        ],
      ),
    );
    if (!context.mounted || choice == null) return;
    if (choice == 'skip') {
      await ref.read(shiftProvider.notifier).clockOut();
    } else {
      await _startWalkAroundThenClockOut(context);
    }
  }

  /// Pushes the end-of-shift Walk-Around Check screen. Submitting it does
  /// not clock out — the driver presses Clock Out afterwards. Falls back to asking for a tractor first
  /// if the active shift somehow has none recorded (the walk-around
  /// requires a real vehicle) — rare, since clock-in now requires one,
  /// but the best-effort vehicle_id write at clock-in can still fail
  /// silently, and this is the safety net for that case.
  Future<void> _startWalkAroundThenClockOut(BuildContext context) async {
    final driverId = SupabaseService.currentDriverId;
    final activeShift = ref.read(shiftProvider).activeShift;
    final organizationId = ref.read(authProvider).driver?['organization_id'] as String?;
    if (driverId == null || activeShift == null || organizationId == null) return;

    final vehicles = await SupabaseService.fetchOrgVehicles(organizationId);
    Map<String, dynamic>? findById(String? id) {
      if (id == null) return null;
      for (final v in vehicles) {
        if (v['id'] == id) return v;
      }
      return null;
    }

    var tractor = findById(activeShift.vehicleId);
    final trailer = _shiftTrailer(activeShift, vehicles);

    if (!context.mounted) return;

    if (tractor == null) {
      final picked = await _showSearchableAssetPicker(
        context,
        title: 'TRACTOR UNIT',
        subtitle: 'No tractor is recorded for this shift — select the one you drove.',
        vehicles: vehicles,
        typeFilter: 'truck',
        signOffContext: 'coupling',
      );
      if (picked == null || picked.isEmpty) return;
      tractor = picked;
    }

    if (!context.mounted) return;
    final resolvedTractor = tractor;
    final messenger = ScaffoldMessenger.of(context);
    Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => WalkAroundCheckScreen(
        driverId: driverId,
        organizationId: organizationId,
        checkType: 'end_of_shift',
        vehicleId: resolvedTractor['id'] as String,
        vehicleNumber: resolvedTractor['vehicle_number'] as String,
        trailerId: trailer?['id'] as String?,
        trailerNumber: trailer?['vehicle_number'] as String?,
        shiftId: activeShift.id,
        onComplete: (checkId, checkedTrailer) async {
          // Finishing the inspection does NOT clock the driver out — they
          // press Clock Out themselves. How long the inspection took is
          // recorded on the check (duration_seconds) for the office.
          await _syncShiftTrailer(checkedTrailer);
          ref.read(shiftProvider.notifier).markWalkaroundCompleted('end_of_shift');
          messenger.showSnackBar(
            const SnackBar(
              content: Text('Inspection complete. Tap Clock Out when you are ready to finish your shift.', style: TextStyle(fontWeight: FontWeight.bold)),
              backgroundColor: Color(0xFF111111),
              behavior: SnackBarBehavior.floating,
            ),
          );
        },
      ),
    ));
  }

  /// Header-toolbar / sticky-reminder Couple/Decouple modal — reachable
  /// any time during an active shift, independent of the clock-in flow.
  /// Each of Tractor/Trailer can be set, changed, or cleared on its own.
  void _handleCoupleDecoupleAction(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final organizationId = ref.read(authProvider).driver?['organization_id'] as String?;
    final vehiclesFuture = organizationId != null
        ? SupabaseService.fetchOrgVehicles(organizationId)
        : Future.value(<Map<String, dynamic>>[]);

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: isDark ? const Color(0xFF0F172A) : Colors.white,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (sheetContext) {
        return StatefulBuilder(
          builder: (sheetContext, setSheetState) {
            final activeShift = ref.read(shiftProvider).activeShift;

            return FutureBuilder<List<Map<String, dynamic>>>(
              future: vehiclesFuture,
              builder: (context, snapshot) {
                final vehicles = snapshot.data ?? const [];
                Map<String, dynamic>? findById(String? id) {
                  if (id == null) return null;
                  for (final v in vehicles) {
                    if (v['id'] == id) return v;
                  }
                  return null;
                }
                final tractor = findById(activeShift?.vehicleId);
                final trailer = _shiftTrailer(activeShift, vehicles);

                return Padding(
                  padding: EdgeInsets.only(
                    left: 20, right: 20, top: 20,
                    bottom: 20 + MediaQuery.of(sheetContext).viewInsets.bottom,
                  ),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          const Icon(Icons.local_shipping_outlined, color: Color(0xFFCC0000), size: 26),
                          const SizedBox(width: 12),
                          Text(
                            'COUPLE / DECOUPLE',
                            style: TextStyle(fontWeight: FontWeight.w900, letterSpacing: 0.5, fontSize: 16, color: isDark ? Colors.white : Colors.black87),
                          ),
                        ],
                      ),
                      const SizedBox(height: 4),
                      Text(
                        'Update the tractor or trailer coupled to this shift at any time.',
                        style: TextStyle(fontSize: 12.5, color: isDark ? Colors.white60 : Colors.black54),
                      ),
                      const SizedBox(height: 16),
                      if (snapshot.connectionState != ConnectionState.done)
                        const Padding(
                          padding: EdgeInsets.symmetric(vertical: 24),
                          child: Center(child: CircularProgressIndicator(strokeWidth: 2.5)),
                        )
                      else ...[
                        _buildCouplingRow(
                          context: context,
                          isDark: isDark,
                          label: 'TRACTOR UNIT',
                          icon: Icons.local_shipping_outlined,
                          selectedVehicleNumber: tractor?['vehicle_number'] as String?,
                          onTap: () async {
                            final picked = await _showSearchableAssetPicker(
                              context,
                              title: 'TRACTOR UNIT',
                              subtitle: 'Search or select a tractor, or decouple.',
                              vehicles: vehicles,
                              typeFilter: 'truck',
                              signOffContext: 'coupling',
                              allowClear: tractor != null,
                            );
                            if (picked == null) return;
                            final isClear = picked.isEmpty;
                            final ok = await ref.read(shiftProvider.notifier).updateCoupling(
                                  vehicleId: isClear ? null : picked['id'] as String,
                                  clearVehicle: isClear,
                                );
                            if (ok) setSheetState(() {});
                          },
                        ),
                        const SizedBox(height: 10),
                        _buildCouplingRow(
                          context: context,
                          isDark: isDark,
                          label: 'TRAILER',
                          icon: Icons.rv_hookup_outlined,
                          selectedVehicleNumber: trailer?['vehicle_number'] as String?,
                          onTap: () async {
                            final picked = await _showSearchableAssetPicker(
                              context,
                              title: 'TRAILER',
                              subtitle: 'Search or select a trailer, or decouple.',
                              vehicles: vehicles,
                              typeFilter: 'trailer',
                              signOffContext: 'coupling',
                              allowClear: trailer != null,
                            );
                            if (picked == null) return;
                            final isClear = picked.isEmpty;
                            final custom = isCustomTrailer(picked);
                            final ok = await ref.read(shiftProvider.notifier).updateCoupling(
                                  trailerId: isClear || custom ? null : picked['id'] as String,
                                  customTrailerNumber: custom ? picked['vehicle_number'] as String : null,
                                  clearTrailer: isClear,
                                );
                            if (ok) setSheetState(() {});
                          },
                        ),
                      ],
                    ],
                  ),
                );
              },
            );
          },
        );
      },
    );
  }

  /// Fuel & AdBlue receipt logging. Anti-theft pass (migration 055):
  /// litres alone let a driver buy 400L on a valid receipt, put a
  /// fraction of it in the tank, and divert the rest — so a second,
  /// independently-checkable data point is now required alongside the
  /// receipt: the odometer reading (cross-checked against distance
  /// travelled since the last fill-up — see the admin panel's MPG
  /// anomaly logic) and a dashboard photo showing that same odometer
  /// reading, so the typed number can't just be made up. GPS is
  /// captured silently from whatever fix shiftProvider already has
  /// (the same one driving the live map) — never requested specially
  /// and never blocks submission if there isn't one yet.
  ///
  /// Required now: receipt photo, dashboard photo, litres, odometer.
  /// Total cost stays optional (migration 049). Re-openable any number
  /// of times per shift. Tied to the active shift; starts 'pending'
  /// and only counts toward Actual Fuel Cost once an admin approves it.
  void _handleFuelReceiptAction(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final litersController = TextEditingController();
    final costController = TextEditingController();
    final vendorController = TextEditingController();
    final odometerController = TextEditingController();
    final picker = ImagePicker();
    XFile? selectedPhoto;
    Uint8List? selectedPhotoBytes;
    XFile? selectedDashboardPhoto;
    Uint8List? selectedDashboardPhotoBytes;
    // Started the moment each photo is picked (see pickPhoto below), so
    // submit() awaits two uploads already running in parallel instead of
    // starting them fresh, one after the other.
    Future<String?>? photoUpload;
    Future<String?>? dashboardPhotoUpload;
    String fuelType = 'diesel';
    bool isSubmitting = false;
    String? formError;
    // Fleet-wide rule (migration 070): trucks are always refuelled to
    // the brim, so this defaults true. A driver who genuinely only part-
    // filled (e.g. topping up to reach the next depot) can untick it —
    // that row is then excluded from the MPG anomaly comparison
    // entirely, since a partial fill would make the NEXT full-tank
    // reading look artificially thirsty.
    bool isFullTank = true;

    final organizationId = ref.read(authProvider).driver?['organization_id'] as String?;
    final activeShift = ref.read(shiftProvider).activeShift;
    final shiftId = activeShift?.id;
    // Defaults to the currently coupled tractor unit, per spec — the
    // driver can still search/select any other asset from the picker.
    Map<String, dynamic>? selectedAsset;
    final vehiclesFuture = organizationId != null
        ? SupabaseService.fetchOrgVehicles(organizationId)
        : Future.value(<Map<String, dynamic>>[]);
    // The last logged odometer reading for whichever asset is selected —
    // refetched every time the asset changes, so the submit-time check
    // below is always comparing against the right vehicle's history.
    int? lastOdometerForAsset;
    String? lastOdometerAssetId;

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: isDark ? const Color(0xFF0F172A) : Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (sheetContext) {
        return StatefulBuilder(
          builder: (sheetContext, setSheetState) {
            Future<void> loadLastOdometer(String? vehicleId) async {
              if (vehicleId == null) {
                lastOdometerForAsset = null;
                lastOdometerAssetId = null;
                return;
              }
              if (lastOdometerAssetId == vehicleId) return; // already fetched for this asset
              lastOdometerAssetId = vehicleId;
              final reading = await SupabaseService.fetchLastOdometerForVehicle(vehicleId);
              // The driver may have switched assets again while this was
              // in flight — only apply the result if it's still current.
              if (lastOdometerAssetId == vehicleId) {
                setSheetState(() => lastOdometerForAsset = reading);
              }
            }

            Future<void> pickPhoto(ImageSource source, {required bool dashboard}) async {
              final picked = await picker.pickImage(source: source, imageQuality: 80, maxWidth: 1600);
              if (picked == null) return;
              final bytes = await picked.readAsBytes();
              setSheetState(() {
                if (dashboard) {
                  selectedDashboardPhoto = picked;
                  selectedDashboardPhotoBytes = bytes;
                } else {
                  selectedPhoto = picked;
                  selectedPhotoBytes = bytes;
                }
              });
              final driverId = ref.read(authProvider).driver?['id'] as String?;
              if (organizationId != null && driverId != null) {
                final upload = SupabaseService.uploadFuelReceiptPhoto(
                  organizationId: organizationId,
                  driverId: driverId,
                  bytes: bytes,
                  fileName: picked.name,
                );
                if (dashboard) {
                  dashboardPhotoUpload = upload;
                } else {
                  photoUpload = upload;
                }
              }
            }

            // Deliberately NOT gated on every field being filled in — submit()
            // below already validates each one and sets a specific formError.
            // Disabling the button on those same conditions made it silently
            // inert (Flutter fires no feedback for tapping a disabled button)
            // instead of showing the driver why — indistinguishable from the
            // button being broken. Only isSubmitting should disable it.
            final canSubmit = !isSubmitting;

            Future<void> submit() async {
              final messenger = ScaffoldMessenger.of(context);
              final driverId = ref.read(authProvider).driver?['id'] as String?;
              if (driverId == null || isSubmitting) return;

              final photo = selectedPhoto;
              final dashboardPhoto = selectedDashboardPhoto;
              final litersValue = double.tryParse(litersController.text.trim());
              final odometerValue = int.tryParse(odometerController.text.trim());
              if (photo == null) {
                setSheetState(() => formError = 'A photo of the pump/receipt is required.');
                return;
              }
              if (dashboardPhoto == null) {
                setSheetState(() => formError = 'A dashboard photo showing the odometer and fuel gauge is required.');
                return;
              }
              if (litersValue == null || litersValue <= 0) {
                setSheetState(() => formError = 'Enter the volume in litres.');
                return;
              }
              if (odometerValue == null || odometerValue < 0) {
                setSheetState(() => formError = 'Enter the current odometer reading in miles.');
                return;
              }
              if (lastOdometerForAsset != null && odometerValue <= lastOdometerForAsset!) {
                setSheetState(() => formError =
                    'Odometer must be higher than the last logged reading for this vehicle (${lastOdometerForAsset!.toStringAsFixed(0)} mi).');
                return;
              }
              final capacity = (selectedAsset?['fuel_tank_capacity_litres'] as num?)?.toInt();
              if (capacity != null && litersValue > capacity) {
                setSheetState(() => formError = 'Logged litres ($litersValue L) exceed this vehicle\'s physical tank capacity ($capacity L).');
                return;
              }
              final costText = costController.text.trim();
              final cost = costText.isEmpty ? null : double.tryParse(costText);
              if (costText.isNotEmpty && (cost == null || cost <= 0)) {
                setSheetState(() => formError = 'Enter a valid total cost, or leave it blank.');
                return;
              }

              setSheetState(() {
                isSubmitting = true;
                formError = null;
              });

              // try/finally — same fix as the incident report's submit():
              // without it, an exception here left isSubmitting stuck at
              // true forever, silently blocking every later tap on this
              // sheet with no visible error.
              try {
                String? photoPath;
                String? dashboardPhotoPath;
                if (organizationId != null) {
                  // Both uploads were kicked off as soon as each photo was
                  // taken (pickPhoto above) — awaited here together, not
                  // one after the other, and only started fresh now if
                  // that never happened (e.g. picked before organizationId
                  // was available).
                  final results = await Future.wait([
                    photoUpload ??
                        (selectedPhotoBytes != null
                            ? SupabaseService.uploadFuelReceiptPhoto(organizationId: organizationId, driverId: driverId, bytes: selectedPhotoBytes!, fileName: photo.name)
                            : Future.value(null)),
                    dashboardPhotoUpload ??
                        (selectedDashboardPhotoBytes != null
                            ? SupabaseService.uploadFuelReceiptPhoto(organizationId: organizationId, driverId: driverId, bytes: selectedDashboardPhotoBytes!, fileName: dashboardPhoto.name)
                            : Future.value(null)),
                  ]);
                  photoPath = results[0];
                  dashboardPhotoPath = results[1];
                }
                if (photoPath == null || dashboardPhotoPath == null) {
                  // SupabaseService.lastUploadError carries the real
                  // exception (network drop vs. rejected format vs. size
                  // limit — previously indistinguishable) so the next
                  // failure is self-diagnosing instead of always reading
                  // as a generic "connection error" regardless of cause.
                  final reason = SupabaseService.lastUploadError;
                  setSheetState(() {
                    formError = reason != null
                        ? 'Could not upload a photo: $reason'
                        : 'Could not upload a photo — check your connection and try again.';
                  });
                  return;
                }

                // Silent — whatever GPS fix shiftProvider already has (or
                // none yet); never a separate permission prompt here, and
                // never blocks the submit if there isn't one.
                final pos = ref.read(shiftProvider).currentPosition;

                final isTractor = selectedAsset?['vehicle_type'] == 'truck';
                final success = await SupabaseService.submitFuelReceipt(
                  driverId: driverId,
                  receiptPhotoPath: photoPath,
                  liters: litersValue,
                  fuelType: fuelType,
                  totalCost: cost,
                  shiftId: shiftId,
                  vehicleId: isTractor ? selectedAsset!['id'] as String : null,
                  trailerId: !isTractor && selectedAsset != null ? selectedAsset!['id'] as String : null,
                  vendor: vendorController.text,
                  odometerMiles: odometerValue,
                  dashboardPhotoPath: dashboardPhotoPath,
                  gpsLat: pos?.latitude,
                  gpsLng: pos?.longitude,
                  isFullTank: isFullTank,
                );
                if (sheetContext.mounted) Navigator.pop(sheetContext);
                messenger.showSnackBar(
                  SnackBar(
                    content: Text(
                      success ? 'Fuel receipt sent for approval.' : 'Could not send the receipt — try again.',
                      style: const TextStyle(fontWeight: FontWeight.bold),
                    ),
                    backgroundColor: success ? const Color(0xFF111111) : const Color(0xFFFF3333),
                    behavior: SnackBarBehavior.floating,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                );
              } catch (e) {
                debugPrint('Fuel receipt submit failed: $e');
                setSheetState(() => formError = 'Something went wrong sending the receipt: $e');
              } finally {
                if (sheetContext.mounted) setSheetState(() => isSubmitting = false);
              }
            }

            InputDecoration fieldDecoration(String hint) => InputDecoration(
              hintText: hint,
              filled: true,
              fillColor: isDark ? const Color(0xFF1E293B) : const Color(0xFFF1F5F9),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide.none,
              ),
            );

            Widget buildTypeToggle(String value, String label) {
              final selected = fuelType == value;
              return Expanded(
                child: GestureDetector(
                  onTap: () => setSheetState(() => fuelType = value),
                  child: Container(
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: selected ? const Color(0xFFCC0000) : (isDark ? const Color(0xFF1E293B) : const Color(0xFFF1F5F9)),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Text(
                      label,
                      style: TextStyle(
                        fontWeight: FontWeight.w800,
                        fontSize: 13,
                        color: selected ? Colors.white : (isDark ? Colors.white70 : Colors.black54),
                      ),
                    ),
                  ),
                ),
              );
            }

            Widget buildPhotoPicker({
              required String label,
              required XFile? photo,
              required Uint8List? bytes,
              required bool dashboard,
            }) {
              if (photo == null) {
                return Row(
                  children: [
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: () => pickPhoto(ImageSource.camera, dashboard: dashboard),
                        icon: const Icon(Icons.camera_alt_outlined, size: 18, color: Color(0xFFCC0000)),
                        label: Text(label, style: const TextStyle(fontWeight: FontWeight.w700, color: Color(0xFFCC0000))),
                        style: OutlinedButton.styleFrom(
                          padding: const EdgeInsets.symmetric(vertical: 14),
                          side: const BorderSide(color: Color(0xFFCC0000), width: 1.5),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                        ),
                      ),
                    ),
                  ],
                );
              }
              return Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Stack(
                    clipBehavior: Clip.none,
                    children: [
                      ClipRRect(
                        borderRadius: BorderRadius.circular(12),
                        child: Image.memory(bytes!, width: double.infinity, height: 160, fit: BoxFit.cover),
                      ),
                      Positioned(
                        top: -8,
                        right: -8,
                        child: GestureDetector(
                          onTap: () => setSheetState(() {
                            if (dashboard) {
                              selectedDashboardPhoto = null;
                              selectedDashboardPhotoBytes = null;
                            } else {
                              selectedPhoto = null;
                              selectedPhotoBytes = null;
                            }
                          }),
                          child: Container(
                            padding: const EdgeInsets.all(4),
                            decoration: const BoxDecoration(color: Color(0xFFCC0000), shape: BoxShape.circle),
                            child: const Icon(Icons.close, size: 16, color: Colors.white),
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 6),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      TextButton.icon(
                        onPressed: () => pickPhoto(ImageSource.camera, dashboard: dashboard),
                        icon: const Icon(Icons.replay_outlined, size: 16, color: Color(0xFFCC0000)),
                        label: const Text('Retake', style: TextStyle(fontWeight: FontWeight.w700, color: Color(0xFFCC0000))),
                      ),
                      Text('/', style: TextStyle(color: isDark ? Colors.white30 : Colors.black26)),
                      TextButton.icon(
                        onPressed: () => setSheetState(() {
                          if (dashboard) {
                            selectedDashboardPhoto = null;
                            selectedDashboardPhotoBytes = null;
                          } else {
                            selectedPhoto = null;
                            selectedPhotoBytes = null;
                          }
                        }),
                        icon: Icon(Icons.delete_outline, size: 16, color: isDark ? Colors.white54 : Colors.black54),
                        label: Text('Remove', style: TextStyle(fontWeight: FontWeight.w700, color: isDark ? Colors.white54 : Colors.black54)),
                      ),
                    ],
                  ),
                ],
              );
            }

            return FutureBuilder<List<Map<String, dynamic>>>(
              future: vehiclesFuture,
              builder: (context, snapshot) {
                final vehicles = snapshot.data ?? const [];
                // Default the target to the coupled tractor the first time
                // the vehicle list resolves, without overwriting a manual
                // selection the driver has since made.
                if (selectedAsset == null && activeShift?.vehicleId != null) {
                  for (final v in vehicles) {
                    if (v['id'] == activeShift!.vehicleId) {
                      selectedAsset = v;
                      break;
                    }
                  }
                }
                if (selectedAsset != null) {
                  // Fire-and-forget — the builder itself must stay sync;
                  // loadLastOdometer calls setSheetState once it resolves.
                  loadLastOdometer(selectedAsset!['id'] as String?);
                }

                return Padding(
                  padding: EdgeInsets.only(
                    left: 20, right: 20, top: 20,
                    bottom: 20 + MediaQuery.of(sheetContext).viewInsets.bottom,
                  ),
                  child: SingleChildScrollView(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            const Icon(Icons.local_gas_station_outlined, color: Color(0xFFCC0000), size: 26),
                            const SizedBox(width: 12),
                            Text(
                              'LOG A FUEL RECEIPT',
                              style: TextStyle(
                                fontWeight: FontWeight.w900,
                                letterSpacing: 0.5,
                                fontSize: 16,
                                color: isDark ? Colors.white : Colors.black87,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 4),
                        Text(
                          'A manager reviews this before it counts toward fuel cost.',
                          style: TextStyle(fontSize: 12.5, color: isDark ? Colors.white60 : Colors.black54),
                        ),
                        const SizedBox(height: 16),

                        Row(children: [buildTypeToggle('diesel', 'FUEL (DIESEL)'), const SizedBox(width: 8), buildTypeToggle('adblue', 'ADBLUE')]),
                        const SizedBox(height: 12),

                        _buildCouplingRow(
                          context: context,
                          isDark: isDark,
                          label: 'ASSET',
                          icon: selectedAsset?['vehicle_type'] == 'trailer' ? Icons.rv_hookup_outlined : Icons.local_shipping_outlined,
                          selectedVehicleNumber: selectedAsset?['vehicle_number'] as String?,
                          onTap: () async {
                            final picked = await _showSearchableAssetPicker(
                              context,
                              title: 'WHICH ASSET?',
                              subtitle: 'Search any tractor or trailer — not just the one coupled.',
                              vehicles: vehicles,
                            );
                            if (picked != null && picked.isNotEmpty) {
                              setSheetState(() => selectedAsset = picked);
                              loadLastOdometer(picked['id'] as String?);
                            } else if (picked != null && picked.isEmpty) {
                              setSheetState(() {
                                selectedAsset = null;
                                lastOdometerForAsset = null;
                                lastOdometerAssetId = null;
                              });
                            }
                          },
                        ),
                        const SizedBox(height: 12),

                        Text('PUMP / RECEIPT PHOTO *', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 11, letterSpacing: 0.4, color: isDark ? Colors.white54 : Colors.black45)),
                        const SizedBox(height: 6),
                        buildPhotoPicker(label: 'Take Photo', photo: selectedPhoto, bytes: selectedPhotoBytes, dashboard: false),

                        const SizedBox(height: 14),
                        Text('DASHBOARD PHOTO — ODOMETER + FUEL GAUGE *', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 11, letterSpacing: 0.4, color: isDark ? Colors.white54 : Colors.black45)),
                        const SizedBox(height: 6),
                        buildPhotoPicker(label: 'Take Photo', photo: selectedDashboardPhoto, bytes: selectedDashboardPhotoBytes, dashboard: true),

                        const SizedBox(height: 12),
                        Row(
                          children: [
                            Expanded(
                              child: TextField(
                                controller: litersController,
                                onChanged: (_) => setSheetState(() {}),
                                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                                decoration: fieldDecoration('Volume in litres (L) *'),
                              ),
                            ),
                            const SizedBox(width: 10),
                            Expanded(
                              child: TextField(
                                controller: costController,
                                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                                decoration: fieldDecoration('Total cost £ (optional)'),
                              ),
                            ),
                          ],
                        ),
                        if (selectedAsset?['fuel_tank_capacity_litres'] != null) ...[
                          const SizedBox(height: 4),
                          Text(
                            'Tank capacity: ${selectedAsset!['fuel_tank_capacity_litres']} L',
                            style: TextStyle(fontSize: 11, color: isDark ? Colors.white38 : Colors.black38),
                          ),
                        ],
                        const SizedBox(height: 10),
                        TextField(
                          controller: odometerController,
                          keyboardType: TextInputType.number,
                          decoration: fieldDecoration('Current odometer (miles) *'),
                        ),
                        if (lastOdometerForAsset != null) ...[
                          const SizedBox(height: 4),
                          Text(
                            'Last logged for this vehicle: ${lastOdometerForAsset!.toStringAsFixed(0)} mi',
                            style: TextStyle(fontSize: 11, color: isDark ? Colors.white38 : Colors.black38),
                          ),
                        ],
                        const SizedBox(height: 10),
                        // Fleet-wide rule: fill to the brim every time. Left
                        // on for a normal fill; a driver only turns it off
                        // for a genuine partial top-up, which then sits out
                        // of the MPG anomaly comparison entirely (migration
                        // 070) rather than skewing it.
                        GestureDetector(
                          onTap: () => setSheetState(() => isFullTank = !isFullTank),
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                            decoration: BoxDecoration(
                              color: isDark ? const Color(0xFF1E293B) : const Color(0xFFF1F5F9),
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: Row(
                              children: [
                                Expanded(
                                  child: Text(
                                    'Full Tank / Brim to Brim',
                                    style: TextStyle(
                                      fontWeight: FontWeight.w700,
                                      fontSize: 13,
                                      color: isDark ? Colors.white : Colors.black87,
                                    ),
                                  ),
                                ),
                                Switch(
                                  value: isFullTank,
                                  activeThumbColor: const Color(0xFFCC0000),
                                  onChanged: (v) => setSheetState(() => isFullTank = v),
                                ),
                              ],
                            ),
                          ),
                        ),
                        const SizedBox(height: 10),
                        TextField(
                          controller: vendorController,
                          decoration: fieldDecoration('Station / vendor (optional)'),
                        ),
                        if (formError != null) ...[
                          const SizedBox(height: 10),
                          Text(formError!, style: const TextStyle(color: Color(0xFFFF3333), fontSize: 12.5, fontWeight: FontWeight.w600)),
                        ],
                        const SizedBox(height: 16),
                        ElevatedButton(
                          onPressed: canSubmit ? submit : null,
                          style: ElevatedButton.styleFrom(
                            backgroundColor: const Color(0xFFCC0000),
                            disabledBackgroundColor: isDark ? const Color(0xFF1E293B) : const Color(0xFFE2E8F0),
                            minimumSize: const Size(double.infinity, 48),
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                          ),
                          child: isSubmitting
                              ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.white))
                              : const Text('Submit Fuel Log', style: TextStyle(fontWeight: FontWeight.w800, color: Colors.white)),
                        ),
                      ],
                    ),
                  ),
                );
              },
            );
          },
        );
      },
    );
  }

  /// Overnight parking claim — paid by the driver out of pocket,
  /// reimbursed via payroll once an admin approves it (migration 054).
  /// Tied to the active shift by default so the admin panel knows
  /// which shift's payroll to add the amount to; nothing here limits
  /// it to one claim. Same photo-capture / submit-with-try-finally
  /// shape as _handleFuelReceiptAction above.
  void _handleParkingExpenseAction(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final amountController = TextEditingController();
    final locationController = TextEditingController();
    final noteController = TextEditingController();
    final picker = ImagePicker();
    XFile? selectedPhoto;
    Uint8List? selectedPhotoBytes;
    // Started the moment the photo is picked — see pickPhoto below.
    Future<String?>? photoUpload;
    bool isSubmitting = false;
    String? formError;

    final organizationId = ref.read(authProvider).driver?['organization_id'] as String?;
    final activeShift = ref.read(shiftProvider).activeShift;
    final shiftId = activeShift?.id;

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: isDark ? const Color(0xFF0F172A) : Colors.white,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (sheetContext) {
        return StatefulBuilder(
          builder: (sheetContext, setSheetState) {
            Future<void> pickPhoto(ImageSource source) async {
              final picked = await picker.pickImage(source: source, imageQuality: 80, maxWidth: 1600);
              if (picked == null) return;
              final bytes = await picked.readAsBytes();
              setSheetState(() {
                selectedPhoto = picked;
                selectedPhotoBytes = bytes;
              });
              final driverId = ref.read(authProvider).driver?['id'] as String?;
              photoUpload = organizationId != null && driverId != null
                  ? SupabaseService.uploadParkingReceiptPhoto(organizationId: organizationId, driverId: driverId, bytes: bytes, fileName: picked.name)
                  : null;
            }

            final canSubmit = !isSubmitting;

            Future<void> submit() async {
              final messenger = ScaffoldMessenger.of(context);
              final driverId = ref.read(authProvider).driver?['id'] as String?;
              if (driverId == null || isSubmitting) return;

              final photo = selectedPhoto;
              final amountValue = double.tryParse(amountController.text.trim());
              if (photo == null) {
                setSheetState(() => formError = 'A photo of the receipt is required.');
                return;
              }
              if (amountValue == null || amountValue <= 0) {
                setSheetState(() => formError = 'Enter how much you paid.');
                return;
              }

              setSheetState(() {
                isSubmitting = true;
                formError = null;
              });

              try {
                String? photoPath = await photoUpload;
                if (photoPath == null && organizationId != null && selectedPhotoBytes != null) {
                  photoPath = await SupabaseService.uploadParkingReceiptPhoto(
                    organizationId: organizationId,
                    driverId: driverId,
                    bytes: selectedPhotoBytes!,
                    fileName: photo.name,
                  );
                }
                if (photoPath == null) {
                  final reason = SupabaseService.lastUploadError;
                  setSheetState(() {
                    formError = reason != null
                        ? 'Could not upload the photo: $reason'
                        : 'Could not upload the photo — check your connection and try again.';
                  });
                  return;
                }

                final success = await SupabaseService.submitParkingExpense(
                  driverId: driverId,
                  receiptPhotoPath: photoPath,
                  amount: amountValue,
                  shiftId: shiftId,
                  location: locationController.text,
                  note: noteController.text,
                );
                if (sheetContext.mounted) Navigator.pop(sheetContext);
                messenger.showSnackBar(
                  SnackBar(
                    content: Text(
                      success ? 'Parking claim sent for approval.' : 'Could not send the claim — try again.',
                      style: const TextStyle(fontWeight: FontWeight.bold),
                    ),
                    backgroundColor: success ? const Color(0xFF111111) : const Color(0xFFFF3333),
                    behavior: SnackBarBehavior.floating,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                );
              } catch (e) {
                debugPrint('Parking expense submit failed: $e');
                setSheetState(() => formError = 'Something went wrong sending the claim: $e');
              } finally {
                if (sheetContext.mounted) setSheetState(() => isSubmitting = false);
              }
            }

            InputDecoration fieldDecoration(String hint) => InputDecoration(
              hintText: hint,
              filled: true,
              fillColor: isDark ? const Color(0xFF1E293B) : const Color(0xFFF1F5F9),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide.none,
              ),
            );

            return Padding(
              padding: EdgeInsets.only(
                left: 20, right: 20, top: 20,
                bottom: 20 + MediaQuery.of(sheetContext).viewInsets.bottom,
              ),
              child: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        const Icon(Icons.local_parking_outlined, color: Color(0xFFCC0000), size: 26),
                        const SizedBox(width: 12),
                        Text(
                          'OVERNIGHT PARKING',
                          style: TextStyle(fontWeight: FontWeight.w900, letterSpacing: 0.5, fontSize: 16, color: isDark ? Colors.white : Colors.black87),
                        ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text(
                      "You'll be repaid through payroll once a manager approves this.",
                      style: TextStyle(fontSize: 12.5, color: isDark ? Colors.white60 : Colors.black54),
                    ),
                    const SizedBox(height: 16),

                    if (selectedPhoto == null)
                      Row(
                        children: [
                          Expanded(
                            child: OutlinedButton.icon(
                              onPressed: () => pickPhoto(ImageSource.camera),
                              icon: const Icon(Icons.camera_alt_outlined, size: 18, color: Color(0xFFCC0000)),
                              label: const Text('Take Photo', style: TextStyle(fontWeight: FontWeight.w700, color: Color(0xFFCC0000))),
                              style: OutlinedButton.styleFrom(
                                padding: const EdgeInsets.symmetric(vertical: 14),
                                side: const BorderSide(color: Color(0xFFCC0000), width: 1.5),
                                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                              ),
                            ),
                          ),
                        ],
                      )
                    else
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Stack(
                            clipBehavior: Clip.none,
                            children: [
                              ClipRRect(
                                borderRadius: BorderRadius.circular(12),
                                child: Image.memory(selectedPhotoBytes!, width: double.infinity, height: 160, fit: BoxFit.cover),
                              ),
                              Positioned(
                                top: -8,
                                right: -8,
                                child: GestureDetector(
                                  onTap: () => setSheetState(() {
                                    selectedPhoto = null;
                                    selectedPhotoBytes = null;
                                  }),
                                  child: Container(
                                    padding: const EdgeInsets.all(4),
                                    decoration: const BoxDecoration(color: Color(0xFFCC0000), shape: BoxShape.circle),
                                    child: const Icon(Icons.close, size: 16, color: Colors.white),
                                  ),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 6),
                          Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              TextButton.icon(
                                onPressed: () => pickPhoto(ImageSource.camera),
                                icon: const Icon(Icons.replay_outlined, size: 16, color: Color(0xFFCC0000)),
                                label: const Text('Retake', style: TextStyle(fontWeight: FontWeight.w700, color: Color(0xFFCC0000))),
                              ),
                              Text('/', style: TextStyle(color: isDark ? Colors.white30 : Colors.black26)),
                              TextButton.icon(
                                onPressed: () => setSheetState(() {
                                  selectedPhoto = null;
                                  selectedPhotoBytes = null;
                                }),
                                icon: Icon(Icons.delete_outline, size: 16, color: isDark ? Colors.white54 : Colors.black54),
                                label: Text('Remove', style: TextStyle(fontWeight: FontWeight.w700, color: isDark ? Colors.white54 : Colors.black54)),
                              ),
                            ],
                          ),
                        ],
                      ),
                    const SizedBox(height: 10),
                    TextField(
                      controller: amountController,
                      keyboardType: const TextInputType.numberWithOptions(decimal: true),
                      decoration: fieldDecoration('Amount paid £ *'),
                    ),
                    const SizedBox(height: 10),
                    TextField(
                      controller: locationController,
                      decoration: fieldDecoration('Where did you park? (optional)'),
                    ),
                    const SizedBox(height: 10),
                    TextField(
                      controller: noteController,
                      decoration: fieldDecoration('Note (optional)'),
                    ),
                    if (formError != null) ...[
                      const SizedBox(height: 10),
                      Text(formError!, style: const TextStyle(color: Color(0xFFFF3333), fontSize: 12.5, fontWeight: FontWeight.w600)),
                    ],
                    const SizedBox(height: 16),
                    ElevatedButton(
                      onPressed: canSubmit ? submit : null,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFFCC0000),
                        disabledBackgroundColor: isDark ? const Color(0xFF1E293B) : const Color(0xFFE2E8F0),
                        minimumSize: const Size(double.infinity, 48),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                      ),
                      child: isSubmitting
                          ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.white))
                          : const Text('Submit Parking Claim', style: TextStyle(fontWeight: FontWeight.w800, color: Colors.white)),
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    );
  }

  /// Lets a driver tag their own active shift with which load they're
  /// running, from the cab, rather than dispatch entering it after the
  /// fact. Only the load reference / customer name — never a revenue
  /// figure, which a driver was never shown and never will be (see
  /// SupabaseService.attachLoadReference's doc comment). An admin
  /// still rates the £ value afterward from the Shipments ledger.
  /// Confirm Delivery (manually attached loads): the same proof flow as an
  /// office-assigned load. Pick one or more proof types (solo departure /
  /// empty trailer / paper POD), take a live photo for each, add optional
  /// notes. At least one photo is required (migration 077).
  Future<void> _handleConfirmDeliveryAction(BuildContext context) async {
    final loadReference = ref.read(shiftProvider).loadReference;
    if (loadReference == null) return;
    final messenger = ScaffoldMessenger.of(context);
    final submission = await showProofCaptureSheet(
      context,
      ref,
      title: 'CONFIRM DELIVERY',
      subtitle: 'Load $loadReference',
    );
    if (submission == null) return;
    final proofs = await uploadProofs(ref, submission);
    if (proofs == null) {
      messenger.showSnackBar(const SnackBar(content: Text('Photo upload failed — check your signal and try again.')));
      return;
    }
    final result = await ref.read(shiftProvider.notifier).confirmLoadDelivered(proofs: proofs, notes: submission.notes);
    messenger.showSnackBar(
      SnackBar(
        content: Text(
          result['success'] == true ? 'Load $loadReference marked as delivered.' : (result['error']?.toString() ?? 'Could not confirm delivery.'),
          style: const TextStyle(fontWeight: FontWeight.bold),
        ),
        backgroundColor: result['success'] == true ? const Color(0xFF111111) : const Color(0xFFCC0000),
        behavior: SnackBarBehavior.floating,
      ),
    );
  }

  void _handleAttachLoadAction(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final loadRefController = TextEditingController();
    final carrierController = TextEditingController();
    final activeShift = ref.read(shiftProvider).activeShift;
    if (activeShift == null) return;

    // Departure and booked-delivery times let the office measure on-time
    // performance without chasing every driver.
    DateTime? bookedDeparture;
    DateTime? bookedDelivery;
    bool isSubmitting = false;
    String? formError;
    final cargo = CargoInput();

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: isDark ? const Color(0xFF0F172A) : Colors.white,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (sheetContext) {
        return StatefulBuilder(
          builder: (sheetContext, setSheetState) {
            Future<void> submit() async {
              final messenger = ScaffoldMessenger.of(context);
              final loadRef = loadRefController.text.trim();
              final carrier = carrierController.text.trim();
              if (loadRef.isEmpty || carrier.isEmpty) {
                setSheetState(() => formError = loadRef.isEmpty && carrier.isEmpty
                    ? 'Enter the load reference and the customer / carrier.'
                    : loadRef.isEmpty
                        ? 'Enter the load reference.'
                        : 'Enter the customer / carrier.');
                return;
              }
              setSheetState(() {
                isSubmitting = true;
                formError = null;
              });
              try {
                final cargoPath = await uploadCargoPhoto(ref, cargo);
                if (cargo.photo != null && !cargo.sealed && cargoPath == null) {
                  setSheetState(() => formError = 'Could not upload the cargo photo. Try again, or tick Trailer sealed.');
                  return;
                }
                final result = await ref.read(shiftProvider.notifier).attachLoad(
                      loadRef,
                      carrier,
                      bookedDepartureAt: bookedDeparture,
                      bookedDeliveryAt: bookedDelivery,
                      cargoPhotoPath: cargoPath,
                      trailerSealed: cargo.sealed,
                    );
                if (result['success'] == true) {
                  if (sheetContext.mounted) Navigator.pop(sheetContext);
                  messenger.showSnackBar(
                    const SnackBar(
                      content: Text('Load attached to this shift.', style: TextStyle(fontWeight: FontWeight.bold)),
                      backgroundColor: Color(0xFF111111),
                      behavior: SnackBarBehavior.floating,
                    ),
                  );
                } else {
                  setSheetState(() => formError = result['error']?.toString() ?? 'Could not attach the load.');
                }
              } finally {
                if (sheetContext.mounted) setSheetState(() => isSubmitting = false);
              }
            }

            InputDecoration fieldDecoration(String hint) => InputDecoration(
              hintText: hint,
              filled: true,
              fillColor: isDark ? const Color(0xFF1E293B) : const Color(0xFFF1F5F9),
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
            );

            return Padding(
              padding: EdgeInsets.only(left: 20, right: 20, top: 20, bottom: 20 + MediaQuery.of(sheetContext).viewInsets.bottom),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      const Icon(Icons.local_shipping_outlined, color: Color(0xFFCC0000), size: 26),
                      const SizedBox(width: 12),
                      Text('ATTACH LOAD', style: TextStyle(fontWeight: FontWeight.w900, letterSpacing: 0.5, fontSize: 16, color: isDark ? Colors.white : Colors.black87)),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text(
                    "Tag this shift with what you're carrying — a manager rates it afterward.",
                    style: TextStyle(fontSize: 12.5, color: isDark ? Colors.white60 : Colors.black54),
                  ),
                  const SizedBox(height: 16),
                  TextField(controller: loadRefController, decoration: fieldDecoration('Load reference *')),
                  const SizedBox(height: 10),
                  TextField(controller: carrierController, decoration: fieldDecoration('Customer / carrier *')),
                  const SizedBox(height: 14),
                  Text('BOOKED TIMES (OPTIONAL)', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w900, letterSpacing: 0.6, color: isDark ? Colors.white54 : Colors.black45)),
                  const SizedBox(height: 6),
                  Row(children: [
                    Expanded(
                      child: _BookedTimeField(
                        label: 'Departure',
                        value: bookedDeparture,
                        onChange: (v) => setSheetState(() => bookedDeparture = v),
                        isDark: isDark,
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: _BookedTimeField(
                        label: 'Arrival',
                        value: bookedDelivery,
                        onChange: (v) => setSheetState(() => bookedDelivery = v),
                        isDark: isDark,
                      ),
                    ),
                  ]),
                  const SizedBox(height: 6),
                  Text(
                    'Fill these in so the office can measure on-time delivery.',
                    style: TextStyle(fontSize: 11, color: isDark ? Colors.white54 : Colors.black45),
                  ),
                  const SizedBox(height: 14),
                  CargoPhotoField(input: cargo, organizationId: ref.read(authProvider).driver?['organization_id']?.toString()),
                  if (formError != null) ...[
                    const SizedBox(height: 10),
                    Text(formError!, style: const TextStyle(color: Color(0xFFFF3333), fontSize: 12.5, fontWeight: FontWeight.w600)),
                  ],
                  const SizedBox(height: 16),
                  ElevatedButton(
                    onPressed: isSubmitting ? null : submit,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFFCC0000),
                      disabledBackgroundColor: isDark ? const Color(0xFF1E293B) : const Color(0xFFE2E8F0),
                      minimumSize: const Size(double.infinity, 48),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                    child: isSubmitting
                        ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.white))
                        : const Text('Attach Load', style: TextStyle(fontWeight: FontWeight.w800, color: Colors.white)),
                  ),
                ],
              ),
            );
          },
        );
      },
    );
  }

  void _handleSOSAction(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    showDialog(
      context: context,
      builder: (context) {
        return AlertDialog(
          backgroundColor: isDark ? const Color(0xFF0F172A) : Colors.white,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(20),
            side: BorderSide(
              color: isDark ? const Color(0xFF1E293B) : const Color(0xFFE2E8F0),
              width: 1.5,
            ),
          ),
          title: const Row(
            children: [
              Icon(Icons.warning_amber_rounded, color: Color(0xFFFF3333), size: 28),
              SizedBox(width: 12),
              Text(
                'EMERGENCY SOS',
                style: TextStyle(fontWeight: FontWeight.w900, letterSpacing: 0.5, fontSize: 18),
              ),
            ],
          ),
          content: const Text(
            'Are you sure you want to broadcast an emergency breakdown SOS alert to dispatch? This will immediately send your current GPS coordinates.',
            style: TextStyle(fontSize: 14, height: 1.4),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: Text(
                'CANCEL',
                style: TextStyle(color: isDark ? Colors.white60 : Colors.black54, fontWeight: FontWeight.bold),
              ),
            ),
            ElevatedButton(
              onPressed: () async {
                final messenger = ScaffoldMessenger.of(context);
                Navigator.pop(context);
                final success = await ref.read(shiftProvider.notifier).sendSOSAlert();
                // On failure, sendSOSAlert() sets a specific reason (no
                // active shift vs. no GPS fix) on shiftProvider.errorMessage
                // instead of just a bare true/false — show that instead of
                // a generic "failed" message so a driver in an actual
                // emergency knows what to fix (e.g. enable location) rather
                // than just retrying a button that will fail the same way.
                final failureReason = ref.read(shiftProvider).errorMessage;
                messenger.showSnackBar(
                  SnackBar(
                    content: Text(
                      success
                          ? 'EMERGENCY SOS BROADCASTED SUCCESSFULLY!'
                          : (failureReason ?? 'FAILED TO BROADCAST SOS ALERT — TRY AGAIN').toUpperCase(),
                      style: const TextStyle(fontWeight: FontWeight.bold),
                    ),
                    backgroundColor: success ? const Color(0xFF111111) : const Color(0xFFFF3333),
                    behavior: SnackBarBehavior.floating,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                );
              },
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFFFF3333),
                foregroundColor: Colors.white,
                minimumSize: const Size(120, 40),
                padding: const EdgeInsets.symmetric(horizontal: 16),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
              child: const Text('SEND SOS'),
            ),
          ],
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(shiftProvider);
    // Start loading the company's plan features as soon as the home screen
    // shows, so the Quick Actions menu already knows what to offer.
    ref.watch(entitlementsProvider);
    final authState = ref.watch(authProvider);
    final theme = Theme.of(context);
    final activeShift = state.activeShift;
    final isClockedIn = activeShift != null;

    // Absolute dynamic calculation based strictly on activeShift.startTime
    final Duration liveDuration;
    if (isClockedIn) {
      final diff = DateTime.now().toUtc().difference(activeShift.startTime.toUtc());
      liveDuration = diff.isNegative ? Duration.zero : diff;
    } else {
      liveDuration = Duration.zero;
    }
    final effectiveDuration = isClockedIn ? (_elapsedTime.inSeconds > 0 ? _elapsedTime : liveDuration) : Duration.zero;
    final double liveHoursDecimal = effectiveDuration.inMilliseconds / (1000.0 * 60.0 * 60.0);

    final isDark = theme.brightness == Brightness.dark;
    final driverMap = authState.driver;
    final driverName = driverMap?['name'] ?? driverMap?['full_name'] ?? 'Driver';

    // Dynamic rate display logic based on driver's profile rate_type
    final isFixed = driverMap?['rate_type'] == 'Fixed Shift Rate (Day Rate)' || driverMap?['rate_type'] == 'Fixed';
    final double rateValue = isFixed
        ? ((driverMap?['fixed_rate'] as num?)?.toDouble() ?? 0.0)
        : ((driverMap?['hourly_rate'] as num?)?.toDouble() ?? (driverMap?['mon_fri_rate'] as num?)?.toDouble() ?? 16.0);
    final String rateSuffix = isFixed ? '/shift' : '/hr';

    final double calculatedAccruedEarnings = isFixed
        ? rateValue
        : (liveHoursDecimal * (activeShift?.baseHourlyRate ?? rateValue));

    // Hook logic to open completed shift summary sheet and trigger icon morph
    ref.listen<ShiftState>(shiftProvider, (previous, next) {
      if (previous?.lastCompletedShift == null && next.lastCompletedShift != null) {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          _showCompletedShiftModal(context, next.lastCompletedShift);
          ref.read(shiftProvider.notifier).clearCompletedShift();
        });
      }

      final wasClockedIn = previous?.activeShift != null;
      final isNowClockedIn = next.activeShift != null;
      if (wasClockedIn != isNowClockedIn) {
        _updateTimerTick();
        if (isNowClockedIn) {
          _iconAnimationController.forward();
        } else {
          _iconAnimationController.reverse();
          setState(() {
            _elapsedTime = Duration.zero;
          });
        }
      }
    });

    // Listen for dispatcher manual logout / session termination
    ref.listen<AuthState>(authProvider, (previous, next) {
      if (next.status == AuthStatus.initial) {
        _cleanupRealtimeListeners();
        context.goNamed('login');
      } else if (next.status == AuthStatus.authenticated && previous?.driver?['id'] != next.driver?['id']) {
        final newDriverId = next.driver?['id'];
        if (newDriverId != null) {
          _setupRealtimeListeners(newDriverId.toString());
        }
      }
    });

    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        centerTitle: true,
        title: Image.asset('assets/images/tachyo_logo.png', height: 26, fit: BoxFit.contain),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(1),
          child: Container(height: 1, color: const Color(0xFFE0E0E0)),
        ),
        actions: [
          // Back to one consolidated trigger for all four operational
          // actions (Vehicle, Fuel, Incident, Night Out) — the docked
          // bar tried under the map took up too much permanent space;
          // this opens the same actions from a single bottom sheet
          // instead, per explicit feedback to bring the old single-hub
          // button back.
          IconButton(
            icon: const Icon(Icons.tune_rounded, size: 20, color: Color(0xFF333333)),
            tooltip: 'Quick actions',
            onPressed: () => _handleActionHub(context),
          ),
          IconButton(
            icon: const Icon(Icons.logout, size: 18, color: Color(0xFF333333)),
            onPressed: () => _handleLogoutAction(context),
          ),
          const SizedBox(width: 4),
        ],
      ),
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            AssignedLoadBanner(onManualEntry: () => _handleAttachLoadAction(context)),
            // Driver Profile Header Card (Minimalist & Dynamic Rate Display)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
              decoration: const BoxDecoration(
                color: Colors.white,
                border: Border(
                  bottom: BorderSide(color: Color(0xFFE0E0E0), width: 1),
                ),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Container(
                            width: 8,
                            height: 8,
                            decoration: const BoxDecoration(
                              color: Color(0xFFCC0000), // Green online indicator
                              shape: BoxShape.circle,
                            ),
                          ),
                          const SizedBox(width: 8),
                          Text(
                            driverName.toUpperCase(),
                            style: theme.textTheme.bodyLarge?.copyWith(
                              fontWeight: FontWeight.w900, color: const Color(0xFF333333),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 2),
                      Text(
                        'Base Rate: £${rateValue.toStringAsFixed(2)}$rateSuffix',
                        style: theme.textTheme.bodyMedium?.copyWith(
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                          color: const Color(0xFF666666),
                        ),
                      ),
                    ],
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                    decoration: BoxDecoration(
                      border: Border.all(
                        color: isClockedIn
                            ? const Color(0xFFCC0000)
                            : (state.pendingAction?.type == 'clock_in' ? const Color(0xFF888888) : const Color(0xFFBBBBBB)),
                        width: 1.5,
                      ),
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: Text(
                      isClockedIn
                          ? 'ACTIVE SHIFT'
                          : (state.pendingAction?.type == 'clock_in' ? 'SYNCING…' : 'OFF DUTY'),
                      style: theme.textTheme.bodyMedium?.copyWith(
                        fontSize: 10,
                        fontWeight: FontWeight.w800,
                        color: isClockedIn
                            ? const Color(0xFFCC0000)
                            : (state.pendingAction?.type == 'clock_in' ? const Color(0xFF888888) : const Color(0xFF888888)),
                      ),
                    ),
                  ),
                ],
              ),
            ),

            if (_trackingUnhealthy && isClockedIn) _buildTrackingBanner(),

            // Live map (High Contrast Grid)
            Expanded(
              child: Stack(
                children: [
                  ml.MapLibreMap(
                    options: ml.MapOptions(
                      initStyle: _kMapStyleUrl,
                      initCenter: state.currentPosition != null
                          ? ml.Geographic(lon: state.currentPosition!.longitude, lat: state.currentPosition!.latitude)
                          : const ml.Geographic(lon: -1.0880, lat: 53.5160),
                      initZoom: 14.0,
                      maxZoom: 19,
                      minPitch: 0,
                      maxPitch: 0,
                    ),
                    onMapCreated: (controller) => _mapController = controller,
                    layers: [
                      // Depot geofences (metre radius, drawn as polygons):
                      // red, going green only while the driver is
                      // inside the nearest one.
                      ml.PolygonLayer(
                        polygons: [
                          for (final depot in state.depots)
                            if (!(state.nearestDepot?.id == depot.id && state.isNearDepot))
                              ml.Feature(geometry: ml.Polygon.from([_geofenceRing(depot.latitude, depot.longitude, depot.geofenceRadiusM.toDouble())])),
                        ],
                        color: const Color(0xFFCC0000).withValues(alpha: 0.10),
                        outlineColor: const Color(0xFFCC0000),
                      ),
                      ml.PolygonLayer(
                        polygons: [
                          for (final depot in state.depots)
                            if (state.nearestDepot?.id == depot.id && state.isNearDepot)
                              ml.Feature(geometry: ml.Polygon.from([_geofenceRing(depot.latitude, depot.longitude, depot.geofenceRadiusM.toDouble())])),
                        ],
                        color: TachyoTheme.success.withValues(alpha: 0.18),
                        outlineColor: TachyoTheme.success,
                      ),
                    ],
                    children: [
                      ml.WidgetLayer(
                        markers: [
                          // Depot pins: a plain red dot with a white ring, inside its red radius circle.
                          ...state.depots.map((depot) {
                            return ml.Marker(
                              point: ml.Geographic(lon: depot.longitude, lat: depot.latitude),
                              size: const Size(18, 18),
                              child: Center(
                                child: Container(
                                  width: 11,
                                  height: 11,
                                  decoration: BoxDecoration(
                                    color: const Color(0xFFCC0000),
                                    shape: BoxShape.circle,
                                    border: Border.all(color: Colors.white, width: 2),
                                    boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.3), blurRadius: 3, offset: const Offset(0, 1))],
                                  ),
                                ),
                              ),
                            );
                          }),

                          // Driver puck: a brand-red heading arrow with a white
                          // outline, inside a soft red halo.
                          if (state.currentPosition != null)
                            ml.Marker(
                              point: ml.Geographic(lon: state.currentPosition!.longitude, lat: state.currentPosition!.latitude),
                              size: const Size(56, 56),
                              child: Builder(
                                builder: (context) {
                                  final rawHeading = state.currentPosition!.heading;
                                  final heading = rawHeading.isFinite && rawHeading >= 0 ? rawHeading : 0.0;
                                  return Stack(
                                    alignment: Alignment.center,
                                    children: [
                                      Container(
                                        width: 56,
                                        height: 56,
                                        decoration: BoxDecoration(
                                          shape: BoxShape.circle,
                                          color: const Color(0xFFCC0000).withValues(alpha: 0.14),
                                          border: Border.all(color: const Color(0xFFCC0000).withValues(alpha: 0.35), width: 1.5),
                                        ),
                                      ),
                                      Transform.rotate(
                                        angle: heading * (math.pi / 180),
                                        child: Stack(
                                          alignment: Alignment.center,
                                          children: [
                                            Icon(
                                              Icons.navigation_rounded,
                                              size: 32,
                                              color: Colors.white,
                                              shadows: [Shadow(color: Colors.black.withValues(alpha: 0.35), blurRadius: 4, offset: const Offset(0, 1))],
                                            ),
                                            const Icon(Icons.navigation_rounded, size: 25, color: Color(0xFFCC0000)),
                                          ],
                                        ),
                                      ),
                                    ],
                                  );
                                },
                              ),
                            ),
                        ],
                      ),
                    ],
                  ),

                  // Required attribution for OpenFreeMap / OpenMapTiles / OSM.
                  const Positioned(
                    left: 0,
                    bottom: 0,
                    child: DecoratedBox(
                      decoration: BoxDecoration(color: Color(0xB3FFFFFF)),
                      child: Padding(
                        padding: EdgeInsets.symmetric(horizontal: 4, vertical: 2),
                        child: Text(
                          '© OpenFreeMap © OpenMapTiles Data from OpenStreetMap',
                          style: TextStyle(fontSize: 8, color: Color(0xFF666666)),
                        ),
                      ),
                    ),
                  ),

                  // Floating status pills — replaces what used to be
                  // tall, full-width banners (GPS error, offline sync)
                  // that lived in the Column above the map and pushed it
                  // down. Compact pills floating over the top of the map
                  // instead, so the map itself always gets its full
                  // Expanded height. The old "no tractor assigned"
                  // reminder pill was removed per explicit feedback — the
                  // Quick Actions hub (Assigned Units row) already covers
                  // it without a standing notification over the map.
                  Positioned(
                    top: 12,
                    left: 16,
                    right: 16,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        if (state.errorMessage != null)
                          Padding(
                            padding: const EdgeInsets.only(bottom: 6),
                            child: _buildStatusPill(
                              icon: Icons.gps_off_rounded,
                              label: state.errorMessage!,
                              tone: const Color(0xFFCC0000),
                            ),
                          ),
                        if (state.pendingAction != null)
                          _buildStatusPill(
                            icon: Icons.cloud_off_rounded,
                            label: state.pendingAction!.type == 'clock_in'
                                ? 'Clock-in recorded ${DateFormat('HH:mm').format(state.pendingAction!.timestamp.toLocal())} — syncing'
                                : 'Clock-out recorded ${DateFormat('HH:mm').format(state.pendingAction!.timestamp.toLocal())} — syncing',
                          ),
                      ],
                    ),
                  ),

                  // Floating "Center to My Location" Button
                  Positioned(
                    bottom: isClockedIn ? 68 : 16,
                    right: 16,
                    child: Container(
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        boxShadow: [
                          BoxShadow(
                            color: Colors.black.withValues(alpha: 0.15),
                            blurRadius: 8,
                            offset: const Offset(0, 2),
                          ),
                        ],
                      ),
                      child: FloatingActionButton(
                        heroTag: 'recenter_btn',
                        backgroundColor: Colors.white,
                        foregroundColor: const Color(0xFF1C1C1E),
                        shape: const CircleBorder(),
                        mini: true,
                        elevation: 0,
                        onPressed: _handleRecenter,
                        child: const Icon(Icons.my_location_rounded, size: 20, color: Color(0xFF1C1C1E)),
                      ),
                    ),
                  ),

                  // Red SOS breakdown button
                  if (isClockedIn)
                    Positioned(
                      bottom: 16,
                      right: 16,
                      child: FloatingActionButton(
                        heroTag: 'sos_btn',
                        backgroundColor: const Color(0xFFCC0000),
                        foregroundColor: Colors.white,
                        shape: const CircleBorder(),
                        mini: true,
                        onPressed: () => _handleSOSAction(context),
                        child: const Icon(Icons.warning_amber_rounded, size: 18),
                      ),
                    ),
                ],
              ),
            ),

            // Active Shift stats card panel
            if (isClockedIn)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 8),
                decoration: const BoxDecoration(
                  color: Colors.white,
                  border: Border(
                    top: BorderSide(color: Color(0xFFE0E0E0), width: 1),
                  ),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceAround,
                  children: [
                    _buildShiftStat(
                      context,
                      'SHIFT START',
                      state.activeShift != null
                          ? DateFormat('HH:mm').format(state.activeShift!.startTime.toLocal())
                          : '--:--',
                    ),
                    _buildShiftStat(context, 'ELAPSED', _formatDuration(effectiveDuration)),
                    _buildShiftStat(
                      context,
                      'ACCRUED PAY',
                      '£${calculatedAccruedEarnings.toStringAsFixed(2)}',
                    ),
                  ],
                ),
              ),

            // Shift control action trigger card
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              decoration: BoxDecoration(
                border: Border(
                  top: BorderSide(
                    color: isDark ? TachyoTheme.darkBorder : TachyoTheme.lightBorder,
                    width: 1,
                  ),
                ),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // Proximity Status Banner
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        'LOCATION STATUS',
                        style: theme.textTheme.bodyMedium?.copyWith(
                          fontSize: 9,
                          fontWeight: FontWeight.w900,
                          letterSpacing: 0.5,
                        ),
                      ),
                      Text(
                        state.isNearDepot
                            ? 'INSIDE DEPOT GEOFENCE'
                            : 'OUTSIDE DEPOT RANGE',
                        style: theme.textTheme.bodyMedium?.copyWith(
                          fontSize: 9,
                          fontWeight: FontWeight.w900,
                          color: state.isNearDepot ? TachyoTheme.success : const Color(0xFF888888),
                          letterSpacing: 0.5,
                        ),
                      ),
                    ],
                  ),
                  
                  const SizedBox(height: 10),

                  if (isClockedIn) ...[
                    // ── Active Shift Controls (Night Out + Clock Out) ──
                    if (state.activeShift?.nightOutStatus == 'pending') ...[
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                        decoration: BoxDecoration(
                          color: isDark ? const Color(0xFF451A03) : const Color(0xFFFEF3C7),
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: const Color(0xFF888888), width: 1.5),
                        ),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            const Icon(Icons.bedtime_rounded, color: Color(0xFF888888), size: 18),
                            const SizedBox(width: 8),
                            Text(
                              'NIGHT OUT REQUESTED (PENDING)',
                              style: GoogleFonts.outfit(
                                fontWeight: FontWeight.w800,
                                fontSize: 11,
                                color: isDark ? const Color(0xFFFDE68A) : const Color(0xFF92400E),
                                letterSpacing: 0.5,
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 12),
                    ] else if (state.activeShift?.nightOutStatus == 'approved') ...[
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                        decoration: BoxDecoration(
                          color: isDark ? const Color(0xFF064E3B) : const Color(0xFFD1FAE5),
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: const Color(0xFFCC0000), width: 1.5),
                        ),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            const Icon(Icons.check_circle_rounded, color: Color(0xFFCC0000), size: 18),
                            const SizedBox(width: 8),
                            Text(
                              'NIGHT OUT APPROVED',
                              style: GoogleFonts.outfit(
                                fontWeight: FontWeight.w800,
                                fontSize: 11,
                                color: isDark ? const Color(0xFFA7F3D0) : const Color(0xFF065F46),
                                letterSpacing: 0.5,
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 12),
                    ] else if (state.activeShift?.nightOutStatus == 'rejected') ...[
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                        decoration: BoxDecoration(
                          color: isDark ? const Color(0xFF7F1D1D) : const Color(0xFFFEE2E2),
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: const Color(0xFFEF4444), width: 1.5),
                        ),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            const Icon(Icons.cancel_rounded, color: Color(0xFFEF4444), size: 18),
                            const SizedBox(width: 8),
                            Text(
                              'NIGHT OUT REQUEST REJECTED',
                              style: GoogleFonts.outfit(
                                fontWeight: FontWeight.w800,
                                fontSize: 11,
                                color: isDark ? const Color(0xFFFECACA) : const Color(0xFF991B1B),
                                letterSpacing: 0.5,
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 12),
                    ],
                    // No status yet ('none') — nothing to show here; the
                    // request itself is now triggered from the Action Hub
                    // (Quick Actions -> Request Night Out), not a
                    // standalone button in this panel.

                    // Clock Out Button (Dynamically enabled/disabled based on geofence)
                    ElevatedButton(
                      onPressed: (state.isLoading || !state.isNearDepot || state.pendingAction != null)
                          ? null
                          : () => _handleClockOut(context),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFFCC0000),
                        disabledBackgroundColor: isDark ? const Color(0xFF1E293B) : const Color(0xFFE2E8F0),
                        disabledForegroundColor: isDark ? const Color(0xFF64748B) : const Color(0xFF94A3B8),
                        foregroundColor: Colors.white,
                        minimumSize: const Size(double.infinity, 46),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                        elevation: 0,
                      ),
                      child: state.isLoading
                          ? const SizedBox(
                              width: 20,
                              height: 20,
                              child: CircularProgressIndicator(
                                strokeWidth: 2.5,
                                color: Colors.white,
                              ),
                            )
                          : Row(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                const Icon(Icons.stop_rounded, size: 22),
                                const SizedBox(width: 8),
                                Text(
                                  'CLOCK OUT OF SHIFT',
                                  style: GoogleFonts.outfit(
                                    fontWeight: FontWeight.w900,
                                    fontSize: 14,
                                    letterSpacing: 0.5,
                                  ),
                                ),
                              ],
                            ),
                    ),
                    if (!state.isNearDepot) ...[
                      const SizedBox(height: 8),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(
                            Icons.location_searching_rounded,
                            size: 13,
                            color: isDark ? const Color(0xFF94A3B8) : const Color(0xFF64748B),
                          ),
                          const SizedBox(width: 6),
                          Text(
                            'Awaiting arrival at designated location to clock out',
                            style: GoogleFonts.outfit(
                              color: isDark ? const Color(0xFF94A3B8) : const Color(0xFF64748B),
                              fontWeight: FontWeight.w600,
                              fontSize: 11.5,
                              letterSpacing: 0.2,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ] else ...[
                    // ── Inactive Shift Controls (Clock In Only) ──
                    ElevatedButton(
                      onPressed: (state.isLoading || !state.isNearDepot || state.pendingAction != null)
                          ? null
                          : () => requiresFieldChecks(ref.read(authProvider).driver)
                              ? _handleClockInVehicleSelection(context)
                              : ref.read(shiftProvider.notifier).clockIn(),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFFCC0000),
                        disabledBackgroundColor: isDark ? const Color(0xFF1E293B) : const Color(0xFFE2E8F0),
                        disabledForegroundColor: isDark ? const Color(0xFF64748B) : const Color(0xFF94A3B8),
                        foregroundColor: Colors.white,
                        minimumSize: const Size(double.infinity, 46),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                        elevation: 0,
                      ),
                      child: state.isLoading
                          ? const SizedBox(
                              width: 20,
                              height: 20,
                              child: CircularProgressIndicator(
                                strokeWidth: 2.5,
                                color: Colors.white,
                              ),
                            )
                          : Row(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                const Icon(Icons.play_arrow_rounded, size: 22),
                                const SizedBox(width: 8),
                                Text(
                                  'CLOCK IN TO SHIFT',
                                  style: GoogleFonts.outfit(
                                    fontWeight: FontWeight.w900,
                                    fontSize: 14,
                                    letterSpacing: 0.5,
                                  ),
                                ),
                              ],
                            ),
                    ),
                    if (!state.isNearDepot) ...[
                      const SizedBox(height: 8),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(
                            Icons.location_searching_rounded,
                            size: 13,
                            color: isDark ? const Color(0xFF94A3B8) : const Color(0xFF64748B),
                          ),
                          const SizedBox(width: 6),
                          Text(
                            'Awaiting arrival at designated location to clock in',
                            style: GoogleFonts.outfit(
                              color: isDark ? const Color(0xFF94A3B8) : const Color(0xFF64748B),
                              fontWeight: FontWeight.w600,
                              fontSize: 11.5,
                              letterSpacing: 0.2,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ],

                  // Dev Location controller presets drawer (sandbox debug mode only)
                  if (kDebugMode) ...[
                    const SizedBox(height: 8),
                    ExpansionTile(
                      title: Text(
                        'SANDBOX LOCATION INJECTOR',
                        style: theme.textTheme.bodyMedium?.copyWith(
                          fontSize: 9,
                          fontWeight: FontWeight.w900,
                          color: isDark ? Colors.white70 : Colors.black87,
                        ),
                      ),
                      dense: true,
                      childrenPadding: EdgeInsets.zero,
                      tilePadding: EdgeInsets.zero,
                      children: [
                        Padding(
                          padding: const EdgeInsets.symmetric(vertical: 4),
                          child: Wrap(
                            spacing: 6,
                            runSpacing: 6,
                            children: [
                              OutlinedButton(
                                onPressed: () => ref.read(shiftProvider.notifier).mockLocation(53.481798, -1.086552),
                                style: OutlinedButton.styleFrom(
                                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                                  textStyle: const TextStyle(fontSize: 9, fontWeight: FontWeight.bold),
                                ),
                                child: const Text('ROSSINGTON DEPOT'),
                              ),
                              OutlinedButton(
                                onPressed: () => ref.read(shiftProvider.notifier).mockLocation(53.550248, -1.091061),
                                style: OutlinedButton.styleFrom(
                                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                                  textStyle: const TextStyle(fontSize: 9, fontWeight: FontWeight.bold),
                                ),
                                child: const Text('WHEATLEY DEPOT'),
                              ),
                              OutlinedButton(
                                onPressed: () => ref.read(shiftProvider.notifier).mockLocation(53.5000, -1.0900),
                                style: OutlinedButton.styleFrom(
                                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                                  textStyle: const TextStyle(fontSize: 9, fontWeight: FontWeight.bold),
                                ),
                                child: const Text('DRIVE AWAY (OUT)'),
                              ),
                              ElevatedButton(
                                onPressed: () {
                                  if (state.isPlaybackRunning) {
                                    ref.read(shiftProvider.notifier).stopRoutePlayback();
                                  } else {
                                    ref.read(shiftProvider.notifier).startRoutePlayback();
                                  }
                                },
                                style: ElevatedButton.styleFrom(
                                  backgroundColor: state.isPlaybackRunning
                                      ? TachyoTheme.success
                                      : (isDark ? Colors.white24 : Colors.black12),
                                  foregroundColor: isDark ? Colors.white : Colors.black,
                                  side: BorderSide(
                                    color: state.isPlaybackRunning
                                        ? TachyoTheme.success
                                        : (isDark ? Colors.white30 : Colors.black26),
                                    width: 1,
                                  ),
                                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                                  textStyle: const TextStyle(fontSize: 9, fontWeight: FontWeight.bold),
                                ),
                                child: Text(state.isPlaybackRunning
                                    ? 'STOP PLAYBACK SIMULATION'
                                    : 'START PLAYBACK SIMULATION'),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildShiftStat(BuildContext context, String label, String value) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    return Column(
      children: [
        Text(
          label,
          style: theme.textTheme.bodyMedium?.copyWith(
            fontSize: 9,
            fontWeight: FontWeight.w900,
            letterSpacing: 0.5,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          value,
          style: theme.textTheme.headlineMedium?.copyWith(
            fontSize: 18,
            fontWeight: FontWeight.w900,
            color: isDark ? Colors.white : Colors.black,
          ),
        ),
      ],
    );
  }
}

/// Compact date-and-time button — tapped, it opens a date picker then a
/// time picker. Used on the Attach Load sheet for booked departure/arrival.
class _BookedTimeField extends StatelessWidget {
  final String label;
  final DateTime? value;
  final ValueChanged<DateTime?> onChange;
  final bool isDark;

  const _BookedTimeField({
    required this.label,
    required this.value,
    required this.onChange,
    required this.isDark,
  });

  Future<void> _pick(BuildContext context) async {
    final now = DateTime.now();
    final base = value ?? now;
    final date = await showDatePicker(
      context: context,
      initialDate: base,
      firstDate: now.subtract(const Duration(days: 1)),
      lastDate: now.add(const Duration(days: 60)),
      builder: (context, child) => Theme(
        data: Theme.of(context).copyWith(
          colorScheme: isDark
              ? const ColorScheme.dark(primary: Color(0xFFCC0000))
              : const ColorScheme.light(primary: Color(0xFFCC0000)),
        ),
        child: child!,
      ),
    );
    if (date == null) return;
    if (!context.mounted) return;
    final time = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(base),
      builder: (context, child) => Theme(
        data: Theme.of(context).copyWith(
          colorScheme: isDark
              ? const ColorScheme.dark(primary: Color(0xFFCC0000))
              : const ColorScheme.light(primary: Color(0xFFCC0000)),
        ),
        child: child!,
      ),
    );
    if (time == null) return;
    onChange(DateTime(date.year, date.month, date.day, time.hour, time.minute));
  }

  @override
  Widget build(BuildContext context) {
    final display = value == null
        ? 'Not set'
        : DateFormat('EEE d MMM · HH:mm').format(value!);
    final bg = isDark ? const Color(0xFF1A1A1A) : const Color(0xFFF5F5F5);
    return Material(
      color: bg,
      borderRadius: BorderRadius.circular(10),
      child: InkWell(
        borderRadius: BorderRadius.circular(10),
        onTap: () => _pick(context),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label, style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w800, color: isDark ? Colors.white54 : Colors.black45)),
              const SizedBox(height: 2),
              Row(
                children: [
                  Icon(Icons.event_outlined, size: 15, color: value == null ? (isDark ? Colors.white38 : Colors.black38) : const Color(0xFFCC0000)),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      display,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 12.5,
                        fontWeight: FontWeight.w700,
                        color: value == null ? (isDark ? Colors.white54 : Colors.black45) : (isDark ? Colors.white : Colors.black87),
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
