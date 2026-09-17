import 'dart:async';
import 'dart:math' as math;
import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:vector_map_tiles/vector_map_tiles.dart';
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

/// Desaturated grayscale basemap skin — applied only to the tile/vector
/// layer, never to the marker/circle layers above it, so the depot
/// geofences and driver puck stay in full, high-contrast colour against
/// a muted map. Standard ITU-R BT.709 luma weights with no brightness
/// offset — the closest Flutter ColorFilter equivalent of the spec's
/// `grayscale(100%) contrast(100%)` (there's no direct 1:1 CSS-filter-
/// to-ColorMatrix port; contrast(100%) is CSS's identity value, i.e.
/// pure grayscale with no softening applied on top of it).
const List<double> _grayscaleMapMatrix = <double>[
  0.2126, 0.7152, 0.0722, 0, 0,
  0.2126, 0.7152, 0.0722, 0, 0,
  0.2126, 0.7152, 0.0722, 0, 0,
  0, 0, 0, 1, 0,
];

class _HomeScreenState extends ConsumerState<HomeScreen> with TickerProviderStateMixin {
  Timer? _shiftDurationTimer;
  Duration _elapsedTime = Duration.zero;
  final MapController _mapController = MapController();
  late AnimationController _iconAnimationController;

  /// OpenFreeMap Positron vector style — keyless, unmetered, commercial use permitted.
  /// Fetched once per screen mount; the layer is built when it resolves.
  late final Future<Style> _mapStyle = StyleReader(
    uri: 'https://tiles.openfreemap.org/styles/positron',
  ).read();

  RealtimeChannel? _driverProfileChannel;
  RealtimeChannel? _shiftsChannel;
  RealtimeChannel? _orgSettingsChannel;

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

  /// Searchable fleet-asset picker, shared by the fuel log, incident
  /// report, and couple/decouple sheets. Returns the chosen vehicle map,
  /// an empty map as the "Decouple / Clear" sentinel (only offered when
  /// [allowClear] is true), or null if the sheet was dismissed with no
  /// choice made.
  Future<Map<String, dynamic>?> _showSearchableAssetPicker(
    BuildContext context, {
    required String title,
    required String subtitle,
    required List<Map<String, dynamic>> vehicles,
    String? typeFilter,
    bool allowClear = false,
  }) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final source = typeFilter != null
        ? vehicles.where((v) => v['vehicle_type'] == typeFilter).toList()
        : vehicles;
    final searchController = TextEditingController();

