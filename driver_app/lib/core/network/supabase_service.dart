import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

/// Singleton access to the Supabase client with offline mock mode fallback
class SupabaseService {
  SupabaseService._();

  static SupabaseClient get client => Supabase.instance.client;

  // ── Offline Mock Database State ─────────────────────────────
  static bool get isMockMode {
    const url = String.fromEnvironment('SUPABASE_URL',
        defaultValue: 'https://imfgzhxdzxkifuncowrl.supabase.co');
    return url.isEmpty ||
        (!url.startsWith('http://') && !url.startsWith('https://')) ||
        url.toLowerCase().contains('your_project') ||
        url.toLowerCase().contains('lewwfurlewlbgikzunsi');
  }

  static String? _mockDriverId;
  static String? _mockDriverName;
  static final List<Map<String, dynamic>> _mockShifts = [];
  static Map<String, dynamic>? _mockActiveShift;
  static const String _mockRateProfile = 'LWR';

  /// Authenticate driver with ID + PIN via Edge Function (or Offline Mock fallback)
  static Future<Map<String, dynamic>> driverLogin({
    required String driverId,
    required String pin,
  }) async {
    if (isMockMode) {
      await Future.delayed(const Duration(milliseconds: 800)); // Simulate delay
      
      final normalizedId = driverId.trim().toUpperCase();
      if (normalizedId == 'DRV-001' && pin == '123456') {
        _mockDriverId = 'drv-uuid-mock-john-smith';
        _mockDriverName = 'John Smith (Offline Mock)';
        return {
          'success': true,
          'driver': {
            'id': _mockDriverId,
            'driver_id': 'DRV-001',
            'full_name': _mockDriverName,
            'rate_profile': _mockRateProfile,
          },
        };
      }
      return {
        'success': false,
        'error': 'Invalid Employee ID or PIN (Mock Hint: use EMP-001 / 123456)',
      };
    }

    try {
      final email = '${driverId.trim().toLowerCase()}@driver.abtso';
      final response = await client.auth.signInWithPassword(
        email: email,
        password: pin.trim(),
      );

      final session = response.session;
      if (session != null) {
        final profile = await client
            .from('drivers')
            .select()
            .eq('id', session.user.id)
            .single();

        return {
          'success': true,
          'driver': {
            'id': session.user.id,
            'driver_id': profile['driver_id'],
            'name': profile['full_name'],
            'hourly_rate': profile['hourly_rate'] != null ? (profile['hourly_rate'] as num).toDouble() : null,
            'rate_profile': profile['rate_profile'] ?? 'LWR',
          },
        };
      }
      return {
        'success': false,
        'error': 'Authentication failed.',
      };
    } on AuthException catch (e) {
      debugPrint('AUTH EXCEPTION: ${e.message}');
      return {
        'success': false,
        'error': e.message,
      };
    } catch (e) {
      debugPrint('LOGIN EXCEPTION: $e');
      return {
        'success': false,
        'error': 'Connection error. Check your network.',
      };
    }
  }

  /// Sign out the current driver
  static Future<void> signOut() async {
    if (isMockMode) {
      _mockDriverId = null;
      _mockDriverName = null;
      _mockActiveShift = null;
      return;
    }
    await client.auth.signOut();
  }

  /// Get current authenticated driver ID
  static String? get currentDriverId {
    if (isMockMode) {
      return _mockDriverId;
    }
    return client.auth.currentUser?.id;
  }

  /// Check if a driver is currently authenticated
  static bool get isAuthenticated {
    if (isMockMode) {
      return _mockDriverId != null;
    }
    return client.auth.currentUser != null;
  }

  // ── Mock Helper Mocking RPC / Queries ──────────────────────
  static Future<List<Map<String, dynamic>>> fetchMockDepots() async {
    return [
      {
        'id': 'depot-a-id',
        'name': 'Rossington Depot',
        'latitude': 53.481798,
        'longitude': -1.086552,
        'geofence_radius_m': 10,
        'address': 'Rossington Base',
      },
      {
        'id': 'depot-b-id',
        'name': 'Wheatley Depot',
        'latitude': 53.550248,
        'longitude': -1.091061,
        'geofence_radius_m': 10,
        'address': 'Wheatley Base',
      }
    ];
  }

