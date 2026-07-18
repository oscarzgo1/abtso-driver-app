import 'dart:async';
import 'dart:ui';
import 'package:flutter/foundation.dart';
import 'package:geolocator/geolocator.dart';
import 'package:flutter_background_service/flutter_background_service.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class LocationService {
  LocationService._();

  static StreamSubscription<Position>? _positionStreamSubscription;

  /// Check permissions and request if necessary
  static Future<bool> handlePermission() async {
    bool serviceEnabled;
    LocationPermission permission;

    serviceEnabled = await Geolocator.isLocationServiceEnabled();
    if (!serviceEnabled) {
      return false;
    }

    permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
      if (permission == LocationPermission.denied) {
        return false;
      }
    }

    if (permission == LocationPermission.deniedForever) {
      return false;
    }

    return true;
  }

  /// Get current GPS position
  static Future<Position?> getCurrentPosition() async {
    final hasPermission = await handlePermission();
    if (!hasPermission) return null;

    try {
      return await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
          timeLimit: Duration(seconds: 10),
        ),
      );
    } catch (e) {
      return null;
    }
  }

  /// Start background GPS tracking stream (legacy/local UI fallback)
  static void startTrackingStream({
    required Function(Position) onLocationChanged,
    int intervalSeconds = 120,
    int distanceFilterMeters = 10,
  }) {
    _positionStreamSubscription?.cancel();

    LocationSettings locationSettings;

    if (defaultTargetPlatform == TargetPlatform.android) {
      locationSettings = AndroidSettings(
        accuracy: LocationAccuracy.high,
        distanceFilter: distanceFilterMeters,
        intervalDuration: Duration(seconds: intervalSeconds),
        foregroundNotificationConfig: const ForegroundNotificationConfig(
          notificationText: 'ABTSO Employee App is tracking your shift location.',
          notificationTitle: 'Shift Tracking Active',
          enableWakeLock: true,
        ),
      );
    } else if (defaultTargetPlatform == TargetPlatform.iOS) {
      locationSettings = AppleSettings(
        accuracy: LocationAccuracy.high,
        distanceFilter: distanceFilterMeters,
        activityType: ActivityType.otherNavigation,
        pauseLocationUpdatesAutomatically: false,
        showBackgroundLocationIndicator: true,
      );
    } else {
      locationSettings = LocationSettings(
        accuracy: LocationAccuracy.high,
        distanceFilter: distanceFilterMeters,
      );
    }

    _positionStreamSubscription = Geolocator.getPositionStream(
      locationSettings: locationSettings,
    ).listen((Position position) {
      onLocationChanged(position);
    });
  }

  /// Stop the tracking stream (legacy/local UI fallback)
  static void stopTrackingStream() {
    _positionStreamSubscription?.cancel();
    _positionStreamSubscription = null;
  }

  /// Initialize the background service configuration (called in main.dart)
  static Future<void> initializeService() async {
    final service = FlutterBackgroundService();

    // Configure notification channel
    await service.configure(
      androidConfiguration: AndroidConfiguration(
        onStart: onStart,
        autoStart: false, // Started manually when driver clocks in
        isForegroundMode: true,
        notificationChannelId: 'abtso_location_service',
        initialNotificationTitle: 'ABTSO Logistics',
        initialNotificationContent: 'Shift active. Tracking location in background.',
      ),
      iosConfiguration: IosConfiguration(
        autoStart: false,
        onForeground: onStart,
        onBackground: onIosBackground,
      ),
    );
  }
}

@pragma('vm:entry-point')
Future<bool> onIosBackground(ServiceInstance service) async {
  return true;
}

@pragma('vm:entry-point')
void onStart(ServiceInstance service) async {
  DartPluginRegistrant.ensureInitialized();

  StreamSubscription<Position>? positionSubscription;
  Timer? uploadTimer;
  Position? lastPosition;
  String? driverId;
  String? shiftId;
  String? supabaseUrl;
  String? supabaseAnonKey;
  bool isMockMode = false;

  if (service is AndroidServiceInstance) {
    service.on('setAsForeground').listen((event) {
      service.setAsForegroundService();
    });
    service.on('setAsBackground').listen((event) {
      service.setAsBackgroundService();
    });
  }

  service.on('stopService').listen((event) async {
    await positionSubscription?.cancel();
    uploadTimer?.cancel();
    service.stopSelf();
  });

  service.on('startTracking').listen((event) async {
    driverId = event?['driverId'];
    shiftId = event?['shiftId'];
    supabaseUrl = event?['supabaseUrl'];
    supabaseAnonKey = event?['supabaseAnonKey'];
    isMockMode = event?['isMockMode'] ?? false;

    // Set notification details on Android
    if (service is AndroidServiceInstance) {
      service.setForegroundNotificationInfo(
        title: 'ABTSO Logistics',
        content: 'Shift active. Tracking location in background.',
      );
    }

    // Initialize standalone Supabase Client in background isolate
    SupabaseClient? supabaseClient;
    if (!isMockMode && supabaseUrl != null && supabaseAnonKey != null) {
      try {
        supabaseClient = SupabaseClient(supabaseUrl!, supabaseAnonKey!);
      } catch (e) {
        debugPrint('Background Isolate: Supabase init error: $e');
      }
    }

    // Begin GPS location tracking stream
    await positionSubscription?.cancel();
    positionSubscription = Geolocator.getPositionStream(
      locationSettings: const LocationSettings(
        accuracy: LocationAccuracy.high,
        distanceFilter: 2, // Check location updates frequently
      ),
    ).listen((Position position) {
      lastPosition = position;
      
      // Send location details back to UI thread
      service.invoke('locationUpdated', {
        'latitude': position.latitude,
        'longitude': position.longitude,
        'accuracy': position.accuracy,
        'altitude': position.altitude,
        'heading': position.heading,
        'speed': position.speed,
        'timestamp': position.timestamp.toIso8601String(),
        'isMocked': position.isMocked,
      });
    }, onError: (err) {
      debugPrint('Background Isolate: Location stream error: $err');
    });

    // Attempt to grab initial position
    try {
      final initialPos = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
          timeLimit: Duration(seconds: 10),
        ),
      );
      lastPosition = initialPos;
      service.invoke('locationUpdated', {
        'latitude': initialPos.latitude,
        'longitude': initialPos.longitude,
        'accuracy': initialPos.accuracy,
        'altitude': initialPos.altitude,
        'heading': initialPos.heading,
        'speed': initialPos.speed,
        'timestamp': initialPos.timestamp.toIso8601String(),
        'isMocked': initialPos.isMocked,
      });
    } catch (_) {}

    // Periodic Supabase push every 20 seconds
    uploadTimer?.cancel();
    uploadTimer = Timer.periodic(const Duration(seconds: 20), (timer) async {
      if (lastPosition == null || driverId == null || shiftId == null) return;
      if (isMockMode) return;

      final payload = {
        'driver_id': driverId,
        'shift_id': shiftId,
        'latitude': lastPosition!.latitude,
        'longitude': lastPosition!.longitude,
        'speed': lastPosition!.speed,
        'accuracy': lastPosition!.accuracy,
        'recorded_at': lastPosition!.timestamp.toUtc().toIso8601String(),
      };

      if (supabaseClient != null) {
        try {
          await supabaseClient.from('gps_locations').insert(payload);
          debugPrint('Background Isolate: GPS location telemetry successfully pushed.');
        } catch (e) {
          debugPrint('Background Isolate: GPS location telemetry push failed: $e');
        }
      }
    });
  });
}
