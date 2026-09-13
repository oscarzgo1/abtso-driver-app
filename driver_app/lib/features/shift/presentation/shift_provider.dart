import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import 'package:latlong2/latlong.dart' as latlong;
import 'package:shared_preferences/shared_preferences.dart';
import '../../../core/network/supabase_service.dart';
import '../../../core/services/location_service.dart';
import 'package:tracelet/tracelet.dart' as tl;
import '../../../core/utils/geofence_helper.dart';
import '../data/depot_model.dart';
import '../data/shift_model.dart';
import '../../auth/presentation/auth_provider.dart';

/// A clock-in/clock-out tap made while offline, held locally until it can be
/// sent to the server. Carries only what was actually captured on-device at
/// the moment of the tap (real GPS + real timestamp) — never a fabricated
/// shift id, pay figure, or duration, since those only exist once the server
/// has accepted the action.
class PendingShiftAction {
  final String type; // 'clock_in' or 'clock_out'
  final String? shiftId; // required for clock_out, absent for clock_in
  final double latitude;
  final double longitude;
  final DateTime timestamp;

  const PendingShiftAction({
    required this.type,
    this.shiftId,
    required this.latitude,
    required this.longitude,
    required this.timestamp,
  });

  Map<String, dynamic> toJson() => {
        'type': type,
        'shift_id': shiftId,
        'latitude': latitude,
        'longitude': longitude,
        'timestamp': timestamp.toIso8601String(),
      };

  factory PendingShiftAction.fromJson(Map<String, dynamic> json) => PendingShiftAction(
        type: json['type'] as String,
        shiftId: json['shift_id'] as String?,
        latitude: (json['latitude'] as num).toDouble(),
        longitude: (json['longitude'] as num).toDouble(),
        timestamp: DateTime.parse(json['timestamp'] as String),
      );
}

class ShiftState {
  final List<Depot> depots;
  final bool isLoading;
  final Position? currentPosition;
  final bool isNearDepot;
  final Depot? nearestDepot;
  final double? distanceToNearestDepot;
  final DriverShift? activeShift;
  final DriverShift? lastCompletedShift;
  final String? errorMessage;
  final bool isPlaybackRunning;
  final PendingShiftAction? pendingAction;

  const ShiftState({
    this.depots = const [],
    this.isLoading = false,
    this.currentPosition,
    this.isNearDepot = false,
    this.nearestDepot,
    this.distanceToNearestDepot,
    this.activeShift,
    this.lastCompletedShift,
    this.errorMessage,
    this.isPlaybackRunning = false,
    this.pendingAction,
  });

  ShiftState copyWith({
    List<Depot>? depots,
    bool? isLoading,
    Position? currentPosition,
    bool? isNearDepot,
    Depot? nearestDepot,
    double? distanceToNearestDepot,
    DriverShift? activeShift,
    bool clearActiveShift = false,
    DriverShift? lastCompletedShift,
    bool clearLastCompletedShift = false,
    String? errorMessage,
    bool clearErrorMessage = false,
    bool? isPlaybackRunning,
    PendingShiftAction? pendingAction,
    bool clearPendingAction = false,
  }) {
    return ShiftState(
      depots: depots ?? this.depots,
      isLoading: isLoading ?? this.isLoading,
      currentPosition: currentPosition ?? this.currentPosition,
      isNearDepot: isNearDepot ?? this.isNearDepot,
      nearestDepot: nearestDepot ?? this.nearestDepot,
      distanceToNearestDepot: distanceToNearestDepot ?? this.distanceToNearestDepot,
      activeShift: clearActiveShift ? null : (activeShift ?? this.activeShift),
      lastCompletedShift: clearLastCompletedShift ? null : (lastCompletedShift ?? this.lastCompletedShift),
      errorMessage: clearErrorMessage ? null : (errorMessage ?? this.errorMessage),
      isPlaybackRunning: isPlaybackRunning ?? this.isPlaybackRunning,
      pendingAction: clearPendingAction ? null : (pendingAction ?? this.pendingAction),
    );
  }
}

class ShiftNotifier extends StateNotifier<ShiftState> {
  final Ref _ref;

  ShiftNotifier(this._ref) : super(const ShiftState()) {
    _init();
    
    // Automatically reset state and subscriptions when driver logs out
    _ref.listen<AuthState>(authProvider, (previous, next) {
      if (next.status == AuthStatus.initial) {
        reset();
      }
    });
  }




  
  

  Future<void> _init() async {
    await _loadOfflineQueue();
    await _loadPendingAction();
    await fetchDepots();
    await loadActiveShift();

    final driverId = SupabaseService.currentDriverId;
    if (driverId != null) {
      startRealtimeShiftListener(driverId);
    }

    // Start listening to live location updates
    startRealtimeLocationListener();
  }

  StreamSubscription<Position>? _positionSubscription;
  StreamSubscription<tl.Location>? _traceletSubscription;
  DateTime? _lastUploadTime;
  
  // Filter to reject stale active shift stream updates on successful completion
  String? _lastCompletedShiftId;
  List<Map<String, dynamic>> _offlineQueue = [];
  Timer? _pendingActionRetryTimer;
  bool _isFlushingPendingAction = false;

