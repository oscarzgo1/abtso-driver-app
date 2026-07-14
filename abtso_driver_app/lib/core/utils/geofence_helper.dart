import 'dart:math' as math;

class GeofenceHelper {
  GeofenceHelper._();

  /// Calculates the distance between two GPS coordinates in meters using the Haversine formula
  static double calculateDistance(
    double lat1,
    double lon1,
    double lat2,
    double lon2,
  ) {
    const r = 6371000.0; // Earth radius in meters
    final phi1 = lat1 * math.pi / 180.0;
    final phi2 = lat2 * math.pi / 180.0;
    final deltaPhi = (lat2 - lat1) * math.pi / 180.0;
    final deltaLambda = (lon2 - lon1) * math.pi / 180.0;

    final a = math.sin(deltaPhi / 2.0) * math.sin(deltaPhi / 2.0) +
        math.cos(phi1) *
            math.cos(phi2) *
            math.sin(deltaLambda / 2.0) *
            math.sin(deltaLambda / 2.0);
    
    final c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a));
    return r * c;
  }

  /// Checks if coordinates are within the specified radius (in meters) of a target
  static bool isWithinRadius(
    double currentLat,
    double currentLng,
    double targetLat,
    double targetLng,
    int radiusMeters,
  ) {
    final distance = calculateDistance(currentLat, currentLng, targetLat, targetLng);
    return distance <= radiusMeters;
  }
}
