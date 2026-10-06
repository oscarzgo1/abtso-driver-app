import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:image_picker/image_picker.dart';
import '../../../core/network/supabase_service.dart';
import 'asset_picker.dart';

// ============================================================
// Walk-Around Check — start-of-shift ("Safety Check") and
// end-of-shift ("End of Shift Inspection") vehicle checks
// (migration 052), field-for-field matched to the company's real
// existing app from screenshots, not a generic DVSA template.
//
// Two different field lists, not one reused checklist — the real
// app's "Safety check" and "End of shift inspection" screens ask
// genuinely different questions. Every field below came from a
// screenshot except the one marked `inferred: true` (the Safety
// Check screenshot has been scrolled and cut off the same item at
// the top twice now — still a placeholder pending the real label).
// The trailer block (kTrailerFields) is confirmed to be the same
// content reused in both forms when a trailer's attached, per the
// founder directly, not from a screenshot.
// ============================================================

enum WalkaroundFieldType { photo, checkbox, passFail, text }

class WalkaroundFieldDef {
  final String key;
  final String label;
  final WalkaroundFieldType type;
  /// Required items must be filled before Submit is enabled; everything
  /// else can be left blank.
  final bool required;
  final String? sectionTitle;
  final bool inferred;
  final bool numeric;
  const WalkaroundFieldDef(
    this.key,
    this.label,
    this.type, {
    this.required = false,
    this.sectionTitle,
    this.inferred = false,
    this.numeric = false,
  });
}

/// SAFETY CHECK — start-of-shift. Matches the real screenshots except
/// the very first item, which is cut off ("...operation") above "Tyre
/// condition / wear" in both screenshots sent so far — still a
/// placeholder guess pending the real label.
///
/// Split into two lists (tractor items, then the trailer block is
/// inserted, then the defect report) because the defect report has
/// to stay last — it's meant to cover the whole rig, tractor and
/// trailer together — see kSafetyCheckDefectFields below and
/// WalkAroundCheckScreen._fields.
const List<WalkaroundFieldDef> kSafetyCheckTractorFields = [
  WalkaroundFieldDef('odometer_reading', 'Odometer reading', WalkaroundFieldType.text, required: true, numeric: true),
  WalkaroundFieldDef('lights_indicators_operation', 'Lights & indicators operation', WalkaroundFieldType.checkbox, inferred: true, required: true),
  WalkaroundFieldDef('tyre_condition', 'Tyre condition / wear', WalkaroundFieldType.checkbox, required: true),
  WalkaroundFieldDef('speedometer_operation', 'Speedometer operation', WalkaroundFieldType.checkbox, required: true),
  WalkaroundFieldDef('wheels_condition', 'Wheels condition', WalkaroundFieldType.checkbox, required: true),
  WalkaroundFieldDef('battery_condition', 'Battery condition', WalkaroundFieldType.checkbox, required: true),
  WalkaroundFieldDef('oil_level_picture', 'Oil level picture', WalkaroundFieldType.photo, required: true),
  WalkaroundFieldDef('fuel_card_last4', 'Fuel card - type last 4 digits', WalkaroundFieldType.text, required: true),
  // All four sides of the unit are compulsory on every check.
  WalkaroundFieldDef('outside_right', 'Outside picture - right side', WalkaroundFieldType.photo, required: true),
  WalkaroundFieldDef('outside_front', 'Outside picture - front', WalkaroundFieldType.photo, required: true),
  WalkaroundFieldDef('outside_left', 'Outside picture - left side', WalkaroundFieldType.photo, required: true),
  WalkaroundFieldDef('outside_back', 'Outside picture - back', WalkaroundFieldType.photo, required: true),
];

const List<WalkaroundFieldDef> kSafetyCheckDefectFields = [
  WalkaroundFieldDef('defect_details', 'Defect details', WalkaroundFieldType.text, sectionTitle: 'Defect report - detail any faults'),
  WalkaroundFieldDef('defect_image_1', 'Defect image 1', WalkaroundFieldType.photo),
  WalkaroundFieldDef('defect_image_2', 'Defect image 2', WalkaroundFieldType.photo),
];