  // Simulation Route Playback attributes
  Timer? _playbackTimer;
  int _playbackIndex = 0;
  bool _playbackForward = true;

  // Intermediate GPS coordinates on HGV route between depots
  static const List<latlong.LatLng> routeWaypoints = [
    latlong.LatLng(53.481798, -1.086552), // Rossington Depot Base A
    latlong.LatLng(53.4920, -1.0810),
    latlong.LatLng(53.5020, -1.0750),
    latlong.LatLng(53.5120, -1.0710),
    latlong.LatLng(53.5220, -1.0730),
    latlong.LatLng(53.5320, -1.0770),
    latlong.LatLng(53.5420, -1.0840),
    latlong.LatLng(53.550248, -1.091061), // Wheatley Depot Base B
  ];

  /// Load initial data: depots, active shift, and start real-time updates
  Future<void> initialize() async {
    state = state.copyWith(isLoading: true, clearErrorMessage: true);
    try {
      await _loadOfflineQueue();
      await _loadPendingAction();
      await fetchDepots();
      await loadActiveShift();

      final driverId = SupabaseService.currentDriverId;
      if (driverId != null) {
        startRealtimeShiftListener(driverId);
      }

      // Start real-time position tracking immediately (clocked in or out)
      await startRealtimeLocationListener();
    } catch (e) {
      state = state.copyWith(errorMessage: 'Failed to initialize shift manager');
    } finally {
      state = state.copyWith(isLoading: false);
    }
  }

  Future<void> _startBackgroundTrackingService(String driverId, String shiftId) async {
    _positionSubscription?.cancel();
    _positionSubscription = null;

    if (kIsWeb) return;

    await tl.Tracelet.ready(const tl.Config(
      app: tl.AppConfig(
        stopOnTerminate: false,
        startOnBoot: true,
      ),
      geo: tl.GeoConfig(
        desiredAccuracy: tl.DesiredAccuracy.high,
        distanceFilter: 0.0, // Force 0.0 distance filter so OS delivers location updates continuously when stationary
        filter: tl.LocationFilter(
          rejectMockLocations: kDebugMode ? false : true,
        ),
      ),
      android: tl.AndroidConfig(
        foregroundService: tl.ForegroundServiceConfig(
          notificationTitle: 'Tachyo',
          notificationText: 'Shift active. Tracking location in background.',
        ),
      ),
    ));

    _traceletSubscription?.cancel();
    _traceletSubscription = tl.Tracelet.onLocation((tl.Location location) {
      final position = Position(
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        timestamp: DateTime.tryParse(location.timestamp) ?? DateTime.now(),
        accuracy: location.coords.accuracy,
        altitude: location.coords.altitude,
        altitudeAccuracy: location.coords.altitudeAccuracy,
        heading: location.coords.heading,
        headingAccuracy: location.coords.headingAccuracy,
        speed: location.coords.speed,
        speedAccuracy: location.coords.speedAccuracy,
        isMocked: location.isMock,
      );
      _handleNewPosition(position);
    });

    await tl.Tracelet.start();
  }

  Future<void> _stopBackgroundTrackingService() async {
    _traceletSubscription?.cancel();
    _traceletSubscription = null;

    if (!kIsWeb) {
      await tl.Tracelet.stop();
    }

    await startRealtimeLocationListener();
  }

  /// Listen to GPS changes in real-time. Updates the map and proximity instantly.
  Future<void> startRealtimeLocationListener() async {
    _positionSubscription?.cancel();
    _traceletSubscription?.cancel();
    _traceletSubscription = null;

    final hasPermission = await LocationService.handlePermission();
    if (!hasPermission) {
      state = state.copyWith(
        errorMessage: 'Location permission denied. Please allow GPS access.',
      );
      return;
    }

    final driverId = SupabaseService.currentDriverId;
    if (state.activeShift != null && driverId != null) {
      if (!kIsWeb) {
        await _startBackgroundTrackingService(driverId, state.activeShift!.id);
        return; // Only return early on mobile where Tracelet handles it.
      }
    }

    // Set up real-time updates
    _positionSubscription = Geolocator.getPositionStream(
      locationSettings: const LocationSettings(
        accuracy: LocationAccuracy.high,
        distanceFilter: 0, // Force 0-meter filter to ensure continuous stationary updates
      ),
    ).listen(
      (Position position) {
        _handleNewPosition(position);
      },
      onError: (err) {
        state = state.copyWith(
          errorMessage: 'GPS Stream Error: Check your device settings.',
        );
      },
    );

    final initialPos = await Geolocator.getCurrentPosition();
    _handleNewPosition(initialPos);
  }

  Timer? _gpsPingTimer;

  void _startGpsPingTimer() {
    _gpsPingTimer?.cancel();
    debugPrint('📡 Starting periodic 2-minute GPS Upload timer...');
    _gpsPingTimer = Timer.periodic(const Duration(minutes: 2), (_) async {
      Position? pos = state.currentPosition;
      if (pos == null) {
        try {
          final p = await Geolocator.getCurrentPosition();
          pos = p;
          state = state.copyWith(currentPosition: p);
        } catch (_) {}
      }
      if (pos != null && state.activeShift != null) {
        debugPrint('⏰ Periodic 2-minute GPS Upload tick executing...');
        await _maybeUploadPing(pos, forceUpload: true);
      } else {
        debugPrint('⏰ GPS Ping tick skipped: pos=${pos != null}, activeShift=${state.activeShift?.id}');
      }
    });
  }

