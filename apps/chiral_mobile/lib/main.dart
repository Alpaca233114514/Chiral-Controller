import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'src/screens/home_screen.dart';
import 'src/screens/pair_screen.dart';
import 'src/theme/chiral_theme.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const ProviderScope(child: ChiralApp()));
}

class ChiralApp extends StatelessWidget {
  const ChiralApp({super.key});

  static final GoRouter _router = GoRouter(
    routes: <RouteBase>[
      GoRoute(
        path: '/',
        builder: (BuildContext context, GoRouterState state) =>
            const HomeScreen(),
      ),
      GoRoute(
        path: '/pair',
        builder: (BuildContext context, GoRouterState state) =>
            const PairScreen(),
      ),
    ],
  );

  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      title: 'Chiral',
      debugShowCheckedModeBanner: false,
      theme: ChiralTheme.light,
      darkTheme: ChiralTheme.dark,
      themeMode: ThemeMode.system,
      routerConfig: _router,
    );
  }
}