/// END OF SHIFT INSPECTION — matches the real screenshots exactly,
/// top to bottom, de-duplicated where two screenshots overlapped
/// the same scroll position.
const List<WalkaroundFieldDef> kEndOfShiftFields = [
  WalkaroundFieldDef('odometer_reading', 'Odometer reading', WalkaroundFieldType.text, required: true, numeric: true),
  WalkaroundFieldDef('cab_clean_tidy', 'Is the cab clean and tidy?', WalkaroundFieldType.passFail, required: true),
  WalkaroundFieldDef('no_litter_dirt', 'Are there no litter or dirt on the dashboard or floor?', WalkaroundFieldType.passFail, required: true),
  WalkaroundFieldDef('floor_mats_clean', 'Are the floor mats clean?', WalkaroundFieldType.passFail, required: true),
  // One cab-interior and one door-pocket photo are compulsory; the second
  // of each is optional extra evidence.
  WalkaroundFieldDef('cab_interior_photo_1', 'Upload photo of cab interior', WalkaroundFieldType.photo, required: true),
  WalkaroundFieldDef('cab_interior_photo_2', 'Additional cab interior photo', WalkaroundFieldType.photo),
  WalkaroundFieldDef('door_pocket_photo_1', 'Door pocket picture', WalkaroundFieldType.photo, required: true),
  WalkaroundFieldDef('door_pocket_photo_2', 'Additional door pocket picture', WalkaroundFieldType.photo),
  WalkaroundFieldDef('adblue_level', 'Ad blue level', WalkaroundFieldType.photo, required: true),
  WalkaroundFieldDef('registration_plate_in_cab', 'Is there a registration plate inside the cab? Take a picture', WalkaroundFieldType.checkbox, required: true),
  WalkaroundFieldDef('fuel_card_photo', 'Photo of Fuel Card', WalkaroundFieldType.photo, required: true),
  WalkaroundFieldDef('driver_comments', 'Driver comments', WalkaroundFieldType.text),
  WalkaroundFieldDef('outside_right', 'Outside picture - right side', WalkaroundFieldType.photo, required: true),
  WalkaroundFieldDef('outside_front', 'Outside picture - front', WalkaroundFieldType.photo, required: true),
  WalkaroundFieldDef('outside_left', 'Outside picture - left side', WalkaroundFieldType.photo, required: true),
  WalkaroundFieldDef('outside_back', 'Outside picture - back', WalkaroundFieldType.photo, required: true),
];

/// TRAILER CHECK — confirmed by the founder to be the same block
/// used in both Safety Check and End of Shift Inspection whenever a
/// trailer is attached, not a separate third form. Tyre condition is
/// deliberately NOT repeated here (already covered once by the
/// tractor's own "Tyre condition / wear"); side walls and corners
/// were explicitly requested. Coupling/landing legs and doors/
/// curtains are Claude's own judgment additions, per the founder's
/// explicit "add some of the details yourself that are required for
/// the trailer" — standard trailer safety points, not confirmed from
/// a screenshot.
const List<WalkaroundFieldDef> kTrailerFields = [
  WalkaroundFieldDef('trailer_lights_operation', 'Trailer lights & indicators operation', WalkaroundFieldType.checkbox, sectionTitle: 'Trailer check', required: true),
  WalkaroundFieldDef('trailer_wheels_condition', 'Trailer wheels condition', WalkaroundFieldType.checkbox, required: true),
  WalkaroundFieldDef('trailer_side_walls', 'Side walls condition', WalkaroundFieldType.checkbox, required: true),
  WalkaroundFieldDef('trailer_corners', 'Corners condition', WalkaroundFieldType.checkbox, required: true),
  WalkaroundFieldDef('trailer_coupling_landing_legs', 'Coupling / landing legs secure', WalkaroundFieldType.checkbox, required: true),
  WalkaroundFieldDef('trailer_doors_curtains', 'Doors / curtains condition', WalkaroundFieldType.checkbox, required: true),
  WalkaroundFieldDef('trailer_outside_right', 'Trailer picture - right side', WalkaroundFieldType.photo, required: true),
  WalkaroundFieldDef('trailer_outside_front', 'Trailer picture - front', WalkaroundFieldType.photo, required: true),
  WalkaroundFieldDef('trailer_outside_left', 'Trailer picture - left side', WalkaroundFieldType.photo, required: true),
  WalkaroundFieldDef('trailer_outside_back', 'Trailer picture - back', WalkaroundFieldType.photo, required: true),
];

