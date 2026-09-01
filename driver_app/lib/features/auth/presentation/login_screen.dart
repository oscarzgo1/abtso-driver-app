import 'dart:math' as math;
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'auth_provider.dart';

class ShakeCurve extends Curve {
  final double count;
  const ShakeCurve({this.count = 3.0});

  @override
  double transformInternal(double t) {
    return math.sin(t * count * 2 * math.pi);
  }
}

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> with SingleTickerProviderStateMixin {
  final _driverIdController = TextEditingController();
  final _pinController = TextEditingController();
  final _formKey = GlobalKey<FormState>();
  bool _acceptedTerms = false;

  late AnimationController _shakeController;
  late Animation<double> _shakeAnimation;

  @override
  void initState() {
    super.initState();
    _shakeController = AnimationController(
      duration: const Duration(milliseconds: 400),
      vsync: this,
    );
    _shakeAnimation = Tween<double>(begin: 0.0, end: 12.0)
        .animate(CurvedAnimation(
          parent: _shakeController,
          curve: const ShakeCurve(),
        ))
      ..addStatusListener((status) {
        if (status == AnimationStatus.completed) {
          _shakeController.reset();
        }
      });

    // Handle immediate redirect if already authenticated on launch.
    // The user stays logged in until they explicitly sign out — see
    // AuthNotifier.checkSession, which restores this session indefinitely
    // and never bounces the driver back here over a transient network issue.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final auth = ref.read(authProvider);
      if (mounted && auth.status == AuthStatus.authenticated) {
        context.goNamed('home');
      }
    });
  }

  @override
  void dispose() {
    _driverIdController.dispose();
    _pinController.dispose();
    _shakeController.dispose();
    super.dispose();
  }

  void _handleLogin() {
    if (!_acceptedTerms) return; // Button is disabled in this state; guarded here too.
    if (_formKey.currentState!.validate()) {
      FocusScope.of(context).unfocus();
      ref.read(authProvider.notifier).login(
            _driverIdController.text,
            _pinController.text,
          );
    }
  }

  @override
  Widget build(BuildContext context) {
    final authState = ref.watch(authProvider);
    final theme = Theme.of(context);

    // Listen for authentication success or failure
    ref.listen<AuthState>(authProvider, (prev, next) {
      if (next.status == AuthStatus.authenticated && prev?.status != AuthStatus.authenticated) {
        // Terms were accepted via the checkbox on this screen, which is the
        // only way to reach a successful login — record it against the
        // driver's profile now that a session exists. Login itself is not
        // gated on this write succeeding: a slow/offline acceptance sync
        // should never block a driver from starting a shift.
        ref.read(authProvider.notifier).acceptTerms();
        context.goNamed('greeting');
      } else if (next.status == AuthStatus.error) {
        _shakeController.forward();
      }
    });

    if (authState.status == AuthStatus.loading) {
      return Scaffold(
        backgroundColor: Colors.white,
        body: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Image.asset('assets/images/abtso_logo_transparent.png', height: 48, fit: BoxFit.contain),
              const SizedBox(height: 24),
              const SizedBox(
                width: 24,
                height: 24,
                child: CircularProgressIndicator(
                  strokeWidth: 2.5,
                  valueColor: AlwaysStoppedAnimation<Color>(Color(0xFFCC0000)),
                ),
              ),
            ],
          ),
        ),
      );
    }

    return Scaffold(
      backgroundColor: const Color(0xFFFAFAFA),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 32),
            child: AnimatedBuilder(
              animation: _shakeAnimation,
              builder: (context, child) {
                return Transform.translate(
                  offset: Offset(_shakeAnimation.value, 0),
                  child: child,
                );
              },
              child: Container(
                padding: const EdgeInsets.fromLTRB(24, 32, 24, 24),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(20),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withValues(alpha: 0.06),
                      blurRadius: 24,
                      offset: const Offset(0, 8),
                    ),
                  ],
                ),
                child: Form(
                  key: _formKey,
                  child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    // Official ABTSO Image Logo
                    Center(
                      child: Image.asset(
                        'assets/images/abtso_logo_transparent.png',
                        height: 54,
                        fit: BoxFit.contain,
                      ),
                    ),

                    const SizedBox(height: 10),

                    Text(
                      'LOGISTICS & TRANSPORT',
                      textAlign: TextAlign.center,
                      style: theme.textTheme.bodyMedium?.copyWith(
                        fontSize: 10,
                        letterSpacing: 1.5,
                        fontWeight: FontWeight.w800,
                        color: const Color(0xFF555555),
                      ),
                    ),

                    const SizedBox(height: 28),

                    // Driver ID / Username Input
                    TextFormField(
                      controller: _driverIdController,
                      style: const TextStyle(color: Color(0xFF333333), fontWeight: FontWeight.bold, fontSize: 13),
                      decoration: InputDecoration(
                        hintText: 'USERNAME OR ID (e.g. john.smith)',
                        hintStyle: const TextStyle(fontSize: 12),
                        counterText: '',
                        isDense: true,
                        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                        prefixIcon: const Icon(Icons.person_outline, color: Color(0xFF888888), size: 18),
                        prefixIconConstraints: const BoxConstraints(minWidth: 36, minHeight: 18),
                        filled: true,
                        fillColor: const Color(0xFFF5F5F5),
                        enabledBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                          borderSide: const BorderSide(color: Color(0xFFBBBBBB), width: 1.5),
                        ),
                        focusedBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                          borderSide: const BorderSide(color: Color(0xFF333333), width: 2),
                        ),
                      ),
                      textCapitalization: TextCapitalization.none,
                      autocorrect: false,
                      maxLength: 40,
                      validator: (value) {
                        if (value == null || value.trim().isEmpty) {
                          return 'USERNAME OR EMPLOYEE ID REQUIRED';
                        }
                        return null;
                      },
                    ),

                    const SizedBox(height: 12),

                    // PIN Input
                    TextFormField(
                      controller: _pinController,
                      style: const TextStyle(color: Color(0xFF333333), fontWeight: FontWeight.bold, fontSize: 13),
                      decoration: InputDecoration(
                        hintText: 'SECURITY PIN (6 DIGITS)',
                        hintStyle: const TextStyle(fontSize: 12),
                        counterText: '',
                        isDense: true,
                        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                        prefixIcon: const Icon(Icons.lock_outline, color: Color(0xFF888888), size: 18),
                        prefixIconConstraints: const BoxConstraints(minWidth: 36, minHeight: 18),
                        filled: true,
                        fillColor: const Color(0xFFF5F5F5),
                        enabledBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                          borderSide: const BorderSide(color: Color(0xFFBBBBBB), width: 1.5),
                        ),
                        focusedBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                          borderSide: const BorderSide(color: Color(0xFF333333), width: 2),
                        ),
                      ),
                      obscureText: true,
                      keyboardType: TextInputType.number,
                      maxLength: 6,
                      inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                      validator: (value) {
                        if (value == null || value.trim().isEmpty) {
                          return 'PIN REQUIRED';
                        }
                        if (value.trim().length != 6) {
                          return 'PIN MUST BE 6 DIGITS';
                        }
                        return null;
                      },
                    ),

                    const SizedBox(height: 20),

                    // Error Message
                    if (authState.status == AuthStatus.error) ...[
                      Text(
                        authState.errorMessage?.toUpperCase() ?? 'LOGIN FAILED',
                        style: const TextStyle(
                          color: Color(0xFFCC0000),
                          fontWeight: FontWeight.w700,
                          fontSize: 12,
                        ),
                        textAlign: TextAlign.center,
                      ),
                      const SizedBox(height: 16),
                    ],

                    // Terms & Conditions consent — required before login is
                    // possible; replaces the old post-login acceptance screen.
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        SizedBox(
                          width: 22,
                          height: 22,
                          child: Checkbox(
                            value: _acceptedTerms,
                            onChanged: (value) => setState(() => _acceptedTerms = value ?? false),
                            activeColor: const Color(0xFFCC0000),
                            materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                            visualDensity: VisualDensity.compact,
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(4)),
                          ),
                        ),
                        const SizedBox(width: 10),
                        // Deliberately not wrapped in its own tap-to-toggle
                        // GestureDetector: doing so would put a second
                        // TapGestureRecognizer in the same gesture arena as
                        // the "Terms & Conditions" link below, making it
                        // unreliable which one wins on tap. The checkbox
                        // above is the sole toggle; this text carries only
                        // the link's own recognizer.
                        Expanded(
                          child: Padding(
                            padding: const EdgeInsets.only(top: 3),
                            child: RichText(
                              text: TextSpan(
                                style: const TextStyle(
                                  fontSize: 12,
                                  height: 1.4,
                                  color: Color(0xFF555555),
                                  fontWeight: FontWeight.w600,
                                ),
                                children: [
                                  const TextSpan(text: 'I accept the '),
                                  TextSpan(
                                    text: 'Terms & Conditions and Privacy Policy',
                                    style: const TextStyle(
                                      color: Color(0xFFCC0000),
                                      fontWeight: FontWeight.w800,
                                      decoration: TextDecoration.underline,
                                      decorationColor: Color(0xFFCC0000),
                                    ),
                                    recognizer: TapGestureRecognizer()
                                      ..onTap = () => context.pushNamed('legal'),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),

                    const SizedBox(height: 20),

                    // Login Button (Sleek, brand red primary action)
                    ElevatedButton(
                      onPressed: (authState.status == AuthStatus.loading || !_acceptedTerms)
                          ? null
                          : _handleLogin,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFFCC0000),
                        foregroundColor: Colors.white,
                        disabledBackgroundColor: const Color(0xFFE0A0A0),
                        disabledForegroundColor: Colors.white.withValues(alpha: 0.85),
                        minimumSize: const Size(double.infinity, 44),
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(10),
                        ),
                        elevation: 2,
                        shadowColor: const Color(0xFFCC0000).withValues(alpha: 0.4),
                      ),
                      child: authState.status == AuthStatus.loading
                          ? const SizedBox(
                              width: 18,
                              height: 18,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: Colors.white,
                              ),
                            )
                          : Text(
                              'Log in',
                              style: GoogleFonts.outfit(
                                fontSize: 14,
                                fontWeight: FontWeight.w700,
                                letterSpacing: 0.3,
                              ),
                            ),
                    ),

                    const SizedBox(height: 28),

                    // Clean typography footer
                    const Text(
                      'PRIVATE SYSTEM ACCESS\nAUTHORISED EMPLOYEES ONLY',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontSize: 9,
                        letterSpacing: 0.8,
                        fontWeight: FontWeight.w600,
                        color: Color(0xFF888888),
                      ),
                    ),
                  ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
