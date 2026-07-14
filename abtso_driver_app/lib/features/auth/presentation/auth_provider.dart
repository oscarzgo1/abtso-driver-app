import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../../core/network/supabase_service.dart';

// ── Auth State ──────────────────────────────────────────────
enum AuthStatus { initial, loading, authenticated, error }

class AuthState {
  final AuthStatus status;
  final String? errorMessage;
  final Map<String, dynamic>? driver;

  const AuthState({
    this.status = AuthStatus.initial,
    this.errorMessage,
    this.driver,
  });

  AuthState copyWith({
    AuthStatus? status,
    String? errorMessage,
    Map<String, dynamic>? driver,
  }) {
    return AuthState(
      status: status ?? this.status,
      errorMessage: errorMessage ?? this.errorMessage,
      driver: driver ?? this.driver,
    );
  }
}

// ── Auth Notifier ───────────────────────────────────────────
class AuthNotifier extends StateNotifier<AuthState> {
  AuthNotifier() : super(const AuthState()) {
    checkSession(); // Check local session auto-login on startup
  }

  /// Verifies if there is a cached login session under 14 days old
  Future<void> checkSession() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final driverId = prefs.getString('session_driver_id');
      final loginTimeStr = prefs.getString('session_login_time');

      if (driverId != null && loginTimeStr != null) {
        final loginTime = DateTime.parse(loginTimeStr);
        final differenceInDays = DateTime.now().difference(loginTime).inDays;

        if (differenceInDays < 14) {
          state = const AuthState(status: AuthStatus.loading);
          final result = await SupabaseService.fetchDriverProfile(driverId);
          if (result['success'] == true) {
            state = AuthState(
              status: AuthStatus.authenticated,
              driver: result['driver'],
            );
            return;
          }
        }
      }
    } catch (_) {
      // Storage error or profile loading failed; fall back to credentials prompt
    }
    state = const AuthState(status: AuthStatus.initial);
  }

  Future<void> login(String driverId, String pin) async {
    // Validation
    if (driverId.trim().isEmpty) {
      state = const AuthState(
        status: AuthStatus.error,
        errorMessage: 'Please enter your Employee ID',
      );
      return;
    }
    if (pin.trim().isEmpty) {
      state = const AuthState(
        status: AuthStatus.error,
        errorMessage: 'Please enter your PIN',
      );
      return;
    }

    state = const AuthState(status: AuthStatus.loading);

    final result = await SupabaseService.driverLogin(
      driverId: driverId.trim().toUpperCase(),
      pin: pin.trim(),
    );

    if (result['success'] == true) {
      // Save 14-day persistent login session locally
      try {
        final prefs = await SharedPreferences.getInstance();
        await prefs.setString('session_driver_id', driverId.trim().toUpperCase());
        await prefs.setString('session_login_time', DateTime.now().toIso8601String());
      } catch (_) {
        // Safe to ignore, fallback to normal lifecycle if shared preferences fails
      }

      state = AuthState(
        status: AuthStatus.authenticated,
        driver: result['driver'],
      );
    } else {
      state = AuthState(
        status: AuthStatus.error,
        errorMessage: result['error'] ?? 'Login failed',
      );
    }
  }

  Future<void> logout() async {
    // Clear 14-day login cache
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove('session_driver_id');
      await prefs.remove('session_login_time');
    } catch (_) {}

    await SupabaseService.signOut();
    state = const AuthState(status: AuthStatus.initial);
  }

  void clearError() {
    if (state.status == AuthStatus.error) {
      state = const AuthState(status: AuthStatus.initial);
    }
  }
}

// ── Provider ────────────────────────────────────────────────
final authProvider = StateNotifierProvider<AuthNotifier, AuthState>((ref) {
  return AuthNotifier();
});