  void _stopGpsPingTimer() {
    _gpsPingTimer?.cancel();
    _gpsPingTimer = null;
  }

  /// Processes new location updates (calculates distance, updates UI, and manages upload)
  void _handleNewPosition(Position position, {bool forceUpload = false}) {
    // Anti-Spoofing: Block mock coordinates from third-party spoofing apps on mobile release builds only.
    // Allow mock locations in Web, Debug mode, or simulation route playback.
    if (position.isMocked && !kDebugMode && !kIsWeb && !state.isPlaybackRunning) {
      state = state.copyWith(
        currentPosition: position,
        isNearDepot: false,
        nearestDepot: null,
        distanceToNearestDepot: null,
        errorMessage: 'SECURITY WARNING: Spoofing detected! Action blocked.',
      );
      return;
    }
    // GPS Accuracy Guard: Discard very low-accuracy readings (error margin > 50m) to prevent extreme drift
    // Note: 50m threshold allows indoor use while still blocking GPS noise
    if (position.accuracy > 50.0) {
      state = state.copyWith(
        currentPosition: position,
        isNearDepot: false,
        nearestDepot: null,
        distanceToNearestDepot: null,
        errorMessage: 'GPS Signal weak (±${position.accuracy.toStringAsFixed(0)}m). Move to an open area to improve signal.',
      );
      return;
    }

    Depot? nearest;
    double? minDistance;

    if (state.depots.isNotEmpty) {
      double min = double.infinity;
      for (final depot in state.depots) {
        final dist = GeofenceHelper.calculateDistance(
          position.latitude,
          position.longitude,
          depot.latitude,
          depot.longitude,
        );
        if (dist < min) {
          min = dist;
          nearest = depot;
        }
      }
      minDistance = min;
    }

    final isNear = nearest != null && minDistance != null && minDistance <= nearest.geofenceRadiusM;

    state = state.copyWith(
      currentPosition: position,
      nearestDepot: nearest,
      distanceToNearestDepot: minDistance,
      isNearDepot: isNear,
      clearErrorMessage: true,
    );

    // If clocked in, check if we need to upload the ping to Supabase (limit to every 2 minutes)
    if (state.activeShift != null) {
      _maybeUploadPing(position, forceUpload: forceUpload);
    }
  }

