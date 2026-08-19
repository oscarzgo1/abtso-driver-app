import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart' as latlong;
import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart' hide AuthState;
import '../../../config/theme.dart';
import '../../auth/presentation/auth_provider.dart';
import 'shift_provider.dart';
import '../../../core/network/supabase_service.dart';


class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key});

  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends ConsumerState<HomeScreen> with TickerProviderStateMixin {
  Timer? _shiftDurationTimer;
  Duration _elapsedTime = Duration.zero;
  final MapController _mapController = MapController();
  late AnimationController _iconAnimationController;

  RealtimeChannel? _driverProfileChannel;
  RealtimeChannel? _shiftsChannel;

  /// Aggressive fresh read of driver profile, active shift, and depots from database
  Future<void> fetchDashboardData() async {
    final driverId = SupabaseService.currentDriverId;
    if (driverId == null) return;
    debugPrint('🔄 Aggressively fetching fresh dashboard data for driver $driverId...');
    await ref.read(authProvider.notifier).refreshProfile();
    await ref.read(shiftProvider.notifier).loadActiveShift();
    await ref.read(shiftProvider.notifier).fetchDepots();
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
  }

  @override
  void initState() {
    super.initState();
    
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
      }
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
    _cleanupRealtimeListeners();
    _shiftDurationTimer?.cancel();
    _mapController.dispose();
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
                    border: Border.all(color: ABTSOTheme.success, width: 1.5),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.star, color: ABTSOTheme.success, size: 18),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          'WEEKEND RATE OVERRIDE APPLIED (£18.00/HR)',
                          style: theme.textTheme.bodyMedium?.copyWith(
                            color: ABTSOTheme.success,
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
                ? ABTSOTheme.success
                : (isDark ? Colors.white : Colors.black),
            fontSize: highlighted ? 20 : 15,
          ),
        ),
      ],
    );
  }

  void _handleRecenter() {
    final pos = ref.read(shiftProvider).currentPosition;
    if (pos != null) {
      _mapController.move(
        latlong.LatLng(pos.latitude, pos.longitude),
        15.0,
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
                messenger.showSnackBar(
                  SnackBar(
                    content: Text(
                      success ? 'EMERGENCY SOS BROADCASTED SUCCESSFULLY!' : 'FAILED TO BROADCAST SOS ALERT',
                      style: const TextStyle(fontWeight: FontWeight.bold),
                    ),
                    backgroundColor: success ? const Color(0xFF10B981) : const Color(0xFFFF3333),
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
        title: Image.asset('assets/images/abtso_logo_transparent.png', height: 28, fit: BoxFit.contain),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(1),
          child: Container(height: 1, color: const Color(0xFFE0E0E0)),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.logout, size: 18, color: Color(0xFF333333)),
            onPressed: () {
              _cleanupRealtimeListeners();
              ref.read(authProvider.notifier).logout();
              context.goNamed('login');
            },
          ),
          const SizedBox(width: 4),
        ],
      ),
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
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
                              color: Color(0xFF2E7D32), // Green online indicator
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
                        color: isClockedIn ? const Color(0xFF2E7D32) : const Color(0xFFBBBBBB),
                        width: 1.5,
                      ),
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: Text(
                      isClockedIn ? 'ACTIVE SHIFT' : 'OFF DUTY',
                      style: theme.textTheme.bodyMedium?.copyWith(
                        fontSize: 10,
                        fontWeight: FontWeight.w800,
                        color: isClockedIn ? const Color(0xFF2E7D32) : const Color(0xFF888888),
                      ),
                    ),
                  ),
                ],
              ),
            ),

            // Live map (High Contrast Grid)
            Expanded(
              child: Stack(
                children: [
                  FlutterMap(
                    mapController: _mapController,
                    options: MapOptions(
                      initialCenter: state.currentPosition != null
                          ? latlong.LatLng(state.currentPosition!.latitude, state.currentPosition!.longitude)
                          : const latlong.LatLng(53.5160, -1.0880),
                      initialZoom: 14.0,
                    ),
                    children: [
                      // Bright Google Maps-style tiles (CartoDB Positron)
                      TileLayer(
                        urlTemplate: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
                        subdomains: const ['a', 'b', 'c', 'd'],
                        userAgentPackageName: 'com.abtso.driver',
                      ),
                      
                      // Circles Layer for Depots
                      CircleLayer(
                        circles: state.depots.map((depot) {
                          final isNearest = state.nearestDepot?.id == depot.id;
                          return CircleMarker(
                            point: latlong.LatLng(depot.latitude, depot.longitude),
                            radius: depot.geofenceRadiusM.toDouble(),
                            useRadiusInMeter: true,
                            color: isNearest && state.isNearDepot
                                ? ABTSOTheme.success.withValues(alpha: 0.12)
                                : (isDark ? Colors.white.withValues(alpha: 0.05) : Colors.black.withValues(alpha: 0.03)),
                            borderColor: isNearest && state.isNearDepot
                                ? ABTSOTheme.success
                                : (isDark ? Colors.white54 : Colors.black54),
                            borderStrokeWidth: 1.5,
                          );
                        }).toList(),
                      ),

                      // Markers Layer for Driver position & depots
                      MarkerLayer(
                        markers: [
                          // Depot Pins
                          ...state.depots.map((depot) {
                            return Marker(
                              point: latlong.LatLng(depot.latitude, depot.longitude),
                              width: 32,
                              height: 32,
                              child: Icon(
                                Icons.location_pin,
                                color: isDark ? Colors.white : Colors.black,
                                size: 18,
                              ),
                            );
                          }),
                          
                          // Current Driver Blue Dot
                          if (state.currentPosition != null)
                            Marker(
                              point: latlong.LatLng(state.currentPosition!.latitude, state.currentPosition!.longitude),
                              width: 24,
                              height: 24,
                              child: Container(
                                decoration: BoxDecoration(
                                  color: Colors.blueAccent,
                                  shape: BoxShape.circle,
                                  border: Border.all(color: Colors.white, width: 2.5),
                                ),
                              ),
                            ),
                        ],
                      ),
                    ],
                  ),

                  // Floating accuracy error message card
                  if (state.errorMessage != null)
                    Positioned(
                      top: 16,
                      left: 16,
                      right: 16,
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                        decoration: BoxDecoration(
                          color: theme.scaffoldBackgroundColor,
                          border: Border.all(color: theme.colorScheme.error, width: 1.5),
                        ),
                        child: Text(
                          state.errorMessage!.toUpperCase(),
                          style: theme.textTheme.bodyMedium?.copyWith(
                            color: theme.colorScheme.error,
                            fontWeight: FontWeight.w700,
                            fontSize: 11,
                          ),
                          textAlign: TextAlign.center,
                        ),
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
                    color: isDark ? ABTSOTheme.darkBorder : ABTSOTheme.lightBorder,
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
                            : 'SEARCHING DEPOT RANGE',
                        style: theme.textTheme.bodyMedium?.copyWith(
                          fontSize: 9,
                          fontWeight: FontWeight.w900,
                          color: state.isNearDepot ? ABTSOTheme.success : const Color(0xFF888888),
                          letterSpacing: 0.5,
                        ),
                      ),
                    ],
                  ),
                  
                  const SizedBox(height: 10),

                  if (isClockedIn) ...[
                    // ── Active Shift Controls (Night Out + Clock Out) ──
                    // Always active regardless of geofence location
                    if (state.activeShift?.nightOutStatus == 'pending') ...[
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                        decoration: BoxDecoration(
                          color: isDark ? const Color(0xFF451A03) : const Color(0xFFFEF3C7),
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: const Color(0xFFF59E0B), width: 1.5),
                        ),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            const Icon(Icons.bedtime_rounded, color: Color(0xFFF59E0B), size: 18),
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
                          border: Border.all(color: const Color(0xFF10B981), width: 1.5),
                        ),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            const Icon(Icons.check_circle_rounded, color: Color(0xFF10B981), size: 18),
                            const SizedBox(width: 8),
                            Text(
                              'NIGHT OUT ALLOWANCE ACTIVE (£25.00)',
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
                    ] else ...[
                      OutlinedButton.icon(
                        onPressed: state.isLoading
                            ? null
                            : () async {
                                final messenger = ScaffoldMessenger.of(context);
                                final success = await ref.read(shiftProvider.notifier).requestNightOut();
                                if (success) {
                                  messenger.showSnackBar(
                                    const SnackBar(
                                      content: Text('Night Out request submitted successfully!'),
                                      backgroundColor: Color(0xFFF59E0B),
                                    ),
                                  );
                                }
                              },
                        icon: const Icon(Icons.bedtime_outlined, size: 18, color: Color(0xFFF59E0B)),
                        label: Text(
                          'REQUEST NIGHT OUT',
                          style: GoogleFonts.outfit(
                            fontWeight: FontWeight.w800,
                            fontSize: 12,
                            color: isDark ? Colors.white : Colors.black87,
                            letterSpacing: 0.5,
                          ),
                        ),
                        style: OutlinedButton.styleFrom(
                          padding: const EdgeInsets.symmetric(vertical: 12),
                          side: const BorderSide(color: Color(0xFFF59E0B), width: 1.5),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                        ),
                      ),
                      const SizedBox(height: 12),
                    ],

                    // Clock Out Button (Rendered ONLY if inside depot range)
                    if (state.isNearDepot)
                      ElevatedButton(
                        onPressed: state.isLoading
                            ? null
                            : () => ref.read(shiftProvider.notifier).clockOut(),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFFCC0000),
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
                      )
                    else
                      Container(
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        alignment: Alignment.center,
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(
                              Icons.location_searching_rounded,
                              size: 14,
                              color: isDark ? const Color(0xFF94A3B8) : const Color(0xFF64748B),
                            ),
                            const SizedBox(width: 8),
                            Text(
                              'Awaiting arrival at designated location to clock out',
                              style: GoogleFonts.outfit(
                                color: isDark ? const Color(0xFF94A3B8) : const Color(0xFF64748B),
                                fontWeight: FontWeight.w600,
                                fontSize: 12,
                                letterSpacing: 0.2,
                              ),
                            ),
                          ],
                        ),
                      ),
                  ] else ...[
                    // ── Inactive Shift Controls (Clock In Only) ──
                    if (state.isNearDepot)
                      ElevatedButton(
                        onPressed: state.isLoading
                            ? null
                            : () => ref.read(shiftProvider.notifier).clockIn(),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFF2E7D32),
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
                      )
                    else
                      Container(
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        alignment: Alignment.center,
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(
                              Icons.location_searching_rounded,
                              size: 14,
                              color: isDark ? const Color(0xFF94A3B8) : const Color(0xFF64748B),
                            ),
                            const SizedBox(width: 8),
                            Text(
                              'Awaiting arrival at designated location',
                              style: GoogleFonts.outfit(
                                color: isDark ? const Color(0xFF94A3B8) : const Color(0xFF64748B),
                                fontWeight: FontWeight.w600,
                                fontSize: 12,
                                letterSpacing: 0.2,
                              ),
                            ),
                          ],
                        ),
                      ),
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
                                      ? ABTSOTheme.success
                                      : (isDark ? Colors.white24 : Colors.black12),
                                  foregroundColor: isDark ? Colors.white : Colors.black,
                                  side: BorderSide(
                                    color: state.isPlaybackRunning
                                        ? ABTSOTheme.success
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
