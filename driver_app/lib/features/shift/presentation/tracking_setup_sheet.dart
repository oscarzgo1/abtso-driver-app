import 'package:flutter/material.dart';
import '../../../config/theme.dart';
import '../../../core/services/gps_policy.dart';
import '../../../core/services/tracking_guard.dart';

/// "Keep Tachyo tracking" — the checklist a driver has to complete before
/// clocking in (and again if the phone's settings change mid-shift).
///
/// Every row shows whether that setting is on and has a button that jumps
/// straight to the right system screen; the list re-checks the moment the
/// driver comes back from Settings, so ticks appear as they go.
class TrackingSetupSheet extends StatefulWidget {
  /// When true the sheet can't be dismissed until everything is allowed —
  /// used at clock-in and for an active shift whose settings regressed.
  final bool mandatory;
  final GpsPolicy policy;

  const TrackingSetupSheet({super.key, required this.mandatory, required this.policy});

  /// Resolves true once the phone is set up, false if the driver backed out
  /// (only possible when [mandatory] is false).
  static Future<bool> show(BuildContext context, {required bool mandatory, required GpsPolicy policy}) async {
    final result = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      isDismissible: !mandatory,
      enableDrag: !mandatory,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (_) => PopScope(
        canPop: !mandatory,
        child: TrackingSetupSheet(mandatory: mandatory, policy: policy),
      ),
    );
    return result == true;
  }

  @override
  State<TrackingSetupSheet> createState() => _TrackingSetupSheetState();
}

