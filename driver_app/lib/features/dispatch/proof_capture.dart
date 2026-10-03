import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import '../../core/network/supabase_service.dart';
import '../auth/presentation/auth_provider.dart';
import '../shift/presentation/shift_provider.dart';
import 'signature_capture.dart';

const _red = Color(0xFFCC0000);

/// The three kinds of delivery proof (migration 077).
enum PodType {
  soloDeparture('solo_departure', 'Solo Departure / Bobtail', 'Tractor leaving alone, e.g. a Drop & Hook yard exit', Icons.local_shipping_outlined),
  emptyTrailer('empty_trailer', 'Empty Trailer Interior', 'The bed clean and empty', Icons.crop_square_rounded),
  paperPod('paper_pod', 'Paper POD / CMR Stamp', 'The delivery paperwork, stamped and signed', Icons.description_outlined);

  const PodType(this.wire, this.label, this.hint, this.icon);
  final String wire;
  final String label;
  final String hint;
  final IconData icon;
}

/// One photo taken for a proof type, with when and where it was taken.
/// `upload` is started the moment the photo is captured (see `take()`
/// below), not when the sheet is confirmed — uploadProofs() just awaits
/// it, so by the time a driver has picked their proof types and tapped
/// Confirm, most or all of the network work is already done.
class ProofPhoto {
  final PodType type;
  final Uint8List bytes;
  final double? lat;
  final double? lng;
  final DateTime takenAt;
  final Future<String?> upload;
  const ProofPhoto(this.type, this.bytes, this.lat, this.lng, this.takenAt, this.upload);
}

class ProofSubmission {
  final List<ProofPhoto> photos;
  final String notes;

  /// Fallback when no photo can be taken: the receiver's name + signature.
  final DeliverySignature? signature;
  const ProofSubmission(this.photos, this.notes, {this.signature});
}

