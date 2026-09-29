import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'dispatch_load.dart';
import 'dispatch_provider.dart';

/// Read-only list of the driver's completed loads — dense, tabular figures.
class LoadHistoryScreen extends StatefulWidget {
  const LoadHistoryScreen({super.key});

  @override
  State<LoadHistoryScreen> createState() => _LoadHistoryScreenState();
}

class _LoadHistoryScreenState extends State<LoadHistoryScreen> {
  late Future<LoadHistoryResult> _future = fetchLoadHistory();

  Future<void> _refresh() async {
    setState(() => _future = fetchLoadHistory());
    await _future.catchError((_) => const LoadHistoryResult([]));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF7F7F7),
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        foregroundColor: const Color(0xFF111111),
        title: const Text('Load history', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
      ),
      body: RefreshIndicator(
        onRefresh: _refresh,
        child: FutureBuilder<LoadHistoryResult>(
          future: _future,
          builder: (context, snap) {
            if (snap.connectionState != ConnectionState.done) {
              return const Center(child: CircularProgressIndicator(strokeWidth: 2.5, color: Color(0xFFCC0000)));
            }
            if (snap.hasError) {
              return ListView(children: const [
                Padding(
                  padding: EdgeInsets.all(40),
                  child: Text("Couldn't load your loads and none are saved on this device yet. Pull down to retry.", textAlign: TextAlign.center, style: TextStyle(color: Colors.black54)),
                ),
              ]);
            }
            final result = snap.data!;
            if (result.loads.isEmpty) {
              return ListView(children: const [
                Padding(padding: EdgeInsets.all(40), child: Text('No completed loads yet.', textAlign: TextAlign.center, style: TextStyle(color: Colors.black54))),
              ]);
            }
            return ListView(
              padding: const EdgeInsets.fromLTRB(12, 10, 12, 24),
              children: [
                if (result.fromCache)
                  Container(
                    margin: const EdgeInsets.only(bottom: 8),
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                    decoration: BoxDecoration(color: const Color(0xFFFFF4E5), borderRadius: BorderRadius.circular(8)),
                    child: const Row(children: [
                      Icon(Icons.cloud_off, size: 14, color: Color(0xFF8A5A00)),
                      SizedBox(width: 8),
                      Expanded(child: Text('Offline — showing the last copy saved on this device.', style: TextStyle(fontSize: 12, color: Color(0xFF8A5A00), fontWeight: FontWeight.w600))),
                    ]),
                  ),
                for (final l in result.loads) _HistoryCard(load: l),
              ],
            );
          },
        ),
      ),
    );
  }
}

class _HistoryCard extends StatelessWidget {
  final DispatchLoad load;
  const _HistoryCard({required this.load});

  static const _tab = [FontFeature.tabularFigures()];

  @override
  Widget build(BuildContext context) {
    final when = load.completedAt ?? load.createdAt;
    final route = '${load.origin ?? '—'} → ${load.destination ?? '—'}';
    final miles = (load.odometerStart != null && load.odometerEnd != null) ? load.odometerEnd! - load.odometerStart! : null;
    final odo = '${load.odometerStart ?? '—'} → ${load.odometerEnd ?? '—'}${miles != null ? '  ($miles mi)' : ''}';

    Widget kv(String k, String v) => Padding(
          padding: const EdgeInsets.only(top: 3),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              SizedBox(width: 74, child: Text(k, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: Color(0xFF888888)))),
              Expanded(child: Text(v, style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: Color(0xFF222222), fontFeatures: _tab))),
            ],
          ),
        );

    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(10), border: Border.all(color: const Color(0xFFE0E0E0))),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(child: Text(load.vrid, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w900, fontFeatures: _tab))),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(color: const Color(0x1A111111), borderRadius: BorderRadius.circular(6)),
                child: const Text('COMPLETED', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w900, letterSpacing: 0.4)),
              ),
            ],
          ),
          kv('When', DateFormat('d MMM yyyy, HH:mm').format(when)),
          kv('Route', route),
          kv('Trailer', load.trailerNumber ?? '—'),
          kv('Odometer', odo),
        ],
      ),
    );
  }
}
