import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../features/auth/presentation/greeting_screen.dart';
import '../features/auth/presentation/login_screen.dart';
import '../features/shift/presentation/main_layout.dart';
import '../features/legal/presentation/legal_compliance_screen.dart';

final appRouter = GoRouter(
  initialLocation: '/login',
  routes: [
    GoRoute(
      path: '/login',
      name: 'login',
      builder: (context, state) => const LoginScreen(),
    ),
    GoRoute(
      path: '/greeting',
      name: 'greeting',
      // The login screen's ink reveal / splash already matches the
      // cinematic's first frame — a route transition would only add a seam.
      pageBuilder: (context, state) => NoTransitionPage(
        key: state.pageKey,
        child: const GreetingScreen(),
      ),
    ),
    GoRoute(
      path: '/home',
      name: 'home',
      // Soft fade-and-rise so home settles in after the cinematic (or the
      // splash) instead of sliding across like a regular push.
      pageBuilder: (context, state) => CustomTransitionPage(
        key: state.pageKey,
        child: const MainLayout(),
        transitionDuration: const Duration(milliseconds: 450),
        transitionsBuilder: (context, animation, secondaryAnimation, child) {
          final curved = CurvedAnimation(parent: animation, curve: Curves.easeOutCubic);
          return FadeTransition(
            opacity: curved,
            child: SlideTransition(
              position: Tween<Offset>(begin: const Offset(0, 0.025), end: Offset.zero).animate(curved),
              child: child,
            ),
          );
        },
      ),
    ),
    GoRoute(
      path: '/legal',
      name: 'legal',
      builder: (context, state) => const LegalComplianceScreen(),
    ),
  ],
);
