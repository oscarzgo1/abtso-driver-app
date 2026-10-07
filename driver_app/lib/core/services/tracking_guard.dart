import 'package:flutter/foundation.dart';
import 'package:tracelet/tracelet.dart' as tl;

/// What the phone has to allow for Tachyo's GPS to keep running with the
/// screen off or the app in the background. Drivers were switching the
/// app away so live tracking stopped (client feedback, Oct 2026), so the
/// app now refuses to clock in until all of these are on, and every
/// requirement has a button that jumps straight to the right system screen.
///
/// Web builds can't be checked (a browser tab has no "Always" permission
/// or battery setting), so there everything reads as healthy.
class TrackingHealth {
  final bool servicesOn;
  final bool always;
  final bool permanentlyDenied;

  /// iPhone "Precise Location". With it off every fix is 1-3 km out, the
  /// tracker discards them all and no pings reach the office.
  final bool precise;
  final bool batteryOk;
  final bool notificationsOk;

  const TrackingHealth({
    required this.servicesOn,
    required this.always,
    required this.permanentlyDenied,
    required this.precise,
    required this.batteryOk,
    required this.notificationsOk,
  });

  static const healthyOnWeb = TrackingHealth(servicesOn: true, always: true, permanentlyDenied: false, precise: true, batteryOk: true, notificationsOk: true);

  /// Everything a shift needs to be tracked reliably. Notifications are
  /// recommended (they carry the "tracking stopped" warning) but don't
  /// block clocking in.
  bool get healthy => servicesOn && always && precise && batteryOk;
}

class TrackingGuard {
  TrackingGuard._();

  static bool get _isAndroid => !kIsWeb && defaultTargetPlatform == TargetPlatform.android;
  static bool get isIOS => !kIsWeb && defaultTargetPlatform == TargetPlatform.iOS;

  static Future<TrackingHealth> check() async {
    if (kIsWeb) return TrackingHealth.healthyOnWeb;
    try {
      final provider = await tl.Tracelet.getProviderState();
      final auth = await tl.Tracelet.getLocationAuthorization();
      final battery = _isAndroid ? await tl.Tracelet.isIgnoringBatteryOptimizations() : true;
      final notif = await tl.Tracelet.getNotificationAuthorization();
      return TrackingHealth(
        servicesOn: provider.enabled,
        always: auth == tl.AuthorizationStatus.always,
        permanentlyDenied: auth == tl.AuthorizationStatus.deniedForever,
        // Only iOS reports this reliably; Android counts as precise.
        precise: !isIOS || provider.accuracyAuthorization == tl.AccuracyAuthorization.full,
        batteryOk: battery,
        notificationsOk: notif == tl.NotificationAuthorizationStatus.granted,
      );
    } catch (e) {
      debugPrint('TrackingGuard.check failed, treating as healthy so a plugin hiccup never blocks work: $e');
      return TrackingHealth.healthyOnWeb;
    }
  }

  /// Asks for location. First call asks for "while using", the second for
  /// "Always"; if the OS won't show a dialog any more (denied forever, or
  /// Android 11+ which only offers Always from Settings) opens the app's
  /// settings page instead.
  static Future<void> requestAlwaysLocation() async {
    if (kIsWeb) return;
    var status = await tl.Tracelet.requestLocationAuthorization();
    if (status == tl.AuthorizationStatus.whenInUse) {
      status = await tl.Tracelet.requestLocationAuthorization();
    }
    if (status != tl.AuthorizationStatus.always) {
      await tl.Tracelet.openAppSettings();
    }
  }

  /// Precise Location is switched on in the app's own Location settings.
  static Future<void> openAppSettings() async {
    if (kIsWeb) return;
    await tl.Tracelet.openAppSettings();
  }

  static Future<void> openLocationSettings() async {
    if (kIsWeb) return;
    await tl.Tracelet.openLocationSettings();
  }

  /// Android: the system "Allow Tachyo to always run in the background?"
  /// dialog (ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS) — one tap to allow.
  static Future<void> requestBatteryExemption() async {
    if (kIsWeb || !_isAndroid) return;
    await tl.Tracelet.openBatterySettings();
  }

  static Future<void> requestNotifications() async {
    if (kIsWeb) return;
    final status = await tl.Tracelet.requestNotificationAuthorization();
    if (status != tl.NotificationAuthorizationStatus.granted) {
      await tl.Tracelet.openAppSettings();
    }
  }

  /// Opens the phone maker's own power-manager screen (Xiaomi autostart,
  /// Samsung "never sleeping apps", Huawei launch settings…) — on those
  /// phones the standard exemption alone isn't enough to keep tracking alive.
  static Future<void> openManufacturerPowerSettings() async {
    if (kIsWeb || !_isAndroid) return;
    await tl.Tracelet.showPowerManager();
  }

  static Future<bool> isAggressiveManufacturer() async {
    if (kIsWeb || !_isAndroid) return false;
    try {
      final health = await tl.Tracelet.getSettingsHealth();
      return health['isAggressiveOem'] == true;
    } catch (_) {
      return false;
    }
  }
}
