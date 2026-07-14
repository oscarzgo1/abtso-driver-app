import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

/// ABTSO Design System — Brand identity aligned with Concept B logo
/// Palette: White (#FFFFFF) · Charcoal (#333333) · Brand Red (#CC0000)
class ABTSOTheme {
  ABTSOTheme._();

  // ── Brand Palette ─────────────────────────────────────────
  static const Color white       = Color(0xFFFFFFFF);
  static const Color charcoal    = Color(0xFF333333);   // primary text / elements
  static const Color charcoalMid = Color(0xFF555555);   // secondary text
  static const Color charcoalLight = Color(0xFF888888); // tertiary / hints
  static const Color brandRed    = Color(0xFFCC0000);   // brand accent (logo red)
  static const Color surface     = Color(0xFFF5F5F5);   // card / input backgrounds
  static const Color border      = Color(0xFFE0E0E0);   // dividers / borders
  static const Color success     = Color(0xFF2E7D32);   // active shift / clocked-in green

  // Legacy aliases (referenced in home_screen / main_layout)
  static const Color lightBg             = white;
  static const Color lightText           = charcoal;
  static const Color lightTextSecondary  = charcoalMid;
  static const Color lightBorder         = border;
  static const Color lightSurface        = surface;
  static const Color darkBg              = charcoal;
  static const Color darkText            = white;
  static const Color darkTextSecondary   = charcoalLight;
  static const Color darkBorder          = Color(0xFF444444);
  static const Color darkSurface         = Color(0xFF3D3D3D);
  static const Color error               = brandRed;

  // ── Light Theme ───────────────────────────────────────────
  static ThemeData get lightTheme {
    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.light,
      scaffoldBackgroundColor: white,
      colorScheme: const ColorScheme.light(
        primary: charcoal,
        secondary: brandRed,
        surface: surface,
        error: brandRed,
        onPrimary: white,
        onSecondary: white,
        onSurface: charcoal,
      ),
      textTheme: GoogleFonts.outfitTextTheme(
        const TextTheme(
          displayLarge: TextStyle(
            fontSize: 32,
            fontWeight: FontWeight.w900,
            color: charcoal,
            letterSpacing: -1.2,
          ),
          displayMedium: TextStyle(
            fontSize: 26,
            fontWeight: FontWeight.w800,
            color: charcoal,
            letterSpacing: -0.8,
          ),
          headlineMedium: TextStyle(
            fontSize: 20,
            fontWeight: FontWeight.w800,
            color: charcoal,
            letterSpacing: -0.5,
          ),
          titleLarge: TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.w700,
            color: charcoal,
          ),
          titleMedium: TextStyle(
            fontSize: 15,
            fontWeight: FontWeight.w600,
            color: charcoalMid,
          ),
          bodyLarge: TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.w500,
            color: charcoal,
          ),
          bodyMedium: TextStyle(
            fontSize: 14,
            fontWeight: FontWeight.w500,
            color: charcoalMid,
          ),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: surface,
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: border, width: 1.5),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: border, width: 1.5),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: charcoal, width: 2),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: brandRed, width: 1.5),
        ),
        focusedErrorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: brandRed, width: 2),
        ),
        hintStyle: const TextStyle(color: charcoalLight, fontSize: 14, fontWeight: FontWeight.w400),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: charcoal,
          foregroundColor: white,
          minimumSize: const Size(double.infinity, 52),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
          elevation: 0,
          textStyle: GoogleFonts.outfit(
            fontSize: 14,
            fontWeight: FontWeight.w700,
            letterSpacing: 0.8,
          ),
        ),
      ),
      appBarTheme: AppBarTheme(
        backgroundColor: white,
        elevation: 0,
        centerTitle: true,
        iconTheme: const IconThemeData(color: charcoal, size: 20),
        titleTextStyle: GoogleFonts.outfit(
          color: charcoal,
          fontSize: 14,
          fontWeight: FontWeight.w800,
          letterSpacing: 1.5,
        ),
      ),
      dividerTheme: const DividerThemeData(
        color: border,
        thickness: 1,
      ),
      switchTheme: SwitchThemeData(
        thumbColor: WidgetStateProperty.resolveWith((states) =>
            states.contains(WidgetState.selected) ? brandRed : Colors.grey),
        trackColor: WidgetStateProperty.resolveWith((states) =>
            states.contains(WidgetState.selected) ? brandRed.withValues(alpha: 0.3) : Colors.grey.withValues(alpha: 0.3)),
      ),
    );
  }

  // ── Dark Theme (kept for backward compatibility, mirrors light with inverted bg) ──
  static ThemeData get darkTheme => lightTheme;
}
