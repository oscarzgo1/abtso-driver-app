import 'dart:math' as math;
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'auth_provider.dart';
import '../../legal/presentation/legal_review_screen.dart';

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

class _LoginScreenState extends ConsumerState<LoginScreen> with TickerProviderStateMixin {
  final _companyCodeController = TextEditingController();
  final _driverIdController = TextEditingController();
  final _pinController = TextEditingController();
  final _formKey = GlobalKey<FormState>();
  bool _acceptedTerms = false;

  late AnimationController _shakeController;
  late Animation<double> _shakeAnimation;

  // Two independently-timed controllers drive the soft background blobs —
  // different durations keep the pair drifting out of sync with each other
  // instead of breathing in lockstep, which reads as more organic.
  late final AnimationController _blobController1;
  late final AnimationController _blobController2;

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

    _blobController1 = AnimationController(
      duration: const Duration(seconds: 14),
      vsync: this,
    )..repeat(reverse: true);
    _blobController2 = AnimationController(
      duration: const Duration(seconds: 19),
      vsync: this,
    )..repeat(reverse: true);

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
    _companyCodeController.dispose();
    _driverIdController.dispose();
    _pinController.dispose();
    _shakeController.dispose();
    _blobController1.dispose();
    _blobController2.dispose();
    super.dispose();
  }

  // A soft, blurred-looking circle (radial gradient fading to transparent —
  // cheaper than an actual blur filter) that drifts gently within
  // [driftRange] as [animation] runs. Positioned via whichever of
  // left/top/right/bottom is supplied, so it can anchor to any corner.
  Widget _buildBlob({
    required Animation<double> animation,
    required double size,
    required Color color,
    double? left,
    double? top,
    double? right,
    double? bottom,
    required Offset driftRange,
  }) {
    return AnimatedBuilder(
      animation: animation,
      builder: (context, child) {
        final dx = driftRange.dx * animation.value;
        final dy = driftRange.dy * animation.value;
        return Positioned(
          left: left != null ? left + dx : null,
          top: top != null ? top + dy : null,
          right: right != null ? right - dx : null,
          bottom: bottom != null ? bottom - dy : null,
          child: child!,
        );
      },
      child: Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          gradient: RadialGradient(
            colors: [color, color.withValues(alpha: 0)],
          ),
        ),
      ),
    );
  }

  /// Opens the consolidated legal document review. Tapping its header
  /// "Accept & Close" checks this screen's consent box automatically;
  /// closing via the X or the back gesture leaves it exactly as it was
  /// (the box can always still be ticked manually without opening this).
  Future<void> _openLegalReview() async {
    final accepted = await Navigator.of(context).push<bool>(
      MaterialPageRoute(builder: (_) => const LegalReviewScreen()),
    );
    if (accepted == true && mounted) {
      setState(() => _acceptedTerms = true);
    }
  }

  void _handleLogin() {
    if (!_acceptedTerms) return; // Button is disabled in this state; guarded here too.
    if (_formKey.currentState!.validate()) {
      FocusScope.of(context).unfocus();
      ref.read(authProvider.notifier).login(
            _companyCodeController.text,
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
              Image.asset('assets/images/tachyo_logo.png', height: 40, fit: BoxFit.contain),
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
      body: Stack(
        children: [
          // Soft drifting colour blobs behind everything — background stays
          // white/near-white, this just gives it some depth instead of
          // being completely flat.
          Positioned.fill(
            child: IgnorePointer(
              child: ClipRect(
                child: Stack(
                  children: [
                    _buildBlob(
                      animation: _blobController1,
                      size: 260,
                      color: const Color(0xFFCC0000).withValues(alpha: 0.07),
                      left: -80,
                      top: -60,
                      driftRange: const Offset(30, 25),
                    ),
                    _buildBlob(
                      animation: _blobController2,
                      size: 220,
                      color: const Color(0xFF333333).withValues(alpha: 0.05),
                      right: -60,
                      bottom: -40,
                      driftRange: const Offset(25, 20),
                    ),
                  ],
                ),
              ),
            ),
          ),
          SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 40),
            child: AnimatedBuilder(
              animation: _shakeAnimation,
              builder: (context, child) {
                return Transform.translate(
                  offset: Offset(_shakeAnimation.value, 0),
                  child: child,
                );
              },
              // Capped, not full-bleed — on a wide (desktop/tablet) viewport
              // the card used to stretch edge to edge while every font/icon
              // inside stayed at its small fixed size, which is exactly why
              // it read as "too small": tiny content in a huge box. A real
              // max-width keeps the card a sensibly-sized, well-proportioned
              // block centered on the grey background at any viewport size.
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 460),
                child: Container(
                width: double.infinity,
                padding: const EdgeInsets.fromLTRB(32, 40, 32, 32),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(24),
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
                    // Brand mark
                    Center(
                      child: Image.asset('assets/images/tachyo_logo.png', height: 58, fit: BoxFit.contain),
                    ),

                    const SizedBox(height: 12),

                    Text(
                      'LOGISTICS & TRANSPORT',
                      textAlign: TextAlign.center,
                      style: theme.textTheme.bodyMedium?.copyWith(
                        fontSize: 12,
                        letterSpacing: 1.5,
                        fontWeight: FontWeight.w800,
                        color: const Color(0xFF555555),
                      ),
                    ),

                    const SizedBox(height: 32),

                    // Company Code Input — namespaces every driver ID by
                    // employer, since driver IDs are only unique within a
                    // single company.
                    TextFormField(
                      controller: _companyCodeController,
                      style: GoogleFonts.outfit(color: const Color(0xFF333333), fontWeight: FontWeight.w600, fontSize: 16),
                      decoration: InputDecoration(
                        hintText: 'COMPANY CODE',
                        hintStyle: GoogleFonts.outfit(fontSize: 14, color: const Color(0xFF999999), fontWeight: FontWeight.w500),
                        counterText: '',
                        isDense: true,
                        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
                        prefixIcon: const Icon(Icons.apartment_outlined, color: Color(0xFF888888), size: 22),
                        prefixIconConstraints: const BoxConstraints(minWidth: 42, minHeight: 22),
                        filled: true,
                        fillColor: const Color(0xFFF5F5F5),
                        enabledBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(14),
                          borderSide: const BorderSide(color: Color(0xFFBBBBBB), width: 1.5),
                        ),
                        focusedBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(14),
                          borderSide: const BorderSide(color: Color(0xFF333333), width: 2),
                        ),
                      ),
                      textCapitalization: TextCapitalization.none,
                      autocorrect: false,
                      maxLength: 40,
                      validator: (value) {
                        if (value == null || value.trim().isEmpty) {
                          return 'COMPANY CODE REQUIRED';
                        }
                        return null;
                      },
                    ),

                    const SizedBox(height: 16),

                    // Driver ID / Username Input
                    TextFormField(
                      controller: _driverIdController,
                      style: GoogleFonts.outfit(color: const Color(0xFF333333), fontWeight: FontWeight.w600, fontSize: 16),
                      decoration: InputDecoration(
                        hintText: 'USERNAME OR ID (e.g. john.smith)',
                        hintStyle: GoogleFonts.outfit(fontSize: 14, color: const Color(0xFF999999), fontWeight: FontWeight.w500),
                        counterText: '',
                        isDense: true,
                        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
                        prefixIcon: const Icon(Icons.person_outline, color: Color(0xFF888888), size: 22),
                        prefixIconConstraints: const BoxConstraints(minWidth: 42, minHeight: 22),
                        filled: true,
                        fillColor: const Color(0xFFF5F5F5),
                        enabledBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(14),
                          borderSide: const BorderSide(color: Color(0xFFBBBBBB), width: 1.5),
                        ),
                        focusedBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(14),
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

                    const SizedBox(height: 16),

                    // PIN Input
                    TextFormField(
                      controller: _pinController,
                      style: GoogleFonts.outfit(color: const Color(0xFF333333), fontWeight: FontWeight.w600, fontSize: 16),
                      decoration: InputDecoration(
                        hintText: 'SECURITY PIN (6 DIGITS)',
                        hintStyle: GoogleFonts.outfit(fontSize: 14, color: const Color(0xFF999999), fontWeight: FontWeight.w500),
                        counterText: '',
                        isDense: true,
                        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
                        prefixIcon: const Icon(Icons.lock_outline, color: Color(0xFF888888), size: 22),
                        prefixIconConstraints: const BoxConstraints(minWidth: 42, minHeight: 22),
                        filled: true,
                        fillColor: const Color(0xFFF5F5F5),
                        enabledBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(14),
                          borderSide: const BorderSide(color: Color(0xFFBBBBBB), width: 1.5),
                        ),
                        focusedBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(14),
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

                    const SizedBox(height: 24),

                    // Error Message
                    if (authState.status == AuthStatus.error) ...[
                      Text(
                        authState.errorMessage?.toUpperCase() ?? 'LOGIN FAILED',
                        style: GoogleFonts.outfit(
                          color: const Color(0xFFCC0000),
                          fontWeight: FontWeight.w700,
                          fontSize: 13,
                        ),
                        textAlign: TextAlign.center,
                      ),
                      const SizedBox(height: 18),
                    ],

                    // Terms & Conditions consent — required before login is
                    // possible; replaces the old post-login acceptance screen.
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        SizedBox(
                          width: 26,
                          height: 26,
                          child: Checkbox(
                            value: _acceptedTerms,
                            onChanged: (value) => setState(() => _acceptedTerms = value ?? false),
                            activeColor: const Color(0xFFCC0000),
                            materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                            visualDensity: VisualDensity.compact,
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(5)),
                          ),
                        ),
                        const SizedBox(width: 12),
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
                                style: GoogleFonts.outfit(
                                  fontSize: 13.5,
                                  height: 1.4,
                                  color: const Color(0xFF555555),
                                  fontWeight: FontWeight.w600,
                                ),
                                children: [
                                  const TextSpan(text: 'I accept the '),
                                  TextSpan(
                                    text: 'Terms & Conditions',
                                    style: GoogleFonts.outfit(
                                      color: const Color(0xFFCC0000),
                                      fontWeight: FontWeight.w800,
                                      decoration: TextDecoration.underline,
                                      decorationColor: const Color(0xFFCC0000),
                                    ),
                                    recognizer: TapGestureRecognizer()..onTap = () => _openLegalReview(),
                                  ),
                                  const TextSpan(text: ' and '),
                                  TextSpan(
                                    text: 'Privacy Policy',
                                    style: GoogleFonts.outfit(
                                      color: const Color(0xFFCC0000),
                                      fontWeight: FontWeight.w800,
                                      decoration: TextDecoration.underline,
                                      decorationColor: const Color(0xFFCC0000),
                                    ),
                                    // Both discrete links open the same
                                    // consolidated document feed — there's
                                    // one real modal covering every policy,
                                    // not a separate destination per link.
                                    recognizer: TapGestureRecognizer()..onTap = () => _openLegalReview(),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),

                    const SizedBox(height: 24),

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
                        minimumSize: const Size(double.infinity, 54),
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                        elevation: 2,
                        shadowColor: const Color(0xFFCC0000).withValues(alpha: 0.4),
                      ),
                      child: authState.status == AuthStatus.loading
                          ? const SizedBox(
                              width: 20,
                              height: 20,
                              child: CircularProgressIndicator(
                                strokeWidth: 2.5,
                                color: Colors.white,
                              ),
                            )
                          : Text(
                              'Log in',
                              style: GoogleFonts.outfit(
                                fontSize: 16,
                                fontWeight: FontWeight.w700,
                                letterSpacing: 0.3,
                              ),
                            ),
                    ),

                    const SizedBox(height: 32),

                    // Clean typography footer
                    const Text(
                      'PRIVATE SYSTEM ACCESS\nAUTHORISED EMPLOYEES ONLY',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontSize: 11,
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
          ),
        ],
      ),
    );
  }
}
