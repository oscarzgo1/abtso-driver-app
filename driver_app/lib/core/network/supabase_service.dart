import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../services/gps_policy.dart';

/// Singleton access to the Supabase client with offline mock mode fallback
class SupabaseService {
  SupabaseService._();

  static const deactivatedMessage = 'This account has been deactivated. Contact your manager.';

  static SupabaseClient get client => Supabase.instance.client;

  // debugPrint never reaches a real device's console in a release build,
  // so a failed photo upload's actual exception (network drop, rejected
  // format, size limit — currently indistinguishable from each other)
  // was invisible everywhere except a generic hardcoded fallback string.
  // Callers read this right after a null result to show/report the real
  // reason instead of guessing.
  static String? lastUploadError;

  // 'image/$ext' broke on the single most common case: a '.jpg' file
  // produced Content-Type 'image/jpg', which isn't a real MIME type —
  // the registered one is 'image/jpeg'. Storage's bucket allow-list
  // (['image/jpeg', 'image/png', 'image/heic', 'image/webp']) checks
  // this header verbatim, so every '.jpg' upload was rejected with a
  // 415 (invalid_mime_type), silently in the incident-report flow and
  // as a misleading "connection error" in the fuel-receipt flow.
  static String _imageMimeType(String ext) {
    switch (ext) {
      case 'jpg':
      case 'jpeg':
        return 'image/jpeg';
      case 'png':
        return 'image/png';
      case 'heic':
        return 'image/heic';
      case 'webp':
        return 'image/webp';
      default:
        return 'image/$ext';
    }
  }

  // ── Offline Mock Database State ─────────────────────────────
  static bool get isMockMode {
    const url = String.fromEnvironment('SUPABASE_URL',
        defaultValue: 'https://imfgzhxdzxkifuncowrl.supabase.co');
    return url.isEmpty ||
        (!url.startsWith('http://') && !url.startsWith('https://')) ||
        url.toLowerCase().contains('your_project');
  }

  static String? _mockDriverId;
  static String? _mockDriverName;
  static final List<Map<String, dynamic>> _mockShifts = [];
  static Map<String, dynamic>? _mockActiveShift;
  static const String _mockRateProfile = 'LWR';

  /// Authenticate driver with company code + ID + PIN (or Offline Mock fallback).
  /// The company code namespaces the synthetic Supabase Auth email so two
  /// different companies can each have their own "DRV-001".
  static Future<Map<String, dynamic>> driverLogin({
    required String companyCode,
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
        'error': 'Invalid Company Code, Employee ID or PIN (Mock Hint: use any company code with DRV-001 / 123456)',
      };
    }