/// The completion sheet shared by BOTH load kinds (office-assigned and
/// manually attached). Pick one or more proof types; each picked type
/// needs its own live camera photo. At least one is required.
Future<ProofSubmission?> showProofCaptureSheet(
  BuildContext context,
  WidgetRef ref, {
  required String title,
  required String subtitle,
}) {
  final picker = ImagePicker();
  final selected = <PodType>{};
  final shots = <PodType, Uint8List>{};
  final takenAt = <PodType, DateTime>{};
  final uploads = <PodType, Future<String?>>{};
  final notes = TextEditingController();
  DeliverySignature? signature;
  final orgId = ref.read(authProvider).driver?['organization_id']?.toString();
  final driverId = SupabaseService.currentDriverId;

  return showModalBottomSheet<ProofSubmission>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.white,
    shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
    builder: (sheetContext) => StatefulBuilder(
      builder: (sheetContext, setState) {
        Future<void> take(PodType t) async {
          final f = await picker.pickImage(source: ImageSource.camera, imageQuality: 80, maxWidth: 1600);
          if (f == null) return;
          final bytes = await f.readAsBytes();
          setState(() {
            selected.add(t);
            shots[t] = bytes;
            takenAt[t] = DateTime.now();
          });
          // Start uploading now — in parallel with any other proof photo
          // the driver takes next — rather than waiting for Confirm.
          if (orgId != null && driverId != null) {
            uploads[t] = SupabaseService.uploadDeliveryPhoto(
              organizationId: orgId,
              driverId: driverId,
              bytes: bytes,
              fileName: '${t.wire}.jpg',
              kind: t.wire,
            );
          }
        }

        void toggle(PodType t) {
          if (selected.contains(t)) {
            setState(() {
              selected.remove(t);
              shots.remove(t);
              takenAt.remove(t);
              uploads.remove(t);
            });
          } else {
            take(t);
          }
        }

        final ready = (selected.isNotEmpty && selected.every(shots.containsKey)) || signature != null;
        return Padding(
          padding: EdgeInsets.fromLTRB(20, 20, 20, 20 + MediaQuery.of(sheetContext).viewInsets.bottom),
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(title, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w900, letterSpacing: 0.6, color: _red)),
                const SizedBox(height: 4),
                Text(subtitle, style: const TextStyle(fontSize: 12.5, color: Color(0xFF666666))),
                const SizedBox(height: 4),
                const Text('Choose what you can prove and take a live photo for each. If a photo is not possible, use a signature instead.', style: TextStyle(fontSize: 12.5, color: Color(0xFF666666))),
                const SizedBox(height: 12),
                for (final t in PodType.values)
                  Container(
                    margin: const EdgeInsets.only(bottom: 10),
                    decoration: BoxDecoration(
                      border: Border.all(color: selected.contains(t) ? const Color(0xFF111111) : const Color(0xFFE0E0E0), width: selected.contains(t) ? 1.5 : 1),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: InkWell(
                      borderRadius: BorderRadius.circular(12),
                      onTap: () => toggle(t),
                      child: Padding(
                        padding: const EdgeInsets.all(10),
                        child: Row(
                          children: [
                            Checkbox(
                              value: selected.contains(t),
                              activeColor: _red,
                              onChanged: (_) => toggle(t),
                            ),
                            ClipRRect(
                              borderRadius: BorderRadius.circular(8),
                              child: shots[t] != null
                                  ? Image.memory(shots[t]!, width: 52, height: 52, fit: BoxFit.cover)
                                  : Container(width: 52, height: 52, color: const Color(0xFFF1F5F9), child: Icon(t.icon, color: const Color(0xFF999999))),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(t.label, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13.5)),
                                  Text(t.hint, style: const TextStyle(fontSize: 11.5, color: Color(0xFF777777))),
                                ],
                              ),
                            ),
                            if (shots[t] != null)
                              TextButton(onPressed: () => take(t), child: const Text('Retake', style: TextStyle(fontWeight: FontWeight.w800, color: _red))),
                          ],
                        ),
                      ),
                    ),
                  ),
                Container(
                  margin: const EdgeInsets.only(bottom: 10),
                  decoration: BoxDecoration(
                    border: Border.all(color: signature != null ? const Color(0xFF111111) : const Color(0xFFE0E0E0), width: signature != null ? 1.5 : 1),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: InkWell(
                    borderRadius: BorderRadius.circular(12),
                    onTap: () async {
                      final r = await showSignatureCapture(
                        sheetContext,
                        initialFirstName: signature?.firstName,
                        initialLastName: signature?.lastName,
                      );
                      if (r == null) return;
                      final pos = ref.read(shiftProvider).currentPosition;
                      setState(() => signature = DeliverySignature(
                            firstName: r.firstName,
                            lastName: r.lastName,
                            svg: r.svg,
                            signedAt: DateTime.now(),
                            lat: pos?.latitude,
                            lng: pos?.longitude,
                          ));
                    },
                    child: Padding(
                      padding: const EdgeInsets.all(14),
                      child: Row(
                        children: [
                          const Icon(Icons.draw_outlined, color: Color(0xFF555555)),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(signature == null ? 'Signature instead' : 'Signed by ${signature!.fullName}', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13.5)),
                                Text(signature == null ? "Can't take a photo? The person receiving the load signs on your phone." : 'Tap to sign again', style: const TextStyle(fontSize: 11.5, color: Color(0xFF777777))),
                              ],
                            ),
                          ),
                          if (signature != null) SignaturePreview(svg: signature!.svg, height: 40),
                        ],
                      ),
                    ),
                  ),
                ),
                TextField(
                  controller: notes,
                  maxLines: 2,
                  maxLength: 500,
                  decoration: InputDecoration(
                    hintText: 'Delivery notes (optional)',
                    filled: true,
                    fillColor: const Color(0xFFF1F5F9),
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
                  ),
                ),
                const SizedBox(height: 4),
                ElevatedButton(
                  onPressed: ready
                      ? () {
                          final pos = ref.read(shiftProvider).currentPosition;
                          Navigator.pop(
                            sheetContext,
                            ProofSubmission([
                              for (final t in PodType.values)
                                if (shots[t] != null)
                                  ProofPhoto(t, shots[t]!, pos?.latitude, pos?.longitude, takenAt[t] ?? DateTime.now(), uploads[t] ?? Future.value(null)),
                            ], notes.text.trim(), signature: signature),
                          );
                        }
                      : null,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: _red,
                    foregroundColor: Colors.white,
                    minimumSize: const Size(double.infinity, 48),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                  child: Text(ready ? 'Confirm & complete' : 'Take a proof photo or get a signature', style: const TextStyle(fontWeight: FontWeight.w800)),
                ),
              ],
            ),
          ),
        );
      },
    ),
  );
}

