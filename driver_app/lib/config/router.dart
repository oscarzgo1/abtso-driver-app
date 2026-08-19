import 'package:go_router/go_router.dart';
import '../features/auth/presentation/greeting_screen.dart';
import '../features/auth/presentation/login_screen.dart';
import '../features/shift/presentation/main_layout.dart';
import '../features/legal/presentation/legal_compliance_screen.dart';
import '../features/legal/presentation/terms_acceptance_screen.dart';

final appRouter = GoRouter(
  initialLocation: '/login',
  routes: [
    GoRoute(
      path: '/login',
      name: 'login',
      builder: (context, state) => const LoginScreen(),
    ),
    GoRoute(
      path: '/terms-acceptance',
      name: 'terms-acceptance',
      builder: (context, state) => const TermsAcceptanceScreen(),
    ),
    GoRoute(
      path: '/greeting',
      name: 'greeting',
      builder: (context, state) => const GreetingScreen(),
    ),
    GoRoute(
      path: '/home',
      name: 'home',
      builder: (context, state) => const MainLayout(),
    ),
    GoRoute(
      path: '/legal',
      name: 'legal',
      builder: (context, state) => const LegalComplianceScreen(),
    ),
  ],
);
