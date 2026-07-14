import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
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
  }

  @override
  void dispose() {
    _driverIdController.dispose();
    _pinController.dispose();
    _shakeController.dispose();
    super.dispose();
  }

  void _handleLogin() {
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
      if (next.status == AuthStatus.authenticated) {
        context.goNamed('home');
      } else if (next.status == AuthStatus.error) {
        _shakeController.forward();
      }
    });

    return Scaffold(
      backgroundColor: Colors.white,
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 32),
            child: AnimatedBuilder(
              animation: _shakeAnimation,
              builder: (context, child) {
                return Transform.translate(
                  offset: Offset(_shakeAnimation.value, 0),
                  child: child,
                );
              },
              child: Form(
                key: _formKey,
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const SizedBox(height: 24),
                    
                    // Official ABTSO Image Logo
                    Center(
                      child: Image.asset(
                        'assets/images/abtso_logo.jpg',
                        height: 54,
                        fit: BoxFit.contain,
                      ),
                    ),
                    
                    const SizedBox(height: 12),
                    
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

                    const SizedBox(height: 56),

                    Text(
                      'EMPLOYEE AUTHORISATION',
                      style: theme.textTheme.headlineMedium?.copyWith(
                        fontSize: 12,
                        letterSpacing: 1,
                        fontWeight: FontWeight.w900,
                        color: const Color(0xFF333333),
                      ),
                    ),
                    
                    const SizedBox(height: 16),

                    // Driver ID Input
                    TextFormField(
                      controller: _driverIdController,
                      style: const TextStyle(color: Color(0xFF333333), fontWeight: FontWeight.bold),
                      decoration: InputDecoration(
                        hintText: 'EMPLOYEE ID (e.g., EMP-001)',
                        counterText: '',
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
                      textCapitalization: TextCapitalization.characters,
                      maxLength: 20,
                      validator: (value) {
                        if (value == null || value.trim().isEmpty) {
                          return 'EMPLOYEE ID REQUIRED';
                        }
                        return null;
                      },
                    ),

                    const SizedBox(height: 12),

                    // PIN Input
                    TextFormField(
                      controller: _pinController,
                      style: const TextStyle(color: Color(0xFF333333), fontWeight: FontWeight.bold),
                      decoration: InputDecoration(
                        hintText: 'SECURITY PIN (6 DIGITS)',
                        counterText: '',
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

                    const SizedBox(height: 24),

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

                    // Login Button (Brand Red for primary action)
                    ElevatedButton(
                      onPressed: authState.status == AuthStatus.loading ? null : _handleLogin,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFFCC0000),
                        foregroundColor: Colors.white,
                        minimumSize: const Size(double.infinity, 52),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                        elevation: 0,
                      ),
                      child: authState.status == AuthStatus.loading
                          ? const SizedBox(
                              width: 20,
                              height: 20,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: Colors.white,
                              ),
                            )
                          : const Text('AUTHORISE SESSION'),
                    ),

                    const SizedBox(height: 48),
                    
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
                    const SizedBox(height: 24),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