/// Resolves every proof photo's upload (already started back in `take()`
/// at capture time, in parallel) and returns the JSON the server expects,
/// or null if any upload failed (nothing is submitted in that case). Only
/// falls back to starting an upload itself if one was never kicked off
/// (e.g. org/driver id wasn't available yet at capture time).
Future<List<Map<String, dynamic>>?> uploadProofs(WidgetRef ref, ProofSubmission submission) async {
  final orgId = ref.read(authProvider).driver?['organization_id']?.toString();
  final driverId = SupabaseService.currentDriverId;
  if (orgId == null || driverId == null) return null;
  final paths = await Future.wait(submission.photos.map((p) async {
    final resolved = await p.upload;
    if (resolved != null) return resolved;
    return SupabaseService.uploadDeliveryPhoto(
      organizationId: orgId,
      driverId: driverId,
      bytes: p.bytes,
      fileName: '${p.type.wire}.jpg',
      kind: p.type.wire,
    );
  }));
  if (paths.any((p) => p == null)) return null;
  final sig = submission.signature;
  return [
    if (sig != null) sig.toProofJson(),
    for (var i = 0; i < submission.photos.length; i++)
      {
        'pod_type': submission.photos[i].type.wire,
        'path': paths[i],
        'lat': submission.photos[i].lat,
        'lng': submission.photos[i].lng,
        'taken_at': submission.photos[i].takenAt.toUtc().toIso8601String(),
      },
  ];
}

/// Optional evidence at load start / coupling: a live cargo photo, OR the
/// "Trailer sealed" tick when a photo isn't possible.
class CargoInput {
  bool sealed = false;
  Uint8List? photo;
  Future<String?>? upload;
}

class CargoPhotoField extends StatefulWidget {
  final CargoInput input;
  /// Passed by callers that already have it in scope so the photo can
  /// start uploading the moment it's taken. Left null falls back to the
  /// old behaviour — uploadCargoPhoto() uploads it fresh when called.
  final String? organizationId;
  const CargoPhotoField({super.key, required this.input, this.organizationId});

  @override
  State<CargoPhotoField> createState() => _CargoPhotoFieldState();
}

class _CargoPhotoFieldState extends State<CargoPhotoField> {
  Future<void> _take() async {
    final f = await ImagePicker().pickImage(source: ImageSource.camera, imageQuality: 80, maxWidth: 1600);
    if (f == null) return;
    final bytes = await f.readAsBytes();
    setState(() => widget.input.photo = bytes);
    final orgId = widget.organizationId;
    final driverId = SupabaseService.currentDriverId;
    if (orgId != null && driverId != null) {
      widget.input.upload = SupabaseService.uploadDeliveryPhoto(
        organizationId: orgId,
        driverId: driverId,
        bytes: bytes,
        fileName: 'cargo.jpg',
        kind: 'cargo',
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final input = widget.input;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('CARGO PHOTO (OPTIONAL)', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, letterSpacing: 0.4, color: Color(0xFF888888))),
        const SizedBox(height: 6),
        Row(
          children: [
            if (input.photo != null)
              ClipRRect(borderRadius: BorderRadius.circular(8), child: Image.memory(input.photo!, width: 48, height: 48, fit: BoxFit.cover)),
            if (input.photo != null) const SizedBox(width: 10),
            OutlinedButton.icon(
              onPressed: input.sealed ? null : _take,
              icon: const Icon(Icons.camera_alt_outlined, size: 18),
              label: Text(input.photo == null ? 'Take cargo photo' : 'Retake'),
            ),
          ],
        ),
        CheckboxListTile(
          contentPadding: EdgeInsets.zero,
          controlAffinity: ListTileControlAffinity.leading,
          activeColor: _red,
          dense: true,
          value: input.sealed,
          title: const Text('Trailer sealed / Plomba założona (Photo not possible)', style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700)),
          onChanged: (v) => setState(() {
            input.sealed = v ?? false;
            if (input.sealed) input.photo = null;
          }),
        ),
      ],
    );
  }
}

/// Resolves the cargo photo's upload (already started in CargoPhotoField
/// at capture time, when it was given an organizationId); null when
/// there isn't one (or the trailer is sealed) or the upload failed. Falls
/// back to starting the upload itself if one was never kicked off.
Future<String?> uploadCargoPhoto(WidgetRef ref, CargoInput input) async {
  final bytes = input.photo;
  if (bytes == null || input.sealed) return null;
  final started = input.upload;
  if (started != null) {
    final resolved = await started;
    if (resolved != null) return resolved;
  }
  final orgId = ref.read(authProvider).driver?['organization_id']?.toString();
  final driverId = SupabaseService.currentDriverId;
  if (orgId == null || driverId == null) return null;
  return SupabaseService.uploadDeliveryPhoto(
    organizationId: orgId,
    driverId: driverId,
    bytes: bytes,
    fileName: 'cargo.jpg',
    kind: 'cargo',
  );
}
