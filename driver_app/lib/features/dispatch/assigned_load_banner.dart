import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../core/network/supabase_service.dart';
import '../auth/presentation/auth_provider.dart';
import 'dispatch_load.dart';
import 'dispatch_provider.dart';
import 'proof_capture.dart';

const _red = Color(0xFFCC0000);

/// A slim strip at the top of Home — never a full-screen takeover. Shows
/// the newest assigned load (and how many more are waiting); tap to open
/// the review sheet. Also surfaces a load the driver is already running so
/// they can finish it with the ending odometer.
class AssignedLoadBanner extends ConsumerWidget {
  /// Opens the existing manual attach-load sheet (Manual Entry Override).
  final VoidCallback onManualEntry;
  const AssignedLoadBanner({super.key, required this.onManualEntry});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = ref.watch(dispatchProvider);
    final assigned = s.assigned;
    final running = s.inProgress;
    if (assigned.isEmpty && running.isEmpty) return const SizedBox.shrink();

    final DispatchLoad load = assigned.isNotEmpty ? assigned.first : running.first;
    final isNew = assigned.isNotEmpty;
    final extra = (assigned.length + running.length) - 1;

    return Material(
      color: isNew ? _red : const Color(0xFF111111),
      child: InkWell(
        onTap: () => showDispatchLoadSheet(context, ref, load, onManualEntry: onManualEntry),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 9),
          child: Row(
            children: [
              Icon(isNew ? Icons.notifications_active_outlined : Icons.local_shipping_outlined, size: 16, color: Colors.white),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  isNew ? 'New Load Assigned: ${load.vrid} • Tap to review' : 'Load in progress: ${load.vrid} • Tap to finish',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(color: Colors.white, fontSize: 12.5, fontWeight: FontWeight.w800),
                ),
              ),
              if (extra > 0)
                Container(
                  margin: const EdgeInsets.only(left: 8),
                  padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                  decoration: BoxDecoration(color: Colors.white24, borderRadius: BorderRadius.circular(10)),
                  child: Text('+$extra', style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w900)),
                ),
              if (s.offline)
                const Padding(padding: EdgeInsets.only(left: 8), child: Icon(Icons.cloud_off, size: 14, color: Colors.white70)),
            ],
          ),
        ),
      ),
    );
  }
}

Future<int?> _askOdometer(BuildContext context, {required String title, required String message, int? minimum}) {
  final controller = TextEditingController();
  String? error;
  return showDialog<int>(
    context: context,
    builder: (ctx) => StatefulBuilder(
      builder: (ctx, setState) => AlertDialog(
        title: Text(title, style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 16)),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(message, style: const TextStyle(fontSize: 13)),
            const SizedBox(height: 12),
            TextField(
              controller: controller,
              autofocus: true,
              keyboardType: TextInputType.number,
              decoration: InputDecoration(labelText: 'Odometer (miles)', errorText: error),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: _red, foregroundColor: Colors.white),
            onPressed: () {
              final v = int.tryParse(controller.text.trim());
              if (v == null || v < 0) {
                setState(() => error = 'Enter the reading in miles.');
              } else if (minimum != null && v < minimum) {
                setState(() => error = "Can't be lower than the start ($minimum).");
              } else {
                Navigator.pop(ctx, v);
              }
            },
            child: const Text('Confirm'),
          ),
        ],
      ),
    ),
  );
}


/// Odometer at coupling plus the optional cargo photo / trailer-sealed tick.
Future<(int, CargoInput)?> _askCoupling(BuildContext context, {required String title, String? organizationId}) {
  final controller = TextEditingController();
  final cargo = CargoInput();
  String? error;
  return showDialog<(int, CargoInput)>(
    context: context,
    builder: (ctx) => StatefulBuilder(
      builder: (ctx, setState) => AlertDialog(
        title: Text(title, style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 16)),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('Check the trailer is coupled securely, then enter your current odometer reading.', style: TextStyle(fontSize: 13)),
              const SizedBox(height: 12),
              TextField(
                controller: controller,
                autofocus: true,
                keyboardType: TextInputType.number,
                decoration: InputDecoration(labelText: 'Odometer (miles)', errorText: error),
              ),
              const SizedBox(height: 14),
              CargoPhotoField(input: cargo, organizationId: organizationId),
            ],
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: _red, foregroundColor: Colors.white),
            onPressed: () {
              final v = int.tryParse(controller.text.trim());
              if (v == null || v < 0) {
                setState(() => error = 'Enter the reading in miles.');
              } else {
                Navigator.pop(ctx, (v, cargo));
              }
            },
            child: const Text('Confirm'),
          ),
        ],
      ),
    ),
  );
}