    return showModalBottomSheet<Map<String, dynamic>?>(
      context: context,
      isScrollControlled: true,
      backgroundColor: isDark ? const Color(0xFF0F172A) : Colors.white,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (sheetContext) {
        return StatefulBuilder(
          builder: (sheetContext, setSheetState) {
            final query = searchController.text.trim().toLowerCase();
            final results = query.isEmpty
                ? source
                : source.where((v) => (v['vehicle_number'] as String).toLowerCase().contains(query)).toList();

            Widget buildVehicleTile(Map<String, dynamic> v) {
              final isTruck = v['vehicle_type'] == 'truck';
              return Material(
                color: isDark ? const Color(0xFF1E293B) : const Color(0xFFF1F5F9),
                borderRadius: BorderRadius.circular(12),
                child: InkWell(
                  borderRadius: BorderRadius.circular(12),
                  onTap: () => Navigator.pop(sheetContext, v),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
                    child: Row(
                      children: [
                        Icon(isTruck ? Icons.local_shipping_outlined : Icons.rv_hookup_outlined, size: 20, color: const Color(0xFFCC0000)),
                        const SizedBox(width: 12),
                        Text(
                          (v['vehicle_number'] as String).toUpperCase(),
                          style: const TextStyle(fontFamily: 'monospace', fontWeight: FontWeight.w800, fontSize: 14, letterSpacing: 0.5),
                        ),
                        const Spacer(),
                        Icon(Icons.chevron_right, size: 18, color: isDark ? Colors.white38 : Colors.black38),
                      ],
                    ),
                  ),
                ),
              );
            }

            // With no typeFilter (the general "search fleet asset" picker
            // used by Incident Report and fuel logging) results mix
            // tractors and trailers together, which made it hard to scan
            // for e.g. "is there a spare trailer free" at a glance. Group
            // into TRACTORS / TRAILERS sections (each only shown if
            // non-empty) instead of one flat list; a single-type picker
            // (typeFilter set, used by the dedicated Tractor/Trailer
            // coupling pickers) is already homogeneous so stays flat.
            final listItems = <Widget>[];
            if (typeFilter == null) {
              final tractors = results.where((v) => v['vehicle_type'] == 'truck').toList();
              final trailers = results.where((v) => v['vehicle_type'] != 'truck').toList();
              void addGroup(String label, List<Map<String, dynamic>> group) {
                if (group.isEmpty) return;
                if (listItems.isNotEmpty) listItems.add(const SizedBox(height: 14));
                listItems.add(Padding(
                  padding: const EdgeInsets.only(bottom: 6),
                  child: Text(
                    '$label (${group.length})',
                    style: TextStyle(fontWeight: FontWeight.w800, fontSize: 11, letterSpacing: 0.6, color: isDark ? Colors.white38 : Colors.black38),
                  ),
                ));
                for (var i = 0; i < group.length; i++) {
                  if (i > 0) listItems.add(const SizedBox(height: 8));
                  listItems.add(buildVehicleTile(group[i]));
                }
              }
              addGroup('TRACTORS', tractors);
              addGroup('TRAILERS', trailers);
            } else {
              for (var i = 0; i < results.length; i++) {
                if (i > 0) listItems.add(const SizedBox(height: 8));
                listItems.add(buildVehicleTile(results[i]));
              }
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
                  Row(
                    children: [
                      const Icon(Icons.local_shipping_outlined, color: Color(0xFFCC0000), size: 24),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Text(
                          title,
                          style: TextStyle(fontWeight: FontWeight.w900, fontSize: 15, letterSpacing: 0.5, color: isDark ? Colors.white : Colors.black87),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text(subtitle, style: TextStyle(fontSize: 12, color: isDark ? Colors.white60 : Colors.black54)),
                  const SizedBox(height: 14),
                  TextField(
                    controller: searchController,
                    onChanged: (_) => setSheetState(() {}),
                    style: TextStyle(color: isDark ? Colors.white : Colors.black87, fontWeight: FontWeight.w600),
                    decoration: InputDecoration(
                      hintText: 'Search registration…',
                      hintStyle: TextStyle(color: isDark ? Colors.white38 : Colors.black38, fontWeight: FontWeight.w500),
                      prefixIcon: const Icon(Icons.search, size: 18),
                      isDense: true,
                      filled: true,
                      fillColor: isDark ? const Color(0xFF1E293B) : const Color(0xFFF1F5F9),
                      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
                    ),
                  ),
                  const SizedBox(height: 12),
                  if (allowClear)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: OutlinedButton.icon(
                        onPressed: () => Navigator.pop(sheetContext, <String, dynamic>{}),
                        icon: const Icon(Icons.link_off, size: 16),
                        label: const Text('Decouple / Clear Selection', style: TextStyle(fontWeight: FontWeight.w700)),
                        style: OutlinedButton.styleFrom(
                          foregroundColor: isDark ? Colors.white70 : Colors.black54,
                          side: BorderSide(color: isDark ? Colors.white24 : Colors.black26, width: 1.5),
                          minimumSize: const Size(double.infinity, 42),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                        ),
                      ),
                    ),
                  Flexible(
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(maxHeight: 360),
                      child: results.isEmpty
                          ? Padding(
                              padding: const EdgeInsets.symmetric(vertical: 24),
                              child: Text(
                                source.isEmpty ? 'No vehicles are registered for your company yet.' : 'No matching vehicles.',
                                style: TextStyle(fontSize: 13, color: isDark ? Colors.white60 : Colors.black54),
                              ),
                            )
                          : ListView(shrinkWrap: true, children: listItems),
                    ),
                  ),
                ],
              ),
            );
          },
        );
      },
    );
  }

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
                  for (var i = 0; i < selectedPhotos.length; i++) {
                    final path = await SupabaseService.uploadDefectPhoto(
                      organizationId: organizationId,
                      driverId: driverId,
                      bytes: selectedPhotoBytes[i],
                      fileName: selectedPhotos[i].name,
                    );
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
                    backgroundColor: success && failedPhotoCount == 0 ? const Color(0xFF10B981) : const Color(0xFFFF3333),
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
                      final coupledTrailer = findById(activeShift?.trailerId);

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
            final trailer = findById(activeShift?.trailerId);
            final unitsSubtitle = !isClockedIn
                ? 'Clock in to couple a vehicle'
                : (tractor == null && trailer == null)
                    ? 'Unassigned (tap to pair)'
                    : [
                        if (tractor != null) (tractor['vehicle_number'] as String).toUpperCase(),
                        if (trailer != null) (trailer['vehicle_number'] as String).toUpperCase(),
                      ].join(' / ');

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

            return Padding(
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
                  buildActionRow(
                    icon: Icons.local_shipping_outlined,
                    title: 'Assigned Units',
                    subtitle: unitsSubtitle,
                    onSelect: isClockedIn ? () => _handleCoupleDecoupleAction(hubContext) : null,
                  ),
                  buildActionRow(
                    icon: Icons.local_gas_station_outlined,
                    title: 'Log Fuel & AdBlue',
                    subtitle: isClockedIn ? 'Diesel or AdBlue, with a receipt photo' : 'Clock in to log fuel',
                    onSelect: isClockedIn ? () => _handleFuelReceiptAction(hubContext) : null,
                  ),
                  buildActionRow(
                    icon: Icons.warning_amber_rounded,
                    title: 'Report Defect / Incident',
                    subtitle: 'Damage, near miss, collision, mechanical fault',
                    onSelect: () => _handleReportIncidentAction(hubContext),
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
                                    backgroundColor: Color(0xFFF59E0B),
                                  ),
                                );
                              }
                            }
                          : null,
                    ),
                ],
              ),
            );
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
        return StatefulBuilder(
          builder: (sheetContext, setSheetState) {
            Map<String, dynamic>? selectedTractor;
            Map<String, dynamic>? selectedTrailer;

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
                            );
                            if (picked != null && picked.isNotEmpty) {
                              setSheetState(() => selectedTrailer = picked);
                            }
                          },
                        ),
                        const SizedBox(height: 18),
                        ElevatedButton(
                          onPressed: () {
                            Navigator.pop(sheetContext);
                            ref.read(shiftProvider.notifier).clockIn(
                                  vehicleId: selectedTractor?['id'] as String?,
                                  trailerId: selectedTrailer?['id'] as String?,
                                );
                          },
                          style: ElevatedButton.styleFrom(
                            backgroundColor: const Color(0xFF2E7D32),
                            foregroundColor: Colors.white,
                            minimumSize: const Size(double.infinity, 46),
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                          ),
                          child: const Text('CLOCK IN', style: TextStyle(fontWeight: FontWeight.w900, letterSpacing: 0.5)),
                        ),
                        if (selectedTractor == null && selectedTrailer == null) ...[
                          const SizedBox(height: 8),
                          Text(
                            'Skip / Assign Vehicle Later — you can couple from the dashboard once clocked in.',
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
                final trailer = findById(activeShift?.trailerId);

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
                              allowClear: trailer != null,
                            );
                            if (picked == null) return;
                            final isClear = picked.isEmpty;
                            final ok = await ref.read(shiftProvider.notifier).updateCoupling(
                                  trailerId: isClear ? null : picked['id'] as String,
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

  /// Fuel & AdBlue receipt logging: one photo (required — the
  /// receipt_photo_path column is NOT NULL, migration 047) and litres
  /// (required by this form; migration 049 kept the column itself
  /// nullable at the DB level, but a receipt with no volume logged isn't
  /// useful for cost tracking) are the only two things that must be
  /// filled in. Total cost is now genuinely optional (migration 049
  /// dropped its NOT NULL). Re-openable any number of times per shift —
  /// nothing here limits it to one log. Tied to the active shift so the
  /// Profitability ledger can attribute it to a specific row; starts
  /// 'pending' and only counts toward Actual Fuel Cost once an admin
  /// approves it (see submitFuelReceipt).
  void _handleFuelReceiptAction(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final litersController = TextEditingController();
    final costController = TextEditingController();
    final vendorController = TextEditingController();
    final picker = ImagePicker();
    XFile? selectedPhoto;
    // Read once at pick time — see uploadFuelReceiptPhoto's doc comment;
    // the web build can't re-read an XFile via dart:io.File later, so
    // the bytes captured here are reused for both the instant preview
    // and the actual upload.
    Uint8List? selectedPhotoBytes;
    String fuelType = 'diesel';
    bool isSubmitting = false;
    String? formError;

    final organizationId = ref.read(authProvider).driver?['organization_id'] as String?;
    final activeShift = ref.read(shiftProvider).activeShift;
    final shiftId = activeShift?.id;
    // Defaults to the currently coupled tractor unit, per spec — the
    // driver can still search/select any other asset from the picker.
    Map<String, dynamic>? selectedAsset;
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
            }

            // Deliberately NOT gated on photo/liters being filled in — submit()
            // below already validates both and sets a specific formError
            // ('A photo of the receipt is required.' / 'Enter the volume in
            // litres.'). Disabling the button on those same conditions made it
            // silently inert (Flutter fires no feedback for tapping a disabled
            // button) instead of showing the driver why — indistinguishable
            // from the button being broken. Only isSubmitting should disable it.
            final canSubmit = !isSubmitting;

            Future<void> submit() async {
              final messenger = ScaffoldMessenger.of(context);
              final driverId = ref.read(authProvider).driver?['id'] as String?;
              if (driverId == null || isSubmitting) return;

              final photo = selectedPhoto;
              final litersValue = double.tryParse(litersController.text.trim());
              if (photo == null) {
                setSheetState(() => formError = 'A photo of the receipt is required.');
                return;
              }
              if (litersValue == null || litersValue <= 0) {
                setSheetState(() => formError = 'Enter the volume in litres.');
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
                if (organizationId != null && selectedPhotoBytes != null) {
                  photoPath = await SupabaseService.uploadFuelReceiptPhoto(
                    organizationId: organizationId,
                    driverId: driverId,
                    bytes: selectedPhotoBytes!,
                    fileName: photo.name,
                  );
                }
                if (photoPath == null) {
                  // SupabaseService.lastUploadError carries the real
                  // exception (network drop vs. rejected format vs. size
                  // limit — previously indistinguishable) so the next
                  // failure is self-diagnosing instead of always reading
                  // as a generic "connection error" regardless of cause.
                  final reason = SupabaseService.lastUploadError;
                  setSheetState(() {
                    formError = reason != null
                        ? 'Could not upload the photo: $reason'
                        : 'Could not upload the photo — check your connection and try again.';
                  });
                  return;
                }

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
                );
                if (sheetContext.mounted) Navigator.pop(sheetContext);
                messenger.showSnackBar(
                  SnackBar(
                    content: Text(
                      success ? 'Fuel receipt sent for approval.' : 'Could not send the receipt — try again.',
                      style: const TextStyle(fontWeight: FontWeight.bold),
                    ),
                    backgroundColor: success ? const Color(0xFF10B981) : const Color(0xFFFF3333),
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
                            } else if (picked != null && picked.isEmpty) {
                              setSheetState(() => selectedAsset = null);
                            }
                          },
                        ),
                        const SizedBox(height: 12),

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
                              const SizedBox(width: 10),
                              Expanded(
                                child: OutlinedButton.icon(
                                  onPressed: () => pickPhoto(ImageSource.gallery),
                                  icon: Icon(Icons.photo_library_outlined, size: 18, color: isDark ? Colors.white70 : Colors.black54),
                                  label: Text('Choose Photo', style: TextStyle(fontWeight: FontWeight.w700, color: isDark ? Colors.white70 : Colors.black54)),
                                  style: OutlinedButton.styleFrom(
                                    padding: const EdgeInsets.symmetric(vertical: 14),
                                    side: BorderSide(color: isDark ? Colors.white24 : Colors.black26, width: 1.5),
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
                        const SizedBox(height: 6),
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
                        color: isClockedIn
                            ? const Color(0xFF2E7D32)
                            : (state.pendingAction?.type == 'clock_in' ? const Color(0xFFF59E0B) : const Color(0xFFBBBBBB)),
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
                            ? const Color(0xFF2E7D32)
                            : (state.pendingAction?.type == 'clock_in' ? const Color(0xFFF59E0B) : const Color(0xFF888888)),
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
                      // Desaturated grayscale basemap — Tachyo brand skin.
                      // Two different tile implementations by platform, not
                      // a cosmetic choice: vector_map_tiles (8.0.0) always
                      // builds a disk-backed tile cache via path_provider's
                      // getTemporaryDirectory() — which has no web
                      // implementation and throws MissingPluginException —
                      // and several of its own cache read/write paths
                      // aren't wrapped in try/catch, so on web the map
                      // never rendered a single tile (an uncaught exception
                      // during Caches setup, confirmed via a debug build's
                      // console). Native platforms (Android/iOS) have a
                      // real getTemporaryDirectory, so they keep the nicer
                      // vector rendering unaffected. ColorFiltered wraps
                      // only this tile layer, not the CircleLayer/
                      // MarkerLayer below it, so the depot geofences and
                      // driver puck stay full-colour and high-contrast
                      // against the muted map underneath them.
                      ColorFiltered(
                        colorFilter: const ColorFilter.matrix(_grayscaleMapMatrix),
                        child: kIsWeb
                            ? TileLayer(
                                // CARTO's basemaps.cartocdn.com XYZ endpoint now
                                // returns "API key required" placeholder tiles —
                                // confirmed by actually loading this in a browser,
                                // not assumed. OSM's own standard tile server is
                                // genuinely keyless; a small fleet's worth of
                                // drivers is trivial load for it, and
                                // userAgentPackageName identifies the app per
                                // their usage policy.
                                urlTemplate: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
                                subdomains: const ['a', 'b', 'c'],
                                userAgentPackageName: 'uk.co.tachyo.driver',
                              )
                            : FutureBuilder<Style>(
                                future: _mapStyle,
                                builder: (context, snapshot) {
                                  final style = snapshot.data;
                                  if (style == null) {
                                    // Plain backdrop while the style loads, or if it fails —
                                    // depot circles and markers below stay usable regardless.
                                    return const SizedBox.shrink();
                                  }
                                  return VectorTileLayer(
                                    theme: style.theme,
                                    sprites: style.sprites,
                                    tileProviders: style.providers,
                                  );
                                },
                              ),
                      ),

                      // Circles Layer for Depots — subtle slate outlines,
                      // full-colour against the grayscale basemap.
                      CircleLayer(
                        circles: state.depots.map((depot) {
                          final isNearest = state.nearestDepot?.id == depot.id;
                          return CircleMarker(
                            point: latlong.LatLng(depot.latitude, depot.longitude),
                            radius: depot.geofenceRadiusM.toDouble(),
                            useRadiusInMeter: true,
                            color: isNearest && state.isNearDepot
                                ? TachyoTheme.success.withValues(alpha: 0.12)
                                : const Color(0xFF475569).withValues(alpha: 0.06),
                            borderColor: isNearest && state.isNearDepot
                                ? TachyoTheme.success
                                : const Color(0xFF475569),
                            borderStrokeWidth: 2,
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
                              child: const Icon(
                                Icons.location_pin,
                                color: Color(0xFF475569),
                                size: 18,
                              ),
                            );
                          }),

                          // Current Driver Puck — classic monochrome
                          // navigation-cursor arrow (not a coloured circle
                          // with an icon inside it), dark slate with a
                          // crisp white outline, rotated to the device's
                          // GPS heading. The white "outline" is a larger
                          // white copy of the same glyph directly behind
                          // the dark-slate one — there's no native
                          // stroke-outline API for a Material icon glyph,
                          // and a uniformly-scaled copy behind a convex
                          // kite/arrow shape like this reads as a clean
                          // ~1.5px border at this marker size.
                          if (state.currentPosition != null)
                            Marker(
                              point: latlong.LatLng(state.currentPosition!.latitude, state.currentPosition!.longitude),
                              width: 30,
                              height: 30,
                              child: Builder(
                                builder: (context) {
                                  final rawHeading = state.currentPosition!.heading;
                                  final heading = rawHeading.isFinite && rawHeading >= 0 ? rawHeading : 0.0;
                                  return Transform.rotate(
                                    angle: heading * (math.pi / 180),
                                    child: Stack(
                                      alignment: Alignment.center,
                                      children: [
                                        Icon(
                                          Icons.navigation_rounded,
                                          size: 30,
                                          color: Colors.white,
                                          shadows: [
                                            Shadow(color: Colors.black.withValues(alpha: 0.3), blurRadius: 3, offset: const Offset(0, 1)),
                                          ],
                                        ),
                                        const Icon(Icons.navigation_rounded, size: 23, color: Color(0xFF0F172A)),
                                      ],
                                    ),
                                  );
                                },
                              ),
                            ),
                        ],
                      ),

                      // Required attribution — matches whichever tile
                      // source is actually rendering above (kept minimal,
                      // no flutter_map package branding, small).
                      Align(
                        alignment: Alignment.bottomRight,
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
                          color: const Color(0x99FFFFFF),
                          child: const Text(
                            kIsWeb ? '© OpenStreetMap contributors' : '© OpenFreeMap, OpenMapTiles, OpenStreetMap',
                            style: TextStyle(fontSize: 7, color: Color(0xFF888888)),
                          ),
                        ),
                      ),
                    ],
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
                          : () => ref.read(shiftProvider.notifier).clockOut(),
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
                          : () => _handleClockInVehicleSelection(context),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF2E7D32),
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