// Brand palette — red, black, white and neutral greys only.
const Color _kRed = Color(0xFFCC0000);
const Color _kInk = Color(0xFF111111);
const Color _kGrey = Color(0xFF6B6B6B);
const Color _kGreyDone = Color(0xFF333333);

class WalkAroundCheckScreen extends StatefulWidget {
  final String driverId;
  final String organizationId;
  final String checkType; // 'start_of_shift' | 'end_of_shift'
  final String vehicleId;
  final String vehicleNumber;
  /// Trailer already coupled to the shift (fleet id and/or number). A
  /// non-fleet trailer has a number but no id.
  final String? trailerId;
  final String? trailerNumber;
  final String? shiftId;
  /// Called after submit with the saved check id and the trailer the
  /// driver confirmed on the check (null when no trailer) — callers use
  /// it to couple that trailer to the shift.
  final Future<void> Function(String? checkId, Map<String, dynamic>? trailer) onComplete;

  const WalkAroundCheckScreen({
    super.key,
    required this.driverId,
    required this.organizationId,
    required this.checkType,
    required this.vehicleId,
    required this.vehicleNumber,
    this.trailerId,
    this.trailerNumber,
    this.shiftId,
    required this.onComplete,
  });

  @override
  State<WalkAroundCheckScreen> createState() => _WalkAroundCheckScreenState();
}

class _WalkAroundCheckScreenState extends State<WalkAroundCheckScreen> {
  late DateTime _startedAt;
  /// Set when a saved draft was restored, so saving/submitting updates
  /// that row instead of leaving it behind as an orphan draft.
  String? _draftId;
  bool _hasTrailer = false;
  bool _askedTrailerQuestion = false;
  /// The trailer on this check: `{'id': String?, 'vehicle_number': String, 'custom': bool?}`.
  Map<String, dynamic>? _trailer;
  Future<List<Map<String, dynamic>>>? _vehiclesFuture;

  final Map<String, dynamic> _values = {}; // bool | String | String path
  final Map<String, Uint8List> _pendingPhotoBytes = {};
  final Map<String, String> _pendingPhotoNames = {};
  final Map<String, TextEditingController> _textControllers = {};
  // Started the moment a photo is taken, not at submit — by the time the
  // driver finishes the rest of the check and taps Submit, every upload
  // is already done or well underway instead of waiting to start.
  final Map<String, Future<String?>> _pendingUploads = {};

  bool _isSubmitting = false;
  bool _isSavingDraft = false;

  bool get _isStart => widget.checkType == 'start_of_shift';

  // Trailer block sits after the tractor items in both forms, but
  // before the Safety Check's Defect Report section — that section
  // is meant to cover the whole rig, tractor and trailer together,
  // so it has to come after anything it might need to describe.
  List<WalkaroundFieldDef> get _fields => [
        if (_isStart) ...kSafetyCheckTractorFields else ...kEndOfShiftFields,
        if (_hasTrailer) ...kTrailerFields,
        if (_isStart) ...kSafetyCheckDefectFields,
      ];

  @override
  void initState() {
    super.initState();
    _startedAt = DateTime.now();
    if (widget.trailerNumber != null && widget.trailerNumber!.trim().isNotEmpty) {
      _trailer = {
        'id': widget.trailerId,
        'vehicle_number': widget.trailerNumber!.trim(),
        'vehicle_type': 'trailer',
        if (widget.trailerId == null) 'custom': true,
      };
    }
    _hasTrailer = _trailer != null;
    WidgetsBinding.instance.addPostFrameCallback((_) => _askTrailerQuestion());
    _restoreDraft();
  }

