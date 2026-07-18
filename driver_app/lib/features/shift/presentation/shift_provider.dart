import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import 'package:latlong2/latlong.dart' as latlong;
import 'package:shared_preferences/shared_preferences.dart';
import '../../../core/network/supabase_service.dart';
import '../../../core/services/location_service.dart';
import 'package:flutter_background_service/flutter_background_service.dart';
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
  StreamSubscription? _backgroundSubscription;
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

    final service = FlutterBackgroundService();
    final isRunning = await service.isRunning();
    if (!isRunning) {
      await service.startService();
    }

    const url = String.fromEnvironment('SUPABASE_URL',
        defaultValue: 'https://imfgzhxdzxkifuncowrl.supabase.co');
    const anonKey = String.fromEnvironment('SUPABASE_ANON_KEY',
        defaultValue: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImltZmd6aHhkenhraWZ1bmNvd3JsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM1MDI5NzUsImV4cCI6MjA5OTA3ODk3NX0.AmQesj8ZH2vB6hsQ2dYi3sgiHEWK3kuNc6IWSUitt5M');

    service.invoke('startTracking', {
      'driverId': driverId,
      'shiftId': shiftId,
      'supabaseUrl': url,
      'supabaseAnonKey': anonKey,
      'isMockMode': SupabaseService.isMockMode,
    });

    _backgroundSubscription?.cancel();
    _backgroundSubscription = service.on('locationUpdated').listen((event) {
      if (event != null) {
        final position = Position(
          latitude: event['latitude'],
          longitude: event['longitude'],
          timestamp: DateTime.parse(event['timestamp']),
          accuracy: event['accuracy'],
          altitude: event['altitude'] ?? 0.0,
          altitudeAccuracy: 0.0,
          heading: event['heading'] ?? 0.0,
          headingAccuracy: 0.0,
          speed: event['speed'] ?? 0.0,
          speedAccuracy: 0.0,
          isMocked: event['isMocked'] ?? false,
        );
        _handleNewPosition(position);
      }
    });
  }

  Future<void> _stopBackgroundTrackingService() async {
    _backgroundSubscription?.cancel();
    _backgroundSubscription = null;

    final service = FlutterBackgroundService();
    service.invoke('stopService');

    await startRealtimeLocationListener();
  }

  /// Listen to GPS changes in real-time. Updates the map and proximity instantly.
  Future<void> startRealtimeLocationListener() async {
    _positionSubscription?.cancel();
    _backgroundSubscription?.cancel();
    _backgroundSubscription = null;

    final hasPermission = await LocationService.handlePermission();
    if (!hasPermission) {
      state = state.copyWith(
        errorMessage: 'Location permission denied. Please allow GPS access.',
      );
      return;
    }

    final driverId = SupabaseService.currentDriverId;
    if (state.activeShift != null && driverId != null) {
      await _startBackgroundTrackingService(driverId, state.activeShift!.id);
      return;
    }

    // Set up real-time updates
    _positionSubscription = Geolocator.getPositionStream(
      locationSettings: const LocationSettings(
        accuracy: LocationAccuracy.high,
        distanceFilter: 2, // Trigger on 2 meters change (perfect for testing)
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

  /// Processes new location updates (calculates distance, updates UI, and manages upload)
  void _handleNewPosition(Position position) {
    if (state.depots.isEmpty) return;

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
    // GPS Accuracy Guard: Discard low-accuracy readings (error margin > 15m) to prevent coordinate drift bypasses
    if (position.accuracy > 15.0) {
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
    double minDistance = double.infinity;

    for (final depot in state.depots) {
      final dist = GeofenceHelper.calculateDistance(
        position.latitude,
        position.longitude,
        depot.latitude,
        depot.longitude,
      );
      if (dist < minDistance) {
        minDistance = dist;
        nearest = depot;
      }
    }

    final isNear = nearest != null && minDistance <= nearest.geofenceRadiusM;

    state = state.copyWith(
      currentPosition: position,
      nearestDepot: nearest,
      distanceToNearestDepot: nearest != null ? minDistance : null,
      isNearDepot: isNear,
      clearErrorMessage: true,
    );

    // If clocked in, check if we need to upload the ping to Supabase (limit to every 2 minutes)
    if (state.activeShift != null) {
      _maybeUploadPing(position);
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
  Future<void> _maybeUploadPing(Position position) async {
    final now = DateTime.now();
    final isPlayback = state.isPlaybackRunning;

    if (!isPlayback && !SupabaseService.isMockMode) {
      return;
    }
    
    // Bypass the 2-minute throttling limit during developer simulation playbacks
    // so that the vehicle moves smoothly on the live admin panel map.
    if (isPlayback || _lastUploadTime == null || now.difference(_lastUploadTime!) >= const Duration(minutes: 2)) {
      if (!isPlayback) {
        _lastUploadTime = now;
      }
      final driverId = SupabaseService.currentDriverId;
      final shiftId = state.activeShift?.id;
 
      if (driverId == null || shiftId == null) return;
 
      if (SupabaseService.isMockMode) {
        debugPrint('Mock Ping Upload: (${position.latitude}, ${position.longitude}) Speed: ${position.speed} m/s');
        return;
      }
 
      final payload = {
        'driver_id': driverId,
        'shift_id': shiftId,
        'latitude': position.latitude,
        'longitude': position.longitude,
        'speed': position.speed,
        'accuracy': position.accuracy,
        'recorded_at': position.timestamp.toUtc().toIso8601String(),
      };

      try {
        await SupabaseService.client.from('gps_locations').insert(payload);
        debugPrint('GPS telemetry uploaded successfully.');
        
        // Attempt to sync offline queue if we have cached pings
        if (_offlineQueue.isNotEmpty) {
          _syncOfflineQueue();
        }
      } catch (e) {
        debugPrint('GPS Upload failed: $e. Caching coordinate offline.');
        _offlineQueue.add(payload);
        _saveOfflineQueue();
      }
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
        _lastCompletedShiftId = null; // Clear completed shift filter on new clock-in
        _isInternalClockOut = false; // Reset internal clock-out flag on new clock-in
        await loadActiveShift();
        _lastUploadTime = null; // Clear timer to force immediate GPS upload
        await _maybeUploadPing(pos);
        _lastUploadTime = DateTime.now(); // Reset upload delay timer for subsequent pings
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
          overrideRate: result['override_applied'] == true ? 18.00 : null,
        );
        
        _lastCompletedShiftId = activeShift.id; // Mark shift ID as completed to ignore stale stream frames
        
        state = state.copyWith(
          clearActiveShift: true,
          lastCompletedShift: completedShift,
        );
        await _stopBackgroundTrackingService();
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
    _backgroundSubscription?.cancel();
    _backgroundSubscription = null;
    FlutterBackgroundService().invoke('stopService');

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

    _handleNewPosition(mockPos);
  }

  /// Start automatic route playback simulation
  void startRoutePlayback() {
    if (state.isPlaybackRunning) return;

    state = state.copyWith(isPlaybackRunning: true, clearErrorMessage: true);

    // Cancel live subscription so it doesn't interfere
    _positionSubscription?.cancel();
    _positionSubscription = null;
    _backgroundSubscription?.cancel();
    _backgroundSubscription = null;
    FlutterBackgroundService().invoke('stopService');

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
    _handleNewPosition(mockPos);
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

            if (state.activeShift?.id != activeShift.id) {
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
    _backgroundSubscription?.cancel();
    _backgroundSubscription = null;
    FlutterBackgroundService().invoke('stopService');
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
    _backgroundSubscription?.cancel();
    _playbackTimer?.cancel();
    super.dispose();
  }
}

final shiftProvider = StateNotifierProvider<ShiftNotifier, ShiftState>((ref) {
  return ShiftNotifier(ref);
});
