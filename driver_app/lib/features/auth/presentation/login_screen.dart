import 'dart:math' as math;
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'auth_provider.dart';
import 'activation_screen.dart';
import 'widgets/pin_boxes.dart';
import 'widgets/tachyo_brand.dart';
import '../../legal/presentation/legal_review_screen.dart';
import '../../../config/theme.dart';
import '../../../core/network/supabase_service.dart';
import '../../../core/services/entrance_gate.dart';

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
  // Survives logout (unlike the session_* keys) — the company code is not a
  // secret and rarely changes, so drivers only retype their ID and PIN.
  static const _rememberedCompanyKey = 'remembered_company_code';

  final _companyCodeController = TextEditingController();
  final _driverIdController = TextEditingController();
  final _pinController = TextEditingController();
  final _formKey = GlobalKey<FormState>();
  final _buttonKey = GlobalKey();
  bool _acceptedTerms = false;
  bool _obscurePin = true;
  String? _pinError;

  /// True once the driver pressed Log in here. Separates a real sign-in
  /// (form stays up, button morphs) from the silent session restore on cold
  /// start (branded splash, then home or the entrance cinematic).
  bool _submitted = false;
  bool _succeeded = false;
  bool _navigating = false;
  bool _introStarted = false;
  bool _revealing = false;
  Offset _revealOrigin = Offset.zero;

  late final AnimationController _shakeController;
  late final Animation<double> _shakeAnimation;
  late final AnimationController _introController; // header + sheet entrance
  late final AnimationController _roadController; // header lane markings
  late final AnimationController _revealController; // red wash after success

  @override
  void initState() {
    super.initState();
    _shakeController = AnimationController(
      duration: const Duration(milliseconds: 400),
      vsync: this,
    );
    _shakeAnimation = Tween<double>(begin: 0.0, end: 10.0)
        .animate(CurvedAnimation(
          parent: _shakeController,
          curve: const ShakeCurve(),
        ))
      ..addStatusListener((status) {
        if (status == AnimationStatus.completed) {
          _shakeController.reset();
        }
      });

    _introController = AnimationController(
      duration: const Duration(milliseconds: 900),
      vsync: this,
    );
    _roadController = AnimationController(
      duration: const Duration(milliseconds: 2400),
      vsync: this,
    );
    _revealController = AnimationController(
      duration: const Duration(milliseconds: 460),
      vsync: this,
    );

    _loadRememberedCompanyCode();

    // Handle immediate redirect if already authenticated on launch.
    // The user stays logged in until they explicitly sign out — see
    // AuthNotifier.checkSession, which restores this session indefinitely
    // and never bounces the driver back here over a transient network issue.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final auth = ref.read(authProvider);
      if (mounted && auth.status == AuthStatus.authenticated && !_navigating) {
        _navigating = true;
        context.goNamed('home');
      }
    });
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final reduceMotion = MediaQuery.disableAnimationsOf(context);
    if (reduceMotion) _introController.value = 1;

    // Lane markings only move while the header is fully visible — they stop
    // as soon as the keyboard opens (header collapses) to save battery.
    final runRoad = !reduceMotion && MediaQuery.viewInsetsOf(context).bottom == 0;
    if (runRoad && !_roadController.isAnimating) {
      _roadController.repeat();
    } else if (!runRoad && _roadController.isAnimating) {
      _roadController.stop();
    }
  }

  @override
  void dispose() {
    _companyCodeController.dispose();
    _driverIdController.dispose();
    _pinController.dispose();
    _shakeController.dispose();
    _introController.dispose();
    _roadController.dispose();
    _revealController.dispose();
    super.dispose();
  }

  Future<void> _loadRememberedCompanyCode() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final code = prefs.getString(_rememberedCompanyKey);
      if (!mounted || code == null || _companyCodeController.text.isNotEmpty) return;
      _companyCodeController.text = code;
    } catch (_) {}
  }

  Future<void> _rememberCompanyCode() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_rememberedCompanyKey, _companyCodeController.text.trim());
    } catch (_) {}
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

  String? _validatePin(String value) {
    final pin = value.trim();
    if (pin.isEmpty) return 'Enter your 6-digit PIN';
    if (pin.length != 6) return 'Your PIN is 6 digits';
    return null;
  }

  void _handleLogin() {
    if (!_acceptedTerms) return; // Button is disabled in this state; guarded here too.
    final formOk = _formKey.currentState!.validate();
    final pinError = _validatePin(_pinController.text);
    setState(() => _pinError = pinError);
    if (!formOk || pinError != null) {
      HapticFeedback.lightImpact();
      return;
    }
    FocusScope.of(context).unfocus();
    _submitted = true;
    ref.read(authProvider.notifier).login(
          _companyCodeController.text,
          _driverIdController.text,
          _pinController.text,
        );
  }

  void _clearAuthError() {
    if (ref.read(authProvider).status == AuthStatus.error) {
      ref.read(authProvider.notifier).clearError();
    }
  }

  /// Cold start with a stored session — no form was shown to the driver.
  void _onSessionRestored() {
    if (_navigating) return;
    _navigating = true;
    context.goNamed(EntranceGate.playOnColdStart ? 'greeting' : 'home');
  }

  /// The driver just signed in here: ✓ on the button, the button's circle
  /// washes over the screen, fading to white, and the cinematic picks up from there.
  Future<void> _onSignedIn() async {
    if (_navigating) return;
    _navigating = true;
    _rememberCompanyCode();
    HapticFeedback.lightImpact();
    setState(() => _succeeded = true);

    final play = await EntranceGate.playAfterLogin();
    await Future.delayed(const Duration(milliseconds: 360));
    if (!mounted) return;

    if (!play) {
      context.goNamed('home');
      return;
    }
    if (MediaQuery.disableAnimationsOf(context)) {
      context.goNamed('greeting');
      return;
    }

    final box = _buttonKey.currentContext?.findRenderObject() as RenderBox?;
    if (box != null && box.hasSize) {
      _revealOrigin = box.localToGlobal(box.size.center(Offset.zero));
    } else {
      _revealOrigin = MediaQuery.sizeOf(context).center(Offset.zero);
    }
    setState(() => _revealing = true);
    await _revealController.forward();
    if (mounted) context.goNamed('greeting');
  }

  void _onLoginFailed() {
    HapticFeedback.mediumImpact();
    _pinController.clear();
    _shakeController.forward(from: 0);
  }

  @override
  Widget build(BuildContext context) {
    final authState = ref.watch(authProvider);

    // Listen for authentication success or failure
    ref.listen<AuthState>(authProvider, (prev, next) {
      if (next.status == AuthStatus.authenticated && prev?.status != AuthStatus.authenticated) {
        // Terms were accepted via the checkbox on this screen, which is the
        // only way to reach a successful login — record it against the
        // driver's profile now that a session exists. Login itself is not
        // gated on this write succeeding: a slow/offline acceptance sync
        // should never block a driver from starting a shift.
        ref.read(authProvider.notifier).acceptTerms();
        if (_submitted) {
          _onSignedIn();
        } else {
          _onSessionRestored();
        }
      } else if (next.status == AuthStatus.error && prev?.status != AuthStatus.error && _submitted) {
        _onLoginFailed();
      }
    });

    // Restoring a stored session (cold start) — show the brand splash, never
    // the form, so a signed-in driver doesn't see the login flash past.
    if (!_submitted &&
        (authState.status == AuthStatus.loading || authState.status == AuthStatus.authenticated)) {
      return const _BrandSplash();
    }

    if (!_introStarted) {
      _introStarted = true;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _introController.forward();
      });
    }

    final media = MediaQuery.of(context);
    final keyboardOpen = media.viewInsets.bottom > 0;
    final headerHeight = keyboardOpen
        ? media.padding.top + 96
        : (media.size.height * 0.34).clamp(230.0, 330.0);

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.dark,
      child: Scaffold(
        backgroundColor: TachyoTheme.brandSurfaceEdge,
        body: Stack(
          children: [
            Column(
              children: [
                AnimatedContainer(
                  duration: const Duration(milliseconds: 320),
                  curve: Curves.easeOutCubic,
                  height: headerHeight,
                  width: double.infinity,
                  child: _LoginHeader(
                    road: _roadController,
                    intro: _introController,
                    compact: keyboardOpen,
                  ),
                ),
                Expanded(child: _buildSheet(authState)),
              ],
            ),
            Positioned.fill(
              child: IgnorePointer(
                ignoring: !_revealing,
                child: AnimatedBuilder(
                  animation: _revealController,
                  builder: (context, _) => CustomPaint(
                    painter: _RevealPainter(
                      origin: _revealOrigin,
                      progress: _revealController.value,
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSheet(AuthState authState) {
    final slide = CurvedAnimation(
      parent: _introController,
      curve: const Interval(0.25, 1, curve: Curves.easeOutCubic),
    );
    final hasAuthError = authState.status == AuthStatus.error && authState.errorMessage != null;

    return AnimatedBuilder(
      animation: slide,
      builder: (context, child) => Transform.translate(
        offset: Offset(0, 56 * (1 - slide.value)),
        child: Opacity(opacity: slide.value, child: child),
      ),
      // Capped width: on a tablet/desktop viewport the sheet stays a
      // well-proportioned column instead of stretching edge to edge.
      child: Align(
        alignment: Alignment.topCenter,
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 480),
          child: Container(
            constraints: const BoxConstraints.expand(),
            // White on white: a soft upward shadow keeps the sheet's
            // rounded edge readable against the header.
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.07),
                  blurRadius: 24,
                  offset: const Offset(0, -6),
                ),
              ],
            ),
            child: SafeArea(
              top: false,
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(24, 28, 24, 16),
                child: Form(
                  key: _formKey,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text(
                        'Sign in',
                        style: GoogleFonts.outfit(
                          fontSize: 26,
                          fontWeight: FontWeight.w800,
                          color: TachyoTheme.charcoal,
                          letterSpacing: -0.6,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        'Use the details your manager gave you.',
                        style: GoogleFonts.outfit(
                          fontSize: 14.5,
                          fontWeight: FontWeight.w500,
                          color: TachyoTheme.charcoalMid,
                        ),
                      ),

                      const SizedBox(height: 24),

                      // Company Code — namespaces every driver ID by
                      // employer, since driver IDs are only unique within a
                      // single company.
                      const _FieldLabel('Your company'),
                      TextFormField(
                        controller: _companyCodeController,
                        style: _fieldTextStyle,
                        decoration: _inputDecoration(icon: Icons.apartment_outlined, hint: 'Company code'),
                        textCapitalization: TextCapitalization.none,
                        textInputAction: TextInputAction.next,
                        autocorrect: false,
                        maxLength: 40,
                        onChanged: (_) => _clearAuthError(),
                        validator: (value) {
                          if (value == null || value.trim().isEmpty) {
                            return 'Enter your company';
                          }
                          return null;
                        },
                      ),

                      const SizedBox(height: 16),

                      // Driver ID / Username
                      const _FieldLabel('Username or driver ID'),
                      TextFormField(
                        controller: _driverIdController,
                        style: _fieldTextStyle,
                        decoration: _inputDecoration(icon: Icons.person_outline, hint: 'e.g. john.smith'),
                        textCapitalization: TextCapitalization.none,
                        textInputAction: TextInputAction.next,
                        autocorrect: false,
                        maxLength: 40,
                        onChanged: (_) => _clearAuthError(),
                        validator: (value) {
                          if (value == null || value.trim().isEmpty) {
                            return 'Enter your username or employee ID';
                          }
                          return null;
                        },
                      ),

                      const SizedBox(height: 16),

                      // PIN — six segmented cells over the system number pad
                      Row(
                        children: [
                          const Expanded(child: _FieldLabel('PIN')),
                          InkWell(
                            borderRadius: BorderRadius.circular(8),
                            onTap: () => setState(() => _obscurePin = !_obscurePin),
                            child: Padding(
                              padding: const EdgeInsets.fromLTRB(8, 4, 4, 12),
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Icon(
                                    _obscurePin ? Icons.visibility_outlined : Icons.visibility_off_outlined,
                                    size: 18,
                                    color: TachyoTheme.charcoalMid,
                                  ),
                                  const SizedBox(width: 6),
                                  Text(
                                    _obscurePin ? 'Show' : 'Hide',
                                    style: GoogleFonts.outfit(
                                      fontSize: 13.5,
                                      fontWeight: FontWeight.w700,
                                      color: TachyoTheme.charcoalMid,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ],
                      ),
                      AnimatedBuilder(
                        animation: _shakeAnimation,
                        builder: (context, child) => Transform.translate(
                          offset: Offset(_shakeAnimation.value, 0),
                          child: child,
                        ),
                        child: PinBoxes(
                          controller: _pinController,
                          obscure: _obscurePin,
                          hasError: _pinError != null || hasAuthError,
                          onChanged: (_) {
                            if (_pinError != null) setState(() => _pinError = null);
                            _clearAuthError();
                          },
                        ),
                      ),
                      if (_pinError != null)
                        Padding(
                          padding: const EdgeInsets.only(top: 8, left: 4),
                          child: Text(
                            _pinError!,
                            style: GoogleFonts.outfit(
                              fontSize: 12.5,
                              fontWeight: FontWeight.w600,
                              color: TachyoTheme.brandRed,
                            ),
                          ),
                        ),

                      // Server-side error (wrong PIN, lock-out, PIN not set up)
                      AnimatedSize(
                        duration: const Duration(milliseconds: 220),
                        curve: Curves.easeOutCubic,
                        alignment: Alignment.topCenter,
                        child: hasAuthError
                            ? Padding(
                                padding: const EdgeInsets.only(top: 16),
                                child: _ErrorBanner(message: authState.errorMessage!),
                              )
                            : const SizedBox(width: double.infinity),
                      ),

                      const SizedBox(height: 16),

                      // Terms & Conditions consent — required before login is
                      // possible; replaces the old post-login acceptance screen.
                      Row(
                        children: [
                          Checkbox(
                            value: _acceptedTerms,
                            onChanged: (value) => setState(() => _acceptedTerms = value ?? false),
                            activeColor: TachyoTheme.brandRed,
                            side: const BorderSide(color: Color(0xFFBDBDBD), width: 1.5),
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(5)),
                          ),
                          const SizedBox(width: 4),
                          // Deliberately not wrapped in its own tap-to-toggle
                          // GestureDetector: doing so would put a second
                          // TapGestureRecognizer in the same gesture arena as
                          // the "Terms & Conditions" link below, making it
                          // unreliable which one wins on tap. The checkbox
                          // is the sole toggle; this text carries only the
                          // links' own recognizers.
                          Expanded(
                            child: RichText(
                              text: TextSpan(
                                style: GoogleFonts.outfit(
                                  fontSize: 14,
                                  height: 1.4,
                                  color: TachyoTheme.charcoalMid,
                                  fontWeight: FontWeight.w500,
                                ),
                                children: [
                                  const TextSpan(text: 'I accept the '),
                                  TextSpan(
                                    text: 'Terms & Conditions',
                                    style: _linkStyle,
                                    recognizer: TapGestureRecognizer()..onTap = () => _openLegalReview(),
                                  ),
                                  const TextSpan(text: ' and '),
                                  TextSpan(
                                    text: 'Privacy Policy',
                                    style: _linkStyle,
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
                        ],
                      ),

                      const SizedBox(height: 16),

                      _buildLoginButton(authState),

                      const SizedBox(height: 8),

                      // Activation + forgot PIN links (migration 065).
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Flexible(
                            child: TextButton(
                              onPressed: () => Navigator.of(context).push(MaterialPageRoute(
                                builder: (_) => ActivationScreen(
                                  initialCompanyCode: _companyCodeController.text,
                                  initialDriverId: _driverIdController.text,
                                ),
                              )),
                              style: _linkButtonStyle(TachyoTheme.brandRed),
                              child: const Text('I have an activation code', overflow: TextOverflow.ellipsis),
                            ),
                          ),
                          TextButton(
                            onPressed: () async {
                              final id = _driverIdController.text.trim();
                              if (id.isEmpty) {
                                ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
                                  content: Text('Enter your Driver ID first, then tap Forgot PIN.'),
                                  backgroundColor: Color(0xFF111111), behavior: SnackBarBehavior.floating,
                                ));
                                return;
                              }
                              final messenger = ScaffoldMessenger.of(context);
                              final result = await SupabaseService.requestPinReset(driverId: id);
                              messenger.showSnackBar(SnackBar(
                                content: Text(result['success'] == true
                                    ? 'Your manager will send you a new activation code shortly.'
                                    : (result['error']?.toString() ?? 'Could not send the reset request.')),
                                backgroundColor: result['success'] == true ? const Color(0xFF111111) : const Color(0xFFCC0000),
                                behavior: SnackBarBehavior.floating,
                              ));
                            },
                            style: _linkButtonStyle(TachyoTheme.charcoalMid),
                            child: const Text('Forgot PIN'),
                          ),
                        ],
                      ),

                      const SizedBox(height: 12),

                      Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          const Icon(Icons.lock_outline_rounded, size: 14, color: TachyoTheme.charcoalLight),
                          const SizedBox(width: 6),
                          Text(
                            'Private system · Authorised employees only',
                            style: GoogleFonts.outfit(
                              fontSize: 12,
                              fontWeight: FontWeight.w500,
                              color: TachyoTheme.charcoalLight,
                            ),
                          ),
                        ],
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

  /// Full-width red button that shrinks to a 56dp circle while signing in
  /// (spinner), shows ✓ on success, and is the origin of the reveal.
  /// Until the terms are ticked it reads as a neutral hint, not a broken
  /// pale-red button.
  Widget _buildLoginButton(AuthState authState) {
    final busy = _submitted && authState.status == AuthStatus.loading;
    final done = _succeeded;
    final compact = busy || done;
    final enabled = _acceptedTerms && !compact;
    final radius = BorderRadius.circular(compact ? 28 : 14);

    return LayoutBuilder(
      builder: (context, constraints) => Center(
        child: AnimatedContainer(
          key: _buttonKey,
          duration: const Duration(milliseconds: 340),
          curve: Curves.easeInOutCubic,
          width: compact ? 56 : constraints.maxWidth,
          height: 56,
          clipBehavior: Clip.antiAlias,
          decoration: BoxDecoration(
            color: (_acceptedTerms || compact) ? TachyoTheme.brandRed : const Color(0xFFEDEDED),
            borderRadius: radius,
            boxShadow: (_acceptedTerms || compact)
                ? [
                    BoxShadow(
                      color: TachyoTheme.brandRed.withValues(alpha: 0.28),
                      blurRadius: 18,
                      offset: const Offset(0, 8),
                    ),
                  ]
                : const [],
          ),
          child: Material(
            type: MaterialType.transparency,
            child: InkWell(
              borderRadius: radius,
              onTap: enabled ? _handleLogin : null,
              child: Center(
                child: AnimatedSwitcher(
                  duration: const Duration(milliseconds: 220),
                  transitionBuilder: (child, animation) => FadeTransition(
                    opacity: animation,
                    child: ScaleTransition(scale: animation, child: child),
                  ),
                  child: done
                      ? const Icon(Icons.check_rounded, key: ValueKey('done'), color: Colors.white, size: 30)
                      : busy
                          ? const SizedBox(
                              key: ValueKey('busy'),
                              width: 22,
                              height: 22,
                              child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.white),
                            )
                          : Text(
                              _acceptedTerms ? 'Log in' : 'Accept the terms to log in',
                              key: ValueKey(_acceptedTerms),
                              maxLines: 1,
                              softWrap: false,
                              overflow: TextOverflow.clip,
                              style: GoogleFonts.outfit(
                                fontSize: 16,
                                fontWeight: FontWeight.w700,
                                letterSpacing: 0.2,
                                color: _acceptedTerms ? Colors.white : TachyoTheme.charcoalLight,
                              ),
                            ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  TextStyle get _fieldTextStyle => GoogleFonts.outfit(
        color: TachyoTheme.charcoal,
        fontWeight: FontWeight.w600,
        fontSize: 16,
      );

  TextStyle get _linkStyle => GoogleFonts.outfit(
        color: TachyoTheme.brandRed,
        fontWeight: FontWeight.w700,
        decoration: TextDecoration.underline,
        decorationColor: TachyoTheme.brandRed,
      );

  ButtonStyle _linkButtonStyle(Color color) => TextButton.styleFrom(
        foregroundColor: color,
        minimumSize: const Size(48, 48),
        padding: const EdgeInsets.symmetric(horizontal: 4),
        textStyle: GoogleFonts.outfit(fontSize: 14, fontWeight: FontWeight.w700),
      );

  // Fill, borders and radii come from TachyoTheme.inputDecorationTheme.
  InputDecoration _inputDecoration({required IconData icon, required String hint}) => InputDecoration(
        hintText: hint,
        hintStyle: GoogleFonts.outfit(fontSize: 15, color: const Color(0xFFAAAAAA), fontWeight: FontWeight.w500),
        counterText: '',
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 18),
        prefixIcon: Icon(icon, color: TachyoTheme.charcoalLight, size: 22),
        errorStyle: GoogleFonts.outfit(fontSize: 12.5, fontWeight: FontWeight.w600, color: TachyoTheme.brandRed),
      );
}

class _FieldLabel extends StatelessWidget {
  final String text;
  const _FieldLabel(this.text);

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(left: 2, bottom: 8),
      child: Text(
        text,
        style: GoogleFonts.outfit(
          fontSize: 13.5,
          fontWeight: FontWeight.w700,
          color: TachyoTheme.charcoal,
        ),
      ),
    );
  }
}

class _ErrorBanner extends StatelessWidget {
  final String message;
  const _ErrorBanner({required this.message});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: TachyoTheme.brandRed.withValues(alpha: 0.06),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: TachyoTheme.brandRed.withValues(alpha: 0.25)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.error_outline_rounded, color: TachyoTheme.brandRed, size: 20),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              message,
              style: GoogleFonts.outfit(
                fontSize: 13.5,
                height: 1.35,
                fontWeight: FontWeight.w600,
                color: const Color(0xFF8A0000),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Brand band: lockup centred over slowly moving lane markings.
/// Collapses to a single-row lockup while the keyboard is open.
class _LoginHeader extends StatelessWidget {
  final Animation<double> road;
  final Animation<double> intro;
  final bool compact;

  const _LoginHeader({required this.road, required this.intro, required this.compact});

  @override
  Widget build(BuildContext context) {
    final fade = CurvedAnimation(parent: intro, curve: const Interval(0, 0.6, curve: Curves.easeOut));
    return Stack(
      children: [
        const Positioned.fill(
          child: DecoratedBox(
            decoration: BoxDecoration(
              gradient: RadialGradient(
                center: Alignment(0, -0.1),
                radius: 1.1,
                colors: [Colors.white, TachyoTheme.brandSurfaceEdge],
              ),
            ),
          ),
        ),
        AnimatedPositioned(
          duration: const Duration(milliseconds: 320),
          curve: Curves.easeOutCubic,
          left: 0,
          right: 0,
          bottom: compact ? 4 : 32,
          height: 24,
          child: FadeTransition(
            opacity: fade,
            child: AnimatedBuilder(
              animation: road,
              builder: (context, _) => CustomPaint(painter: RoadPainter(phase: road.value)),
            ),
          ),
        ),
        SafeArea(
          bottom: false,
          child: Padding(
            padding: EdgeInsets.only(bottom: compact ? 14 : 72),
            child: Center(
              child: FadeTransition(
                opacity: fade,
                child: FittedBox(
                  fit: BoxFit.scaleDown,
                  child: TachyoLockup(compact: compact),
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}

/// Cold-start splash while a stored session is restored. A thin red line at
/// the vertical centre — exactly where the cinematic then draws its road —
/// so a returning driver sees one continuous motion.
class _BrandSplash extends StatelessWidget {
  const _BrandSplash();

  @override
  Widget build(BuildContext context) {
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.dark,
      child: Scaffold(
        backgroundColor: Colors.white,
        body: Center(
          child: ClipRRect(
            borderRadius: BorderRadius.circular(2),
            child: const SizedBox(
              width: 120,
              child: LinearProgressIndicator(
                minHeight: 3,
                backgroundColor: TachyoTheme.roadLine,
                valueColor: AlwaysStoppedAnimation<Color>(TachyoTheme.brandRed),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Circle growing from the login button until it covers the screen, shifting
/// from brand red (the button) to white (the cinematic's first frame).
class _RevealPainter extends CustomPainter {
  final Offset origin;
  final double progress;

  const _RevealPainter({required this.origin, required this.progress});

  @override
  void paint(Canvas canvas, Size size) {
    if (progress <= 0) return;
    final corners = [
      Offset.zero,
      Offset(size.width, 0),
      Offset(0, size.height),
      Offset(size.width, size.height),
    ];
    final maxRadius = corners.map((c) => (c - origin).distance).reduce(math.max);
    final eased = Curves.easeInOutCubic.transform(progress);
    final radius = 28 + (maxRadius - 28) * eased;
    final color = Color.lerp(
      TachyoTheme.brandRed,
      Colors.white,
      Curves.easeOut.transform((progress * 2).clamp(0.0, 1.0)),
    )!;
    canvas.drawCircle(origin, radius, Paint()..color = color);
  }

  @override
  bool shouldRepaint(_RevealPainter old) => old.progress != progress || old.origin != origin;
}
