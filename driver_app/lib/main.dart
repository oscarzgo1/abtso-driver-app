import 'dart:async';
import 'dart:ui';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:geolocator/geolocator.dart';
import 'package:flutter_background_service/flutter_background_service.dart';
import 'config/theme.dart';
import 'config/router.dart';
import 'core/services/location_service.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // 1. First initialize the persistence/network layer to expose configuration credentials
  await Supabase.initialize(
    url: const String.fromEnvironment('SUPABASE_URL',
        defaultValue: 'https://imfgzhxdzxkifuncowrl.supabase.co'),
    publishableKey: const String.fromEnvironment('SUPABASE_ANON_KEY',
        defaultValue: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImltZmd6aHhkenhraWZ1bmNvd3JsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM1MDI5NzUsImV4cCI6MjA5OTA3ODk3NX0.AmQesj8ZH2vB6hsQ2dYi3sgiHEWK3kuNc6IWSUitt5M'),
  );

  // 2. Then spin up the background process execution layer
  await LocationService.initializeService();

  runApp(
    const ProviderScope(
      child: ABTSOApp(),
    ),
  );
}

class ABTSOApp extends StatelessWidget {
  const ABTSOApp({super.key});

  ThemeMode get _currentThemeMode {
    final hour = DateTime.now().hour;
    // Force dark mode for night shifts (7 PM to 7 AM)
    if (hour >= 19 || hour < 7) {
      return ThemeMode.dark;
    }
    return ThemeMode.system; // Follow device settings during the day
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      title: 'ABTSO Employee',
      debugShowCheckedModeBanner: false,
      theme: ABTSOTheme.lightTheme,
      darkTheme: ABTSOTheme.darkTheme,
      themeMode: _currentThemeMode,
      routerConfig: appRouter,
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
  WidgetsFlutterBinding.ensureInitialized();

  // Initialize a fresh instance of Supabase directly inside onStart
  const supabaseUrl = String.fromEnvironment('SUPABASE_URL',
      defaultValue: 'https://imfgzhxdzxkifuncowrl.supabase.co');
  const supabaseAnonKey = String.fromEnvironment('SUPABASE_ANON_KEY',
      defaultValue: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImltZmd6aHhkenhraWZ1bmNvd3JsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM1MDI5NzUsImV4cCI6MjA5OTA3ODk3NX0.AmQesj8ZH2vB6hsQ2dYi3sgiHEWK3kuNc6IWSUitt5M');

  try {
    await Supabase.initialize(
      url: supabaseUrl,
      publishableKey: supabaseAnonKey,
    );
  } catch (e) {
    debugPrint('Background Isolate: Supabase init error: $e');
  }

  StreamSubscription<Position>? positionSubscription;
  Timer? uploadTimer;
  Position? lastPosition;
  String? driverId;
  String? shiftId;

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

  service.on('startService').listen((event) async {
    driverId = event?['driverId'];
    shiftId = event?['shiftId'];

    // Set notification details on Android
    if (service is AndroidServiceInstance) {
      service.setForegroundNotificationInfo(
        title: 'ABTSO Logistics',
        content: 'Shift active. Tracking location in background.',
      );
    }

    // Begin GPS location tracking stream entirely inside onStart
    await positionSubscription?.cancel();
    
    // Configure AndroidSettings for Geolocator with ForegroundNotificationConfig and enableWakeLock
    positionSubscription = GeolocatorPlatform.instance.getPositionStream(
      locationSettings: AndroidSettings(
        accuracy: LocationAccuracy.high,
        distanceFilter: kDebugMode ? 0 : 2,
        intervalDuration: const Duration(seconds: 10),
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

      final payload = {
        'driver_id': driverId,
        'shift_id': shiftId,
        'latitude': lastPosition!.latitude,
        'longitude': lastPosition!.longitude,
        'speed': lastPosition!.speed,
        'accuracy': lastPosition!.accuracy,
        'recorded_at': DateTime.now().toUtc().toIso8601String(),
      };

      try {
        await Supabase.instance.client.from('gps_locations').insert(payload);
        debugPrint('Background Isolate: GPS location telemetry successfully pushed.');
      } catch (e) {
        debugPrint('Background Isolate: GPS location telemetry push failed: $e');
      }
    });
  });
}
