import 'package:intl/intl.dart';

/// What the driver's company does when a shift sends no GPS — set by the
/// office under Settings → Alerts (organizations.gps_offline_*, migration
/// 081) and read through the driver_gps_policy() RPC. The same numbers
/// drive the warning the driver sees, so the app never promises a
/// consequence the server won't actually apply.
class GpsPolicy {
  final bool detectionEnabled;
  final int afterMinutes;
  final bool notifyDriver;

  /// 'none' (alert the office only) | 'freeze_time' | 'clock_out'
  final String action;
  final int clockOutMinutes;

  /// Idle (stationary for [idleMinutes]) — migrations 101/102.
  final bool idleEnabled;
  final int idleMinutes;

  /// 'none' (alert the office only) | 'freeze_time'
  final String idleAction;
  final bool idleNotifyDriver;

  const GpsPolicy({
    required this.detectionEnabled,
    required this.afterMinutes,
    required this.notifyDriver,
    required this.action,
    required this.clockOutMinutes,
    this.idleEnabled = true,
    this.idleMinutes = 50,
    this.idleAction = 'none',
    this.idleNotifyDriver = true,
  });

  /// Used until the policy has loaded (or when offline): the same defaults
  /// a company has before anyone changes the settings.
  static const fallback = GpsPolicy(
    detectionEnabled: true,
    afterMinutes: 10,
    notifyDriver: true,
    action: 'none',
    clockOutMinutes: 60,
  );

  factory GpsPolicy.fromJson(Map<String, dynamic> j) => GpsPolicy(
        detectionEnabled: j['detection_enabled'] as bool? ?? true,
        afterMinutes: (j['after_minutes'] as num?)?.toInt() ?? 10,
        notifyDriver: j['notify_driver'] as bool? ?? true,
        action: j['action']?.toString() ?? 'none',
        clockOutMinutes: (j['clock_out_minutes'] as num?)?.toInt() ?? 60,
        idleEnabled: j['idle_enabled'] as bool? ?? true,
        idleMinutes: (j['idle_minutes'] as num?)?.toInt() ?? 50,
        idleAction: j['idle_action']?.toString() ?? 'none',
        idleNotifyDriver: j['idle_notify_driver'] as bool? ?? true,
      );

  bool get freezesTime => action == 'freeze_time';
  bool get clocksOut => action == 'clock_out';
  bool get idleFreezesTime => idleAction == 'freeze_time';

  /// One plain sentence on what happens if tracking stops.
  String get consequence {
    if (clocksOut) {
      return "If tracking stops for $clockOutMinutes minutes you'll be clocked out automatically, at the last moment we could see you. Time without tracking isn't paid.";
    }
    if (freezesTime) {
      return "While tracking is stopped your time is paused and isn't paid. It restarts when Tachyo is tracking again.";
    }
    return 'Your manager is alerted as soon as tracking stops.';
  }

  /// Text for the "tracking has stopped" notification.
  String get warningBody {
    if (clocksOut) {
      return "Tachyo isn't tracking you. Open it now — otherwise you'll be clocked out automatically and the time won't be paid.";
    }
    if (freezesTime) {
      return "Tachyo isn't tracking you, so your time is paused. Open Tachyo to carry on.";
    }
    return "Tachyo isn't tracking you and your manager has been alerted. Open Tachyo to switch tracking back on.";
  }
}

/// Key that identifies one tracking/idle event, so each is announced once.
String gpsNoticeKey(Map<String, dynamic> event) {
  final isIdle = event['kind']?.toString() == 'idle';
  final started = DateTime.tryParse(event['started_at']?.toString() ?? '')?.toLocal();
  return '${isIdle ? 'idle' : 'offline'}|${started?.toIso8601String()}';
}

/// The title and text the driver is shown for a tracking-stopped or idle
/// event (a pop-up in the open app, or a notification while it is in the
/// background).
({String title, String body}) gpsNoticeText(Map<String, dynamic> event) {
  final isIdle = event['kind']?.toString() == 'idle';
  final started = DateTime.tryParse(event['started_at']?.toString() ?? '')?.toLocal() ?? DateTime.now();
  final resolved = DateTime.tryParse(event['resolved_at']?.toString() ?? '')?.toLocal();
  final fmt = DateFormat('HH:mm');
  final minutes = ((resolved ?? DateTime.now()).difference(started).inMinutes).clamp(0, 100000);
  final action = event['action_taken']?.toString() ?? 'alert';
  if (isIdle) {
    final span = '${fmt.format(started)}${resolved != null ? ' – ${fmt.format(resolved)}' : ''}';
    if (action == 'time_frozen') {
      return (title: 'Your time was paused — idle', body: 'You were stationary for $minutes min ($span). That time is paused and will not be paid.');
    }
    return (title: 'You were idle', body: 'You were stationary for $minutes min ($span). Your manager has been alerted.');
  }
  if (action == 'clocked_out') {
    return (
      title: 'You were clocked out',
      body: 'Tachyo stopped tracking you at ${fmt.format(started)}, so your shift was ended automatically at that time. Keep Tachyo running to avoid this.',
    );
  }
  final until = resolved != null ? ' until ${fmt.format(resolved)} ($minutes min)' : '';
  if (action == 'time_frozen') {
    return (title: 'Your time was paused', body: 'Tachyo stopped tracking you at ${fmt.format(started)}$until. That time is paused and will not be paid.');
  }
  return (title: 'Tracking stopped', body: 'Tachyo stopped tracking you at ${fmt.format(started)}$until. Your manager was alerted.');
}
