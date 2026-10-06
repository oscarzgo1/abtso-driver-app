import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:timezone/data/latest_10y.dart' as tzdata;
import 'package:timezone/timezone.dart' as tz;

/// On-device notifications (no push server) — the stationary load
/// reminder and the "tracking has stopped" warning. No-op on web.
class NotificationService {
  NotificationService._();

  static final FlutterLocalNotificationsPlugin _plugin = FlutterLocalNotificationsPlugin();
  static bool _initialized = false;

  static const AndroidNotificationDetails _loadReminderChannel = AndroidNotificationDetails(
    'load_reminders',
    'Load reminders',
    channelDescription: 'Reminders to attach your load or confirm its delivery.',
    importance: Importance.high,
    priority: Priority.high,
  );

  static const AndroidNotificationDetails _trackingLostChannel = AndroidNotificationDetails(
    'tracking_lost',
    'Tracking stopped',
    channelDescription: 'Warns you when Tachyo has stopped tracking your location during a shift.',
    importance: Importance.max,
    priority: Priority.max,
    category: AndroidNotificationCategory.alarm,
    visibility: NotificationVisibility.public,
  );

  static const int _trackingLostId = 1002;

  /// A dead-man's switch for GPS tracking. Called after every successful
  /// GPS upload: it (re)schedules a notification [after] from now, so while
  /// the app keeps uploading it is pushed back forever and never shows —
  /// but if the app is swiped away or killed and uploads stop, the OS fires
  /// it on its own, with no server and no running app needed.
  static Future<void> scheduleTrackingLostWarning({
    required Duration after,
    required String title,
    required String body,
  }) async {
    if (kIsWeb) return;
    await initialize();
    final fireAt = tz.TZDateTime.now(tz.UTC).add(after);
    await _plugin.zonedSchedule(
      _trackingLostId,
      title,
      body,
      fireAt,
      const NotificationDetails(android: _trackingLostChannel, iOS: DarwinNotificationDetails(interruptionLevel: InterruptionLevel.timeSensitive)),
      uiLocalNotificationDateInterpretation: UILocalNotificationDateInterpretation.absoluteTime,
      androidScheduleMode: AndroidScheduleMode.inexactAllowWhileIdle,
    );
  }

  static Future<void> cancelTrackingLostWarning() async {
    if (kIsWeb) return;
    await initialize();
    await _plugin.cancel(_trackingLostId);
  }

  static Future<void> initialize() async {
    if (kIsWeb || _initialized) return;
    tzdata.initializeTimeZones();
    tz.setLocalLocation(tz.UTC);
    const settings = InitializationSettings(
      android: AndroidInitializationSettings('@mipmap/ic_launcher'),
      // Permission is asked for explicitly at clock-in, not at app launch.
      iOS: DarwinInitializationSettings(
        requestAlertPermission: false,
        requestBadgePermission: false,
        requestSoundPermission: false,
      ),
    );
    await _plugin.initialize(settings);
    _initialized = true;
  }

  static Future<void> requestPermission() async {
    if (kIsWeb) return;
    await initialize();
    await _plugin
        .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()
        ?.requestNotificationsPermission();
    await _plugin
        .resolvePlatformSpecificImplementation<IOSFlutterLocalNotificationsPlugin>()
        ?.requestPermissions(alert: true, badge: true, sound: true);
  }

  /// An idle / tracking notice while the app is in the background (the open
  /// app shows a pop-up instead). One id per event so two notices don't replace each other.
  static Future<void> showTrackingNotice({required int id, required String title, required String body}) async {
    if (kIsWeb) return;
    await initialize();
    await _plugin.show(
      id,
      title,
      body,
      const NotificationDetails(android: _trackingLostChannel, iOS: DarwinNotificationDetails(interruptionLevel: InterruptionLevel.timeSensitive)),
    );
  }

  static Future<void> showLoadReminder({required String title, required String body}) async {
    if (kIsWeb) return;
    await initialize();
    await _plugin.show(
      1001, // one fixed id: a newer reminder replaces the previous one
      title,
      body,
      const NotificationDetails(android: _loadReminderChannel, iOS: DarwinNotificationDetails()),
    );
  }
}