  static Future<Map<String, dynamic>?> fetchMockActiveShift() async {
    return _mockActiveShift;
  }

  static Future<Map<String, dynamic>> mockStartShift(double lat, double lng) async {
    if (_mockActiveShift != null) {
      return {'success': false, 'error': 'Shift already active'};
    }

    final now = DateTime.now();
    _mockActiveShift = {
      'id': 'shift-mock-${now.millisecondsSinceEpoch}',
      'driver_id': _mockDriverId,
      'depot_id': 'depot-a-id',
      'start_time': now.toIso8601String(),
      'end_time': null,
      'status': 'active',
      'base_hourly_rate': _getMockBaseRate(now),
      'effective_rate': _getMockBaseRate(now),
    };

    return {
      'success': true,
      'shift_id': _mockActiveShift!['id'],
      'depot_id': 'depot-a-id',
      'start_time': _mockActiveShift!['start_time'],
    };
  }

  static Future<Map<String, dynamic>> mockEndShift(String shiftId, double lat, double lng) async {
    if (_mockActiveShift == null || _mockActiveShift!['id'] != shiftId) {
      return {'success': false, 'error': 'No active shift found'};
    }

    final startTime = DateTime.parse(_mockActiveShift!['start_time']);
    final endTime = DateTime.now();
    final hours = endTime.difference(startTime).inSeconds / 3600.0;
    final dayOfWeek = startTime.weekday; // 1=Mon, 7=Sun

    final baseRate = _getMockBaseRate(startTime);
    double effectiveRate = baseRate;
    double? overrideRate;

    // Check for retroactive Friday (5), Saturday (6), Sunday (7) override
    // Gather all historical completed mock shifts
    final completedShifts = _mockShifts
        .where((s) => s['driver_id'] == _mockDriverId && s['status'] == 'completed')
        .toList();

    bool workedFri = dayOfWeek == 5;
    bool workedSat = dayOfWeek == 6;
    bool workedSun = dayOfWeek == 7;

    for (final s in completedShifts) {
      final sTime = DateTime.parse(s['start_time']);
      // Check if they are in the same ISO week
      if (_isSameIsoWeek(sTime, startTime)) {
        if (sTime.weekday == 5) workedFri = true;
        if (sTime.weekday == 6) workedSat = true;
        if (sTime.weekday == 7) workedSun = true;
      }
    }

    // Apply £18/hr override retroactively if all three are worked
    if (workedFri && workedSat && workedSun) {
      overrideRate = 18.00;
      effectiveRate = 18.00;

      // Update historical shifts in memory
      for (final s in _mockShifts) {
        final sTime = DateTime.parse(s['start_time']);
        if (_isSameIsoWeek(sTime, startTime) && (sTime.weekday == 5 || sTime.weekday == 6 || sTime.weekday == 7)) {
          s['override_rate'] = 18.00;
          s['effective_rate'] = 18.00;
          s['total_pay'] = (s['total_hours'] as double) * 18.00;
        }
      }
    }

    final completedShift = {
      ..._mockActiveShift!,
      'end_time': endTime.toIso8601String(),
      'status': 'completed',
      'total_hours': hours,
      'override_rate': overrideRate,
      'effective_rate': effectiveRate,
      'total_pay': hours * effectiveRate,
    };

    _mockShifts.add(completedShift);
    _mockActiveShift = null;

    return {
      'success': true,
      'shift_id': completedShift['id'],
      'total_hours': hours,
      'effective_rate': effectiveRate,
      'total_pay': hours * effectiveRate,
      'override_applied': overrideRate != null,
    };
  }

