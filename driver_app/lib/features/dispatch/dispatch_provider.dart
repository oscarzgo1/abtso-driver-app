import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart' hide AuthState;
import '../../core/network/supabase_service.dart';
import '../auth/presentation/auth_provider.dart';
import 'dispatch_load.dart';

/// Loads waiting for this driver (status 'assigned') plus any they've
/// accepted and are still running ('in_progress').
class DispatchState {
  final List<DispatchLoad> open;
  /// True when the last refresh failed and [open] came from the offline cache.
  final bool offline;
  const DispatchState({this.open = const [], this.offline = false});

  List<DispatchLoad> get assigned => open.where((l) => l.status == 'assigned').toList();
  List<DispatchLoad> get inProgress => open.where((l) => l.status == 'in_progress').toList();
}

class DispatchNotifier extends StateNotifier<DispatchState> {
  DispatchNotifier(this._driverId) : super(const DispatchState()) {
    if (_driverId != null) {
      _refresh();
      _subscribe();
    }
  }

  final String? _driverId;
  RealtimeChannel? _channel;

  String get _cacheKey => 'dispatch_open_$_driverId';

  void _subscribe() {
    if (SupabaseService.isMockMode) return;
    try {
      // Only this driver's rows — a change to anyone else's load never
      // reaches this device.
      _channel = SupabaseService.client
          .channel('dispatch_loads_$_driverId')
          .onPostgresChanges(
            event: PostgresChangeEvent.all,
            schema: 'public',
            table: 'dispatch_loads',
            filter: PostgresChangeFilter(type: PostgresChangeFilterType.eq, column: 'driver_id', value: _driverId!),
            callback: (_) => _refresh(),
          )
        ..subscribe();
    } catch (e) {
      debugPrint('dispatch realtime subscribe failed: $e');
    }
  }

  Future<void> refresh() => _refresh();

  Future<void> _refresh() async {
    try {
      final rows = await SupabaseService.fetchDispatchLoads(statuses: const ['assigned', 'in_progress']);
      final loads = rows.map(DispatchLoad.fromJson).toList();
      if (!mounted) return;
      state = DispatchState(open: loads);
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_cacheKey, jsonEncode(rows));
    } catch (e) {
      debugPrint('dispatch refresh failed, using cache: $e');
      final cached = await _readCache();
      if (mounted) state = DispatchState(open: cached, offline: true);
    }
  }

  Future<List<DispatchLoad>> _readCache() async {
    try {
      final raw = (await SharedPreferences.getInstance()).getString(_cacheKey);
      if (raw == null) return const [];
      return (jsonDecode(raw) as List).map((e) => DispatchLoad.fromJson(Map<String, dynamic>.from(e as Map))).toList();
    } catch (_) {
      return const [];
    }
  }

  @override
  void dispose() {
    final ch = _channel;
    if (ch != null) SupabaseService.client.removeChannel(ch);
    super.dispose();
  }
}

final dispatchProvider = StateNotifierProvider<DispatchNotifier, DispatchState>((ref) {
  final auth = ref.watch(authProvider);
  String? id;
  if (auth.status == AuthStatus.authenticated) {
    id = auth.driver?['id']?.toString();
  }
  return DispatchNotifier(id);
});

/// Completed-load history, newest first. Falls back to the last copy this
/// device saved when there's no signal.
class LoadHistoryResult {
  final List<DispatchLoad> loads;
  final bool fromCache;
  const LoadHistoryResult(this.loads, {this.fromCache = false});
}

Future<LoadHistoryResult> fetchLoadHistory() async {
  final driverId = SupabaseService.currentDriverId;
  final key = 'dispatch_history_$driverId';
  try {
    final rows = await SupabaseService.fetchDispatchLoads(statuses: const ['completed'], limit: 200);
    (await SharedPreferences.getInstance()).setString(key, jsonEncode(rows));
    return LoadHistoryResult(rows.map(DispatchLoad.fromJson).toList());
  } catch (e) {
    debugPrint('load history fetch failed, using cache: $e');
    try {
      final raw = (await SharedPreferences.getInstance()).getString(key);
      if (raw != null) {
        final loads = (jsonDecode(raw) as List).map((x) => DispatchLoad.fromJson(Map<String, dynamic>.from(x as Map))).toList();
        return LoadHistoryResult(loads, fromCache: true);
      }
    } catch (_) {}
    rethrow;
  }
}
