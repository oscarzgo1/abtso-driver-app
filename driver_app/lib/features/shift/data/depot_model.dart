class Depot {
  final String id;
  final String name;
  final double latitude;
  final double longitude;
  final int geofenceRadiusM;
  final String? address;

  Depot({
    required this.id,
    required this.name,
    required this.latitude,
    required this.longitude,
    required this.geofenceRadiusM,
    this.address,
  });

  factory Depot.fromJson(Map<String, dynamic> json) {
    return Depot(
      id: json['id'] as String,
      name: json['name'] as String,
      latitude: (json['latitude'] as num).toDouble(),
      longitude: (json['longitude'] as num).toDouble(),
      geofenceRadiusM: (json['geofence_radius_m'] as num?)?.toInt() ?? 100,
      address: json['address'] as String?,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'name': name,
      'latitude': latitude,
      'longitude': longitude,
      'geofence_radius_m': geofenceRadiusM,
      'address': address,
    };
  }
}
