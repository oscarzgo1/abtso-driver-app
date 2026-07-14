import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:geolocator/geolocator.dart';

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

  /// Start background GPS tracking stream
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

  /// Stop the tracking stream
  static void stopTrackingStream() {
    _positionStreamSubscription?.cancel();
    _positionStreamSubscription = null;
  }
}
