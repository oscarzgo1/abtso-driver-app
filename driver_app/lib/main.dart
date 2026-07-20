import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'config/theme.dart';
import 'config/router.dart';

import 'core/services/location_service.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // 1. First initialize the persistence/network layer to expose configuration credentials
  await Supabase.initialize(
    // TODO: Replace with your Supabase project credentials
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
