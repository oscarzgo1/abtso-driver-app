import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../../../core/network/supabase_service.dart';

// Roadworthiness sign-off (migration 063). A unit or trailer with an
// expired MOT, road tax, insurance or inspection — or marked VOR — can
// still be taken, but only after the driver signs on screen that they
// accept responsibility. The signature is stored as SVG path data and
// shows up in the admin panel's Alert Panel straight away.

const Color _kRed = Color(0xFFCC0000);
const Color _kInk = Color(0xFF111111);

/// What's wrong with a vehicle, in plain words. Empty = fine to drive.
List<String> vehicleRoadworthinessIssues(Map<String, dynamic> v) {
  if (v['custom'] == true) return const [];
  final issues = <String>[];
  final now = DateTime.now();
  final today = DateTime(now.year, now.month, now.day);
  final fmt = DateFormat('d MMM yyyy');
  if (v['is_vor'] == true) issues.add('Marked VOR (vehicle off road)');
  void checkDate(String key, String label) {
    final raw = v[key]?.toString();
    if (raw == null || raw.isEmpty) return;
    final d = DateTime.tryParse(raw);
    if (d != null && d.isBefore(today)) issues.add('$label expired ${fmt.format(d)}');
  }
  checkDate('mot_due_date', 'MOT');
  checkDate('tax_due_date', 'Road tax');
  checkDate('insurance_expiry_date', 'Insurance');
  checkDate('inspection_due_date', 'Safety inspection');
  return issues;
}

/// Shows the warning and, if the driver chooses to go ahead, the
/// signature pad. Returns true only once a signed acknowledgement has
/// been saved; false means pick another vehicle.
Future<bool> confirmRoadworthinessSignOff(
  BuildContext context, {
  required Map<String, dynamic> vehicle,
  required List<String> issues,
  required String signOffContext,
  String? driverName,
  String? shiftId,
}) async {
  final result = await Navigator.of(context).push<bool>(MaterialPageRoute(
    fullscreenDialog: true,
    builder: (_) => _SignOffScreen(
      vehicle: vehicle,
      issues: issues,
      signOffContext: signOffContext,
      driverName: driverName ?? '',
      shiftId: shiftId,
    ),
  ));
  return result == true;
}

class _SignOffScreen extends StatefulWidget {
  final Map<String, dynamic> vehicle;
  final List<String> issues;
  final String signOffContext;
  final String driverName;
  final String? shiftId;

  const _SignOffScreen({
    required this.vehicle,
    required this.issues,
    required this.signOffContext,
    required this.driverName,
    this.shiftId,
  });

  @override
  State<_SignOffScreen> createState() => _SignOffScreenState();
}

class _SignOffScreenState extends State<_SignOffScreen> {
  final List<List<Offset>> _strokes = [];
  late final TextEditingController _name = TextEditingController(text: widget.driverName);
  bool _accepted = false;
  bool _saving = false;
  String? _error;
  Size _padSize = const Size(300, 160);

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  bool get _hasSignature => _strokes.any((s) => s.length > 1);
  bool get _canSign => _hasSignature && _accepted && _name.text.trim().length >= 2 && !_saving;

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