/// The review sheet: assigned details prefilled and read-only, with the
/// primary Accept & Couple Trailer action and a quiet manual-entry link.
void showDispatchLoadSheet(BuildContext context, WidgetRef ref, DispatchLoad load, {required VoidCallback onManualEntry}) {
  final fmt = DateFormat('EEE d MMM, HH:mm');
  bool busy = false;
  String? error;
  showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.white,
    shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
    builder: (sheetContext) {
      return StatefulBuilder(
        builder: (sheetContext, setSheetState) {
          Widget row(String label, String? value) => Padding(
                padding: const EdgeInsets.symmetric(vertical: 7),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    SizedBox(width: 120, child: Text(label, style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w800, color: Color(0xFF888888)))),
                    Expanded(child: Text(value ?? '—', style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: Color(0xFF111111)))),
                  ],
                ),
              );

          Future<void> accept() async {
            final result = await _askCoupling(
              sheetContext,
              title: 'Couple trailer${load.trailerNumber != null ? ' ${load.trailerNumber}' : ''}',
              organizationId: ref.read(authProvider).driver?['organization_id']?.toString(),
            );
            if (result == null || !sheetContext.mounted) return;
            final (odo, cargo) = result;
            setSheetState(() {
              busy = true;
              error = null;
            });
            final cargoPath = await uploadCargoPhoto(ref, cargo);
            if (cargo.photo != null && !cargo.sealed && cargoPath == null) {
              if (sheetContext.mounted) {
                setSheetState(() {
                  busy = false;
                  error = 'Could not upload the cargo photo. Try again, or tick Trailer sealed.';
                });
              }
              return;
            }
            final err = await SupabaseService.acceptDispatchLoad(load.id, odo, cargoPhotoPath: cargoPath, trailerSealed: cargo.sealed);
            if (err == null) {
              await ref.read(dispatchProvider.notifier).refresh();
              if (sheetContext.mounted) Navigator.pop(sheetContext);
            } else if (sheetContext.mounted) {
              setSheetState(() {
                busy = false;
                error = err;
              });
            }
          }

          Future<void> finish() async {
            final odo = await _askOdometer(
              sheetContext,
              title: 'Finish load ${load.vrid}',
              message: 'Enter your odometer reading at the end of this load.',
              minimum: load.odometerStart,
            );
            if (odo == null || !sheetContext.mounted) return;
            final submission = await showProofCaptureSheet(
              sheetContext,
              ref,
              title: 'PROOF OF DELIVERY',
              subtitle: 'Load ${load.vrid}',
            );
            if (submission == null || !sheetContext.mounted) return;
            setSheetState(() {
              busy = true;
              error = null;
            });
            final proofs = await uploadProofs(ref, submission);
            if (proofs == null) {
              if (sheetContext.mounted) {
                setSheetState(() {
                  busy = false;
                  error = 'Could not upload the photos. Check your connection and try again.';
                });
              }
              return;
            }
            final err = await SupabaseService.completeDispatchLoad(load.id, odo, proofs: proofs, notes: submission.notes);
            if (err == null) {
              await ref.read(dispatchProvider.notifier).refresh();
              if (sheetContext.mounted) Navigator.pop(sheetContext);
            } else if (sheetContext.mounted) {
              setSheetState(() {
                busy = false;
                error = err;
              });
            }
          }

          Future<void> markLoading(String event) async {
            setSheetState(() {
              busy = true;
              error = null;
            });
            final err = await SupabaseService.recordLoadLoading('dispatch', load.id, event);
            if (err == null) {
              await ref.read(dispatchProvider.notifier).refresh();
              if (sheetContext.mounted) Navigator.pop(sheetContext);
            } else if (sheetContext.mounted) {
              setSheetState(() {
                busy = false;
                error = err;
              });
            }
          }

          final isAssigned = load.status == 'assigned';
          final loadingStarted = load.loadingStartedAt != null;
          final loadingDone = load.loadingCompletedAt != null;
          return Padding(
            padding: EdgeInsets.fromLTRB(20, 20, 20, 20 + MediaQuery.of(sheetContext).viewInsets.bottom),
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(isAssigned ? 'ASSIGNED LOAD' : 'LOAD IN PROGRESS', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w900, letterSpacing: 0.6, color: _red)),
                  const SizedBox(height: 10),
                  row('VRID / Reference', load.vrid),
                  row('Pickup (Origin)', load.origin),
                  row('Dropoff (Destination)', load.destination),
                  row('Booking cutoff', load.bookingCutoffAt == null ? null : fmt.format(load.bookingCutoffAt!)),
                  row('Trailer', load.trailerNumber),
                  if (!isAssigned) row('Start odometer', load.odometerStart?.toString()),
                  row(
                    'Loading',
                    loadingDone
                        ? 'Finished ${DateFormat('HH:mm').format(load.loadingCompletedAt!)}'
                        : loadingStarted
                            ? 'Started ${DateFormat('HH:mm').format(load.loadingStartedAt!)}'
                            : 'Not started',
                  ),
                  if (error != null) ...[
                    const SizedBox(height: 8),
                    Text(error!, style: const TextStyle(color: Color(0xFFFF3333), fontSize: 12.5, fontWeight: FontWeight.w600)),
                  ],
                  const SizedBox(height: 14),
                  if (!loadingDone) ...[
                    OutlinedButton.icon(
                      onPressed: busy ? null : () => markLoading(loadingStarted ? 'finished' : 'started'),
                      icon: Icon(loadingStarted ? Icons.check_circle_outline_rounded : Icons.inventory_2_outlined, size: 18),
                      label: Text(loadingStarted ? 'Finished loading' : 'Start loading', style: const TextStyle(fontWeight: FontWeight.w800)),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: const Color(0xFF111111),
                        side: const BorderSide(color: Color(0xFF111111), width: 1.5),
                        minimumSize: const Size(double.infinity, 46),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                      ),
                    ),
                    const SizedBox(height: 10),
                  ],
                  ElevatedButton(
                    onPressed: busy
                        ? null
                        : () => isAssigned
                            ? accept()
                            : finish(),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: _red,
                      foregroundColor: Colors.white,
                      minimumSize: const Size(double.infinity, 48),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                    child: busy
                        ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.white))
                        : Text(isAssigned ? 'Accept & Couple Trailer' : 'Finish load', style: const TextStyle(fontWeight: FontWeight.w800)),
                  ),
                  if (isAssigned)
                    TextButton(
                      onPressed: busy
                          ? null
                          : () {
                              Navigator.pop(sheetContext);
                              onManualEntry();
                            },
                      child: const Text('Manual Entry Override', style: TextStyle(fontWeight: FontWeight.w700, color: Color(0xFF666666), decoration: TextDecoration.underline)),
                    ),
                ],
              ),
            ),
          );
        },
      );
    },
  );
}