  static double _getMockBaseRate(DateTime time) {
    const isHIR = _mockRateProfile == 'HIR';
    if (time.weekday == 7) return isHIR ? 19.00 : 18.00; // Sunday
    if (time.weekday == 6) return isHIR ? 18.00 : 17.00; // Saturday
    return isHIR ? 17.00 : 16.00; // Weekday
  }

  static bool _isSameIsoWeek(DateTime d1, DateTime d2) {
    // Basic approximation of same week
    final week1 = d1.difference(DateTime(d1.year, 1, 1)).inDays ~/ 7;
    final week2 = d2.difference(DateTime(d2.year, 1, 1)).inDays ~/ 7;
    return d1.year == d2.year && week1 == week2;
  }
  static Future<Map<String, dynamic>> fetchDriverProfile(String driverCode) async {
    if (isMockMode) {
      _mockDriverId = driverCode;
      _mockDriverName = 'John Smith';
      return {
        'success': true,
        'driver': {
          'id': 'drv-1',
          'driver_id': driverCode,
          'full_name': 'John Smith',
          'rate_profile': _mockRateProfile,
        },
      };
    }

    try {
      final response = await client
          .from('drivers')
          .select('*')
          .eq('driver_id', driverCode)
          .maybeSingle();

      if (response != null) {
        return {
          'success': true,
          'driver': {
            'id': response['id'],
            'driver_id': response['driver_id'],
            'name': response['full_name'],
            'hourly_rate': response['hourly_rate'] != null ? (response['hourly_rate'] as num).toDouble() : null,
            'rate_profile': response['rate_profile'] ?? 'LWR',
          },
        };
      }
      return {
        'success': false,
        'error': 'Employee profile not found.',
      };
    } catch (e) {
      return {
        'success': false,
        'error': 'Database profile connection failed.',
      };
    }
  }

  static Future<List<Map<String, dynamic>>> fetchDriverShifts({
    required String driverId,
    required DateTime startDate,
    required DateTime endDate,
  }) async {
    final startRange = DateTime(startDate.year, startDate.month, startDate.day, 0, 0, 0);
    final endRange = DateTime(endDate.year, endDate.month, endDate.day, 23, 59, 59);

    if (isMockMode) {
      await Future.delayed(const Duration(milliseconds: 200));
      if (_mockShifts.isEmpty) {
        final base = DateTime.now();
        for (int i = 0; i < 24; i++) {
          final sTime = DateTime(base.year, base.month, base.day).subtract(Duration(days: i)).add(const Duration(hours: 8));
          final eTime = sTime.add(const Duration(hours: 8));
          final weekday = sTime.weekday;
          const isHIR = _mockRateProfile == 'HIR';
          final baseRate = (weekday == 7) ? (isHIR ? 19.00 : 18.00) : ((weekday == 6) ? (isHIR ? 18.00 : 17.00) : (isHIR ? 17.00 : 16.00));
          final pay = baseRate * 8.0;
          _mockShifts.add({
            'id': 'shift-mock-$i',
            'driver_id': driverId,
            'depot_id': 'depot-a-id',
            'start_time': sTime.toIso8601String(),
            'end_time': eTime.toIso8601String(),
            'status': 'completed',
            'base_hourly_rate': baseRate,
            'effective_rate': baseRate,
            'override_rate': null,
            'total_hours': 8.0,
            'total_pay': pay,
          });
        }
      }

      return _mockShifts.where((s) {
        final time = DateTime.parse(s['start_time']);
        return time.isAfter(startRange.subtract(const Duration(seconds: 1))) &&
               time.isBefore(endRange.add(const Duration(seconds: 1)));
      }).toList();
    }

    try {
      final response = await client
          .from('shifts')
          .select()
          .eq('driver_id', driverId)
          .eq('status', 'completed')
          .gte('start_time', startRange.toUtc().toIso8601String())
          .lte('start_time', endRange.toUtc().toIso8601String())
          .order('start_time', ascending: true);

      return List<Map<String, dynamic>>.from(response);
    } catch (e) {
      debugPrint('Error fetching driver shifts: $e');
      return [];
    }
  }
}