    try {
      final cleanCompanyCode = companyCode.trim().toLowerCase();
      final cleanDriverIdUpper = driverId.trim().toUpperCase();
      final email = '${driverId.trim().toLowerCase()}@$cleanCompanyCode.driver.internal';

      // Lock-out gate (migration 065). Refuse to try the password when
      // the account is locked so a stubborn attacker can't count wrong
      // PINs by pressing sign-in in a loop.
      try {
        final lock = await client.rpc('driver_lock_state', params: {
          'p_company_slug': cleanCompanyCode,
          'p_driver_id': cleanDriverIdUpper,
        });
        final rows = (lock is List) ? lock : const [];
        if (rows.isNotEmpty) {
          final untilStr = rows.first['locked_until']?.toString();
          if (untilStr != null && untilStr.isNotEmpty) {
            final until = DateTime.tryParse(untilStr);
            if (until != null && until.isAfter(DateTime.now())) {
              final mins = ((until.difference(DateTime.now()).inSeconds + 59) ~/ 60).clamp(1, 999);
              return {'success': false, 'error': 'Too many wrong PINs. Try again in $mins minute${mins == 1 ? '' : 's'}. If you\'ve forgotten it, tap "Forgot PIN".'};
            }
          }
        }
      } catch (_) {
        // Non-fatal: fall through, the real auth call still guards.
      }

      String? authErrorCode;
      final response = await client.auth.signInWithPassword(
        email: email,
        password: pin.trim(),
      ).catchError((e) {
        if (e is AuthException) authErrorCode = e.code;
        return AuthResponse();
      });

      // A deactivated driver's login is banned (migration 091). Say so,
      // rather than "wrong PIN", and don't count it as a failed attempt.
      if (authErrorCode == 'user_banned') {
        return {'success': false, 'error': deactivatedMessage};
      }

      final session = response.session;
      if (session == null) {
        // Wrong PIN — record the failure and return a shaped lock-out
        // response, then keep the "wrong id or PIN" wording for the app.
        // We're signed out here, so this goes through the pre-sign-in RPC
        // (migration 085) rather than reading the drivers table directly.
        try {
          final state = await client.rpc('register_driver_login_failure', params: {
            'p_company_slug': cleanCompanyCode,
            'p_driver_id': cleanDriverIdUpper,
          });
          final rows = (state is List) ? state : const [];
          if (rows.isNotEmpty) {
            final row = rows.first as Map;
            if (row['pin_pending'] == true) {
              return {'success': false, 'pin_pending': true, 'error': "Your PIN isn't set up yet. Tap \"I have an activation code\" below."};
            }
            final untilStr = row['locked_until']?.toString();
            if (untilStr != null && untilStr.isNotEmpty) {
              final until = DateTime.tryParse(untilStr);
              if (until != null) {
                final mins = ((until.difference(DateTime.now()).inSeconds + 59) ~/ 60).clamp(1, 999);
                return {'success': false, 'error': 'Too many wrong PINs. Try again in $mins minute${mins == 1 ? '' : 's'}. If you\'ve forgotten it, tap "Forgot PIN".'};
              }
            }
            final remaining = row['attempts_remaining'];
            if (remaining is int && remaining > 0 && remaining <= 3) {
              return {'success': false, 'error': 'Wrong PIN. $remaining attempt${remaining == 1 ? '' : 's'} before this account is locked.'};
            }
          }
        } catch (_) {}
        return {'success': false, 'error': 'Wrong Driver ID or PIN.'};
      }

      // Successful sign-in — clear the lock-out counter.
      try {
        await client.rpc('clear_pin_failures', params: {'p_driver_id': session.user.id});
      } catch (_) {}

      {
        final driverUuid = session.user.id;

        // Fetch driver profile
        final profile = await client
            .from('drivers')
            .select()
            .eq('id', driverUuid)
            .single();

        final String rateType = (profile['rate_type'] != null && profile['rate_type'].toString().isNotEmpty)
            ? profile['rate_type'].toString()
            : 'Hourly';
        final double? fixedRate = (profile['fixed_rate'] as num?)?.toDouble();
        final double hourlyRate = (profile['hourly_rate'] as num?)?.toDouble()
            ?? (profile['mon_fri_rate'] as num?)?.toDouble()
            ?? 16.00;
        double monFriRate = (profile['mon_fri_rate'] as num?)?.toDouble() ?? hourlyRate;
        double satRate = (profile['saturday_rate'] as num?)?.toDouble()
            ?? (profile['sat_rate'] as num?)?.toDouble()
            ?? (monFriRate + 1.0);
        double sunRate = (profile['sunday_rate'] as num?)?.toDouble()
            ?? (profile['sun_rate'] as num?)?.toDouble()
            ?? (monFriRate + 2.0);

        try {
          final rateRow = await client
              .from('employee_rates')
              .select('mon_fri_rate, sat_rate, sun_rate, rate_type, agency_name')
              .eq('driver_id', driverUuid)
              .maybeSingle();

          if (rateRow != null) {
            monFriRate = (rateRow['mon_fri_rate'] as num?)?.toDouble() ?? monFriRate;
            satRate = (rateRow['sat_rate'] as num?)?.toDouble() ?? satRate;
            sunRate = (rateRow['sun_rate'] as num?)?.toDouble() ?? sunRate;
          }
        } catch (e) {
          debugPrint('employee_rates fetch (non-fatal): $e');
        }

        return {
          'success': true,
          'driver': {
            'id': driverUuid,
            'driver_id': profile['driver_id'],
            'name': profile['full_name'],
            'full_name': profile['full_name'],
            'rate_type': rateType,
            'fixed_rate': fixedRate,
            'hourly_rate': hourlyRate,
            'mon_fri_rate': monFriRate,
            'sat_rate': satRate,
            'sun_rate': sunRate,
            'agency_name': profile['agency_name'],
            'rate_profile': profile['rate_profile'] ?? 'LWR',
            'organization_id': profile['organization_id'],
          },
        };
      }
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

  /// Checks an activation code (migration 065). Returns
  /// `{success: true}` when the code is currently valid, so the app can
  /// show the "Choose your PIN" screen without using the code up.
  static Future<Map<String, dynamic>> verifyActivationCode({
    required String driverId,
    required String code,
  }) async {
    if (isMockMode) return {'success': true};
    try {
      final response = await client.functions.invoke('driver-activate', body: {
        'action': 'verify',
        'driver_id': driverId,
        'code': code,
      });
      final data = response.data;
      if (data is Map && data['error'] != null) return {'success': false, 'error': data['error']};
      return {'success': true};
    } on FunctionException catch (e) {
      final details = e.details;
      final message = (details is Map && details['error'] != null) ? details['error'].toString() : (e.reasonPhrase ?? 'That activation code isn\'t valid.');
      return {'success': false, 'error': message};
    } catch (e) {
      return {'success': false, 'error': 'Could not check the code — try again.'};
    }
  }

  /// Consumes the activation code and sets the driver's chosen PIN.
  static Future<Map<String, dynamic>> setPinFromActivationCode({
    required String driverId,
    required String code,
    required String pin,
  }) async {
    if (isMockMode) return {'success': true};
    try {
      final response = await client.functions.invoke('driver-activate', body: {
        'action': 'set_pin',
        'driver_id': driverId,
        'code': code,
        'pin': pin,
      });
      final data = response.data;
      if (data is Map && data['error'] != null) return {'success': false, 'error': data['error']};
      return {'success': true};
    } on FunctionException catch (e) {
      final details = e.details;
      final message = (details is Map && details['error'] != null) ? details['error'].toString() : (e.reasonPhrase ?? 'Could not save your PIN.');
      return {'success': false, 'error': message};
    } catch (e) {
      return {'success': false, 'error': 'Could not save your PIN — check your signal and try again.'};
    }
  }

  /// Driver's own "I forgot my PIN". Just files a request in the admin
  /// Alert Panel — the driver still needs a fresh activation code before
  /// they can sign in. Requires a temporary auth session, so we sign in
  /// with a special anonymous handshake first. In practice we call this
  /// from the PIN entry / activate screen when the driver isn't signed
  /// in, so we fall back to writing directly through the anon key when
  /// there's no session.
  static Future<Map<String, dynamic>> requestPinReset({required String driverId, String? companyCode}) async {
    if (isMockMode) return {'success': true};
    try {
      // Uses driver-activate as a stateless entry: it doesn't need a
      // valid activation code to receive a "forgot" ping (see the
      // function's `forgot` action). Falls back to a direct write only
      // if the driver already has a session.
      final response = await client.functions.invoke('driver-activate', body: {
        'action': 'forgot',
        'driver_id': driverId,
        // Driver IDs are only unique per company — this picks the right one.
        if (companyCode != null && companyCode.isNotEmpty) 'company_code': companyCode,
      });
      final data = response.data;
      if (data is Map && data['error'] != null) return {'success': false, 'error': data['error']};
      return {'success': true};
    } on FunctionException catch (e) {
      final details = e.details;
      final message = (details is Map && details['error'] != null) ? details['error'].toString() : (e.reasonPhrase ?? 'Could not send the reset request.');
      return {'success': false, 'error': message};
    } catch (e) {
      return {'success': false, 'error': 'Could not send the reset request — check your signal.'};
    }
  }

  /// Asks the company to delete this employee's account and everything
  /// attached to it (migration 100). Signed in: from Settings.
  static Future<Map<String, dynamic>> requestAccountDeletion({String? reason}) async {
    if (isMockMode) return {'success': true};
    try {
      await client.rpc('request_account_deletion', params: {'p_reason': (reason == null || reason.trim().isEmpty) ? null : reason.trim()});
      return {'success': true};
    } on PostgrestException catch (e) {
      return {'success': false, 'error': e.message};
    } catch (e) {
      debugPrint('requestAccountDeletion failed: $e');
      return {'success': false, 'error': 'Could not send the request — check your signal and try again.'};
    }
  }

  /// Same request from the login screen, signed out. The company code and
  /// Driver ID identify the account; the answer never says whether they matched.
  static Future<Map<String, dynamic>> requestAccountDeletionPublic({required String companyCode, required String driverId, String? reason}) async {
    if (isMockMode) return {'success': true};
    try {
      await client.rpc('request_account_deletion_public', params: {
        'p_company_code': companyCode.trim(),
        'p_driver_id': driverId.trim(),
        'p_reason': (reason == null || reason.trim().isEmpty) ? null : reason.trim(),
      });
      return {'success': true};
    } on PostgrestException catch (e) {
      return {'success': false, 'error': e.message};
    } catch (e) {
      debugPrint('requestAccountDeletionPublic failed: $e');
      return {'success': false, 'error': 'Could not send the request — check your signal and try again.'};
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

  /// Change PIN — used by the driver's own Settings screen. Signed-in
  /// drivers only, no activation code needed. Runs the same easy-PIN
  /// check as the server so 123456 / 111111 / 121212 etc. are refused
  /// consistently (migration 065).
  static Future<Map<String, dynamic>> updateDriverPin({
    required String driverIdOrUuid,
    required String newPin,
  }) async {
    if (isMockMode) return {'success': true};

    final cleanPin = newPin.trim();
    if (!RegExp(r'^\d{6}$').hasMatch(cleanPin)) {
      return {'success': false, 'error': 'Your PIN must be 6 digits.'};
    }
    try {
      final easy = await client.rpc('is_pin_easy', params: {'p_pin': cleanPin});
      if (easy == true) {
        return {'success': false, 'error': 'That PIN is too easy to guess. Pick a mix of digits.'};
      }
    } catch (_) {
      // If the check can't run, fall through — the server enforces on
      // write anyway.
    }

    try {
      final user = client.auth.currentUser;
      if (user == null) return {'success': false, 'error': 'You need to sign in again before changing your PIN.'};

      // pin_hash is behind RLS admins own, so the driver's own change
      // goes through a SECURITY DEFINER function that writes the row
      // and clears any lock-out state (migration 065). It runs first: it
      // also validates the PIN server-side, and if it fails the sign-in
      // password must not have changed already — otherwise the driver is
      // told the change failed while their old PIN no longer works.
      await client.rpc('change_own_pin', params: {'p_new_pin': cleanPin});

      // Supabase Auth password — used by signInWithPassword. A retry after
      // a half-finished attempt can hit "same password"; that already
      // means the sign-in PIN is the new one.
      try {
        await client.auth.updateUser(UserAttributes(password: cleanPin));
      } on AuthException catch (e) {
        if (e.code != 'same_password') rethrow;
      }

      return {'success': true};
    } on PostgrestException catch (e) {
      return {'success': false, 'error': e.message};
    } catch (e) {
      debugPrint('updateDriverPin error: $e');
      return {'success': false, 'error': 'Could not save your PIN. Try again.'};
    }
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
  static Future<Map<String, dynamic>> fetchDriverProfile(String driverCodeOrId) async {
    if (isMockMode) {
      _mockDriverId = driverCodeOrId;
      _mockDriverName = 'John Smith';
      return {
        'success': true,
        'driver': {
          'id': 'drv-1',
          'driver_id': driverCodeOrId,
          'name': 'John Smith',
          'full_name': 'John Smith',
          'rate_type': 'Hourly',
          'fixed_rate': null,
          'hourly_rate': 16.00,
          'mon_fri_rate': 16.00,
          'sat_rate': 17.00,
          'sun_rate': 18.00,
          'rate_profile': _mockRateProfile,
          'profession': 'driver',
        },
      };
    }

    try {
      // Comparing a driver code like "dan.tester" against the uuid id column
      // makes Postgres reject the whole query (400), which callers read as
      // "offline" — so only match on id when the key is actually a uuid.
      final isUuid = RegExp(r'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$')
          .hasMatch(driverCodeOrId);
      final response = await client
          .from('drivers')
          .select('*')
          .or(isUuid ? 'id.eq.$driverCodeOrId' : 'driver_id.ilike.$driverCodeOrId')
          .maybeSingle();

      if (response != null && response['is_active'] == false) {
        // Deactivated by the employer. Auth refuses new sign-ins and token
        // refreshes (migration 091), but a session already on the device
        // keeps a valid access token for up to an hour — end it here.
        return {
          'success': false,
          'error': deactivatedMessage,
          'errorType': 'deactivated',
        };
      }

      if (response != null) {
        final String rateType = (response['rate_type'] != null && response['rate_type'].toString().isNotEmpty)
            ? response['rate_type'].toString()
            : 'Hourly';
        final double? fixedRate = (response['fixed_rate'] as num?)?.toDouble();
        final double hourlyRate = (response['hourly_rate'] as num?)?.toDouble()
            ?? (response['mon_fri_rate'] as num?)?.toDouble()
            ?? 16.00;
        final double monFriRate = (response['mon_fri_rate'] as num?)?.toDouble() ?? hourlyRate;
        final double satRate = (response['saturday_rate'] as num?)?.toDouble()
            ?? (response['sat_rate'] as num?)?.toDouble()
            ?? (monFriRate + 1.0);
        final double sunRate = (response['sunday_rate'] as num?)?.toDouble()
            ?? (response['sun_rate'] as num?)?.toDouble()
            ?? (monFriRate + 2.0);

        return {
          'success': true,
          'driver': {
            'id': response['id'],
            'driver_id': response['driver_id'],
            'name': response['full_name'],
            'full_name': response['full_name'],
            'rate_type': rateType,
            'fixed_rate': fixedRate,
            'hourly_rate': hourlyRate,
            'mon_fri_rate': monFriRate,
            'sat_rate': satRate,
            'sun_rate': sunRate,
            'agency_name': response['agency_name'],
            'rate_profile': response['rate_profile'] ?? 'LWR',
            'organization_id': response['organization_id'],
            'profession': response['profession'],
          },
        };
      }
      // No row matched — this is a real "not found", not a connectivity
      // problem, so it is safe for callers to treat as a genuine logout.
      return {
        'success': false,
        'error': 'Employee profile not found.',
        'errorType': 'not_found',
      };
    } catch (e) {
      // Network/DB failure, not a verdict on the account. Tagged separately
      // so a dropped connection at startup never gets treated the same as
      // the driver having been removed from the system.
      return {
        'success': false,
        'error': 'Database profile connection failed: $e',
        'errorType': 'network_error',
      };
    }
  }

  /// Support phone number(s) for this driver's own company (migration 039).
  /// Replaces what used to be two numbers hardcoded into the app binary and
  /// shown to every driver on the platform regardless of employer. Either
  /// entry can be null — the caller only renders a row for a number that's
  /// actually set.
  static Future<Map<String, String?>> fetchOrgSupportContacts(String? organizationId) async {
    if (isMockMode) {
      return {
        'support_phone_1': '+44 7724 320498',
        'support_phone_2': '+44 7751 735184',
      };
    }
    if (organizationId == null || organizationId.isEmpty) {
      return {'support_phone_1': null, 'support_phone_2': null};
    }

    try {
      final response = await client
          .from('organizations')
          .select('support_phone_1, support_phone_2')
          .eq('id', organizationId)
          .maybeSingle();

      return {
        'support_phone_1': response?['support_phone_1'] as String?,
        'support_phone_2': response?['support_phone_2'] as String?,
      };
    } catch (e) {
      debugPrint('fetchOrgSupportContacts failed (non-fatal): $e');
      return {'support_phone_1': null, 'support_phone_2': null};
    }
  }

  /// Uploads one defect-evidence photo to the private "defect-photos"
  /// bucket (migration 044) and returns the stored object path (NOT a
  /// public URL — the bucket is private; the admin panel resolves this
  /// path to a short-lived signed URL when actually displaying it).
  /// Path shape `<org_id>/<driver_id>/<file>` matches the bucket's RLS,
  /// which scopes read access to the uploader and their own org's admins.
  ///
  /// Takes raw bytes + a file name, not a dart:io File — this app is
  /// deployed as a Flutter Web build (driver.tachyo.co.uk), and
  /// dart:io.File throws UnsupportedError on web. uploadBinary() is the
  /// cross-platform Supabase Storage call that actually works on both
  /// web and native; the caller gets bytes via XFile.readAsBytes(),
  /// which is itself already cross-platform.
  static Future<String?> uploadDefectPhoto({
    required String organizationId,
    required String driverId,
    required Uint8List bytes,
    required String fileName,
  }) async {
    if (isMockMode) {
      debugPrint('MOCK photo upload: $fileName');
      return 'mock/$fileName';
    }
    try {
      final ext = fileName.contains('.') ? fileName.split('.').last.toLowerCase() : 'jpg';
      final path = '$organizationId/$driverId/${DateTime.now().millisecondsSinceEpoch}.$ext';
      await client.storage.from('defect-photos').uploadBinary(
            path,
            bytes,
            fileOptions: FileOptions(contentType: _imageMimeType(ext)),
          );
      lastUploadError = null;
      return path;
    } catch (e) {
      debugPrint('uploadDefectPhoto failed: $e');
      lastUploadError = e.toString();
      return null;
    }
  }

  /// Fetches this driver's org's feature toggles (migration 050) — right
  /// now just allow_driver_night_out_requests, which gates whether the
  /// Action Hub shows "Request Night Out" at all. RLS's
  /// `organizations_read_own` policy (migration 032) already lets a
  /// driver read their own org's row via current_org_id(), which
  /// resolves for a driver session the same way it does for an admin
  /// one — no new policy needed.
  static Future<bool> fetchAllowNightOutRequests(String organizationId) async {
    if (isMockMode) return true;
    try {
      final response = await client
          .from('organizations')
          .select('allow_driver_night_out_requests')
          .eq('id', organizationId)
          .maybeSingle();
      return response?['allow_driver_night_out_requests'] == true;
    } catch (e) {
      debugPrint('fetchAllowNightOutRequests failed: $e');
      return false;
    }
  }

  /// Fetches this driver's org's active vehicles (trucks + trailers) so the
  /// incident-report flow can ask which asset a report concerns — without
  /// this, incident_reports.vehicle_id is left null and the admin panel
  /// has no way to know which truck/trailer needs attention. RLS
  /// (`vehicles_org_read`, migration 040) already scopes this to the
  /// caller's own organization via current_org_id().
  static Future<List<Map<String, dynamic>>> fetchOrgVehicles(String organizationId) async {
    if (isMockMode) {
      return [
        {'id': 'mock-truck-1', 'vehicle_number': 'TRK-101', 'vehicle_type': 'truck'},
        {'id': 'mock-trailer-1', 'vehicle_number': 'TRL-204', 'vehicle_type': 'trailer'},
      ];
    }
    try {
      final response = await client
          .from('vehicles')
          .select('id, vehicle_number, vehicle_type, fuel_tank_capacity_litres, is_vor, inspection_due_date, mot_due_date, tax_due_date, insurance_expiry_date')
          .eq('organization_id', organizationId)
          .eq('is_active', true)
          .order('vehicle_type')
          .order('vehicle_number');
      return _mergeVehicleRows(List<Map<String, dynamic>>.from(response));
    } catch (e) {
      debugPrint('fetchOrgVehicles failed: $e');
      return [];
    }
  }

  /// The fleet register stores one `vehicles` row per inspection type
  /// (MOT, PMI, tacho…) for the same registration, so the raw list repeats
  /// a unit once per inspection. Collapse them to one entry per unit: keep
  /// the first row's id, the earliest of each due date (the one that makes
  /// the unit unroadworthy first) and VOR if any row is VOR.
  static List<Map<String, dynamic>> _mergeVehicleRows(List<Map<String, dynamic>> rows) {
    const dateKeys = ['inspection_due_date', 'mot_due_date', 'tax_due_date', 'insurance_expiry_date'];
    final merged = <String, Map<String, dynamic>>{};
    for (final row in rows) {
      final key = '${row['vehicle_type']}|${(row['vehicle_number'] ?? '').toString().trim().toUpperCase()}';
      final existing = merged[key];
      if (existing == null) {
        merged[key] = Map<String, dynamic>.from(row);
        continue;
      }
      if (row['is_vor'] == true) existing['is_vor'] = true;
      existing['fuel_tank_capacity_litres'] ??= row['fuel_tank_capacity_litres'];
      for (final k in dateKeys) {
        final a = DateTime.tryParse(existing[k]?.toString() ?? '');
        final b = DateTime.tryParse(row[k]?.toString() ?? '');
        if (b != null && (a == null || b.isBefore(a))) existing[k] = row[k];
      }
    }
    return merged.values.toList();
  }

  /// Submits a driver-reported defect (migration 040/043) — vehicle
  /// damage, near-miss, collision, mechanical fault, or other, tagged to
  /// the specific asset involved (vehicleId) wherever one was selected, with
  /// optional evidence photos (stored object paths from
  /// uploadDefectPhoto, not URLs). Deliberately minimal otherwise: a
  /// category plus whatever context is actually available (GPS, an
  /// optional note) — nothing here is fabricated when a value isn't
  /// known, it's just omitted (e.g. no GPS fix yet). Fires as a single
  /// direct insert with no queueing or batching, so it reaches the admin
  /// panel immediately.
  static Future<bool> submitIncidentReport({
    required String driverId,
    required String category,
    String? vehicleId,
    String? trailerId,
    String? note,
    double? latitude,
    double? longitude,
    List<String> photoPaths = const [],
  }) async {
    if (isMockMode) {
      debugPrint('MOCK incident report: $category for vehicle $vehicleId / trailer $trailerId ($note) at ($latitude, $longitude) with ${photoPaths.length} photo(s)');
      return true;
    }

    try {
      await client.from('incident_reports').insert({
        'driver_id': driverId,
        'category': category,
        if (vehicleId != null) 'vehicle_id': vehicleId,
        if (trailerId != null) 'trailer_id': trailerId,
        if (note != null && note.trim().isNotEmpty) 'note': note.trim(),
        if (latitude != null) 'latitude': latitude,
        if (longitude != null) 'longitude': longitude,
        if (photoPaths.isNotEmpty) 'photo_urls': photoPaths,
      });
      return true;
    } catch (e) {
      debugPrint('submitIncidentReport failed: $e');
      return false;
    }
  }

  /// Submits a walk-around check (migration 052) — either a completed
  /// one (completedAt + overallResult set) or a "Save as Draft" partial
  /// save (both left null, matching the nullable columns the migration
  /// already declares). A draft never counts as satisfying the
  /// before-shift/before-clock-out gate — only a completed submission
  /// does. shiftId is null for a start-of-shift check — the shift
  /// doesn't exist yet when that check runs; see
  /// linkWalkaroundCheckToShift, called right after clock-in creates
  /// the real shift row.
  static Future<String?> submitWalkaroundCheck({
    required String driverId,
    required String vehicleId,
    String? trailerId,
    String? customTrailerNumber,
    String? shiftId,
    required String checkType, // 'start_of_shift' | 'end_of_shift'
    required DateTime startedAt,
    DateTime? completedAt,
    required List<Map<String, dynamic>> items,
    String? overallResult, // 'pass' | 'defects_found'
    String? defectNote,
    String? existingId, // a saved draft to finish/overwrite instead of inserting
  }) async {
    if (isMockMode) {
      debugPrint('MOCK walkaround check: $checkType for vehicle $vehicleId / trailer $trailerId — ${overallResult ?? 'draft'}');
      return 'mock-walkaround-id';
    }
    final row = {
      'driver_id': driverId,
      'vehicle_id': vehicleId,
      'trailer_id': trailerId,
      'custom_trailer_number': trailerId == null && customTrailerNumber != null && customTrailerNumber.trim().isNotEmpty
          ? customTrailerNumber.trim().toUpperCase()
          : null,
      if (shiftId != null) 'shift_id': shiftId,
      'check_type': checkType,
      'started_at': startedAt.toUtc().toIso8601String(),
      'completed_at': completedAt?.toUtc().toIso8601String(),
      'duration_seconds': completedAt?.difference(startedAt).inSeconds,
      'items': items,
      'overall_result': overallResult,
      'defect_note': defectNote != null && defectNote.trim().isNotEmpty ? defectNote.trim() : null,
    };
    try {
      final query = existingId != null
          ? client.from('walkaround_checks').update(row).eq('id', existingId)
          : client.from('walkaround_checks').insert(row);
      final response = await query.select('id').single();
      return response['id'] as String?;
    } catch (e) {
      debugPrint('submitWalkaroundCheck failed: $e');
      return null;
    }
  }

  /// The signed-in driver's most recent unsubmitted draft for this check,
  /// so "Save as Draft" can be picked up where it was left. Without a
  /// shift (a start-of-shift check before clock-in) it only looks at
  /// drafts from the last 12 hours.
  static Future<Map<String, dynamic>?> fetchWalkaroundDraft({
    required String checkType,
    String? shiftId,
  }) async {
    final driverId = currentDriverId;
    if (isMockMode || driverId == null) return null;
    try {
      var query = client
          .from('walkaround_checks')
          .select('id, started_at, items, trailer_id, custom_trailer_number')
          .eq('driver_id', driverId)
          .eq('check_type', checkType)
          .isFilter('completed_at', null);
      query = shiftId != null
          ? query.eq('shift_id', shiftId)
          : query.isFilter('shift_id', null).gte('started_at', DateTime.now().subtract(const Duration(hours: 12)).toUtc().toIso8601String());
      final rows = await query.order('started_at', ascending: false).limit(1);
      final list = List<Map<String, dynamic>>.from(rows as List);
      return list.isEmpty ? null : list.first;
    } catch (e) {
      debugPrint('fetchWalkaroundDraft failed: $e');
      return null;
    }
  }

  /// Uploads one walk-around check photo to the private
  /// "walkaround-photos" bucket (migration 053) — same
  /// private-bucket-with-signed-URL shape as uploadDefectPhoto.
  static Future<String?> uploadWalkaroundPhoto({
    required String organizationId,
    required String driverId,
    required Uint8List bytes,
    required String fileName,
  }) async {
    if (isMockMode) {
      debugPrint('MOCK walkaround photo upload: $fileName');
      return 'mock/$fileName';
    }
    try {
      final ext = fileName.contains('.') ? fileName.split('.').last.toLowerCase() : 'jpg';
      final path = '$organizationId/$driverId/${DateTime.now().millisecondsSinceEpoch}.$ext';
      await client.storage.from('walkaround-photos').uploadBinary(
            path,
            bytes,
            fileOptions: FileOptions(contentType: _imageMimeType(ext)),
          );
      lastUploadError = null;
      return path;
    } catch (e) {
      debugPrint('uploadWalkaroundPhoto failed: $e');
      lastUploadError = e.toString();
      return null;
    }
  }

  /// Backfills shift_id on a start-of-shift check once clock-in has
  /// created the real shift row — the check is always completed before
  /// the shift exists, so this is a required second step, not optional
  /// cleanup.
  static Future<void> linkWalkaroundCheckToShift({
    required String checkId,
    required String shiftId,
  }) async {
    if (isMockMode) return;
    try {
      await client.from('walkaround_checks').update({'shift_id': shiftId}).eq('id', checkId);
    } catch (e) {
      debugPrint('linkWalkaroundCheckToShift failed: $e');
    }
  }

  /// The signed-in driver's own walk-around checks, newest first —
  /// submitted checks and saved drafts — for their in-app history.
  static Future<List<Map<String, dynamic>>> fetchMyWalkaroundChecks({int limit = 60}) async {
    final driverId = currentDriverId;
    if (isMockMode || driverId == null) return [];
    try {
      final rows = await client
          .from('walkaround_checks')
          .select('id, shift_id, check_type, started_at, completed_at, duration_seconds, overall_result, defect_note, items, custom_trailer_number, vehicle:vehicles!vehicle_id(vehicle_number), trailer:vehicles!trailer_id(vehicle_number)')
          .eq('driver_id', driverId)
          .order('started_at', ascending: false)
          .limit(limit);
      return List<Map<String, dynamic>>.from(rows as List);
    } catch (e) {
      debugPrint('fetchMyWalkaroundChecks failed: $e');
      rethrow;
    }
  }

  /// Dispatched loads (migration 073) for the signed-in driver. Throws on a
  /// network/server failure so the caller can fall back to its offline
  /// cache instead of silently showing "no loads".
  static Future<List<Map<String, dynamic>>> fetchDispatchLoads({required List<String> statuses, int limit = 100}) async {
    final driverId = currentDriverId;
    if (isMockMode || driverId == null) return [];
    final rows = await client
        .from('dispatch_loads')
        .select('id, vrid, origin, destination, booking_cutoff_at, trailer_number, status, odometer_start, odometer_end, created_at, accepted_at, completed_at, loading_started_at, loading_completed_at, shipment_proofs(id, pod_type, photo_path, taken_at)')
        .eq('driver_id', driverId)
        .inFilter('status', statuses)
        .order('created_at', ascending: false)
        .limit(limit);
    return List<Map<String, dynamic>>.from(rows as List);
  }

  /// The company's rule for what happens when tracking stops (Settings →
  /// Alerts in the admin panel). Falls back to the defaults when offline.
  static Future<GpsPolicy> fetchGpsPolicy() async {
    if (isMockMode) return GpsPolicy.fallback;
    try {
      final res = await client.rpc('driver_gps_policy');
      if (res is Map) return GpsPolicy.fromJson(Map<String, dynamic>.from(res));
    } catch (e) {
      debugPrint('fetchGpsPolicy failed, using defaults: $e');
    }
    return GpsPolicy.fallback;
  }

  /// The driver's most recent "tracking stopped" event in the last 12
  /// hours (null if none) — shown when they reopen the app so they know
  /// what the office saw and what it did to their time.
  /// The driver's recent tracking events — offline AND idle (migration 101),
  /// newest first, so the app can show each one once.
  static Future<List<Map<String, dynamic>>> fetchRecentGpsEvents() async {
    if (isMockMode) return const [];
    try {
      final res = await client.rpc('my_recent_gps_offline');
      if (res is List) return res.map((e) => Map<String, dynamic>.from(e as Map)).toList();
    } catch (e) {
      debugPrint('fetchRecentGpsEvents failed: $e');
    }
    return const [];
  }

  static Future<Map<String, dynamic>?> fetchRecentGpsOffline() async {
    if (isMockMode) return null;
    try {
      final res = await client.rpc('my_recent_gps_offline');
      if (res is List && res.isNotEmpty) return Map<String, dynamic>.from(res.first as Map);
    } catch (e) {
      debugPrint('fetchRecentGpsOffline failed: $e');
    }
    return null;
  }

  /// Signed, short-lived links for proof-of-delivery photos (private
  /// "delivery-photos" bucket) — a driver can only ever get a link for
  /// photos in their own driver_id folder (storage RLS), which is all
  /// the Load History screen ever shows them anyway.
  static Future<Map<String, String>> fetchSignedDeliveryPhotoUrls(List<String> paths) async {
    if (isMockMode || paths.isEmpty) return {};
    try {
      final data = await client.storage.from('delivery-photos').createSignedUrls(paths, 3600);
      final out = <String, String>{};
      for (var i = 0; i < data.length; i++) {
        final url = data[i].signedUrl;
        if (url.isNotEmpty) out[paths[i]] = url;
      }
      return out;
    } catch (e) {
      debugPrint('fetchSignedDeliveryPhotoUrls failed: $e');
      return {};
    }
  }

  /// Marks loading as started or finished on one of the driver's loads
  /// (migration 092) so the office can see the shipment is being loaded.
  /// [kind] is 'dispatch' (office-assigned) or 'shift' (attached by the
  /// driver); [event] is 'started' or 'finished'. Returns null on success.
  static Future<String?> recordLoadLoading(String kind, String loadId, String event) async {
    if (isMockMode) return null;
    try {
      await client.rpc('record_load_loading', params: {'p_kind': kind, 'p_load_id': loadId, 'p_event': event});
      return null;
    } on PostgrestException catch (e) {
      return e.message;
    } catch (_) {
      return 'No connection — try again when you have signal.';
    }
  }

  /// Accepts an assigned load (assigned → in_progress) with the odometer
  /// at coupling and the optional cargo photo / trailer-sealed tick
  /// (migration 077). Returns null on success, or the server's message.
  static Future<String?> acceptDispatchLoad(String id, int odometer, {String? cargoPhotoPath, bool trailerSealed = false}) async {
    if (isMockMode) return null;
    try {
      await client.rpc('accept_dispatch_load', params: {
        'p_id': id,
        'p_odometer': odometer,
        'p_cargo_photo_path': cargoPhotoPath,
        'p_trailer_sealed': trailerSealed,
      });
      return null;
    } on PostgrestException catch (e) {
      return e.message;
    } catch (_) {
      return 'No connection — try again when you have signal.';
    }
  }

  /// Completes an in-progress load with the ending odometer and one or
  /// more typed proof photos (migration 077). The server refuses without
  /// at least one.
  static Future<String?> completeDispatchLoad(
    String id,
    int odometer, {
    required List<Map<String, dynamic>> proofs,
    String? notes,
  }) async {
    if (isMockMode) return null;
    try {
      await client.rpc('complete_dispatch_load', params: {
        'p_id': id,
        'p_odometer': odometer,
        'p_proofs': proofs,
        'p_notes': notes,
      });
      return null;
    } on PostgrestException catch (e) {
      return e.message;
    } catch (_) {
      return 'No connection — try again when you have signal.';
    }
  }

  /// The signed-in driver's own fuel/AdBlue receipts since [since] —
  /// used by the History tab's fuel progress ring. RLS already limits a
  /// driver to their own rows (fuel_receipts_driver_select), same as
  /// walkaround checks above.
  static Future<List<Map<String, dynamic>>> fetchMyFuelReceipts({required DateTime since}) async {
    final driverId = currentDriverId;
    if (isMockMode || driverId == null) return [];
    try {
      final rows = await client
          .from('fuel_receipts')
          .select('id, liters, created_at, is_full_tank, calculated_mpg, theft_flag')
          .eq('driver_id', driverId)
          .gte('created_at', since.toIso8601String())
          .order('created_at', ascending: false);
      return List<Map<String, dynamic>>.from(rows as List);
    } catch (e) {
      debugPrint('fetchMyFuelReceipts failed: $e');
      return [];
    }
  }

  /// Driver's signed acceptance of responsibility for taking a unit or
  /// trailer that isn't roadworthy (migration 063).
  static Future<bool> recordVehicleRiskAcknowledgement({
    required String vehicleId,
    required List<String> issues,
    required String signOffContext,
    required String signerName,
    required String signatureSvg,
    String? shiftId,
  }) async {
    final driverId = currentDriverId;
    if (isMockMode) return true;
    if (driverId == null) return false;
    try {
      await client.from('vehicle_risk_acknowledgements').insert({
        'driver_id': driverId,
        'vehicle_id': vehicleId,
        if (shiftId != null) 'shift_id': shiftId,
        'issues': issues,
        'context': signOffContext,
        'signer_name': signerName,
        'signature_svg': signatureSvg,
      });
      return true;
    } catch (e) {
      debugPrint('recordVehicleRiskAcknowledgement failed: $e');
      return false;
    }
  }

  /// Feature keys the employee's company plan includes (migration 067),
  /// or null if they can't be fetched — callers then show everything and
  /// let the server enforce the plan.
  static Future<Set<String>?> fetchFeatureKeys() async {
    if (isMockMode) return null;
    try {
      final data = await client.rpc('my_entitlements');
      if (data is Map && data['features'] is List) {
        return {for (final f in data['features'] as List) f.toString()};
      }
      return null;
    } catch (e) {
      debugPrint('fetchFeatureKeys failed: $e');
      return null;
    }
  }

  /// The signed-in employee's own holidays and holiday requests
  /// (migration 061) — pending, approved, declined and cancelled.
  static Future<List<Map<String, dynamic>>> fetchMyHolidays() async {
    final driverId = currentDriverId;
    if (isMockMode || driverId == null) return [];
    final rows = await client
        .from('employee_holidays')
        .select('id, start_date, end_date, note, status, leave_type, review_note, reviewed_at, created_at, requested_by_driver')
        .eq('driver_id', driverId)
        .order('start_date', ascending: false)
        .limit(120);
    return List<Map<String, dynamic>>.from(rows as List);
  }

  static String _isoDate(DateTime d) =>
      '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

  /// Sends a holiday request for admin approval. Validation (past dates,
  /// overlaps, length) happens server-side in request_holiday().
  static Future<Map<String, dynamic>> requestHoliday({
    required DateTime start,
    required DateTime end,
    required String leaveType,
    String? note,
  }) async {
    if (isMockMode) return {'success': true};
    try {
      await client.rpc('request_holiday', params: {
        'p_start': _isoDate(start),
        'p_end': _isoDate(end),
        'p_leave_type': leaveType,
        'p_note': (note == null || note.trim().isEmpty) ? null : note.trim(),
      });
      return {'success': true};
    } on PostgrestException catch (e) {
      return {'success': false, 'error': e.message};
    } catch (e) {
      debugPrint('requestHoliday failed: $e');
      return {'success': false, 'error': 'Could not send your request — check your connection and try again.'};
    }
  }

  /// Withdraws a request that hasn't been decided yet.
  static Future<Map<String, dynamic>> cancelHolidayRequest(String id) async {
    if (isMockMode) return {'success': true};
    try {
      await client.rpc('cancel_holiday_request', params: {'p_id': id});
      return {'success': true};
    } on PostgrestException catch (e) {
      return {'success': false, 'error': e.message};
    } catch (e) {
      debugPrint('cancelHolidayRequest failed: $e');
      return {'success': false, 'error': 'Could not cancel the request — check your connection and try again.'};
    }
  }

  /// The signed-in employee's rota for the seven days from [weekStart]
  /// (migration 094). Each row: work_date, day_off, start_time, end_time, note.
  static Future<List<Map<String, dynamic>>> fetchMyRota(DateTime weekStart) async {
    final driverId = currentDriverId;
    if (isMockMode || driverId == null) return [];
    final rows = await client
        .from('employee_rota')
        .select('work_date, day_off, start_time, end_time, note')
        .eq('driver_id', driverId)
        .gte('work_date', _isoDate(weekStart))
        .lte('work_date', _isoDate(weekStart.add(const Duration(days: 6))))
        .order('work_date');
    return List<Map<String, dynamic>>.from(rows as List);
  }

  /// Replaces the employee's rota for the week. [days] holds
  /// {date, off, start, end, note}; validation happens in save_my_rota().
  static Future<Map<String, dynamic>> saveMyRota(DateTime weekStart, List<Map<String, dynamic>> days) async {
    if (isMockMode) return {'success': true};
    try {
      await client.rpc('save_my_rota', params: {'p_week_start': _isoDate(weekStart), 'p_days': days});
      return {'success': true};
    } on PostgrestException catch (e) {
      return {'success': false, 'error': e.message};
    } catch (e) {
      debugPrint('saveMyRota failed: $e');
      return {'success': false, 'error': 'Could not save your rota — check your connection and try again.'};
    }
  }

  /// Which walk-around checks ('start_of_shift' / 'end_of_shift') have
  /// been fully submitted (not just saved as a draft) for this shift —
  /// drives the "complete your skipped check" quick action.
  static Future<Set<String>> fetchCompletedWalkaroundTypes(String shiftId) async {
    if (isMockMode) return <String>{};
    try {
      final rows = await client
          .from('walkaround_checks')
          .select('check_type')
          .eq('shift_id', shiftId)
          .not('completed_at', 'is', null);
      return {for (final r in rows as List) r['check_type'] as String};
    } catch (e) {
      debugPrint('fetchCompletedWalkaroundTypes failed: $e');
      return <String>{};
    }
  }

  /// Uploads one fuel-receipt photo to the private "fuel-receipts"
  /// bucket (migration 047) — same private-bucket-with-signed-URL shape
  /// as uploadDefectPhoto above, not a public link.
  /// Cross-platform bytes + file name — see uploadDefectPhoto's doc
  /// comment for why this doesn't take a dart:io File.
  static Future<String?> uploadFuelReceiptPhoto({
    required String organizationId,
    required String driverId,
    required Uint8List bytes,
    required String fileName,
  }) async {
    if (isMockMode) {
      debugPrint('MOCK fuel receipt photo upload: $fileName');
      return 'mock/$fileName';
    }
    try {
      final ext = fileName.contains('.') ? fileName.split('.').last.toLowerCase() : 'jpg';
      final path = '$organizationId/$driverId/${DateTime.now().millisecondsSinceEpoch}.$ext';
      await client.storage.from('fuel-receipts').uploadBinary(
            path,
            bytes,
            fileOptions: FileOptions(contentType: _imageMimeType(ext)),
          );
      lastUploadError = null;
      return path;
    } catch (e) {
      debugPrint('uploadFuelReceiptPhoto failed: $e');
      lastUploadError = e.toString();
      return null;
    }
  }

  /// Submits one fuel or AdBlue receipt (migration 047, extended by 049
  /// with fuel_type and an optional total_cost) — starts 'pending' until
  /// an admin reviews it; only 'approved' receipts count toward the
  /// Profitability ledger's Actual Fuel Cost, so an unreviewed submission
  /// here never silently inflates anyone's numbers. liters is required
  /// by the caller (the mobile form enforces this before calling), cost
  /// is genuinely optional now that migration 049 dropped its NOT NULL.
  ///
  /// isFullTank (migration 070, defaults true — this fleet always brims)
  /// tells the server-side calc_fuel_theft_flag trigger whether this row
  /// is a valid comparison anchor: calculated_mpg/theft_flag/theft_reason
  /// are computed and stored by that trigger, not here.
  static Future<bool> submitFuelReceipt({
    required String driverId,
    required String receiptPhotoPath,
    required double liters,
    String fuelType = 'diesel',
    double? totalCost,
    String? shiftId,
    String? vehicleId,
    String? trailerId,
    String? vendor,
    int? odometerMiles,
    String? dashboardPhotoPath,
    double? gpsLat,
    double? gpsLng,
    bool isFullTank = true,
  }) async {
    if (isMockMode) {
      debugPrint('MOCK fuel receipt: $fuelType, ${liters}L, ${totalCost != null ? '£$totalCost' : 'no cost entered'} at ${vendor ?? 'unknown vendor'} for shift $shiftId, odometer $odometerMiles mi, full tank: $isFullTank, GPS ($gpsLat, $gpsLng)');
      return true;
    }

    try {
      await client.from('fuel_receipts').insert({
        'driver_id': driverId,
        'receipt_photo_path': receiptPhotoPath,
        'liters': liters,
        'fuel_type': fuelType,
        if (totalCost != null) 'total_cost': totalCost,
        if (shiftId != null) 'shift_id': shiftId,
        if (vehicleId != null) 'vehicle_id': vehicleId,
        if (trailerId != null) 'trailer_id': trailerId,
        if (vendor != null && vendor.trim().isNotEmpty) 'vendor': vendor.trim(),
        if (odometerMiles != null) 'odometer_miles': odometerMiles,
        if (dashboardPhotoPath != null) 'dashboard_photo_path': dashboardPhotoPath,
        if (gpsLat != null) 'gps_lat': gpsLat,
        if (gpsLng != null) 'gps_lng': gpsLng,
        'is_full_tank': isFullTank,
      });
      return true;
    } catch (e) {
      debugPrint('submitFuelReceipt failed: $e');
      return false;
    }
  }

  /// The most recent logged odometer reading for this vehicle, across
  /// any driver's fuel receipts (full-tank or not — the odometer itself
  /// must still be monotonic regardless). Used by the fuel log form to
  /// reject a reading that's gone backwards before it's even submitted,
  /// rather than only catching it later in the admin audit view. Returns
  /// null if the vehicle has no prior receipt with an odometer reading,
  /// or on any error — callers treat null as "nothing to compare against"
  /// rather than blocking the submission.
  static Future<int?> fetchLastOdometerForVehicle(String vehicleId) async {
    if (isMockMode) return null;
    try {
      final rows = await client
          .from('fuel_receipts')
          .select('odometer_miles')
          .eq('vehicle_id', vehicleId)
          .not('odometer_miles', 'is', null)
          .order('odometer_miles', ascending: false)
          .limit(1);
      if (rows.isEmpty) return null;
      return rows.first['odometer_miles'] as int?;
    } catch (e) {
      debugPrint('fetchLastOdometerForVehicle failed: $e');
      return null;
    }
  }

  /// Uploads one overnight parking receipt photo to the private
  /// "parking-receipts" bucket (migration 054) — same
  /// private-bucket-with-signed-URL shape as uploadFuelReceiptPhoto.
  static Future<String?> uploadParkingReceiptPhoto({
    required String organizationId,
    required String driverId,
    required Uint8List bytes,
    required String fileName,
  }) async {
    if (isMockMode) {
      debugPrint('MOCK parking receipt photo upload: $fileName');
      return 'mock/$fileName';
    }
    try {
      final ext = fileName.contains('.') ? fileName.split('.').last.toLowerCase() : 'jpg';
      final path = '$organizationId/$driverId/${DateTime.now().millisecondsSinceEpoch}.$ext';
      await client.storage.from('parking-receipts').uploadBinary(
            path,
            bytes,
            fileOptions: FileOptions(contentType: _imageMimeType(ext)),
          );
      lastUploadError = null;
      return path;
    } catch (e) {
      debugPrint('uploadParkingReceiptPhoto failed: $e');
      lastUploadError = e.toString();
      return null;
    }
  }

  /// Submits an overnight parking expense claim (migration 054) — paid
  /// by the driver, reimbursed via payroll once an admin approves it
  /// (approval adds the amount onto the linked shift's extras_amount;
  /// see the admin panel's handleReviewParkingExpense). Starts
  /// 'pending', same review gate as fuel receipts.
  static Future<bool> submitParkingExpense({
    required String driverId,
    required String receiptPhotoPath,
    required double amount,
    String? shiftId,
    String? location,
    String? note,
    DateTime? parkingDate,
  }) async {
    if (isMockMode) {
      debugPrint('MOCK parking expense: £$amount at ${location ?? 'unknown location'} for shift $shiftId');
      return true;
    }

    try {
      await client.from('parking_expenses').insert({
        'driver_id': driverId,
        'receipt_photo_path': receiptPhotoPath,
        'amount': amount,
        if (shiftId != null) 'shift_id': shiftId,
        if (location != null && location.trim().isNotEmpty) 'location': location.trim(),
        if (note != null && note.trim().isNotEmpty) 'note': note.trim(),
        'parking_date': (parkingDate ?? DateTime.now()).toIso8601String().substring(0, 10),
      });
      return true;
    } catch (e) {
      debugPrint('submitParkingExpense failed: $e');
      return false;
    }
  }

  /// Lets a driver tag their own active shift with a load reference /
  /// customer name, via the attach-load Edge Function — never a direct
  /// write to shift_revenue, which has no driver-facing RLS policy at
  /// all on purpose (migration 035: revenue_amount, the company's
  /// billed rate, must never reach a driver's device). The function
  /// only ever touches load_reference/carrier_name; an admin still
  /// rates the £ value afterward from the Shipments ledger.
  static Future<Map<String, dynamic>> attachLoadReference({
    required String shiftId,
    required String loadReference,
    String? carrierName,
    DateTime? bookedDepartureAt,
    DateTime? bookedDeliveryAt,
    String? cargoPhotoPath,
    bool trailerSealed = false,
  }) async {
    if (isMockMode) {
      debugPrint('MOCK load attached: $loadReference (${carrierName ?? 'no carrier'}) to shift $shiftId');
      return {'success': true};
    }
    try {
      final response = await client.functions.invoke('attach-load', body: {
        'shift_id': shiftId,
        'load_reference': loadReference,
        if (carrierName != null && carrierName.trim().isNotEmpty) 'carrier_name': carrierName.trim(),
        if (bookedDepartureAt != null) 'booked_departure_at': bookedDepartureAt.toUtc().toIso8601String(),
        if (bookedDeliveryAt != null) 'booked_delivery_at': bookedDeliveryAt.toUtc().toIso8601String(),
        if (cargoPhotoPath != null) 'cargo_photo_path': cargoPhotoPath,
        'trailer_sealed': trailerSealed,
      });
      final data = response.data;
      if (data is Map && data['error'] != null) {
        return {'success': false, 'error': data['error'].toString()};
      }
      return {'success': true, 'load_id': data is Map ? data['load_id'] : null};
    } on FunctionException catch (e) {
      final details = e.details;
      final message = (details is Map && details['error'] != null) ? details['error'].toString() : e.reasonPhrase ?? 'Could not attach the load.';
      debugPrint('attachLoadReference failed: $message');
      return {'success': false, 'error': message};
    } catch (e) {
      debugPrint('attachLoadReference failed: $e');
      return {'success': false, 'error': 'Could not attach the load — check your connection and try again.'};
    }
  }

  /// The shift's load + delivery state and the org's load reminder
  /// threshold, via the same attach-load function (never a direct read
  /// of shift_revenue). Returns null when it can't be fetched.
  static Future<Map<String, dynamic>?> fetchLoadStatus(String shiftId) async {
    if (isMockMode) {
      return {'load_reference': null, 'carrier_name': null, 'delivered_at': null, 'reminder_minutes': 30};
    }
    try {
      final response = await client.functions.invoke('attach-load', body: {'action': 'status', 'shift_id': shiftId});
      final data = response.data;
      if (data is Map && data['success'] == true) return Map<String, dynamic>.from(data);
      return null;
    } catch (e) {
      debugPrint('fetchLoadStatus failed: $e');
      return null;
    }
  }

  /// Uploads one delivery photo (paperwork or load evidence) to the
  /// private "delivery-photos" bucket (migration 060) — same
  /// `<org>/<driver>/<file>` shape as uploadWalkaroundPhoto.
  static Future<String?> uploadDeliveryPhoto({
    required String organizationId,
    required String driverId,
    required Uint8List bytes,
    required String fileName,
    required String kind, // 'paperwork' | 'evidence'
  }) async {
    if (isMockMode) {
      debugPrint('MOCK delivery photo upload ($kind): $fileName');
      return 'mock/$fileName';
    }
    try {
      final ext = fileName.contains('.') ? fileName.split('.').last.toLowerCase() : 'jpg';
      final path = '$organizationId/$driverId/${DateTime.now().millisecondsSinceEpoch}_$kind.$ext';
      await client.storage.from('delivery-photos').uploadBinary(
            path,
            bytes,
            fileOptions: FileOptions(contentType: _imageMimeType(ext)),
          );
      lastUploadError = null;
      return path;
    } catch (e) {
      debugPrint('uploadDeliveryPhoto failed: $e');
      lastUploadError = e.toString();
      return null;
    }
  }

  /// Confirms the shift's attached load was delivered (migration 059),
  /// with one or more typed proof photos and optional notes (migration 077).
  static Future<Map<String, dynamic>> confirmLoadDelivered(
    String shiftId, {
    String? loadId,
    required List<Map<String, dynamic>> proofs,
    String? notes,
  }) async {
    if (isMockMode) return {'success': true, 'delivered_at': DateTime.now().toIso8601String()};
    try {
      final response = await client.functions.invoke('attach-load', body: {
        'action': 'deliver',
        'shift_id': shiftId,
        if (loadId != null) 'load_id': loadId,
        'proofs': proofs,
        if (notes != null && notes.isNotEmpty) 'notes': notes,
      });
      final data = response.data;
      if (data is Map && data['error'] != null) {
        return {'success': false, 'error': data['error'].toString()};
      }
      return {'success': true, 'delivered_at': data is Map ? data['delivered_at'] : null};
    } on FunctionException catch (e) {
      final details = e.details;
      final message = (details is Map && details['error'] != null) ? details['error'].toString() : e.reasonPhrase ?? 'Could not confirm delivery.';
      return {'success': false, 'error': message};
    } catch (e) {
      debugPrint('confirmLoadDelivered failed: $e');
      return {'success': false, 'error': 'Could not confirm delivery — check your connection and try again.'};
    }
  }

  /// Couples/decouples the tractor and/or trailer on an in-progress
  /// shift (migration 049's shifts.trailer_id, alongside the existing
  /// vehicle_id) — the header toolbar's Couple/Decouple modal and the
  /// dashboard's "No Tractor Assigned" reminder both call this. Passing
  /// an explicit `clearVehicle`/`clearTrailer` sets that column back to
  /// NULL (decouple); omitting a field leaves that column untouched.
  static Future<bool> updateShiftCoupling({
    required String shiftId,
    String? vehicleId,
    bool clearVehicle = false,
    String? trailerId,
    String? customTrailerNumber,
    bool clearTrailer = false,
  }) async {
    if (isMockMode) {
      debugPrint('MOCK coupling update for shift $shiftId: vehicle=${clearVehicle ? 'CLEARED' : vehicleId ?? 'unchanged'}, trailer=${clearTrailer ? 'CLEARED' : trailerId ?? 'unchanged'}');
      return true;
    }
    final update = <String, dynamic>{};
    if (clearVehicle) {
      update['vehicle_id'] = null;
    } else if (vehicleId != null) {
      update['vehicle_id'] = vehicleId;
    }
    // A fleet trailer and a typed (non-fleet) trailer number are
    // mutually exclusive — setting one always clears the other.
    if (clearTrailer) {
      update['trailer_id'] = null;
      update['custom_trailer_number'] = null;
    } else if (trailerId != null) {
      update['trailer_id'] = trailerId;
      update['custom_trailer_number'] = null;
    } else if (customTrailerNumber != null && customTrailerNumber.trim().isNotEmpty) {
      update['trailer_id'] = null;
      update['custom_trailer_number'] = customTrailerNumber.trim().toUpperCase();
    }
    if (update.isEmpty) return true;
    try {
      await client.from('shifts').update(update).eq('id', shiftId);
      return true;
    } catch (e) {
      debugPrint('updateShiftCoupling failed: $e');
      return false;
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

  /// Raw GPS pings (shift_id, speed, recorded_at) for this driver over a
  /// date range — the same telemetry source the admin dashboard's Driver
  /// Hours page classifies into driving/stationary time. The History
  /// tab's Hours table groups these by shift, then by calendar day, to
  /// work out actual telemetry-derived driving time, as distinct from a
  /// shift's total logged (on-duty) hours.
  static Future<List<Map<String, dynamic>>> fetchDriverGpsPings({
    required String driverId,
    required DateTime startDate,
    required DateTime endDate,
  }) async {
    final startRange = DateTime(startDate.year, startDate.month, startDate.day, 0, 0, 0);
    final endRange = DateTime(endDate.year, endDate.month, endDate.day, 23, 59, 59);

    if (isMockMode) return [];

    try {
      final response = await client
          .from('gps_locations')
          .select('shift_id, speed, recorded_at')
          .eq('driver_id', driverId)
          .gte('recorded_at', startRange.toUtc().toIso8601String())
          .lte('recorded_at', endRange.toUtc().toIso8601String())
          .order('recorded_at', ascending: true);

      return List<Map<String, dynamic>>.from(response);
    } catch (e) {
      debugPrint('Error fetching driver GPS pings: $e');
      return [];
    }
  }
}
