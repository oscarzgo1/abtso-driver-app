import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../../../config/theme.dart';

/// The red truck mark on its own (keyed out of the launcher icon), so it can
/// be animated separately from the wordmark.
class TachyoMark extends StatelessWidget {
  final double height;
  const TachyoMark({super.key, this.height = 64});

  @override
  Widget build(BuildContext context) {
    return Image.asset(
      'assets/images/tachyo_mark.png',
      height: height,
      fit: BoxFit.contain,
      filterQuality: FilterQuality.medium,
    );
  }
}

/// "tachyo." set in code rather than as an image: crisp on any surface and
/// animatable. [progress] 0→1 brings the letters in one by one, then drops
/// the red full stop; leave it at 1 for the static wordmark.
class TachyoWordmark extends StatelessWidget {
  final double fontSize;
  final double progress;
  final Color color;

  const TachyoWordmark({
    super.key,
    this.fontSize = 40,
    this.progress = 1,
    this.color = TachyoTheme.wordmark,
  });

  static const _letters = ['t', 'a', 'c', 'h', 'y', 'o'];

  @override
  Widget build(BuildContext context) {
    final style = GoogleFonts.outfit(
      fontSize: fontSize,
      fontWeight: FontWeight.w700,
      color: color,
      height: 1.0,
    );

    final children = <Widget>[];
    for (var i = 0; i < _letters.length; i++) {
      final t = ((progress - i * 0.09) / 0.22).clamp(0.0, 1.0);
      final e = Curves.easeOutCubic.transform(t);
      children.add(Opacity(
        opacity: e,
        child: Transform.translate(
          offset: Offset(0, (1 - e) * fontSize * 0.35),
          child: Text(_letters[i], style: style),
        ),
      ));
    }

    final dotT = ((progress - 0.72) / 0.28).clamp(0.0, 1.0);
    final drop = Curves.bounceOut.transform(dotT);
    children.add(Opacity(
      opacity: dotT > 0 ? 1 : 0,
      child: Transform.translate(
        offset: Offset(0, -(1 - drop) * fontSize * 0.9),
        child: Text('.', style: style.copyWith(color: TachyoTheme.brandRed)),
      ),
    ));

    return Row(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.baseline,
      textBaseline: TextBaseline.alphabetic,
      children: children,
    );
  }
}

/// Mark + wordmark (+ tagline when not [compact]) for the login header.
class TachyoLockup extends StatelessWidget {
  final bool compact;
  const TachyoLockup({super.key, this.compact = false});

  @override
  Widget build(BuildContext context) {
    return AnimatedSwitcher(
      duration: const Duration(milliseconds: 260),
      child: compact
          ? const Row(
              key: ValueKey('compact'),
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                TachyoMark(height: 38),
                SizedBox(width: 12),
                TachyoWordmark(fontSize: 30),
              ],
            )
          : Column(
              key: const ValueKey('full'),
              mainAxisSize: MainAxisSize.min,
              children: [
                const TachyoMark(height: 68),
                const SizedBox(height: 12),
                const TachyoWordmark(fontSize: 42),
                const SizedBox(height: 8),
                Text(
                  'LOGISTICS & TRANSPORT',
                  style: GoogleFonts.outfit(
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    letterSpacing: 2.4,
                    color: TachyoTheme.charcoalLight,
                  ),
                ),
              ],
            ),
    );
  }
}

/// A road seen side-on: a hairline edge plus a dashed lane line, faded out
/// at both ends. [phase] 0→1 scrolls the dashes by one period (repeat it for
/// a moving road); [reveal] 0→1 draws the road in from the left.
/// [trailX]/[trailOpacity] paint a short red streak behind a vehicle.
class RoadPainter extends CustomPainter {
  final double phase;
  final double reveal;
  final double? trailX;
  final double trailOpacity;
  final Color color;

  const RoadPainter({
    this.phase = 0,
    this.reveal = 1,
    this.trailX,
    this.trailOpacity = 0,
    this.color = TachyoTheme.roadLine,
  });

  static const double _dash = 22;
  static const double _period = 40;

  @override
  void paint(Canvas canvas, Size size) {
    if (reveal <= 0) return;
    final bounds = Offset.zero & size;
    final end = size.width * reveal;
    final y = size.height / 2;

    Paint faded(double strokeWidth, Color c) => Paint()
      ..strokeWidth = strokeWidth
      ..strokeCap = StrokeCap.round
      ..shader = LinearGradient(
        colors: [c.withValues(alpha: 0), c, c, c.withValues(alpha: 0)],
        stops: const [0, 0.18, 0.82, 1],
      ).createShader(bounds);

    canvas.drawLine(Offset(0, y + 9), Offset(end, y + 9), faded(1, color));

    final dashPaint = faded(3, color);
    for (var x = -(phase * _period); x < end; x += _period) {
      final segEnd = (x + _dash).clamp(0.0, end);
      if (segEnd > x) canvas.drawLine(Offset(x, y), Offset(segEnd, y), dashPaint);
    }

    if (trailX != null && trailOpacity > 0) {
      const length = 120.0;
      final from = Offset(trailX! - length, y + 9);
      final to = Offset(trailX!, y + 9);
      canvas.drawLine(
        from,
        to,
        Paint()
          ..strokeWidth = 2
          ..strokeCap = StrokeCap.round
          ..shader = LinearGradient(colors: [
            TachyoTheme.brandRed.withValues(alpha: 0),
            TachyoTheme.brandRed.withValues(alpha: trailOpacity),
          ]).createShader(Rect.fromPoints(from, to.translate(0, 1))),
      );
    }
  }

  @override
  bool shouldRepaint(RoadPainter old) =>
      old.phase != phase ||
      old.reveal != reveal ||
      old.trailX != trailX ||
      old.trailOpacity != trailOpacity ||
      old.color != color;
}
