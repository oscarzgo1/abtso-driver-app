import 'dart:math' as math;
import 'package:flutter/material.dart';

/// A single circular progress ring — dark track, rounded-cap colour arc,
/// percentage in the centre, label underneath. Reimplements the visual
/// design of 21st.dev's community "Circle Progress" component
/// (https://21st.dev/community/components?q=Progress+rings&preview=%2F%40hihahihahoho%2Fcomponents%2Fcircle-progress)
/// natively in Flutter — that component is React/Tailwind and can't run
/// in this app directly, so this is a from-scratch CustomPainter match:
/// same track/arc/rounded-cap structure, same green→amber→red colour
/// escalation by progress level, same "circle with number underneath"
/// layout.
class ProgressRing extends StatelessWidget {
  /// 0.0–1.0. Values outside that range are clamped, so a ring never
  /// visually overflows or reads as negative progress.
  final double progress;
  final String label;
  final String centerText;
  final double size;
  final double strokeWidth;
  /// When null, colour escalates with [progress] (green low → amber
  /// mid → red near/at the limit) — used for rings where "high" is a
  /// warning (e.g. rest running low). Pass an explicit colour for rings
  /// where more progress is simply good (e.g. earnings toward target).
  final Color? color;
  final bool isDark;

  const ProgressRing({
    super.key,
    required this.progress,
    required this.label,
    required this.centerText,
    this.size = 96,
    this.strokeWidth = 8,
    this.color,
    required this.isDark,
  });

  Color _autoColor(double p) {
    if (p >= 0.9) return const Color(0xFFCC0000);
    if (p >= 0.6) return const Color(0xFFF59E0B);
    return const Color(0xFF10B981);
  }

  @override
  Widget build(BuildContext context) {
    final clamped = progress.clamp(0.0, 1.0);
    final ringColor = color ?? _autoColor(clamped);
    final trackColor = isDark ? const Color(0xFF262626) : const Color(0xFFE5E5E5);
    final textColor = isDark ? Colors.white : const Color(0xFF111111);
    final mutedColor = isDark ? Colors.white60 : Colors.black54;

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        SizedBox(
          width: size,
          height: size,
          child: Stack(
            alignment: Alignment.center,
            children: [
              CustomPaint(
                size: Size(size, size),
                painter: _RingPainter(progress: clamped, trackColor: trackColor, ringColor: ringColor, strokeWidth: strokeWidth),
              ),
              Text(
                centerText,
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: size * 0.16, fontWeight: FontWeight.w900, color: textColor),
              ),
            ],
          ),
        ),
        const SizedBox(height: 8),
        Text(
          label,
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: mutedColor, letterSpacing: 0.2),
        ),
      ],
    );
  }
}

class _RingPainter extends CustomPainter {
  final double progress;
  final Color trackColor;
  final Color ringColor;
  final double strokeWidth;

  _RingPainter({required this.progress, required this.trackColor, required this.ringColor, required this.strokeWidth});

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final radius = (math.min(size.width, size.height) - strokeWidth) / 2;

    final trackPaint = Paint()
      ..color = trackColor
      ..style = PaintingStyle.stroke
      ..strokeWidth = strokeWidth
      ..strokeCap = StrokeCap.round;
    canvas.drawCircle(center, radius, trackPaint);

    if (progress > 0) {
      final ringPaint = Paint()
        ..color = ringColor
        ..style = PaintingStyle.stroke
        ..strokeWidth = strokeWidth
        ..strokeCap = StrokeCap.round;
      // Starts at 12 o'clock, sweeps clockwise — matches the reference.
      const startAngle = -math.pi / 2;
      final sweepAngle = 2 * math.pi * progress;
      canvas.drawArc(Rect.fromCircle(center: center, radius: radius), startAngle, sweepAngle, false, ringPaint);
    }
  }

  @override
  bool shouldRepaint(covariant _RingPainter oldDelegate) =>
      oldDelegate.progress != progress || oldDelegate.trackColor != trackColor || oldDelegate.ringColor != ringColor || oldDelegate.strokeWidth != strokeWidth;
}
