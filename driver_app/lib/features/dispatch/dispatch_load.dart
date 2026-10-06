/// One proof-of-delivery photo the driver took for a load (migration 077).
class LoadProof {
  final String id;
  final String podType; // solo_departure | empty_trailer | paper_pod
  final String photoPath;
  final DateTime? takenAt;
  const LoadProof({required this.id, required this.podType, required this.photoPath, this.takenAt});

  static const Map<String, String> labels = {
    'solo_departure': 'Solo departure',
    'empty_trailer': 'Empty trailer',
    'paper_pod': 'Paper POD',
  };
  String get label => labels[podType] ?? podType;

  factory LoadProof.fromJson(Map<String, dynamic> j) => LoadProof(
        id: j['id'].toString(),
        podType: j['pod_type']?.toString() ?? '',
        photoPath: j['photo_path']?.toString() ?? '',
        takenAt: j['taken_at'] == null ? null : DateTime.tryParse(j['taken_at'].toString())?.toLocal(),
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'pod_type': podType,
        'photo_path': photoPath,
        'taken_at': takenAt?.toUtc().toIso8601String(),
      };
}

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
  /// When the driver marked loading as started / finished (migration 092).
  final DateTime? loadingStartedAt;
  final DateTime? loadingCompletedAt;
  final List<LoadProof> proofs;

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
    this.loadingStartedAt,
    this.loadingCompletedAt,
    this.proofs = const [],
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
        loadingStartedAt: _date(j['loading_started_at']),
        loadingCompletedAt: _date(j['loading_completed_at']),
        proofs: j['shipment_proofs'] is List
            ? (j['shipment_proofs'] as List)
                .whereType<Map>()
                .map((p) => LoadProof.fromJson(Map<String, dynamic>.from(p)))
                .where((p) => p.photoPath.isNotEmpty)
                .toList()
            : const [],
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
        'loading_started_at': loadingStartedAt?.toUtc().toIso8601String(),
        'loading_completed_at': loadingCompletedAt?.toUtc().toIso8601String(),
        'completed_at': completedAt?.toUtc().toIso8601String(),
        'shipment_proofs': proofs.map((p) => p.toJson()).toList(),
      };
}
