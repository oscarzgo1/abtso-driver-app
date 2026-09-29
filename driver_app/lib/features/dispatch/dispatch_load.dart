/// A load the office assigned to this driver (migration 073).
class DispatchLoad {
  final String id;
  final String vrid;
  final String? origin;
  final String? destination;
  final DateTime? bookingCutoffAt;
  final String? trailerNumber;
  final String status; // assigned | in_progress | completed | cancelled
  final int? odometerStart;
  final int? odometerEnd;
  final DateTime createdAt;
  final DateTime? acceptedAt;
  final DateTime? completedAt;

  const DispatchLoad({
    required this.id,
    required this.vrid,
    this.origin,
    this.destination,
    this.bookingCutoffAt,
    this.trailerNumber,
    required this.status,
    this.odometerStart,
    this.odometerEnd,
    required this.createdAt,
    this.acceptedAt,
    this.completedAt,
  });

  static DateTime? _date(dynamic v) => v == null ? null : DateTime.tryParse(v.toString())?.toLocal();
  static int? _int(dynamic v) => v is num ? v.toInt() : null;
  static String? _text(dynamic v) {
    final s = v?.toString().trim();
    return (s == null || s.isEmpty) ? null : s;
  }

  factory DispatchLoad.fromJson(Map<String, dynamic> j) => DispatchLoad(
        id: j['id'].toString(),
        vrid: j['vrid']?.toString() ?? '',
        origin: _text(j['origin']),
        destination: _text(j['destination']),
        bookingCutoffAt: _date(j['booking_cutoff_at']),
        trailerNumber: _text(j['trailer_number']),
        status: j['status']?.toString() ?? 'assigned',
        odometerStart: _int(j['odometer_start']),
        odometerEnd: _int(j['odometer_end']),
        createdAt: _date(j['created_at']) ?? DateTime.now(),
        acceptedAt: _date(j['accepted_at']),
        completedAt: _date(j['completed_at']),
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'vrid': vrid,
        'origin': origin,
        'destination': destination,
        'booking_cutoff_at': bookingCutoffAt?.toUtc().toIso8601String(),
        'trailer_number': trailerNumber,
        'status': status,
        'odometer_start': odometerStart,
        'odometer_end': odometerEnd,
        'created_at': createdAt.toUtc().toIso8601String(),
        'accepted_at': acceptedAt?.toUtc().toIso8601String(),
        'completed_at': completedAt?.toUtc().toIso8601String(),
      };
}
