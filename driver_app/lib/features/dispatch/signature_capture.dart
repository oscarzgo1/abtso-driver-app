import 'package:flutter/material.dart';
import '../../config/theme.dart';

/// A signature taken on the driver's phone as proof of delivery when a
/// photo isn't possible (client feedback, Oct 2026): who received the load
/// (first + last name) and their signature, stored as SVG path data so the
/// admin panel can show it and print it at any size.
class DeliverySignature {
  final String firstName;
  final String lastName;
  final String svg;
  final DateTime signedAt;
  final double? lat;
  final double? lng;

  const DeliverySignature({
    required this.firstName,
    required this.lastName,
    required this.svg,
    required this.signedAt,
    this.lat,
    this.lng,
  });

  String get fullName => '$firstName $lastName';

  /// The shape the proof RPC / attach-load function expect for a
  /// `pod_type: 'signature'` entry.
  Map<String, dynamic> toProofJson() => {
        'pod_type': 'signature',
        'first_name': firstName,
        'last_name': lastName,
        'signature_svg': svg,
        'lat': lat,
        'lng': lng,
        'taken_at': signedAt.toUtc().toIso8601String(),
      };
}

class SignatureResult {
  final String firstName;
  final String lastName;
  final String svg;
  const SignatureResult(this.firstName, this.lastName, this.svg);
}

/// Opens the full-screen signature panel. Returns null if cancelled.
Future<SignatureResult?> showSignatureCapture(
  BuildContext context, {
  String? initialFirstName,
  String? initialLastName,
}) {
  return Navigator.of(context).push<SignatureResult>(MaterialPageRoute(
    fullscreenDialog: true,
    builder: (_) => _SignatureCaptureScreen(firstName: initialFirstName ?? '', lastName: initialLastName ?? ''),
  ));
}

/// Renders stored signature SVG-path strokes as a small preview.
class SignaturePreview extends StatelessWidget {
  final String svg;
  final double height;
  const SignaturePreview({super.key, required this.svg, this.height = 44});

  @override
  Widget build(BuildContext context) {
    final strokes = _parseStrokes(svg);
    final size = _parseViewBox(svg);
    return SizedBox(
      height: height,
      child: AspectRatio(
        aspectRatio: size.width / size.height,
        child: CustomPaint(painter: _SignaturePainter(strokes, scaleTo: size)),
      ),
    );
  }

  static Size _parseViewBox(String svg) {
    final m = RegExp(r'viewBox="0 0 ([0-9.]+) ([0-9.]+)"').firstMatch(svg);
    if (m == null) return const Size(300, 170);
    return Size(double.tryParse(m.group(1)!) ?? 300, double.tryParse(m.group(2)!) ?? 170);
  }

  static List<List<Offset>> _parseStrokes(String svg) {
    final d = RegExp(r'd="([^"]*)"').firstMatch(svg)?.group(1) ?? '';
    final strokes = <List<Offset>>[];
    List<Offset>? current;
    for (final tok in RegExp(r'([ML])([0-9.\-]+) ([0-9.\-]+)').allMatches(d)) {
      final p = Offset(double.tryParse(tok.group(2)!) ?? 0, double.tryParse(tok.group(3)!) ?? 0);
      if (tok.group(1) == 'M') {
        current = [p];
        strokes.add(current);
      } else {
        current?.add(p);
      }
    }
    return strokes;
  }
}

class _SignatureCaptureScreen extends StatefulWidget {
  final String firstName;
  final String lastName;
  const _SignatureCaptureScreen({required this.firstName, required this.lastName});

  @override
  State<_SignatureCaptureScreen> createState() => _SignatureCaptureScreenState();
}

class _SignatureCaptureScreenState extends State<_SignatureCaptureScreen> {
  final List<List<Offset>> _strokes = [];
  late final TextEditingController _first = TextEditingController(text: widget.firstName);
  late final TextEditingController _last = TextEditingController(text: widget.lastName);
  bool _confirmed = false;
  Size _padSize = const Size(300, 190);

  @override
  void dispose() {
    _first.dispose();
    _last.dispose();
    super.dispose();
  }

  bool get _hasSignature => _strokes.any((s) => s.length > 1);
  bool get _valid => _hasSignature && _confirmed && _first.text.trim().isNotEmpty && _last.text.trim().isNotEmpty;

