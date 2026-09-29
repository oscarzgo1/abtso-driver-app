import 'package:shared_preferences/shared_preferences.dart';

/// Decides when the branded entrance cinematic plays.
///
/// Rules:
/// - Cold start with a restored session: plays only if the app was last in
///   the foreground [breakThreshold] or more ago.
/// - Straight after a real sign-in: always plays.
/// - Never while a shift is in progress — SOS on the home screen must be one
///   tap away, not behind an animation.
class EntranceGate {
  EntranceGate._();

  static const Duration breakThreshold = Duration(hours: 5);

  static const _lastActiveKey = 'entrance_last_active_at';
  static const _shiftActiveKey = 'entrance_shift_active';

  static DateTime? _lastActiveAtLaunch;
  static bool _shiftActiveAtLaunch = false;

  /// Snapshots the previous session's timestamps. Must run once in main()
  /// before runApp, i.e. before [markActive] overwrites them.
  static Future<void> captureLaunch() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(_lastActiveKey);
      _lastActiveAtLaunch = raw != null ? DateTime.tryParse(raw) : null;
      _shiftActiveAtLaunch = prefs.getBool(_shiftActiveKey) ?? false;
    } catch (_) {}
    await markActive();
  }

  /// Records "the driver was using the app just now". Called at launch and
  /// whenever the app leaves or returns to the foreground.
  static Future<void> markActive() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_lastActiveKey, DateTime.now().toIso8601String());
    } catch (_) {}
  }

  static Future<void> recordShiftActive(bool active) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setBool(_shiftActiveKey, active);
    } catch (_) {}
  }

  /// Cold start with a restored session.
  static bool get playOnColdStart {
    if (_shiftActiveAtLaunch) return false;
    final last = _lastActiveAtLaunch;
    // No record (first launch after this feature shipped) counts as a break.
    if (last == null) return true;
    return DateTime.now().difference(last) >= breakThreshold;
  }

  /// Straight after the driver signs in on the login screen.
  static Future<bool> playAfterLogin() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      return !(prefs.getBool(_shiftActiveKey) ?? false);
    } catch (_) {
      return true;
    }
  }
}
