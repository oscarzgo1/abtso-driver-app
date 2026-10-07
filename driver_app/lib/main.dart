import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'config/theme.dart';
import 'config/router.dart';
import 'core/network/supabase_service.dart';
import 'core/services/entrance_gate.dart';
import 'core/services/location_service.dart';
import 'features/shift/presentation/shift_provider.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // 1. First initialize the persistence/network layer to expose configuration credentials
  await Supabase.initialize(
    url: const String.fromEnvironment('SUPABASE_URL',
        defaultValue: 'https://imfgzhxdzxkifuncowrl.supabase.co'),
    publishableKey: const String.fromEnvironment('SUPABASE_ANON_KEY',
        defaultValue: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImltZmd6aHhkenhraWZ1bmNvd3JsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM1MDI5NzUsImV4cCI6MjA5OTA3ODk3NX0.AmQesj8ZH2vB6hsQ2dYi3sgiHEWK3kuNc6IWSUitt5M'),
  );

  // 2. Then spin up the background process execution layer (Tracelet SDK)
  await LocationService.initializeService();

  // 3. Snapshot when the app was last used, before this launch overwrites it —
  //    decides whether the entrance cinematic plays (see EntranceGate).
  await EntranceGate.captureLaunch();

  runApp(
    const ProviderScope(
      child: DriverApp(),
    ),
  );
}

class DriverApp extends ConsumerStatefulWidget {
  const DriverApp({super.key});

  @override
  ConsumerState<DriverApp> createState() => _DriverAppState();
}

class _DriverAppState extends ConsumerState<DriverApp> with WidgetsBindingObserver {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);

    // Start the shift manager (which uploads the GPS pings) as soon as a
    // signed-in driver's app launches, not only once the home screen opens.
    // When iOS relaunches Tachyo in the background mid-shift no screen is
    // ever shown, so without this nothing would send the pings.
    if (!kIsWeb && SupabaseService.isAuthenticated) {
      ref.read(shiftProvider);
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  // Keeps the "last used" timestamp fresh so the 5-hour break is measured
  // from when the driver actually left the app, not from when it launched.
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.paused ||
        state == AppLifecycleState.detached ||
        state == AppLifecycleState.resumed) {
      EntranceGate.markActive();
    }
  }

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
      title: 'Tachyo Driver',
      debugShowCheckedModeBanner: false,
      theme: TachyoTheme.lightTheme,
      darkTheme: TachyoTheme.darkTheme,
      themeMode: _currentThemeMode,
      routerConfig: appRouter,
    );
  }
}