  String _toSvg() {
    final buffer = StringBuffer();
    for (final stroke in _strokes) {
      if (stroke.isEmpty) continue;
      buffer.write('M${stroke.first.dx.toStringAsFixed(1)} ${stroke.first.dy.toStringAsFixed(1)}');
      for (final p in stroke.skip(1)) {
        buffer.write(' L${p.dx.toStringAsFixed(1)} ${p.dy.toStringAsFixed(1)}');
      }
      buffer.write(' ');
    }
    final w = _padSize.width.toStringAsFixed(0);
    final h = _padSize.height.toStringAsFixed(0);
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 $w $h"><path d="${buffer.toString().trim()}" fill="none" stroke="#111111" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }

  InputDecoration _decoration(String label) => InputDecoration(
        labelText: label,
        filled: true,
        fillColor: TachyoTheme.surface,
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
        labelStyle: const TextStyle(fontWeight: FontWeight.w600, color: TachyoTheme.charcoalLight),
      );

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: Colors.white,
        foregroundColor: TachyoTheme.charcoal,
        elevation: 0,
        title: const Text('Delivery signature', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 17)),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 4, 20, 28),
        // Drawing must not scroll the page.
        physics: const ClampingScrollPhysics(),
        children: [
          const Text(
            'Hand your phone to the person receiving the load. They enter their name and sign with a finger.',
            style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w500, color: TachyoTheme.charcoalMid, height: 1.4),
          ),
          const SizedBox(height: 18),
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _first,
                  textCapitalization: TextCapitalization.words,
                  textInputAction: TextInputAction.next,
                  onChanged: (_) => setState(() {}),
                  decoration: _decoration('First name'),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: TextField(
                  controller: _last,
                  textCapitalization: TextCapitalization.words,
                  textInputAction: TextInputAction.done,
                  onChanged: (_) => setState(() {}),
                  decoration: _decoration('Last name'),
                ),
              ),
            ],
          ),
          const SizedBox(height: 18),
          Row(
            children: [
              const Text('Sign here', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: TachyoTheme.charcoalMid)),
              const Spacer(),
              if (_strokes.isNotEmpty)
                TextButton(
                  onPressed: () => setState(_strokes.clear),
                  child: const Text('Clear', style: TextStyle(fontWeight: FontWeight.w700, color: TachyoTheme.brandRed)),
                ),
            ],
          ),
          LayoutBuilder(builder: (context, constraints) {
            _padSize = Size(constraints.maxWidth, 190);
            return Container(
              height: 190,
              decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(14), border: Border.all(color: Colors.black26, width: 1.5)),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(13),
                child: GestureDetector(
                  behavior: HitTestBehavior.opaque,
                  onPanStart: (d) => setState(() => _strokes.add([d.localPosition])),
                  onPanUpdate: (d) => setState(() => _strokes.last.add(d.localPosition)),
                  child: CustomPaint(painter: _SignaturePainter(_strokes), size: Size.infinite),
                ),
              ),
            );
          }),
          const SizedBox(height: 12),
          CheckboxListTile(
            value: _confirmed,
            onChanged: (v) => setState(() => _confirmed = v ?? false),
            activeColor: TachyoTheme.brandRed,
            contentPadding: EdgeInsets.zero,
            controlAffinity: ListTileControlAffinity.leading,
            title: const Text(
              'I confirm I have received this load.',
              style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700, color: TachyoTheme.charcoal),
            ),
          ),
          const SizedBox(height: 10),
          ElevatedButton(
            onPressed: _valid
                ? () => Navigator.of(context).pop(SignatureResult(_first.text.trim(), _last.text.trim(), _toSvg()))
                : null,
            style: ElevatedButton.styleFrom(
              backgroundColor: TachyoTheme.brandRed,
              foregroundColor: Colors.white,
              disabledBackgroundColor: TachyoTheme.border,
              elevation: 0,
              minimumSize: const Size.fromHeight(52),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
              textStyle: const TextStyle(fontSize: 15.5, fontWeight: FontWeight.w800),
            ),
            child: const Text('Save signature'),
          ),
        ],
      ),
    );
  }
}

class _SignaturePainter extends CustomPainter {
  final List<List<Offset>> strokes;
  final Size? scaleTo;
  _SignaturePainter(this.strokes, {this.scaleTo});

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = const Color(0xFF111111)
      ..strokeWidth = 2.5
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round
      ..style = PaintingStyle.stroke;
    if (scaleTo != null) {
      canvas.scale(size.width / scaleTo!.width, size.height / scaleTo!.height);
    }
    for (final stroke in strokes) {
      if (stroke.length < 2) continue;
      final path = Path()..moveTo(stroke.first.dx, stroke.first.dy);
      for (final p in stroke.skip(1)) {
        path.lineTo(p.dx, p.dy);
      }
      canvas.drawPath(path, paint);
    }
  }

  @override
  bool shouldRepaint(covariant _SignaturePainter old) => true;
}
