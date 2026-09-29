import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../features/auth/presentation/auth_provider.dart';
import 'supabase_service.dart';

/// The features the signed-in employee's company plan includes
/// (migration 067). `null` means "not known" — offline, signed out, or
/// the lookup failed — and callers treat that as everything allowed: the
/// database and Edge Functions enforce the plan either way, so this only
/// decides what the app shows.
final entitlementsProvider = FutureProvider<Set<String>?>((ref) async {
  final auth = ref.watch(authProvider);
  if (auth.status != AuthStatus.authenticated) return null;
  return SupabaseService.fetchFeatureKeys();
});

/// True when [feature] is included, or when it isn't known yet.
bool hasFeature(Set<String>? features, String feature) => features == null || features.contains(feature);