class _TrackingSetupSheetState extends State<TrackingSetupSheet> with WidgetsBindingObserver {
  TrackingHealth? _health;
  bool _aggressiveOem = false;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _refresh();
    TrackingGuard.isAggressiveManufacturer().then((v) {
      if (mounted) setState(() => _aggressiveOem = v);
    });
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) _refresh();
  }

  Future<void> _refresh() async {
    final h = await TrackingGuard.check();
    if (!mounted) return;
    setState(() => _health = h);
  }

  Future<void> _run(Future<void> Function() action) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      await action();
    } finally {
      if (mounted) setState(() => _busy = false);
      await _refresh();
    }
  }

  Widget _row({
    required IconData icon,
    required String title,
    required String detail,
    required bool ok,
    required String buttonLabel,
    required VoidCallback onPressed,
    bool optional = false,
  }) {
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: ok ? const Color(0xFFF3FAF5) : TachyoTheme.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: ok ? const Color(0xFFBFE3C9) : TachyoTheme.border),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 38,
            height: 38,
            decoration: BoxDecoration(
              color: ok ? const Color(0xFF1B8A3D) : TachyoTheme.brandRed.withValues(alpha: 0.1),
              shape: BoxShape.circle,
            ),
            child: Icon(ok ? Icons.check_rounded : icon, size: 20, color: ok ? Colors.white : TachyoTheme.brandRed),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Flexible(child: Text(title, style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w800, color: TachyoTheme.charcoal))),
                    if (optional) ...[
                      const SizedBox(width: 6),
                      const Text('recommended', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: TachyoTheme.charcoalLight)),
                    ],
                  ],
                ),
                const SizedBox(height: 3),
                Text(detail, style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w500, color: TachyoTheme.charcoalMid, height: 1.35)),
                if (!ok) ...[
                  const SizedBox(height: 10),
                  SizedBox(
                    height: 38,
                    child: ElevatedButton(
                      onPressed: _busy ? null : onPressed,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: TachyoTheme.brandRed,
                        foregroundColor: Colors.white,
                        elevation: 0,
                        padding: const EdgeInsets.symmetric(horizontal: 16),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                        textStyle: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700),
                      ),
                      child: Text(buttonLabel),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final h = _health;
    final policy = widget.policy;
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.fromLTRB(20, 14, 20, 16 + MediaQuery.of(context).viewInsets.bottom),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Center(
                child: Container(width: 40, height: 4, decoration: BoxDecoration(color: TachyoTheme.border, borderRadius: BorderRadius.circular(2))),
              ),
              const SizedBox(height: 16),
              const Text('Keep Tachyo tracking', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: TachyoTheme.charcoal)),
              const SizedBox(height: 4),
              const Text(
                'Your manager sees your shift live and your journey is saved. These phone settings keep that working with the screen off.',
                style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w500, color: TachyoTheme.charcoalMid, height: 1.4),
              ),
              const SizedBox(height: 16),
              if (h == null)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 30),
                  child: Center(child: CircularProgressIndicator(color: TachyoTheme.brandRed, strokeWidth: 2.5)),
                )
              else ...[
                _row(
                  icon: Icons.my_location_rounded,
                  title: 'Location: allow all the time',
                  detail: h.always
                      ? 'Tachyo can read your location in the background.'
                      : 'Choose "Allow all the time" — "only while using the app" stops tracking when the screen turns off.',
                  ok: h.always,
                  buttonLabel: h.permanentlyDenied ? 'Open app settings' : 'Allow all the time',
                  onPressed: () => _run(TrackingGuard.requestAlwaysLocation),
                ),
                if (TrackingGuard.isIOS)
                  _row(
                    icon: Icons.center_focus_strong_rounded,
                    title: 'Precise Location on',
                    detail: h.precise
                        ? 'Tachyo gets your exact position.'
                        : 'Precise Location is off, so your position is only roughly known and isn\'t sent. Open Location in Tachyo\'s settings and turn Precise Location on.',
                    ok: h.precise,
                    buttonLabel: 'Open app settings',
                    onPressed: () => _run(TrackingGuard.openAppSettings),
                  ),
                _row(
                  icon: Icons.gps_fixed_rounded,
                  title: 'GPS switched on',
                  detail: h.servicesOn ? 'Your phone\'s location is on.' : 'Location is switched off on your phone.',
                  ok: h.servicesOn,
                  buttonLabel: 'Open location settings',
                  onPressed: () => _run(TrackingGuard.openLocationSettings),
                ),
                _row(
                  icon: Icons.battery_charging_full_rounded,
                  title: 'Battery: unrestricted',
                  detail: h.batteryOk
                      ? 'Your phone won\'t put Tachyo to sleep.'
                      : 'Stop the phone putting Tachyo to sleep to save battery — that\'s the main reason tracking drops out.',
                  ok: h.batteryOk,
                  buttonLabel: 'Allow background use',
                  onPressed: () => _run(TrackingGuard.requestBatteryExemption),
                ),
                _row(
                  icon: Icons.notifications_active_outlined,
                  title: 'Notifications',
                  detail: h.notificationsOk ? 'You\'ll be warned if tracking stops.' : 'So Tachyo can warn you if tracking stops.',
                  ok: h.notificationsOk,
                  buttonLabel: 'Allow notifications',
                  onPressed: () => _run(TrackingGuard.requestNotifications),
                  optional: true,
                ),
                if (_aggressiveOem && h.batteryOk)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: OutlinedButton.icon(
                      onPressed: _busy ? null : () => _run(TrackingGuard.openManufacturerPowerSettings),
                      icon: const Icon(Icons.settings_suggest_outlined, size: 18),
                      label: const Text('Your phone brand has an extra power setting — open it'),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: TachyoTheme.charcoal,
                        side: const BorderSide(color: TachyoTheme.border),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                        textStyle: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600),
                      ),
                    ),
                  ),
              ],
              if (policy.notifyDriver && policy.detectionEnabled) ...[
                const SizedBox(height: 4),
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(color: const Color(0xFFFFF7E6), borderRadius: BorderRadius.circular(12), border: Border.all(color: const Color(0xFFF1D9A0))),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Icon(Icons.info_outline_rounded, size: 18, color: Color(0xFF8A5A00)),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Text(
                          'If Tachyo stops tracking for ${policy.afterMinutes} minutes: ${policy.consequence}',
                          style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: Color(0xFF6B4500), height: 1.4),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
              const SizedBox(height: 16),
              ElevatedButton(
                onPressed: (h?.healthy ?? false) ? () => Navigator.of(context).pop(true) : null,
                style: ElevatedButton.styleFrom(
                  backgroundColor: TachyoTheme.brandRed,
                  foregroundColor: Colors.white,
                  disabledBackgroundColor: TachyoTheme.border,
                  disabledForegroundColor: TachyoTheme.charcoalLight,
                  elevation: 0,
                  minimumSize: const Size.fromHeight(52),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                  textStyle: const TextStyle(fontSize: 15.5, fontWeight: FontWeight.w800),
                ),
                child: Text((h?.healthy ?? false) ? 'Continue' : 'Turn on the settings above to continue'),
              ),
              if (!widget.mandatory)
                TextButton(
                  onPressed: () => Navigator.of(context).pop(false),
                  child: const Text('Not now', style: TextStyle(color: TachyoTheme.charcoalLight, fontWeight: FontWeight.w600)),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
