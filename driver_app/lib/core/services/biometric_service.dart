import 'package:local_auth/local_auth.dart';
import 'package:shared_preferences/shared_preferences.dart';

// ============================================================
// Biometric unlock (Face ID / fingerprint) — a device-level gate in
// front of the Supabase session that already persists indefinitely
// (see AuthNotifier.checkSession). This never touches real
// authentication: it decides whether an already-restored session is
// shown to whoever picked up the phone, nothing more. The driver
// still has to type Company Code + Driver ID + PIN for the first,
// real login on a device — biometrics only ever unlock a session
// that already exists.
// ============================================================

class BiometricService {
  static const _enabledKey = 'biometric_unlock_enabled';
  static const _askedKey = 'biometric_unlock_asked';
  static final LocalAuthentication _auth = LocalAuthentication();

  /// Whether this device even has usable Face ID/fingerprint hardware
  /// with something enrolled — never throws, just returns false on any
  /// platform/hardware error.
  static Future<bool> isDeviceSupported() async {
    try {
      final canCheck = await _auth.canCheckBiometrics;
      final isSupported = await _auth.isDeviceSupported();
      return canCheck && isSupported;
    } catch (_) {
      return false;
    }
  }

  static Future<bool> isEnabled() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      return prefs.getBool(_enabledKey) ?? false;
    } catch (_) {
      return false;
    }
  }

  static Future<void> setEnabled(bool value) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setBool(_enabledKey, value);
    } catch (_) {}
  }

  /// Whether the one-time "enable Face ID?" prompt has already been
  /// shown on this device (regardless of the driver's answer) — so it
  /// only ever asks once, not on every login.
  static Future<bool> hasBeenAsked() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      return prefs.getBool(_askedKey) ?? false;
    } catch (_) {
      return false;
    }
  }

  static Future<void> markAsked() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setBool(_askedKey, true);
    } catch (_) {}
  }

  /// Prompts Face ID/fingerprint. Never throws — returns false on any
  /// failure (cancelled, not enrolled, hardware error, lockout), so the
  /// caller can always fall back to the PIN form. biometricOnly: true
  /// deliberately excludes the OS's own device-unlock PIN/pattern as a
  /// fallback — that's a different credential than the driver's actual
  /// Tachyo PIN, and letting it in would mean anyone who knows the
  /// phone's lock code (not the driver's PIN) could get in too.
  static Future<bool> authenticate({required String reason}) async {
    try {
      return await _auth.authenticate(
        localizedReason: reason,
        options: const AuthenticationOptions(
          biometricOnly: true,
          stickyAuth: true,
        ),
      );
    } catch (_) {
      return false;
    }
  }
}
