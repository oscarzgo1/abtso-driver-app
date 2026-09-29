import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../../core/network/supabase_service.dart';

/// One-time activation code + choose your own PIN (migration 065).
/// Admins can't set or see driver PINs any more; instead the panel
/// issues a code, the driver enters it here, and picks their own 6-digit
/// PIN. Easy PINs (all one digit, sequences, xyxyxy) are refused by the
/// server too, so the check can't be side-stepped.
class ActivationScreen extends StatefulWidget {
  final String? initialCompanyCode;
  final String? initialDriverId;
  const ActivationScreen({super.key, this.initialCompanyCode, this.initialDriverId});

  @override
  State<ActivationScreen> createState() => _ActivationScreenState();
}

const Color _kRed = Color(0xFFCC0000);
const Color _kInk = Color(0xFF111111);

class _ActivationScreenState extends State<ActivationScreen> {
  int _step = 0; // 0: enter code, 1: choose PIN
  late final TextEditingController _driverIdController = TextEditingController(text: widget.initialDriverId ?? '');
  final _codeController = TextEditingController();
  final _pinController = TextEditingController();
  final _confirmController = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _driverIdController.dispose();
    _codeController.dispose();
    _pinController.dispose();
    _confirmController.dispose();
    super.dispose();
  }

  Future<void> _verify() async {
    final id = _driverIdController.text.trim();
    final code = _codeController.text.trim();
    if (id.isEmpty || code.isEmpty) {
      setState(() => _error = 'Enter your Driver ID and the activation code from your manager.');
      return;
    }
    setState(() { _busy = true; _error = null; });
    final result = await SupabaseService.verifyActivationCode(driverId: id, code: code);
    if (!mounted) return;
    setState(() => _busy = false);
    if (result['success'] == true) {
      setState(() => _step = 1);
    } else {
      setState(() => _error = result['error']?.toString() ?? 'That code isn\'t valid.');
    }
  }

  Future<void> _setPin() async {
    final pin = _pinController.text.trim();
    final confirm = _confirmController.text.trim();
    if (!RegExp(r'^\d{6}$').hasMatch(pin)) {
      setState(() => _error = 'Your PIN must be 6 digits.');
      return;
    }
    if (pin != confirm) {
      setState(() => _error = 'The two PINs don\'t match.');
      return;
    }
    setState(() { _busy = true; _error = null; });
    final result = await SupabaseService.setPinFromActivationCode(
      driverId: _driverIdController.text.trim(),
      code: _codeController.text.trim(),
      pin: pin,
    );
    if (!mounted) return;
    setState(() => _busy = false);
    if (result['success'] == true) {
      showDialog<void>(
        context: context,
        barrierDismissible: false,
        builder: (dialogContext) => AlertDialog(
          title: const Text('You\'re all set', style: TextStyle(fontWeight: FontWeight.w900)),
          content: const Text('Sign in with your Driver ID and your new PIN.'),
          actions: [
            ElevatedButton(
              onPressed: () { Navigator.pop(dialogContext); Navigator.pop(context); },
              style: ElevatedButton.styleFrom(backgroundColor: _kRed, foregroundColor: Colors.white),
              child: const Text('Sign in'),
            ),
          ],
        ),
      );
    } else {
      setState(() => _error = result['error']?.toString() ?? 'Could not save your PIN.');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFFAFAFA),
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        foregroundColor: _kInk,
        title: Text('Activate your app', style: GoogleFonts.outfit(fontWeight: FontWeight.w800, fontSize: 16, color: _kInk)),
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(24, 24, 24, 32),
          children: _step == 0 ? _stepEnterCode() : _stepChoosePin(),
        ),
      ),
    );
  }

  List<Widget> _stepEnterCode() => [
        const Text('Step 1 of 2', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w900, color: _kRed, letterSpacing: 0.5)),
        const SizedBox(height: 6),
        const Text('Enter your activation code', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w900, color: _kInk)),
        const SizedBox(height: 8),
        const Text('Your manager gave you a code like TCH-XXXXX. It works once and expires after 48 hours.',
            style: TextStyle(fontSize: 13, color: Colors.black54)),
        const SizedBox(height: 20),
        _field(_driverIdController, 'DRIVER ID', 'DRV-001', capitalize: true),
        const SizedBox(height: 12),
        _field(_codeController, 'ACTIVATION CODE', 'TCH-XXXXX', capitalize: true),
        if (_error != null) ...[
          const SizedBox(height: 12),
          Text(_error!, style: const TextStyle(color: _kRed, fontWeight: FontWeight.w700)),
        ],
        const SizedBox(height: 20),
        _primaryButton(_busy ? 'CHECKING…' : 'CONTINUE', _busy ? null : _verify),
      ];

  List<Widget> _stepChoosePin() => [
        const Text('Step 2 of 2', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w900, color: _kRed, letterSpacing: 0.5)),
        const SizedBox(height: 6),
        const Text('Choose your 6-digit PIN', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w900, color: _kInk)),
        const SizedBox(height: 8),
        const Text('Only you should know this. Avoid obvious PINs like 123456 or your birth year.',
            style: TextStyle(fontSize: 13, color: Colors.black54)),
        const SizedBox(height: 20),
        _pinField(_pinController, 'NEW PIN'),
        const SizedBox(height: 12),
        _pinField(_confirmController, 'CONFIRM PIN'),
        if (_error != null) ...[
          const SizedBox(height: 12),
          Text(_error!, style: const TextStyle(color: _kRed, fontWeight: FontWeight.w700)),
        ],
        const SizedBox(height: 20),
        _primaryButton(_busy ? 'SAVING…' : 'SET MY PIN', _busy ? null : _setPin),
      ];

  Widget _field(TextEditingController c, String label, String hint, {bool capitalize = false}) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w900, color: Colors.black54, letterSpacing: 0.6)),
          const SizedBox(height: 6),
          TextField(
            controller: c,
            textCapitalization: capitalize ? TextCapitalization.characters : TextCapitalization.none,
            style: const TextStyle(fontFamily: 'monospace', fontWeight: FontWeight.w800, fontSize: 15, letterSpacing: 0.6),
            decoration: InputDecoration(
              hintText: hint,
              filled: true,
              fillColor: const Color(0xFFF5F5F5),
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
              contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
            ),
          ),
        ],
      );

  Widget _pinField(TextEditingController c, String label) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w900, color: Colors.black54, letterSpacing: 0.6)),
          const SizedBox(height: 6),
          TextField(
            controller: c,
            keyboardType: TextInputType.number,
            inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(6)],
            obscureText: true,
            style: const TextStyle(fontFamily: 'monospace', fontWeight: FontWeight.w900, fontSize: 20, letterSpacing: 0.4),
            decoration: InputDecoration(
              hintText: '••••••',
              filled: true,
              fillColor: const Color(0xFFF5F5F5),
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
              contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
            ),
          ),
        ],
      );

  Widget _primaryButton(String text, VoidCallback? onTap) => ElevatedButton(
        onPressed: onTap,
        style: ElevatedButton.styleFrom(
          backgroundColor: _kRed,
          foregroundColor: Colors.white,
          disabledBackgroundColor: const Color(0xFFE0A0A0),
          minimumSize: const Size(double.infinity, 52),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        ),
        child: Text(text, style: GoogleFonts.outfit(fontSize: 15, fontWeight: FontWeight.w900, letterSpacing: 0.3)),
      );
}