  Future<void> _loadOfflineQueue() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final dataStr = prefs.getString('offline_gps_queue');
      if (dataStr != null) {
        final decoded = jsonDecode(dataStr) as List<dynamic>;
        _offlineQueue = decoded.map((item) => Map<String, dynamic>.from(item)).toList();
        debugPrint('Loaded ${_offlineQueue.length} offline cached GPS coordinates.');
      }
    } catch (e) {
      debugPrint('Error loading offline queue: $e');
    }
  }

  Future<void> _saveOfflineQueue() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('offline_gps_queue', jsonEncode(_offlineQueue));
    } catch (e) {
      debugPrint('Error saving offline queue: $e');
    }
  }

  Future<void> _syncOfflineQueue() async {
    if (_offlineQueue.isEmpty) return;
    final toSync = List<Map<String, dynamic>>.from(_offlineQueue);
    _offlineQueue.clear();
    await _saveOfflineQueue();

    debugPrint('Synchronizing ${toSync.length} offline cached coordinates...');
    
    List<Map<String, dynamic>> failed = [];
    for (final payload in toSync) {
      try {
        await SupabaseService.client.from('gps_locations').insert(payload);
      } catch (e) {
        debugPrint('Failed to sync coordinate: $e');
        failed.add(payload);
      }
    }

    if (failed.isNotEmpty) {
      _offlineQueue.addAll(failed);
      await _saveOfflineQueue();
      debugPrint('Re-cached ${failed.length} failed coordinates.');
    } else {
      debugPrint('Offline telemetry cache fully synchronized.');
    }
  }

  Future<void> _loadPendingAction() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final dataStr = prefs.getString('pending_shift_action');
      if (dataStr != null) {
        final action = PendingShiftAction.fromJson(jsonDecode(dataStr) as Map<String, dynamic>);
        state = state.copyWith(pendingAction: action);
        debugPrint('Restored offline ${action.type} awaiting sync (captured ${action.timestamp}).');
        _startPendingActionRetryTimer();
      }
    } catch (e) {
      debugPrint('Error loading pending shift action: $e');
    }
  }

  Future<void> _savePendingAction(PendingShiftAction? action) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      if (action == null) {
        await prefs.remove('pending_shift_action');
      } else {
        await prefs.setString('pending_shift_action', jsonEncode(action.toJson()));
      }
    } catch (e) {
      debugPrint('Error saving pending shift action: $e');
    }
  }

  void _startPendingActionRetryTimer() {
    _pendingActionRetryTimer?.cancel();
    _pendingActionRetryTimer = Timer.periodic(const Duration(seconds: 30), (_) => _flushPendingAction());
  }

  void _stopPendingActionRetryTimer() {
    _pendingActionRetryTimer?.cancel();
    _pendingActionRetryTimer = null;
  }

  /// Queues a clock-in/out tap that couldn't reach the server, so a driver
  /// out of signal isn't blocked from recording it. Only the GPS/timestamp
  /// captured at the moment of the tap is kept — no shift id, duration, or
  /// pay is invented, since those don't exist until the server accepts it.
  Future<void> _queuePendingAction(PendingShiftAction action) async {
    state = state.copyWith(pendingAction: action, clearErrorMessage: true);
    await _savePendingAction(action);
    _startPendingActionRetryTimer();
    debugPrint('Queued offline ${action.type} for later sync.');
  }

  /// Retries a queued clock-in/out against the server. Safe to call
  /// speculatively (periodic timer, app resume, after a successful GPS
  /// upload) — it's a no-op if there's nothing pending or another attempt
  /// is already in flight, and it re-throws nothing: a failed attempt just
  /// leaves the action queued for the next retry.
  Future<void> _flushPendingAction() async {
    final pending = state.pendingAction;
    if (pending == null || SupabaseService.isMockMode || _isFlushingPendingAction) return;
    _isFlushingPendingAction = true;

    try {
      if (pending.type == 'clock_in') {
        Map<String, dynamic> result;
        try {
          final response = await SupabaseService.client.rpc('start_shift', params: {
            'p_latitude': pending.latitude,
            'p_longitude': pending.longitude,
          });
          result = response as Map<String, dynamic>;
        } catch (_) {
          result = {'success': false, 'error': 'RPC error'};
        }

        if (result['success'] != true) {
          final driverId = SupabaseService.currentDriverId;
          if (driverId == null) return; // Not logged in — retry once a session exists again.
          await SupabaseService.client.from('shifts').insert({
            'driver_id': driverId,
            'start_time': pending.timestamp.toUtc().toIso8601String(),
            'start_lat': pending.latitude,
            'start_lng': pending.longitude,
            'status': 'active',
          });
        }

        state = state.copyWith(clearPendingAction: true);
        await _savePendingAction(null);
        _stopPendingActionRetryTimer();
        debugPrint('✅ Offline clock-in synced successfully.');
        await loadActiveShift();
      } else if (pending.type == 'clock_out') {
        if (pending.shiftId == null) {
          // Nothing was ever confirmed server-side to close out — drop it.
          state = state.copyWith(clearPendingAction: true);
          await _savePendingAction(null);
          _stopPendingActionRetryTimer();
          return;
        }

        Map<String, dynamic> result;
        try {
          final response = await SupabaseService.client.rpc('end_shift', params: {
            'p_shift_id': pending.shiftId,
            'p_latitude': pending.latitude,
            'p_longitude': pending.longitude,
          });
          result = response as Map<String, dynamic>;
        } catch (_) {
          result = {'success': false, 'error': 'RPC error'};
        }

        if (result['success'] != true) {
          await SupabaseService.client.from('shifts').update({
            'end_time': pending.timestamp.toUtc().toIso8601String(),
            'end_lat': pending.latitude,
            'end_lng': pending.longitude,
            'status': 'completed',
          }).eq('id', pending.shiftId!);
        }

        state = state.copyWith(clearPendingAction: true);
        await _savePendingAction(null);
        _stopPendingActionRetryTimer();
        debugPrint('✅ Offline clock-out synced successfully.');
        await _stopBackgroundTrackingService();
        _stopGpsPingTimer();
        await loadActiveShift();
      }
    } catch (e) {
      debugPrint('Pending shift action still cannot reach the server, will retry: $e');
    } finally {
      _isFlushingPendingAction = false;
    }
  }

  /// Handles upload of background coordinates every 2 minutes
  Future<void> _maybeUploadPing(Position position, {bool forceUpload = false}) async {
    try {
      final now = DateTime.now();
      final isPlayback = state.isPlaybackRunning;

      final bool shouldUpload;
      if (forceUpload || kDebugMode || isPlayback) {
        shouldUpload = true;
      } else {
        shouldUpload = _lastUploadTime == null || now.difference(_lastUploadTime!) >= const Duration(minutes: 2);
      }

      if (shouldUpload) {
        if (!isPlayback) {
          _lastUploadTime = now;
        }
        final driverId = SupabaseService.currentDriverId;
        final shiftId = state.activeShift?.id;
   
        if (driverId == null || shiftId == null) {
          debugPrint('⚠️ GPS upload skipped: driverId=$driverId, shiftId=$shiftId');
          return;
        }
   
        final payload = {
          'driver_id': driverId,
          'shift_id': shiftId,
          'latitude': position.latitude,
          'longitude': position.longitude,
          'speed': position.speed < 0 ? 0.0 : position.speed,
          'accuracy': position.accuracy,
          'recorded_at': DateTime.now().toUtc().toIso8601String(),
        };

        debugPrint('🚀 Sending GPS payload to Supabase: $payload');
        try {
          await SupabaseService.client.from('gps_locations').insert(payload);
          debugPrint('✅ GPS telemetry uploaded successfully: (${position.latitude}, ${position.longitude}) for shift $shiftId');
          
          // Attempt to sync offline queue if we have cached pings
          if (_offlineQueue.isNotEmpty) {
            _syncOfflineQueue();
          }
          // A successful upload is proof connectivity is back — retry any
          // queued clock-out immediately rather than waiting on the timer.
          if (state.pendingAction != null) {
            _flushPendingAction();
          }
        } catch (e) {
          debugPrint('❌ GPS UPLOAD ERROR: $e');
          debugPrint('GPS Upload failed: $e. Caching coordinate offline.');
          _offlineQueue.add(payload);
          _saveOfflineQueue();
        }
      }
    } catch (outerErr) {
      debugPrint('Safety guard caught exception in _maybeUploadPing: $outerErr');
    }
  }

  /// Fetch depots from database
  Future<void> fetchDepots() async {
    try {
      List<dynamic> response;
      if (SupabaseService.isMockMode) {
        response = await SupabaseService.fetchMockDepots();
      } else {
        response = await SupabaseService.client.from('depots').select();
      }
      
      final depotsList = response
          .map((data) => Depot.fromJson(data as Map<String, dynamic>))
          .toList();
      
      state = state.copyWith(depots: depotsList);
    } catch (e) {
      state = state.copyWith(errorMessage: 'Could not fetch depots from server');
    }
  }

  /// Check active shift for current authenticated driver
  Future<void> loadActiveShift() async {
    final driverId = SupabaseService.currentDriverId;
    if (driverId == null) return;

    try {
      Map<String, dynamic>? response;
      if (SupabaseService.isMockMode) {
        response = await SupabaseService.fetchMockActiveShift();
      } else {
        response = await SupabaseService.client
            .from('shifts')
            .select()
            .eq('driver_id', driverId)
            .or('status.eq.active,status.eq.in_progress,end_time.is.null')
            .order('start_time', ascending: false)
            .limit(1)
            .maybeSingle();
      }

      if (response != null && response['status'] != 'completed' && response['end_time'] == null) {
        final activeShift = DriverShift.fromJson(response);
        state = state.copyWith(activeShift: activeShift);
        await _startBackgroundTrackingService(driverId, activeShift.id);
        _startGpsPingTimer();

        // Also trigger immediate GPS upload for loaded active shift
        final pos = state.currentPosition;
        if (pos != null) {
          _maybeUploadPing(pos, forceUpload: true);
        } else {
          Geolocator.getCurrentPosition().then((p) {
            state = state.copyWith(currentPosition: p);
            _maybeUploadPing(p, forceUpload: true);
          }).catchError((_) {});
        }
      } else {
        state = state.copyWith(clearActiveShift: true);
        _stopGpsPingTimer();
      }
    } catch (e) {
      state = state.copyWith(errorMessage: 'Could not load active shift state');
    }
  }

  /// Start a new shift (clock-in)
  Future<void> clockIn() async {
    state = state.copyWith(isLoading: true, clearErrorMessage: true);

    final pos = state.currentPosition;
    if (pos == null) {
      state = state.copyWith(
        isLoading: false,
        errorMessage: 'Unable to clock in. GPS location is required.',
      );
      return;
    }

    try {
      Map<String, dynamic> result;
      if (SupabaseService.isMockMode) {
        result = await SupabaseService.mockStartShift(pos.latitude, pos.longitude);
      } else {
        try {
          final response = await SupabaseService.client.rpc(
            'start_shift',
            params: {
              'p_latitude': pos.latitude,
              'p_longitude': pos.longitude,
            },
          );
          result = response as Map<String, dynamic>;
        } catch (_) {
          result = {'success': false, 'error': 'RPC error'};
        }

        // Direct insert fallback if geofence was rejected by old SQL RPC
        if (result['success'] != true) {
          final driverId = SupabaseService.currentDriverId;
          if (driverId != null) {
            final nearestDepotId = state.nearestDepot?.id;
            final insertData = <String, dynamic>{
              'driver_id': driverId,
              'start_time': DateTime.now().toUtc().toIso8601String(),
              'start_lat': pos.latitude,
              'start_lng': pos.longitude,
              'status': 'active',
            };
            if (nearestDepotId != null) {
              insertData['depot_id'] = nearestDepotId;
            }
            final res = await SupabaseService.client
                .from('shifts')
                .insert(insertData)
                .select()
                .single();
            result = {'success': true, 'shift_id': res['id']};
          }
        }
      }

      if (result['success'] == true) {
        _lastCompletedShiftId = null;
        await loadActiveShift();

        // Capture IDs immediately after loadActiveShift — do NOT rely on state later
        final driverId = SupabaseService.currentDriverId;
        final shiftId = state.activeShift?.id ?? result['shift_id'] as String?;

        if (driverId != null && shiftId != null) {
          // FIX SP-6: Direct insert at clock-in bypasses all state race conditions.
          // This guarantees at least one GPS record exists the moment the shift starts.
          if (!SupabaseService.isMockMode) {
            try {
              await SupabaseService.client.from('gps_locations').insert({
                'driver_id': driverId,
                'shift_id': shiftId,
                'latitude': pos.latitude,
                'longitude': pos.longitude,
                'speed': pos.speed < 0 ? 0.0 : pos.speed,
                'accuracy': pos.accuracy,
                'recorded_at': DateTime.now().toUtc().toIso8601String(),
              });
              debugPrint('✅ Clock-in GPS ping inserted directly: ($shiftId)');
            } catch (gpsErr) {
              debugPrint('⚠️ Clock-in GPS direct insert failed (will retry via ping timer): $gpsErr');
            }
          }

          await _startBackgroundTrackingService(driverId, shiftId);
        }

        _lastUploadTime = null;
        _startGpsPingTimer();
      } else {
        state = state.copyWith(errorMessage: result['error'] ?? 'Clock in failed');
      }
    } catch (e) {
      // Couldn't reach the server at all — likely a driver out of signal.
      // Queue the tap locally (with the real GPS/time already captured
      // above) instead of just failing; it's retried automatically once
      // connectivity returns.
      if (!SupabaseService.isMockMode) {
        await _queuePendingAction(PendingShiftAction(
          type: 'clock_in',
          latitude: pos.latitude,
          longitude: pos.longitude,
          timestamp: DateTime.now(),
        ));
      } else {
        state = state.copyWith(errorMessage: 'Connection error during clock in.');
      }
    } finally {
      state = state.copyWith(isLoading: false);
    }
  }

  /// End current shift (clock-out)
  Future<void> clockOut() async {
    final activeShift = state.activeShift;
    if (activeShift == null) return;

    state = state.copyWith(isLoading: true, clearErrorMessage: true);

    final pos = state.currentPosition;
    if (pos == null) {
      state = state.copyWith(
        isLoading: false,
        errorMessage: 'Unable to clock out. GPS location is required.',
      );
      return;
    }

    try {
      Map<String, dynamic> result;
      if (SupabaseService.isMockMode) {
        result = await SupabaseService.mockEndShift(activeShift.id, pos.latitude, pos.longitude);
      } else {
        try {
          final response = await SupabaseService.client.rpc(
            'end_shift',
            params: {
              'p_shift_id': activeShift.id,
              'p_latitude': pos.latitude,
              'p_longitude': pos.longitude,
            },
          );
          result = response as Map<String, dynamic>;
        } catch (_) {
          result = {'success': false, 'error': 'RPC error'};
        }

        // Direct update fallback if geofence was rejected by old SQL RPC
        if (result['success'] != true) {
          final res = await SupabaseService.client
              .from('shifts')
              .update({
                'end_time': DateTime.now().toUtc().toIso8601String(),
                'end_lat': pos.latitude,
                'end_lng': pos.longitude,
                'status': 'completed',
              })
              .eq('id', activeShift.id)
              .select()
              .single();
          result = {'success': true, 'shift': res};
        }
      }

      if (result['success'] == true) {
        final completedShift = DriverShift(
          id: activeShift.id,
          driverId: activeShift.driverId,
          depotId: activeShift.depotId,
          startTime: activeShift.startTime,
          endTime: DateTime.now(),
          status: 'completed',
          totalHours: (result['total_hours'] as num?)?.toDouble(),
          effectiveRate: (result['effective_rate'] as num?)?.toDouble(),
          totalPay: (result['total_pay'] as num?)?.toDouble(),
          nightOutStatus: (result['night_out_status'] as String?) ?? activeShift.nightOutStatus,
          nightOutAmount: (result['night_out_amount'] as num?)?.toDouble() ?? activeShift.nightOutAmount,
          overrideRate: result['override_applied'] == true ? 18.00 : null,
        );
        
        _lastCompletedShiftId = activeShift.id; // Mark shift ID as completed to ignore stale stream frames
        
        state = state.copyWith(
          clearActiveShift: true,
          lastCompletedShift: completedShift,
        );
        await _stopBackgroundTrackingService();
        _stopGpsPingTimer();
      } else {
        state = state.copyWith(errorMessage: result['error'] ?? 'Clock out failed');
      }
    } catch (e) {
      // Same offline handling as clock-in — this time the shift being
      // ended is already real and confirmed, so the active-shift panel
      // stays exactly as it is; only the clock-out tap itself is queued.
      if (!SupabaseService.isMockMode) {
        await _queuePendingAction(PendingShiftAction(
          type: 'clock_out',
          shiftId: activeShift.id,
          latitude: pos.latitude,
          longitude: pos.longitude,
          timestamp: DateTime.now(),
        ));
      } else {
        state = state.copyWith(errorMessage: 'Connection error during clock out.');
      }
    } finally {
      state = state.copyWith(isLoading: false);
    }
  }

  /// Driver requests Night Out during an active shift
  Future<bool> requestNightOut() async {
    final activeShift = state.activeShift;
    if (activeShift == null || activeShift.status != 'active') {
      state = state.copyWith(errorMessage: 'Night Out can only be requested during an active shift.');
      return false;
    }

    state = state.copyWith(isLoading: true, clearErrorMessage: true);
    try {
      if (SupabaseService.isMockMode) {
        final updatedShift = DriverShift(
          id: activeShift.id,
          driverId: activeShift.driverId,
          depotId: activeShift.depotId,
          startTime: activeShift.startTime,
          endTime: activeShift.endTime,
          status: activeShift.status,
          dayType: activeShift.dayType,
          baseHourlyRate: activeShift.baseHourlyRate,
          overrideRate: activeShift.overrideRate,
          effectiveRate: activeShift.effectiveRate,
          totalHours: activeShift.totalHours,
          totalPay: activeShift.totalPay,
          weekNumber: activeShift.weekNumber,
          weekYear: activeShift.weekYear,
          nightOutStatus: 'pending',
          nightOutAmount: activeShift.nightOutAmount,
        );
        state = state.copyWith(activeShift: updatedShift);
        return true;
      }

      // 1. Direct table update on shifts row
      await SupabaseService.client
          .from('shifts')
          .update({'night_out_status': 'pending'})
          .eq('id', activeShift.id);

      // 2. RPC call (optional)
      try {
        await SupabaseService.client.rpc(
          'request_night_out',
          params: {'p_shift_id': activeShift.id},
        );
      } catch (_) {}

      final updatedShift = DriverShift(
        id: activeShift.id,
        driverId: activeShift.driverId,
        depotId: activeShift.depotId,
        startTime: activeShift.startTime,
        endTime: activeShift.endTime,
        status: activeShift.status,
        dayType: activeShift.dayType,
        baseHourlyRate: activeShift.baseHourlyRate,
        overrideRate: activeShift.overrideRate,
        effectiveRate: activeShift.effectiveRate,
        totalHours: activeShift.totalHours,
        totalPay: activeShift.totalPay,
        weekNumber: activeShift.weekNumber,
        weekYear: activeShift.weekYear,
        nightOutStatus: 'pending',
        nightOutAmount: activeShift.nightOutAmount,
      );
      state = state.copyWith(activeShift: updatedShift);
      return true;
    } catch (e) {
      debugPrint('Error requesting Night Out: $e');
      state = state.copyWith(errorMessage: 'Connection error while requesting Night Out.');
      return false;
    } finally {
      state = state.copyWith(isLoading: false);
    }
  }

  void clearCompletedShift() {
    state = state.copyWith(clearLastCompletedShift: true);
  }

  void clearError() {
    state = state.copyWith(clearErrorMessage: true);
  }

  /// Manually inject a mock position for local testing
  void mockLocation(double lat, double lng) {


    if (state.isPlaybackRunning) {
      stopRoutePlayback();
    }

    // Cancel live GPS stream and background service so they don't overwrite our mock coordinate
    _positionSubscription?.cancel();
    _positionSubscription = null;
    _traceletSubscription?.cancel();
    _traceletSubscription = null;
    if (!kIsWeb) {
      tl.Tracelet.stop();
    }

    final mockPos = Position(
      latitude: lat,
      longitude: lng,
      timestamp: DateTime.now(),
      accuracy: 5.0,
      altitude: 0.0,
      altitudeAccuracy: 0.0,
      heading: 0.0,
      headingAccuracy: 0.0,
      speed: 0.0,
      speedAccuracy: 0.0,
    );

    _handleNewPosition(mockPos, forceUpload: true);
  }

  /// Start automatic route playback simulation
  void startRoutePlayback() {
    if (state.isPlaybackRunning) return;

    state = state.copyWith(isPlaybackRunning: true, clearErrorMessage: true);

    // Cancel live subscription so it doesn't interfere
    _positionSubscription?.cancel();
    _positionSubscription = null;
    _traceletSubscription?.cancel();
    _traceletSubscription = null;
    if (!kIsWeb) {
      tl.Tracelet.stop();
    }

    _playbackTimer?.cancel();
    _playbackTimer = Timer.periodic(const Duration(seconds: 4), (timer) {
      if (_playbackForward) {
        _playbackIndex++;
        if (_playbackIndex >= routeWaypoints.length) {
          _playbackIndex = routeWaypoints.length - 1;
          _playbackForward = false;
        }
      } else {
        _playbackIndex--;
        if (_playbackIndex < 0) {
          _playbackIndex = 0;
          _playbackForward = true;
        }
      }

      _injectWaypointAt(_playbackIndex);
    });

    // Run first position injection instantly
    _injectWaypointAt(_playbackIndex);
  }

  /// Stop automatic route playback simulation
  void stopRoutePlayback() {
    if (!state.isPlaybackRunning) return;

    _playbackTimer?.cancel();
    _playbackTimer = null;
    state = state.copyWith(isPlaybackRunning: false);

    // Resume live GPS updates (automatically starts background service if active shift exists)
    startRealtimeLocationListener();
  }

  void _injectWaypointAt(int index) {
    final point = routeWaypoints[index];
    final mockPos = Position(
      latitude: point.latitude,
      longitude: point.longitude,
      timestamp: DateTime.now(),
      accuracy: 5.0,
      altitude: 0.0,
      altitudeAccuracy: 0.0,
      heading: 0.0,
      headingAccuracy: 0.0,
      speed: 18.78, // ~42 mph (makes the driver status appear "moving" in admin dashboard)
      speedAccuracy: 0.0,
    );
    _handleNewPosition(mockPos, forceUpload: true);
  }

  StreamSubscription<List<Map<String, dynamic>>>? _shiftRealtimeSubscription;

  void startRealtimeShiftListener(String driverId) {
    _shiftRealtimeSubscription?.cancel();
    
    debugPrint('SUBSCRIBING TO REALTIME SHIFTS FOR DRIVER: $driverId');
    
    _shiftRealtimeSubscription = SupabaseService.client
        .from('shifts')
        .stream(primaryKey: ['id'])
        .eq('driver_id', driverId)
        .listen((List<Map<String, dynamic>> shiftsList) {
          debugPrint('REALTIME SHIFTS RECEIVED: ${shiftsList.length} rows');
          
          final activeShiftMap = shiftsList.firstWhere(
            (s) => (s['status'] == 'active' || s['status'] == 'in_progress') && s['end_time'] == null,
            orElse: () => <String, dynamic>{},
          );

          if (activeShiftMap.isEmpty) {
            if (state.activeShift != null) {
              final oldActiveShiftId = state.activeShift!.id;
              final completedShiftMap = shiftsList.firstWhere(
                (s) => s['id'] == oldActiveShiftId && s['status'] == 'completed',
                orElse: () => <String, dynamic>{},
              );
              DriverShift? completedShift;
              if (completedShiftMap.isNotEmpty) {
                completedShift = DriverShift.fromJson(completedShiftMap);
              }

              debugPrint('Shift ended (clocked out or closed by dispatcher). Resetting active shift while maintaining persistent auth session.');
              if (state.isPlaybackRunning) {
                stopRoutePlayback();
              }
              state = state.copyWith(
                clearActiveShift: true,
                lastCompletedShift: completedShift ?? state.lastCompletedShift,
              );
              _stopGpsPingTimer();
            }
          } else {
            final activeShift = DriverShift.fromJson(activeShiftMap);
            debugPrint('Active shift found: ${activeShift.id}, Status: ${activeShift.status}');
            
            // Check if this is a stale active shift event (already completed locally)
            if (activeShift.id == _lastCompletedShiftId) {
              debugPrint('Stale active shift stream event received for completed shift ${activeShift.id}. Ignoring.');
              if (state.activeShift != null) {
                state = state.copyWith(clearActiveShift: true);
              }
              return;
            }

            if (state.activeShift?.id != activeShift.id ||
                state.activeShift?.nightOutStatus != activeShift.nightOutStatus ||
                state.activeShift?.nightOutAmount != activeShift.nightOutAmount) {
              debugPrint('Active shift or Night Out status updated: ${activeShift.nightOutStatus}');
              state = state.copyWith(activeShift: activeShift);
              _startGpsPingTimer();
              
              final pos = state.currentPosition;
              if (pos != null) {
                _maybeUploadPing(pos, forceUpload: true);
              }
            }
          }
        }, onError: (error, stackTrace) {
          debugPrint('REALTIME SHIFTS STREAM ERROR: $error');
          debugPrint('$stackTrace');
        });
  }

  /// Send immediate SOS emergency alert to database/dispatch
  Future<bool> sendSOSAlert() async {
    final driverId = SupabaseService.currentDriverId;
    final shiftId = state.activeShift?.id;
    final position = state.currentPosition;

    if (driverId == null || shiftId == null || position == null) {
      debugPrint('SOS failed: Missing driver, active shift, or GPS coordinate');
      return false;
    }

    try {
      if (SupabaseService.isMockMode) {
        debugPrint('MOCK SOS Sent: Lat: ${position.latitude}, Lng: ${position.longitude}');
        return true;
      }

      final payload = {
        'driver_id': driverId,
        'shift_id': shiftId,
        'latitude': position.latitude,
        'longitude': position.longitude,
        'acknowledged': false,
      };

      await SupabaseService.client.from('sos_alerts').insert(payload);
      debugPrint('SOS alert sent successfully!');
      return true;
    } catch (e) {
      debugPrint('Error sending SOS alert: $e');
      return false;
    }
  }

  /// Reset all shift states and cancel active subscriptions on logout
  void reset() {
    _shiftRealtimeSubscription?.cancel();
    _shiftRealtimeSubscription = null;
    _positionSubscription?.cancel();
    _positionSubscription = null;
    _traceletSubscription?.cancel();
    _traceletSubscription = null;
    if (!kIsWeb) {
      tl.Tracelet.stop();
    }
    _playbackTimer?.cancel();
    _playbackTimer = null;
    _pendingActionRetryTimer?.cancel();
    _pendingActionRetryTimer = null;
    _lastCompletedShiftId = null;
    _lastUploadTime = null;
    state = const ShiftState();
    debugPrint('ShiftNotifier state reset completed on logout.');
  }

  @override
  void dispose() {
    _shiftRealtimeSubscription?.cancel();
    _positionSubscription?.cancel();
    _traceletSubscription?.cancel();
    _playbackTimer?.cancel();
    _pendingActionRetryTimer?.cancel();
    super.dispose();
  }
}

final shiftProvider = StateNotifierProvider<ShiftNotifier, ShiftState>((ref) {
  return ShiftNotifier(ref);
});
