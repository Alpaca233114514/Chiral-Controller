import 'package:flutter/material.dart';

abstract final class ChiralTheme {
  static const Color _ink = Color(0xFF151515);
  static const Color _paper = Color(0xFFF7F7F5);

  static ThemeData get light => _theme(
    brightness: Brightness.light,
    surface: _paper,
    foreground: _ink,
    border: const Color(0xFFD8D8D3),
  );

  static ThemeData get dark => _theme(
    brightness: Brightness.dark,
    surface: const Color(0xFF171717),
    foreground: const Color(0xFFECECE8),
    border: const Color(0xFF393937),
  );

  static ThemeData _theme({
    required Brightness brightness,
    required Color surface,
    required Color foreground,
    required Color border,
  }) {
    final ColorScheme scheme = ColorScheme.fromSeed(
      seedColor: foreground,
      brightness: brightness,
      surface: surface,
    );
    return ThemeData(
      brightness: brightness,
      colorScheme: scheme,
      scaffoldBackgroundColor: surface,
      dividerColor: border,
      fontFamily: 'monospace',
      textTheme: ThemeData(brightness: brightness).textTheme.apply(
        fontFamily: 'monospace',
        bodyColor: foreground,
        displayColor: foreground,
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: scheme.surfaceContainerLow,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: BorderSide(color: border),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: BorderSide(color: border),
        ),
      ),
      cardTheme: CardThemeData(
        elevation: 0,
        color: scheme.surfaceContainerLow,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(10),
          side: BorderSide(color: border),
        ),
      ),
    );
  }
}
