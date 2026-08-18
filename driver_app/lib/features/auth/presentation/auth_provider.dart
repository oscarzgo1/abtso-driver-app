import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
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
  StreamSubscription? _authSubscription;

  AuthNotifier() : super(const AuthState()) {
    _initAuthListener();
    checkSession(); // Check local session auto-login on startup
  }

  /// Listens to cross-tab & real-time Supabase Auth state changes.
  void _initAuthListener() {
    if (SupabaseService.isMockMode) return;

    try {
      _authSubscription = SupabaseService.client.auth.onAuthStateChange.listen((data) {
        final AuthChangeEvent event = data.event;
        final Session? session = data.session;

        if (event == AuthChangeEvent.signedOut) {
          // Explicit sign out triggered
          if (state.status == AuthStatus.authenticated) {
            logout();
          }
        } else if (event == AuthChangeEvent.signedIn ||
                   event == AuthChangeEvent.tokenRefreshed ||
                   event == AuthChangeEvent.userUpdated) {
          if (session != null) {
            final sessionUserId = session.user.id;
            final loadedDriverUuid = state.driver?['id'];

            if (state.status == AuthStatus.authenticated &&
                loadedDriverUuid != null &&
                loadedDriverUuid != sessionUserId) {
              // Identity mismatch detected (cross-tab overwrite)
              logout();
            }
          }
        }
      });
    } catch (_) {}
  }

  @override
  void dispose() {
    _authSubscription?.cancel();
    super.dispose();
  }

  /// Verifies persistent session indefinitely on boot (no arbitrary expiration)
  Future<void> checkSession() async {
    state = const AuthState(status: AuthStatus.loading);
    try {
      final prefs = await SharedPreferences.getInstance();
      final savedDriverId = prefs.getString('session_driver_id');
      final currentAuthUser = SupabaseService.client.auth.currentUser;
      final lookupId = savedDriverId ?? currentAuthUser?.id;

      if (lookupId != null && lookupId.isNotEmpty) {
        final result = await SupabaseService.fetchDriverProfile(lookupId);
        if (result['success'] == true && result['driver'] != null) {
          state = AuthState(
            status: AuthStatus.authenticated,
            driver: result['driver'],
          );
          return;
        }
      }
    } catch (e) {
      debugPrint('Error restoring persistent auth session: $e');
    }
    state = const AuthState(status: AuthStatus.initial);
  }

  /// Force fresh read of driver profile from database (bypassing cache and triggering UI re-render)
  Future<void> refreshProfile() async {
    final driverUuid = state.driver?['id'] ?? SupabaseService.currentDriverId;
    final driverCode = state.driver?['driver_id'];
    final lookupKey = driverUuid ?? driverCode;
    if (lookupKey == null) return;
    try {
      final result = await SupabaseService.fetchDriverProfile(lookupKey.toString());
      if (result['success'] == true && result['driver'] != null) {
        state = state.copyWith(
          driver: result['driver'],
        );
      }
    } catch (_) {}
  }

  Future<void> login(String driverId, String pin) async {
    // Validation
    final cleanId = driverId.trim();
    if (cleanId.isEmpty) {
      state = const AuthState(
        status: AuthStatus.error,
        errorMessage: 'Please enter your Username or Employee ID',
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
      driverId: cleanId,
      pin: pin.trim(),
    );

    if (result['success'] == true) {
      // Save persistent login session locally
      try {
        final prefs = await SharedPreferences.getInstance();
        await prefs.setString('session_driver_id', cleanId);
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