  /// Picks up a "Save as Draft" from earlier: answers, photos already
  /// uploaded, and the original start time (so the duration isn't reset).
  Future<void> _restoreDraft() async {
    final draft = await SupabaseService.fetchWalkaroundDraft(
      checkType: widget.checkType,
      shiftId: widget.shiftId,
    );
    if (draft == null || !mounted) return;
    final items = (draft['items'] as List?) ?? const [];
    setState(() {
      _draftId = draft['id'] as String?;
      final started = DateTime.tryParse(draft['started_at']?.toString() ?? '');
      if (started != null) _startedAt = started.toLocal();
      for (final raw in items) {
        if (raw is! Map) continue;
        final key = raw['key'] as String?;
        final value = raw['value'];
        // 'pending' was a photo that hadn't finished uploading — treat as missing.
        if (key == null || value == null || value == 'pending') continue;
        _values[key] = value;
        if (value is String) {
          _textControllers.putIfAbsent(key, () => TextEditingController()).text = value;
        }
      }
    });
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Draft restored — carry on where you left off.')),
    );
  }

  @override
  void dispose() {
    for (final c in _textControllers.values) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _askTrailerQuestion() async {
    if (_askedTrailerQuestion || !mounted) return;
    _askedTrailerQuestion = true;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final coupled = _trailer?['vehicle_number'] as String?;
    final answer = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (dialogContext) => AlertDialog(
        backgroundColor: isDark ? const Color(0xFF1A1A1A) : Colors.white,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        titlePadding: const EdgeInsets.fromLTRB(20, 20, 20, 0),
        contentPadding: const EdgeInsets.fromLTRB(20, 8, 20, 0),
        actionsPadding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
        title: Text(
          'Does this asset have a trailer attached?',
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 15.5, fontWeight: FontWeight.w800, color: isDark ? Colors.white : _kInk),
        ),
        content: Text(
          coupled != null ? 'Coupled at clock-in: ${coupled.toUpperCase()}' : "If yes, you'll enter the trailer number next.",
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 12.5, color: isDark ? Colors.white60 : Colors.black54),
        ),
        actionsAlignment: MainAxisAlignment.center,
        actions: [
          OutlinedButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            style: OutlinedButton.styleFrom(
              foregroundColor: isDark ? Colors.white : _kInk,
              side: BorderSide(color: isDark ? Colors.white38 : Colors.black38),
              minimumSize: const Size(88, 36),
              padding: const EdgeInsets.symmetric(horizontal: 18),
              tapTargetSize: MaterialTapTargetSize.shrinkWrap,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
            ),
            child: const Text('No', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700)),
          ),
          const SizedBox(width: 8),
          ElevatedButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            style: ElevatedButton.styleFrom(
              backgroundColor: _kRed,
              foregroundColor: Colors.white,
              elevation: 0,
              minimumSize: const Size(88, 36),
              padding: const EdgeInsets.symmetric(horizontal: 18),
              tapTargetSize: MaterialTapTargetSize.shrinkWrap,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
            ),
            child: const Text('Yes', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w800)),
          ),
        ],
      ),
    );
    if (!mounted) return;
    if (answer != true) {
      setState(() {
        _hasTrailer = false;
        _trailer = null;
      });
      return;
    }
    if (_trailer != null) {
      setState(() => _hasTrailer = true);
      return;
    }
    // "Yes" needs the exact trailer number — backing out of the picker
    // without one goes back to the question.
    final picked = await _pickTrailer();
    if (!mounted) return;
    if (picked == null) {
      _askedTrailerQuestion = false;
      await _askTrailerQuestion();
    }
  }

  /// Opens the trailer picker (fleet trailers plus a typed number for any
  /// other trailer). Returns the chosen trailer, or null if dismissed.
  Future<Map<String, dynamic>?> _pickTrailer() async {
    _vehiclesFuture ??= SupabaseService.fetchOrgVehicles(widget.organizationId);
    final vehicles = await _vehiclesFuture!;
    if (!mounted) return null;
    final picked = await showSearchableAssetPicker(
      context,
      title: 'TRAILER NUMBER',
      subtitle: "Select the trailer, or type its number if it isn't one of ours (e.g. Amazon, Katem).",
      vehicles: vehicles,
      typeFilter: 'trailer',
      allowCustomTrailer: true,
      signOffContext: 'walkaround',
      shiftId: widget.shiftId,
    );
    if (!mounted || picked == null || picked.isEmpty) return null;
    setState(() {
      _trailer = picked;
      _hasTrailer = true;
    });
    return picked;
  }

  /// Status-bar "Change": re-ask the question, forgetting the current
  /// trailer so "Yes" always opens the picker.
  void _changeTrailer() {
    setState(() {
      _trailer = null;
      _hasTrailer = false;
    });
    _askedTrailerQuestion = false;
    _askTrailerQuestion();
  }

  bool _isAnswered(WalkaroundFieldDef field) {
    final v = _values[field.key];
    if (field.type == WalkaroundFieldType.text) return (v as String?)?.trim().isNotEmpty ?? false;
    // A compulsory tick-box only counts once it's actually ticked.
    if (field.type == WalkaroundFieldType.checkbox) return v == true;
    return v != null;
  }

  List<WalkaroundFieldDef> get _requiredFields => _fields.where((f) => f.required).toList();

  /// Only compulsory items gate Submit — optional ones can be left blank.
  bool get _allAnswered => _requiredFields.every(_isAnswered);

  bool get _hasDefects {
    if (_values['defect_details'] is String && (_values['defect_details'] as String).trim().isNotEmpty) return true;
    return _values.values.any((v) => v == 'fail');
  }

  Future<void> _choosePhotoSource(String key) async {
    final source = await showModalBottomSheet<ImageSource>(
      context: context,
      builder: (sheetContext) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.camera_alt_outlined),
              title: const Text('Take photo'),
              onTap: () => Navigator.pop(sheetContext, ImageSource.camera),
            ),
            ListTile(
              leading: const Icon(Icons.photo_library_outlined),
              title: const Text('Choose from gallery'),
              onTap: () => Navigator.pop(sheetContext, ImageSource.gallery),
            ),
          ],
        ),
      ),
    );
    if (source != null) await _pickPhoto(key, source);
  }

  Future<void> _pickPhoto(String key, ImageSource source) async {
    final picker = ImagePicker();
    final picked = await picker.pickImage(source: source, imageQuality: 80, maxWidth: 1600);
    if (picked == null) return;
    final bytes = await picked.readAsBytes();
    setState(() {
      _pendingPhotoBytes[key] = bytes;
      _pendingPhotoNames[key] = picked.name;
      _values[key] = 'pending'; // placeholder so _isAnswered() sees it as filled; replaced with the real path on submit
    });
    // Fire the upload now, in parallel with whatever the driver does next
    // (more photos, ticking boxes) — _buildItemsPayload just awaits this
    // later instead of starting it cold at submit time.
    _pendingUploads[key] = SupabaseService.uploadWalkaroundPhoto(
      organizationId: widget.organizationId,
      driverId: widget.driverId,
      bytes: bytes,
      fileName: picked.name,
    );
  }

  Future<Map<String, dynamic>> _buildItemsPayload() async {
    final items = <Map<String, dynamic>>[];
    for (final field in _fields) {
      dynamic value = _values[field.key];
      if (field.type == WalkaroundFieldType.photo && _pendingUploads.containsKey(field.key)) {
        value = await _pendingUploads[field.key];
      }
      items.add({
        'key': field.key,
        'label': field.label,
        'type': field.type.name,
        'value': value,
        if (field.sectionTitle != null) 'section': field.sectionTitle,
      });
    }
    return {'items': items, 'hasDefects': _hasDefects};
  }

  Future<void> _saveAsDraft() async {
    if (_isSavingDraft || _isSubmitting) return;
    setState(() => _isSavingDraft = true);
    try {
      final payload = await _buildItemsPayload();
      final savedId = await SupabaseService.submitWalkaroundCheck(
        driverId: widget.driverId,
        vehicleId: widget.vehicleId,
        trailerId: _hasTrailer ? (_trailer?['id'] as String?) : null,
        customTrailerNumber: _hasTrailer && isCustomTrailer(_trailer) ? (_trailer?['vehicle_number'] as String?) : null,
        shiftId: widget.shiftId,
        checkType: widget.checkType,
        startedAt: _startedAt,
        completedAt: null,
        items: payload['items'] as List<Map<String, dynamic>>,
        overallResult: null,
        existingId: _draftId,
      );
      if (!mounted) return;
      if (savedId == null) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text("Couldn't save the draft — check your signal and try again.")),
        );
        return;
      }
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Saved as draft. It still needs submitting to count as a completed check.')),
      );
      Navigator.of(context).pop();
    } finally {
      if (mounted) setState(() => _isSavingDraft = false);
    }
  }

  Future<void> _submit() async {
    if (!_allAnswered || _isSubmitting) return;
    setState(() => _isSubmitting = true);
    try {
      final payload = await _buildItemsPayload();
      final completedAt = DateTime.now();
      final overallResult = (payload['hasDefects'] as bool) ? 'defects_found' : 'pass';
      final defectNote = _values['defect_details'] as String?;

      final checkId = await SupabaseService.submitWalkaroundCheck(
        driverId: widget.driverId,
        vehicleId: widget.vehicleId,
        trailerId: _hasTrailer ? (_trailer?['id'] as String?) : null,
        customTrailerNumber: _hasTrailer && isCustomTrailer(_trailer) ? (_trailer?['vehicle_number'] as String?) : null,
        shiftId: widget.shiftId,
        checkType: widget.checkType,
        startedAt: _startedAt,
        completedAt: completedAt,
        items: payload['items'] as List<Map<String, dynamic>>,
        overallResult: overallResult,
        defectNote: defectNote,
        existingId: _draftId,
      );

      if (!mounted) return;
      // A failed save must not close the screen or mark the check done —
      // the driver keeps their answers and can retry.
      if (checkId == null) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text("Couldn't submit the check — check your signal and try again.")),
        );
        return;
      }
      Navigator.of(context).pop();
      await widget.onComplete(checkId, _hasTrailer ? _trailer : null);
    } finally {
      if (mounted) setState(() => _isSubmitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final title = _isStart ? 'Safety check' : 'End of shift inspection';
    final answeredCount = _requiredFields.where(_isAnswered).length;

    return Scaffold(
      backgroundColor: isDark ? const Color(0xFF0D0D0D) : const Color(0xFFF7F7F7),
      appBar: AppBar(
        backgroundColor: isDark ? const Color(0xFF0D0D0D) : Colors.white,
        elevation: 0,
        automaticallyImplyLeading: false,
        title: Text.rich(
          TextSpan(children: [
            TextSpan(text: '$title  ', style: GoogleFonts.outfit(fontWeight: FontWeight.w700, fontSize: 15, color: isDark ? Colors.white : Colors.black87)),
            TextSpan(text: '| ${widget.vehicleNumber.toUpperCase()}', style: GoogleFonts.outfit(fontWeight: FontWeight.w500, fontSize: 13, color: isDark ? Colors.white54 : Colors.black45)),
          ]),
        ),
      ),
      body: Column(
        children: [
          _buildStatusBar(isDark, answeredCount),
          Expanded(
            child: ListView.separated(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 110),
              itemCount: _fields.length,
              separatorBuilder: (_, __) => const SizedBox(height: 8),
              itemBuilder: (context, i) {
                final field = _fields[i];
                final widgetTile = _buildFieldTile(field, isDark);
                if (field.sectionTitle == null) return widgetTile;
                return Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Padding(
                      padding: const EdgeInsets.only(top: 8, bottom: 8),
                      child: Text(
                        field.sectionTitle!,
                        style: TextStyle(fontWeight: FontWeight.w900, fontSize: 15, color: isDark ? Colors.white : _kInk),
                      ),
                    ),
                    widgetTile,
                  ],
                );
              },
            ),
          ),
        ],
      ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 10, 16, 16),
          child: Row(
            children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: (_isSavingDraft || _isSubmitting) ? null : _saveAsDraft,
                  style: OutlinedButton.styleFrom(
                    foregroundColor: isDark ? Colors.white70 : Colors.black87,
                    side: BorderSide(color: isDark ? Colors.white24 : Colors.black26),
                    minimumSize: const Size(double.infinity, 50),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                  child: _isSavingDraft
                      ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2.5))
                      : const Text('Save as Draft', style: TextStyle(fontWeight: FontWeight.w700)),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: ElevatedButton(
                  onPressed: _allAnswered && !_isSubmitting && !_isSavingDraft ? _submit : null,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: _kRed,
                    disabledBackgroundColor: isDark ? Colors.white12 : Colors.black12,
                    foregroundColor: Colors.white,
                    minimumSize: const Size(double.infinity, 50),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                  child: _isSubmitting
                      ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.white))
                      : Text(_allAnswered ? 'Submit' : 'Submit ($answeredCount/${_requiredFields.length} required)', style: const TextStyle(fontWeight: FontWeight.w800)),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildStatusBar(bool isDark, int answeredCount) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 10),
      color: isDark ? const Color(0xFF1A1A1A) : Colors.white,
      child: Row(
        children: [
          Icon(
            _hasTrailer ? Icons.rv_hookup : Icons.rv_hookup_outlined,
            size: 16,
            color: _hasTrailer ? _kRed : (isDark ? Colors.white38 : Colors.black38),
          ),
          const SizedBox(width: 6),
          Flexible(
            child: GestureDetector(
              onTap: _changeTrailer,
              child: Text.rich(
                TextSpan(children: [
                  TextSpan(text: _hasTrailer ? 'Trailer ${((_trailer?['vehicle_number'] as String?) ?? '').toUpperCase()}' : 'No trailer'),
                  const TextSpan(text: '  Change', style: TextStyle(color: _kRed, fontWeight: FontWeight.w800)),
                ]),
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: isDark ? Colors.white70 : Colors.black54),
              ),
            ),
          ),
          const SizedBox(width: 8),
          _ElapsedTimer(startedAt: _startedAt, isDark: isDark),
          const SizedBox(width: 12),
          Text('$answeredCount/${_requiredFields.length} required', style: TextStyle(fontFamily: 'monospace', fontSize: 12, fontWeight: FontWeight.w700, color: isDark ? Colors.white54 : Colors.black45)),
        ],
      ),
    );
  }

  Widget _buildFieldTile(WalkaroundFieldDef field, bool isDark) {
    final cardColor = isDark ? const Color(0xFF1A1A1A) : Colors.white;
    final borderColor = isDark ? const Color(0xFF333333) : const Color(0xFFE0E0E0);

    Widget control;
    switch (field.type) {
      case WalkaroundFieldType.photo:
        control = _buildPhotoControl(field, isDark);
        break;
      case WalkaroundFieldType.checkbox:
        control = Checkbox(
          value: _values[field.key] == true,
          activeColor: _kRed,
          checkColor: Colors.white,
          onChanged: (v) => setState(() => _values[field.key] = v),
        );
        break;
      case WalkaroundFieldType.passFail:
        return _buildPassFailTile(field, isDark, cardColor, borderColor);
      case WalkaroundFieldType.text:
        return _buildTextTile(field, isDark, cardColor, borderColor);
    }

    return Container(
      decoration: BoxDecoration(color: cardColor, borderRadius: BorderRadius.circular(12), border: Border.all(color: borderColor)),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
      child: Row(
        children: [
          Expanded(
            child: Text.rich(
              TextSpan(children: [
                TextSpan(text: field.label, style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700, color: isDark ? Colors.white : _kInk)),
                if (field.required) const TextSpan(text: ' *', style: TextStyle(color: Color(0xFFCC0000), fontWeight: FontWeight.w800)),
              ]),
            ),
          ),
          control,
        ],
      ),
    );
  }

  Widget _buildPassFailTile(WalkaroundFieldDef field, bool isDark, Color cardColor, Color borderColor) {
    final value = _values[field.key] as String?;
    Widget radio(String label, String v) {
      final selected = value == v;
      return InkWell(
        onTap: () => setState(() => _values[field.key] = v),
        borderRadius: BorderRadius.circular(8),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 6),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                selected ? Icons.radio_button_checked : Icons.radio_button_unchecked,
                size: 18,
                color: selected ? (v == 'fail' ? _kRed : (isDark ? Colors.white : _kInk)) : (isDark ? Colors.white38 : Colors.black38),
              ),
              const SizedBox(width: 6),
              Text(label, style: TextStyle(fontSize: 13, fontWeight: selected ? FontWeight.w700 : FontWeight.w500, color: isDark ? Colors.white70 : Colors.black54)),
            ],
          ),
        ),
      );
    }

    return Container(
      decoration: BoxDecoration(color: cardColor, borderRadius: BorderRadius.circular(12), border: Border.all(color: borderColor)),
      padding: const EdgeInsets.fromLTRB(14, 10, 6, 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(field.label, style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700, color: isDark ? Colors.white : _kInk)),
          Row(children: [radio('Pass', 'pass'), const SizedBox(width: 6), radio('Fail', 'fail')]),
        ],
      ),
    );
  }

  Widget _buildTextTile(WalkaroundFieldDef field, bool isDark, Color cardColor, Color borderColor) {
    _textControllers.putIfAbsent(field.key, () => TextEditingController());
    return Container(
      decoration: BoxDecoration(color: cardColor, borderRadius: BorderRadius.circular(12), border: Border.all(color: borderColor)),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
      child: TextField(
        controller: _textControllers[field.key],
        onChanged: (v) => setState(() => _values[field.key] = v),
        keyboardType: field.numeric ? TextInputType.number : TextInputType.text,
        inputFormatters: field.numeric ? [FilteringTextInputFormatter.digitsOnly] : null,
        style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600, color: isDark ? Colors.white : _kInk),
        decoration: InputDecoration(
          hintText: field.required ? '${field.label} *' : field.label,
          hintStyle: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700, color: isDark ? Colors.white54 : Colors.black45),
          border: InputBorder.none,
          isDense: true,
          contentPadding: const EdgeInsets.symmetric(vertical: 12),
        ),
      ),
    );
  }

  Widget _buildPhotoControl(WalkaroundFieldDef field, bool isDark) {
    // A photo restored from a draft is already uploaded (a storage path in
    // _values) rather than held as bytes.
    final hasPhoto = _pendingPhotoBytes.containsKey(field.key) || _values[field.key] is String;
    // The photo gallery is allowed on the safety check and end-of-shift
    // inspection (and vehicle defect reports) — everywhere else in the app
    // photos must be taken live with the camera.
    return GestureDetector(
      onTap: () => _choosePhotoSource(field.key),
      child: Container(
        width: 40,
        height: 34,
        decoration: BoxDecoration(
          color: hasPhoto ? _kGreyDone : _kGrey,
          borderRadius: BorderRadius.circular(8),
        ),
        alignment: Alignment.center,
        child: hasPhoto
            ? const Icon(Icons.check, size: 18, color: Colors.white)
            : const Icon(Icons.camera_alt, size: 16, color: Colors.white),
      ),
    );
  }

}

class _ElapsedTimer extends StatefulWidget {
  final DateTime startedAt;
  final bool isDark;
  const _ElapsedTimer({required this.startedAt, required this.isDark});

  @override
  State<_ElapsedTimer> createState() => _ElapsedTimerState();
}

class _ElapsedTimerState extends State<_ElapsedTimer> {
  Timer? _timer;
  Duration _elapsed = Duration.zero;

  @override
  void initState() {
    super.initState();
    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() => _elapsed = DateTime.now().difference(widget.startedAt));
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final m = _elapsed.inMinutes.toString().padLeft(2, '0');
    final s = (_elapsed.inSeconds % 60).toString().padLeft(2, '0');
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(Icons.timer_outlined, size: 13, color: widget.isDark ? Colors.white54 : Colors.black45),
        const SizedBox(width: 4),
        Text(
          '$m:$s',
          style: TextStyle(fontFamily: 'monospace', fontSize: 12, fontWeight: FontWeight.w700, color: widget.isDark ? Colors.white54 : Colors.black45),
        ),
      ],
    );
  }
}
