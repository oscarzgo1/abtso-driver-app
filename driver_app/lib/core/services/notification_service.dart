import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

/// On-device notifications (no push server) — currently used for the
/// stationary load reminder. No-op on web.
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

  static Future<void> initialize() async {
    if (kIsWeb || _initialized) return;
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
