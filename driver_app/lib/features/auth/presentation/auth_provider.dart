import 'dart:async';
import 'dart:convert';
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

  /// Persists the last-known driver profile locally so a session can be
  /// restored even when the network is unavailable at launch.
  Future<void> _cacheDriverProfile(Map<String, dynamic> driver) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('session_driver_cache', jsonEncode(driver));
    } catch (_) {}
  }

  /// Verifies persistent session indefinitely on boot (no arbitrary
  /// expiration). Only a confirmed "driver not found" ends the session here
  /// — a network failure falls back to the last cached profile and stays
  /// authenticated, so a dead signal at the depot can never look like a logout.
  Future<void> checkSession() async {
    final previousState = state;
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
          unawaited(_cacheDriverProfile(result['driver']));
          return;
        }

        if (result['errorType'] != 'not_found') {
          // Network/DB hiccup, not a verdict on the account — fall back to
          // whatever profile was last cached and stay signed in.
          final cachedJson = prefs.getString('session_driver_cache');
          if (cachedJson != null) {
            try {
              final cachedDriver = jsonDecode(cachedJson) as Map<String, dynamic>;
              state = AuthState(status: AuthStatus.authenticated, driver: cachedDriver);
              return;
            } catch (_) {}
          }
          // No cache yet (e.g. first launch after login lost connectivity
          // immediately) — still honour the session rather than sign out,
          // using the minimal identity already on disk.
          state = AuthState(
            status: AuthStatus.authenticated,
            driver: {'id': lookupId, 'driver_id': savedDriverId},
          );
          return;
        }
        // errorType == 'not_found': the account genuinely no longer exists —
        // fall through to the unauthenticated state below.
      }
    } catch (e) {
      debugPrint('Error restoring persistent auth session: $e');
      // An unexpected exception here is an app-side problem, not proof the
      // driver logged out. If there was already an authenticated session in
      // memory, keep it rather than dropping to a spinner or the login
      // screen; otherwise there is nothing to preserve.
      state = previousState.status == AuthStatus.authenticated
          ? previousState
          : const AuthState(status: AuthStatus.initial);
      return;
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
        unawaited(_cacheDriverProfile(result['driver']));
      }
    } catch (_) {}
  }

  /// Mark statutory terms and privacy policy as accepted by the driver
  Future<Map<String, dynamic>> acceptTerms() async {
    final driverUuid = state.driver?['id'] ?? SupabaseService.currentDriverId;
    final driverCode = state.driver?['driver_id'];
    final lookupKey = driverUuid ?? driverCode;

    if (lookupKey == null) {
      return {'success': false, 'error': 'No active driver found.'};
    }

    try {
      if (!SupabaseService.isMockMode) {
        await SupabaseService.client
            .from('drivers')
            .update({'terms_accepted': true})
            .or('id.eq.$lookupKey,driver_id.ilike.$lookupKey');
      }

      final updatedDriver = state.driver != null
          ? Map<String, dynamic>.from(state.driver!)
          : <String, dynamic>{};
      updatedDriver['terms_accepted'] = true;

      state = state.copyWith(driver: updatedDriver);
      return {'success': true};
    } catch (e) {
      debugPrint('acceptTerms error: $e');
      return {'success': false, 'error': e.toString()};
    }
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
      // Save persistent login session locally — restored indefinitely by
      // checkSession() on every future launch; there is no expiry to enforce.
      try {
        final prefs = await SharedPreferences.getInstance();
        await prefs.setString('session_driver_id', cleanId);
        await prefs.setString('session_login_time', DateTime.now().toIso8601String());
      } catch (_) {
        // Safe to ignore, fallback to normal lifecycle if shared preferences fails
      }

      if (result['driver'] != null) {
        unawaited(_cacheDriverProfile(result['driver']));
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
    // Clear the locally persisted session — this is the ONLY path that
    // should ever end it. Reached solely from the driver's own "Log Out"
    // action, never from lifecycle events, backgrounding, or a failed
    // network call (see checkSession, which deliberately does not call this).
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove('session_driver_id');
      await prefs.remove('session_login_time');
      await prefs.remove('session_driver_cache');
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
