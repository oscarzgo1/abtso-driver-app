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
  });

  factory DriverShift.fromJson(Map<String, dynamic> json) {
    return DriverShift(
      id: json['id'] as String,
      driverId: json['driver_id'] as String,
      depotId: json['depot_id'] as String?,
      startTime: DateTime.parse(json['start_time'] as String).toLocal(),
      endTime: json['end_time'] != null
          ? DateTime.parse(json['end_time'] as String).toLocal()
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
    };
  }
}
