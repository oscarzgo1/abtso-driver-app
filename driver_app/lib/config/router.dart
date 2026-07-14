import 'package:go_router/go_router.dart';
import '../features/auth/presentation/login_screen.dart';
import '../features/shift/presentation/main_layout.dart';

final appRouter = GoRouter(
  initialLocation: '/login',
  routes: [
    GoRoute(
      path: '/login',
      name: 'login',
      builder: (context, state) => const LoginScreen(),
    ),
    GoRoute(
      path: '/home',
      name: 'home',
      builder: (context, state) => const MainLayout(),
    ),
  ],
);
