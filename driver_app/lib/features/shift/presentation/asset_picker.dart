import 'package:flutter/material.dart';
import 'roadworthiness_signoff.dart';

/// True when [asset] is a trailer typed in by the driver rather than one
/// from the org's fleet register (see [showSearchableAssetPicker]'s
/// allowCustomTrailer) — it has no vehicles.id.
bool isCustomTrailer(Map<String, dynamic>? asset) => asset?['custom'] == true;

/// Searchable fleet-asset picker, shared by the fuel log, incident
/// report, couple/decouple sheets and the walk-around trailer question.
/// Returns the chosen vehicle map, an empty map as the "Decouple /
/// Clear" sentinel (only offered when [allowClear] is true), or null if
/// the sheet was dismissed with no choice made.
///
/// With [allowCustomTrailer], the driver can also use a trailer that
/// isn't in the fleet (a customer's or carrier's, e.g. Amazon or Katem)
/// by typing its number — that returns
/// `{'id': null, 'vehicle_number': <typed>, 'vehicle_type': 'trailer', 'custom': true}`.
Future<Map<String, dynamic>?> showSearchableAssetPicker(
  BuildContext context, {
  required String title,
  required String subtitle,
  required List<Map<String, dynamic>> vehicles,
  String? typeFilter,
  bool allowClear = false,
  bool allowCustomTrailer = false,
  /// When set, picking a unit/trailer that isn't roadworthy requires the
  /// driver's signed acceptance (recorded with this context) first.
  String? signOffContext,
  String? driverName,
  String? shiftId,
}) {
  final theme = Theme.of(context);
  final isDark = theme.brightness == Brightness.dark;
  final source = typeFilter != null
      ? vehicles.where((v) => v['vehicle_type'] == typeFilter).toList()
      : vehicles;
  final searchController = TextEditingController();

  return showModalBottomSheet<Map<String, dynamic>?>(
    context: context,
    isScrollControlled: true,
    backgroundColor: isDark ? const Color(0xFF0F172A) : Colors.white,
    shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
    builder: (sheetContext) {
      return StatefulBuilder(
        builder: (sheetContext, setSheetState) {
          final typed = searchController.text.trim();
          final query = typed.toLowerCase();
          final results = query.isEmpty
              ? source
              : source.where((v) => (v['vehicle_number'] as String).toLowerCase().contains(query)).toList();
          final exactMatch = source.any((v) => (v['vehicle_number'] as String).toLowerCase() == query);
          final offerCustom = allowCustomTrailer && typed.isNotEmpty && !exactMatch;

          Widget buildVehicleTile(Map<String, dynamic> v) {
            final isTruck = v['vehicle_type'] == 'truck';
            final issues = vehicleRoadworthinessIssues(v);
            return Material(
              color: isDark ? const Color(0xFF1E1E1E) : const Color(0xFFF5F5F5),
              borderRadius: BorderRadius.circular(12),
              child: InkWell(
                borderRadius: BorderRadius.circular(12),
                onTap: () async {
                  if (issues.isNotEmpty && signOffContext != null) {
                    final signed = await confirmRoadworthinessSignOff(
                      sheetContext,
                      vehicle: v,
                      issues: issues,
                      signOffContext: signOffContext,
                      driverName: driverName,
                      shiftId: shiftId,
                    );
                    if (!signed || !sheetContext.mounted) return;
                  }
                  Navigator.pop(sheetContext, v);
                },
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
                  child: Row(
                    children: [
                      Icon(isTruck ? Icons.local_shipping_outlined : Icons.rv_hookup_outlined, size: 20, color: const Color(0xFFCC0000)),
                      const SizedBox(width: 12),
                      Text(
                        (v['vehicle_number'] as String).toUpperCase(),
                        style: const TextStyle(fontFamily: 'monospace', fontWeight: FontWeight.w800, fontSize: 14, letterSpacing: 0.5),
                      ),
                      if (issues.isNotEmpty) ...[
                        const SizedBox(width: 8),
                        Flexible(
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                            decoration: BoxDecoration(color: const Color(0xFFCC0000), borderRadius: BorderRadius.circular(5)),
                            child: Text(
                              issues.length == 1 ? issues.first.split(' expired').first.toUpperCase() : '${issues.length} ISSUES',
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(color: Colors.white, fontSize: 9.5, fontWeight: FontWeight.w900),
                            ),
                          ),
                        ),
                      ],
                      const Spacer(),
                      Icon(Icons.chevron_right, size: 18, color: isDark ? Colors.white38 : Colors.black38),
                    ],
                  ),
                ),
              ),
            );
          }

          Widget buildCustomTile() {
            return Material(
              color: isDark ? const Color(0xFF2A1414) : const Color(0xFFFFF1F1),
              borderRadius: BorderRadius.circular(12),
              child: InkWell(
                borderRadius: BorderRadius.circular(12),
                onTap: () => Navigator.pop(sheetContext, <String, dynamic>{
                  'id': null,
                  'vehicle_number': typed.toUpperCase(),
                  'vehicle_type': 'trailer',
                  'custom': true,
                }),
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                  child: Row(
                    children: [
                      const Icon(Icons.add_circle_outline, size: 20, color: Color(0xFFCC0000)),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Use "${typed.toUpperCase()}"',
                              style: TextStyle(fontFamily: 'monospace', fontWeight: FontWeight.w800, fontSize: 14, color: isDark ? Colors.white : Colors.black87),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              'Trailer not in our fleet (e.g. Amazon, Katem)',
                              style: TextStyle(fontSize: 11.5, color: isDark ? Colors.white54 : Colors.black54),
                            ),
                          ],
                        ),
                      ),
                      Icon(Icons.chevron_right, size: 18, color: isDark ? Colors.white38 : Colors.black38),
                    ],
                  ),
                ),
              ),
            );
          }

          // With no typeFilter (the general "search fleet asset" picker
          // used by Incident Report and fuel logging) results mix
          // tractors and trailers together — group into TRACTORS /
          // TRAILERS sections (each only shown if non-empty). A
          // single-type picker (typeFilter set) is already homogeneous so
          // stays flat.
          final listItems = <Widget>[];
          if (offerCustom) {
            listItems.add(buildCustomTile());
          }
          if (typeFilter == null) {
            final tractors = results.where((v) => v['vehicle_type'] == 'truck').toList();
            final trailers = results.where((v) => v['vehicle_type'] != 'truck').toList();
            void addGroup(String label, List<Map<String, dynamic>> group) {
              if (group.isEmpty) return;
              if (listItems.isNotEmpty) listItems.add(const SizedBox(height: 14));
              listItems.add(Padding(
                padding: const EdgeInsets.only(bottom: 6),
                child: Text(
                  '$label (${group.length})',
                  style: TextStyle(fontWeight: FontWeight.w800, fontSize: 11, letterSpacing: 0.6, color: isDark ? Colors.white38 : Colors.black38),
                ),
              ));
              for (var i = 0; i < group.length; i++) {
                if (i > 0) listItems.add(const SizedBox(height: 8));
                listItems.add(buildVehicleTile(group[i]));
              }
            }
            addGroup('TRACTORS', tractors);
            addGroup('TRAILERS', trailers);
          } else {
            for (var i = 0; i < results.length; i++) {
              if (listItems.isNotEmpty) listItems.add(const SizedBox(height: 8));
              listItems.add(buildVehicleTile(results[i]));
            }
          }

          final emptyText = allowCustomTrailer
              ? 'Type the trailer number above to use a trailer that isn\'t in our fleet.'
              : source.isEmpty
                  ? 'No vehicles are registered for your company yet.'
                  : 'No matching vehicles.';

          return Padding(
            padding: EdgeInsets.only(
              left: 20, right: 20, top: 20,
              bottom: 20 + MediaQuery.of(sheetContext).viewInsets.bottom,
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Icon(typeFilter == 'trailer' ? Icons.rv_hookup_outlined : Icons.local_shipping_outlined, color: const Color(0xFFCC0000), size: 24),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        title,
                        style: TextStyle(fontWeight: FontWeight.w900, fontSize: 15, letterSpacing: 0.5, color: isDark ? Colors.white : Colors.black87),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 4),
                Text(subtitle, style: TextStyle(fontSize: 12, color: isDark ? Colors.white60 : Colors.black54)),
                const SizedBox(height: 14),
                TextField(
                  controller: searchController,
                  onChanged: (_) => setSheetState(() {}),
                  textCapitalization: TextCapitalization.characters,
                  style: TextStyle(color: isDark ? Colors.white : Colors.black87, fontWeight: FontWeight.w600),
                  decoration: InputDecoration(
                    hintText: allowCustomTrailer ? 'Search or type trailer number…' : 'Search registration…',
                    hintStyle: TextStyle(color: isDark ? Colors.white38 : Colors.black38, fontWeight: FontWeight.w500),
                    prefixIcon: const Icon(Icons.search, size: 18),
                    isDense: true,
                    filled: true,
                    fillColor: isDark ? const Color(0xFF1E1E1E) : const Color(0xFFF5F5F5),
                    contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
                  ),
                ),
                const SizedBox(height: 12),
                if (allowClear)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: OutlinedButton.icon(
                      onPressed: () => Navigator.pop(sheetContext, <String, dynamic>{}),
                      icon: const Icon(Icons.link_off, size: 16),
                      label: const Text('Decouple / Clear Selection', style: TextStyle(fontWeight: FontWeight.w700)),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: isDark ? Colors.white70 : Colors.black54,
                        side: BorderSide(color: isDark ? Colors.white24 : Colors.black26, width: 1.5),
                        minimumSize: const Size(double.infinity, 42),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                      ),
                    ),
                  ),
                Flexible(
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxHeight: 360),
                    child: listItems.isEmpty
                        ? Padding(
                            padding: const EdgeInsets.symmetric(vertical: 24),
                            child: Text(emptyText, style: TextStyle(fontSize: 13, color: isDark ? Colors.white60 : Colors.black54)),
                          )
                        : ListView(shrinkWrap: true, children: listItems),
                  ),
                ),
              ],
            ),
          );
        },
      );
    },
  );
}
