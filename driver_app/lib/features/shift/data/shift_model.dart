class DriverShift {
  final String id;
  final String driverId;
  final String? depotId;
  final DateTime startTime;
  final DateTime? endTime;
  final String status;
  final String? dayType;
  final double? baseHourlyRate;
  final double? overrideRate;
  final double? effectiveRate;
  final double? totalHours;
  final double? totalPay;
  final int? weekNumber;
  final int? weekYear;
  final String nightOutStatus;
  final double nightOutAmount;
  /// Coupled tractor unit (vehicles.id) — nullable, a shift can be
  /// started and run uncoupled ("Assign Later").
  final String? vehicleId;
  /// Coupled trailer (vehicles.id) — nullable, independent of vehicleId
  /// (migration 049). A driver can couple a tractor without a trailer,
  /// a trailer without a tractor, both, or neither.
  final String? trailerId;

  DriverShift({
    required this.id,
    required this.driverId,
    this.depotId,
    required this.startTime,
    this.endTime,
    required this.status,
    this.dayType,
    this.baseHourlyRate,
    this.overrideRate,
    this.effectiveRate,
    this.totalHours,
    this.totalPay,
    this.weekNumber,
    this.weekYear,
    this.nightOutStatus = 'none',
    this.nightOutAmount = 0.0,
    this.vehicleId,
    this.trailerId,
  });

  factory DriverShift.fromJson(Map<String, dynamic> json) {
    return DriverShift(
      id: json['id'] as String,
      driverId: json['driver_id'] as String,
      depotId: json['depot_id'] as String?,
      startTime: DateTime.parse(json['start_time'] as String).toUtc(),
      endTime: json['end_time'] != null
          ? DateTime.parse(json['end_time'] as String).toUtc()
          : null,
      status: json['status'] as String,
      dayType: json['day_type'] as String?,
      baseHourlyRate: (json['base_hourly_rate'] as num?)?.toDouble(),
      overrideRate: (json['override_rate'] as num?)?.toDouble(),
      effectiveRate: (json['effective_rate'] as num?)?.toDouble(),
      totalHours: (json['total_hours'] as num?)?.toDouble(),
      totalPay: (json['total_pay'] as num?)?.toDouble(),
      weekNumber: (json['week_number'] as num?)?.toInt(),
      weekYear: (json['week_year'] as num?)?.toInt(),
      nightOutStatus: (json['night_out_status'] as String?) ?? 'none',
      nightOutAmount: (json['night_out_amount'] as num?)?.toDouble() ?? 0.0,
      vehicleId: json['vehicle_id'] as String?,
      trailerId: json['trailer_id'] as String?,
    );
  }

  DriverShift copyWith({
    String? status,
    DateTime? endTime,
    double? totalHours,
    double? totalPay,
    String? nightOutStatus,
    double? nightOutAmount,
    Object? effectiveRate = _unset,
    Object? overrideRate = _unset,
    Object? vehicleId = _unset,
    Object? trailerId = _unset,
  }) {
    return DriverShift(
      id: id,
      driverId: driverId,
      depotId: depotId,
      startTime: startTime,
      endTime: endTime ?? this.endTime,
      status: status ?? this.status,
      dayType: dayType,
      baseHourlyRate: baseHourlyRate,
      overrideRate: identical(overrideRate, _unset) ? this.overrideRate : overrideRate as double?,
      effectiveRate: identical(effectiveRate, _unset) ? this.effectiveRate : effectiveRate as double?,
      totalHours: totalHours ?? this.totalHours,
      totalPay: totalPay ?? this.totalPay,
      weekNumber: weekNumber,
      weekYear: weekYear,
      nightOutStatus: nightOutStatus ?? this.nightOutStatus,
      nightOutAmount: nightOutAmount ?? this.nightOutAmount,
      vehicleId: identical(vehicleId, _unset) ? this.vehicleId : vehicleId as String?,
      trailerId: identical(trailerId, _unset) ? this.trailerId : trailerId as String?,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'driver_id': driverId,
      'depot_id': depotId,
      'start_time': startTime.toUtc().toIso8601String(),
      'end_time': endTime?.toUtc().toIso8601String(),
      'status': status,
      'day_type': dayType,
      'base_hourly_rate': baseHourlyRate,
      'override_rate': overrideRate,
      'effective_rate': effectiveRate,
      'total_hours': totalHours,
      'total_pay': totalPay,
      'week_number': weekNumber,
      'week_year': weekYear,
      'night_out_status': nightOutStatus,
      'night_out_amount': nightOutAmount,
      'vehicle_id': vehicleId,
      'trailer_id': trailerId,
    };
  }
}

/// Sentinel distinguishing "not passed" from "explicitly passed null" in
/// copyWith, so vehicleId/trailerId can be deliberately cleared (coupled
/// -> uncoupled) rather than copyWith's null always meaning "keep as-is".
const Object _unset = Object();
