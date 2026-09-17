import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

/// Singleton access to the Supabase client with offline mock mode fallback
class SupabaseService {
  SupabaseService._();

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
      final email = '${driverId.trim().toLowerCase()}@$cleanCompanyCode.driver.internal';
      final response = await client.auth.signInWithPassword(
        email: email,
        password: pin.trim(),
      );

      final session = response.session;
      if (session != null) {
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

  /// Update driver's PIN in Supabase Auth & drivers table
  static Future<Map<String, dynamic>> updateDriverPin({
    required String driverIdOrUuid,
    required String newPin,
  }) async {
    if (isMockMode) {
      return {'success': true};
    }

    try {
      final cleanPin = newPin.trim();

      // 1. Update Supabase Auth user password directly (used for login)
      final user = client.auth.currentUser;
      if (user != null) {
        await client.auth.updateUser(
          UserAttributes(password: cleanPin),
        );
      }

      // 2. Also sync with backend edge function / pin_hash column if present
      try {
        await client.functions.invoke('create-driver', body: {
          'action': 'update',
          'id': driverIdOrUuid,
          'pin': cleanPin,
        });
      } catch (fnErr) {
        debugPrint('create-driver edge function update (non-fatal): $fnErr');
      }

      try {
        await client
            .from('drivers')
            .update({'pin_hash': cleanPin})
            .or('id.eq.$driverIdOrUuid,driver_id.ilike.$driverIdOrUuid');
      } catch (dbErr) {
        debugPrint('pin_hash table update (non-fatal): $dbErr');
      }

      return {'success': true};
    } catch (e) {
      debugPrint('updateDriverPin error: $e');
      return {'success': false, 'error': e.toString()};
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
        },
      };
    }

    try {
      final response = await client
          .from('drivers')
          .select('*')
          .or('driver_id.ilike.$driverCodeOrId,id.eq.$driverCodeOrId')
          .maybeSingle();

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
          .select('id, vehicle_number, vehicle_type')
          .eq('organization_id', organizationId)
          .eq('is_active', true)
          .order('vehicle_type')
          .order('vehicle_number');
      return List<Map<String, dynamic>>.from(response);
    } catch (e) {
      debugPrint('fetchOrgVehicles failed: $e');
      return [];
    }
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
  }) async {
    if (isMockMode) {
      debugPrint('MOCK fuel receipt: $fuelType, ${liters}L, ${totalCost != null ? '£$totalCost' : 'no cost entered'} at ${vendor ?? 'unknown vendor'} for shift $shiftId');
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
      });
      return true;
    } catch (e) {
      debugPrint('submitFuelReceipt failed: $e');
      return false;
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
    if (clearTrailer) {
      update['trailer_id'] = null;
    } else if (trailerId != null) {
      update['trailer_id'] = trailerId;
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
}
