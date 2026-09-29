import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'auth_provider.dart';
import 'widgets/tachyo_brand.dart';
import '../../../config/theme.dart';

/// Entrance cinematic (~2.1s, tap anywhere to skip). When it plays is
/// decided by EntranceGate — after a sign-in, or a cold start after a
/// 5-hour break, never mid-shift.
///
/// Timeline (fraction of the controller):
///   0.00–0.25  road draws in from the left
///   0.05–0.40  truck mark drives in and brakes, red trail fading behind it
///   0.36–0.50  suspension settle
///   0.36–0.64  "tachyo" letters rise in, red full stop drops
///   0.58–0.80  "Good morning, John" rises in
///   0.84–1.00  composition lifts away, ink turns to the home background
class GreetingScreen extends ConsumerStatefulWidget {
  const GreetingScreen({super.key});

  @override
  ConsumerState<GreetingScreen> createState() => _GreetingScreenState();
}

class _GreetingScreenState extends ConsumerState<GreetingScreen> with SingleTickerProviderStateMixin {
  late final AnimationController _controller;
  bool _started = false;
  bool _done = false;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 2100),
    )..addStatusListener((status) {
        if (status == AnimationStatus.completed) _finish();
      });
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_started) return;
    _started = true;
    if (MediaQuery.disableAnimationsOf(context)) {
      // Reduced motion: show the settled composition briefly, no movement.
      _controller.value = 0.8;
      Future.delayed(const Duration(milliseconds: 900), _finish);
    } else {
      _controller.forward();
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _finish() {
    if (_done || !mounted) return;
    _done = true;
    context.goNamed('home');
  }

  static double _phase(double t, double begin, double end, [Curve curve = Curves.linear]) =>
      curve.transform(((t - begin) / (end - begin)).clamp(0.0, 1.0));

  static String _salutation(DateTime now) {
    final h = now.hour;
    if (h >= 5 && h < 12) return 'Good morning';
    if (h >= 12 && h < 17) return 'Good afternoon';
    if (h >= 17 && h < 22) return 'Good evening';
    return 'Welcome back';
  }

  @override
  Widget build(BuildContext context) {
    final driver = ref.watch(authProvider).driver;
    final fullName = driver?['full_name'] as String?;
    final firstName = (fullName != null && fullName.trim().isNotEmpty)
        ? fullName.trim().split(' ').first
        : null;
    final salutation = _salutation(DateTime.now());
    final greetingText = firstName != null ? '$salutation, $firstName' : salutation;

    return PopScope(
      canPop: false,
      child: Scaffold(
        backgroundColor: TachyoTheme.ink,
        body: GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: _finish,
          child: AnimatedBuilder(
            animation: _controller,
            builder: (context, _) {
              final t = _controller.value;
              final exit = _phase(t, 0.84, 1.0, Curves.easeInCubic);

              return AnnotatedRegion<SystemUiOverlayStyle>(
                value: exit > 0.5 ? SystemUiOverlayStyle.dark : SystemUiOverlayStyle.light,
                child: ColoredBox(
                  color: Color.lerp(TachyoTheme.ink, TachyoTheme.white, exit)!,
                  child: SizedBox.expand(
                    child: Opacity(
                      opacity: 1 - exit,
                      child: Transform.translate(
                        offset: Offset(0, -40 * exit),
                        child: LayoutBuilder(
                          builder: (context, c) => _buildScene(c.biggest, t, greetingText),
                        ),
                      ),
                    ),
                  ),
                ),
              );
            },
          ),
        ),
      ),
    );
  }

  Widget _buildScene(Size size, double t, String greetingText) {
    const markH = 84.0;
    const markW = markH * 563 / 511; // tachyo_mark.png aspect ratio
    final roadY = size.height / 2; // same line the cold-start splash showed

    final roadReveal = _phase(t, 0.0, 0.25, Curves.easeOutCubic);
    final drive = _phase(t, 0.05, 0.40, const Cubic(0.2, 0.9, 0.25, 1.0));
    final settle = math.sin(_phase(t, 0.36, 0.50) * math.pi) * 3;
    final wordProgress = _phase(t, 0.36, 0.64);
    final greet = _phase(t, 0.58, 0.80, Curves.easeOutCubic);

    // Mark centre, offset from screen centre: starts fully off the left edge.
    final markX = -(size.width / 2 + markW) * (1 - drive);
    final markLeft = size.width / 2 + markX - markW / 2;
    final trailOpacity = drive > 0 && drive < 1 ? (1 - drive) * 0.9 : 0.0;

    return Stack(
      children: [
        Positioned(
          left: 0,
          right: 0,
          top: roadY - 12,
          height: 24,
          child: CustomPaint(
            painter: RoadPainter(
              reveal: roadReveal,
              trailX: markLeft + markW * 0.15,
              trailOpacity: trailOpacity,
            ),
          ),
        ),
        Positioned(
          left: markLeft,
          top: roadY + 8 - markH + settle,
          width: markW,
          height: markH,
          child: const TachyoMark(height: markH),
        ),
        Positioned(
          left: 0,
          right: 0,
          top: roadY + 40,
          child: Center(child: TachyoWordmark(fontSize: 46, progress: wordProgress)),
        ),
        Positioned(
          left: 24,
          right: 24,
          top: roadY + 112,
          child: Opacity(
            opacity: greet,
            child: Transform.translate(
              offset: Offset(0, 14 * (1 - greet)),
              child: Text(
                greetingText,
                textAlign: TextAlign.center,
                style: GoogleFonts.outfit(
                  fontSize: 21,
                  fontWeight: FontWeight.w500,
                  color: Colors.white.withValues(alpha: 0.85),
                  letterSpacing: -0.2,
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}
