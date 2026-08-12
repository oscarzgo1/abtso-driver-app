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
  
  // Track if clock-out action was initiated by driver client
  bool _isInternalClockOut = false;
  
  // Filter to reject stale active shift stream updates on successful completion
  String? _lastCompletedShiftId;
  List<Map<String, dynamic>> _offlineQueue = [];

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
        distanceFilter: kDebugMode ? 0.0 : 5.0,
        filter: tl.LocationFilter(
          rejectMockLocations: kDebugMode ? false : true,
        ),
      ),
      android: tl.AndroidConfig(
        foregroundService: tl.ForegroundServiceConfig(
          notificationTitle: 'ABTSO Logistics',
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
        distanceFilter: kDebugMode ? 0 : 2, // If debug mode, bypass the 2-meter filter
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
    _gpsPingTimer = Timer.periodic(const Duration(minutes: 2), (_) async {
      final pos = state.currentPosition;
      if (pos != null && state.activeShift != null) {
        debugPrint('Periodic 2-minute GPS Upload tick executing...');
        await _maybeUploadPing(pos);
      }
    });
  }

  void _stopGpsPingTimer() {
    _gpsPingTimer?.cancel();
    _gpsPingTimer = null;
  }

  /// Processes new location updates (calculates distance, updates UI, and manages upload)
  void _handleNewPosition(Position position, {bool forceUpload = false}) {
    // Anti-Spoofing: Block mock coordinates from third-party spoofing apps (Android)
    if (position.isMocked) {
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
   
        if (driverId == null || shiftId == null) return;
   
        final payload = {
          'driver_id': driverId,
          'shift_id': shiftId,
          'latitude': position.latitude,
          'longitude': position.longitude,
          'speed': position.speed,
          'accuracy': position.accuracy,
          'recorded_at': DateTime.now().toUtc().toIso8601String(),
        };

        try {
          await SupabaseService.client.from('gps_locations').insert(payload);
          debugPrint('GPS telemetry uploaded successfully: (${position.latitude}, ${position.longitude})');
          
          // Attempt to sync offline queue if we have cached pings
          if (_offlineQueue.isNotEmpty) {
            _syncOfflineQueue();
          }
        } catch (e) {
          debugPrint('GPS UPLOAD ERROR: $e');
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
            .eq('status', 'active')
            .maybeSingle();
      }

      if (response != null) {
        final activeShift = DriverShift.fromJson(response);
        state = state.copyWith(activeShift: activeShift);
        await _startBackgroundTrackingService(driverId, activeShift.id);
      } else {
        state = state.copyWith(clearActiveShift: true);
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

    if (!state.isNearDepot) {
      final radius = state.nearestDepot?.geofenceRadiusM ?? 15;
      state = state.copyWith(
        isLoading: false,
        errorMessage: 'You must be within ${radius}m of a depot to clock in.',
      );
      return;
    }

    try {
      Map<String, dynamic> result;
      if (SupabaseService.isMockMode) {
        result = await SupabaseService.mockStartShift(pos.latitude, pos.longitude);
      } else {
        final response = await SupabaseService.client.rpc(
          'start_shift',
          params: {
            'p_latitude': pos.latitude,
            'p_longitude': pos.longitude,
          },
        );
        result = response as Map<String, dynamic>;
      }

      if (result['success'] == true) {
        _lastCompletedShiftId = null;
        _isInternalClockOut = false;
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
      state = state.copyWith(errorMessage: 'Connection error during clock in.');
    } finally {
      state = state.copyWith(isLoading: false);
    }
  }

  /// End current shift (clock-out)
  Future<void> clockOut() async {
    final activeShift = state.activeShift;
    if (activeShift == null) return;

    state = state.copyWith(isLoading: true, clearErrorMessage: true);
    _isInternalClockOut = true; // Set flag to indicate internal clock-out action

    final pos = state.currentPosition;
    if (pos == null) {
      _isInternalClockOut = false;
      state = state.copyWith(
        isLoading: false,
        errorMessage: 'Unable to clock out. GPS location is required.',
      );
      return;
    }

    if (!state.isNearDepot) {
      _isInternalClockOut = false;
      final radius = state.nearestDepot?.geofenceRadiusM ?? 15;
      state = state.copyWith(
        isLoading: false,
        errorMessage: 'You must be within ${radius}m of a depot to clock out.',
      );
      return;
    }

    try {
      Map<String, dynamic> result;
      if (SupabaseService.isMockMode) {
        result = await SupabaseService.mockEndShift(activeShift.id, pos.latitude, pos.longitude);
      } else {
        final response = await SupabaseService.client.rpc(
          'end_shift',
          params: {
            'p_shift_id': activeShift.id,
            'p_latitude': pos.latitude,
            'p_longitude': pos.longitude,
          },
        );
        result = response as Map<String, dynamic>;
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
        _isInternalClockOut = false;
        state = state.copyWith(errorMessage: result['error'] ?? 'Clock out failed');
      }
    } catch (e) {
      _isInternalClockOut = false;
      state = state.copyWith(errorMessage: 'Connection error during clock out.');
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
            (s) => s['status'] == 'active',
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

              if (_isInternalClockOut) {
                debugPrint('Internal clock-out stream ping received. Bypassing logout.');
                _isInternalClockOut = false; // Reset the flag
                
                if (state.isPlaybackRunning) {
                  stopRoutePlayback();
                }
                state = state.copyWith(
                  clearActiveShift: true,
                  lastCompletedShift: completedShift ?? state.lastCompletedShift,
                );
              } else {
                debugPrint('Active shift was terminated by dispatcher. Logging driver out...');
                
                if (state.isPlaybackRunning) {
                  stopRoutePlayback();
                }
                state = state.copyWith(
                  clearActiveShift: true,
                  lastCompletedShift: completedShift ?? state.lastCompletedShift,
                );
                _ref.read(authProvider.notifier).logout();
              }
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
    _lastCompletedShiftId = null;
    _isInternalClockOut = false;
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
    super.dispose();
  }
}

final shiftProvider = StateNotifierProvider<ShiftNotifier, ShiftState>((ref) {
  return ShiftNotifier(ref);
});
