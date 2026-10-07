import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:geolocator/geolocator.dart';
import 'package:tracelet/tracelet.dart' as tl;

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
    int intervalSeconds = 180,
    int distanceFilterMeters = 10,
  }) {
    _positionStreamSubscription?.cancel();

    LocationSettings locationSettings;

    if (defaultTargetPlatform == TargetPlatform.android) {
      locationSettings = AndroidSettings(
        accuracy: LocationAccuracy.high,
        distanceFilter: distanceFilterMeters,
        intervalDuration: Duration(seconds: intervalSeconds),
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

  /// The one Tracelet setup, used at app start and at clock-in alike.
  /// ready() replaces the whole native config, so a second, shorter config
  /// in main() used to reset the 3-minute heartbeat and stop detection on
  /// every launch — including when iOS relaunched the app mid-shift.
  ///
  /// iOS keeps an app running in the background only while it is receiving
  /// GPS. The plugin starts each session "stationary" unless told otherwise,
  /// and stationary switches GPS off on iPhone; drivers clock in standing
  /// still, so iOS suspended the app and no pings arrived until it was
  /// opened again (Oct 2026). isMoving + disableStopDetection keep GPS on for
  /// the whole shift; uploads are still limited to one per 3 minutes.
  static const tl.Config trackingConfig = tl.Config(
    app: tl.AppConfig(
      stopOnTerminate: false,
      startOnBoot: true,
      // Native timer: one position every 3 minutes, even when still.
      heartbeatInterval: 180,
    ),
    geo: tl.GeoConfig(
      desiredAccuracy: tl.DesiredAccuracy.high,
      distanceFilter: 0.0, // keep fixes coming while the phone is still
      filter: tl.LocationFilter(
        rejectMockLocations: kDebugMode ? false : true,
      ),
    ),
    motion: tl.MotionConfig(
      isMoving: true,
      disableStopDetection: true,
      stationaryPeriodicInterval: 180,
    ),
    ios: tl.IosConfig(
      pausesLocationUpdatesAutomatically: false,
      // The blue status-bar pill: the driver can see tracking is on, and
      // iOS treats the app as an active location session.
      showsBackgroundLocationIndicator: true,
      useBackgroundActivitySession: true,
      activityType: tl.LocationActivityType.otherNavigation,
    ),
    android: tl.AndroidConfig(
      foregroundService: tl.ForegroundServiceConfig(
        notificationTitle: 'Tachyo',
        notificationText: 'Shift active. Tracking location in background.',
      ),
    ),
  );

  /// Initialize Tracelet SDK at app startup
  static Future<void> initializeService() async {
    if (kIsWeb) return;

    final state = await tl.Tracelet.ready(trackingConfig);

    // A shift was running when the app was last closed: ready() has just
    // resumed it natively (e.g. iOS relaunched the app in the background).
    // Make sure it resumes with GPS on, not in the stationary state.
    if (state.enabled) {
      try {
        await tl.Tracelet.changePace(true);
      } catch (e) {
        debugPrint('Tracelet.changePace on launch failed: $e');
      }
    }
  }
}