  Future<void> _sign() async {
    setState(() {
      _saving = true;
      _error = null;
    });
    final ok = await SupabaseService.recordVehicleRiskAcknowledgement(
      vehicleId: widget.vehicle['id'] as String,
      issues: widget.issues,
      signOffContext: widget.signOffContext,
      signerName: _name.text.trim(),
      signatureSvg: _toSvg(),
      shiftId: widget.shiftId,
    );
    if (!mounted) return;
    if (ok) {
      Navigator.of(context).pop(true);
    } else {
      setState(() {
        _saving = false;
        _error = "Couldn't save your signature — check your signal and try again.";
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final textMain = isDark ? Colors.white : _kInk;
    final textMuted = isDark ? Colors.white60 : Colors.black54;
    final reg = (widget.vehicle['vehicle_number'] as String? ?? '').toUpperCase();
    final isTrailer = widget.vehicle['vehicle_type'] == 'trailer';

    return Scaffold(
      backgroundColor: isDark ? const Color(0xFF0D0D0D) : Colors.white,
      appBar: AppBar(
        backgroundColor: _kRed,
        foregroundColor: Colors.white,
        title: const Text('NOT ROADWORTHY', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 15, letterSpacing: 0.5)),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 20, 20, 32),
        children: [
          Row(
            children: [
              Icon(isTrailer ? Icons.rv_hookup_outlined : Icons.local_shipping_outlined, color: _kRed, size: 26),
              const SizedBox(width: 10),
              Text(reg, style: TextStyle(fontFamily: 'monospace', fontWeight: FontWeight.w900, fontSize: 20, color: textMain)),
            ],
          ),
          const SizedBox(height: 14),
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(color: _kRed.withValues(alpha: 0.08), borderRadius: BorderRadius.circular(12), border: Border.all(color: _kRed.withValues(alpha: 0.4))),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                for (final issue in widget.issues)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 3),
                    child: Row(
                      children: [
                        const Icon(Icons.error_outline, color: _kRed, size: 18),
                        const SizedBox(width: 8),
                        Expanded(child: Text(issue, style: const TextStyle(fontWeight: FontWeight.w800, color: _kRed, fontSize: 13.5))),
                      ],
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 14),
          Text(
            'This ${isTrailer ? 'trailer' : 'unit'} should not be on the road. Choose another if you can. '
            'If you still take it, you must sign below — your manager is told immediately.',
            style: TextStyle(fontSize: 13, color: textMuted),
          ),
          const SizedBox(height: 16),
          OutlinedButton(
            onPressed: _saving ? null : () => Navigator.of(context).pop(false),
            style: OutlinedButton.styleFrom(
              foregroundColor: textMain,
              side: BorderSide(color: isDark ? Colors.white38 : Colors.black38),
              minimumSize: const Size(double.infinity, 48),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            ),
            child: const Text('CHOOSE ANOTHER VEHICLE', style: TextStyle(fontWeight: FontWeight.w900)),
          ),
          const SizedBox(height: 24),
          Text('YOUR NAME', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w900, letterSpacing: 0.6, color: textMuted)),
          const SizedBox(height: 6),
          TextField(
            controller: _name,
            onChanged: (_) => setState(() {}),
            style: TextStyle(color: textMain, fontWeight: FontWeight.w700),
            decoration: InputDecoration(
              filled: true,
              fillColor: isDark ? const Color(0xFF1A1A1A) : const Color(0xFFF5F5F5),
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
            ),
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              Text('SIGN HERE', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w900, letterSpacing: 0.6, color: textMuted)),
              const Spacer(),
              if (_strokes.isNotEmpty)
                TextButton(
                  onPressed: () => setState(_strokes.clear),
                  style: TextButton.styleFrom(foregroundColor: textMuted, minimumSize: const Size(0, 30)),
                  child: const Text('Clear'),
                ),
            ],
          ),
          const SizedBox(height: 6),
          LayoutBuilder(builder: (context, constraints) {
            _padSize = Size(constraints.maxWidth, 170);
            return Container(
              height: 170,
              decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12), border: Border.all(color: Colors.black26)),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(12),
                child: GestureDetector(
                  onPanStart: (d) => setState(() => _strokes.add([d.localPosition])),
                  onPanUpdate: (d) => setState(() => _strokes.last.add(d.localPosition)),
                  child: CustomPaint(painter: _SignaturePainter(_strokes), size: Size.infinite),
                ),
              ),
            );
          }),
          const SizedBox(height: 14),
          CheckboxListTile(
            value: _accepted,
            onChanged: (v) => setState(() => _accepted = v ?? false),
            activeColor: _kRed,
            contentPadding: EdgeInsets.zero,
            controlAffinity: ListTileControlAffinity.leading,
            title: Text(
              'I know this ${isTrailer ? 'trailer' : 'unit'} is not roadworthy and I take it on my own responsibility.',
              style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: textMain),
            ),
          ),
          if (_error != null) ...[
            const SizedBox(height: 8),
            Text(_error!, style: const TextStyle(color: _kRed, fontWeight: FontWeight.w700)),
          ],
          const SizedBox(height: 12),
          ElevatedButton(
            onPressed: _canSign ? _sign : null,
            style: ElevatedButton.styleFrom(
              backgroundColor: _kRed,
              foregroundColor: Colors.white,
              disabledBackgroundColor: isDark ? Colors.white12 : Colors.black12,
              minimumSize: const Size(double.infinity, 50),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            ),
            child: _saving
                ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.white))
                : const Text('SIGN & TAKE RESPONSIBILITY', style: TextStyle(fontWeight: FontWeight.w900)),
          ),
        ],
      ),
    );
  }
}

class _SignaturePainter extends CustomPainter {
  final List<List<Offset>> strokes;
  _SignaturePainter(this.strokes);

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = _kInk
      ..strokeWidth = 2.5
      ..strokeCap = StrokeCap.round
      ..style = PaintingStyle.stroke;
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
  bool shouldRepaint(covariant _SignaturePainter oldDelegate) => true;
}
