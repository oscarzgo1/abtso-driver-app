import 'package:flutter/services.dart' show rootBundle;
import 'package:intl/intl.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';

/// Per-shift pay figures, derived once so the History list and the PDF
/// export can never disagree. Same fallbacks the History tab has always
/// used for older rows with missing columns.
class ShiftPayBreakdown {
  final DateTime start;
  final DateTime? end;
  final double hours;
  final double pay;
  final double rate;
  final double basePay;
  final double nightOut;
  final double extras;
  final bool hasOverride;

  const ShiftPayBreakdown._({
    required this.start,
    required this.end,
    required this.hours,
    required this.pay,
    required this.rate,
    required this.basePay,
    required this.nightOut,
    required this.extras,
    required this.hasOverride,
  });

  bool get isLive => end == null;
  double get extraPay => nightOut + extras;

  factory ShiftPayBreakdown.fromShift(
    Map<String, dynamic> s, {
    required bool isFixed,
    required double rateValue,
  }) {
    final start = DateTime.parse(s['start_time']).toLocal();
    final end = s['end_time'] != null ? DateTime.parse(s['end_time']).toLocal() : null;

    final pay = (s['total_pay'] as num?)?.toDouble() ?? 0.0;
    final hours = (s['total_hours'] as num?)?.toDouble() ??
        (end != null ? (end.difference(start).inMinutes / 60.0) : 0.0);

    final rate = (s['effective_rate'] as num?)?.toDouble() ??
        (s['base_hourly_rate'] as num?)?.toDouble() ??
        rateValue;

    final nightOut = (s['night_out_amount'] as num?)?.toDouble() ??
        (s['night_out_allowance'] as num?)?.toDouble() ??
        (s['night_out_status'] == 'approved' ? 25.0 : 0.0);

    final extras = (s['extra_amount'] as num?)?.toDouble() ??
        (s['extras_amount'] as num?)?.toDouble() ??
        (s['extras'] as num?)?.toDouble() ??
        0.0;

    final extraPay = nightOut + extras;
    final basePay = isFixed ? rateValue : (extraPay > 0 ? (pay - extraPay) : (hours * rate));

    return ShiftPayBreakdown._(
      start: start,
      end: end,
      hours: hours,
      pay: pay,
      rate: rate,
      basePay: basePay,
      nightOut: nightOut,
      extras: extras,
      hasOverride: s['override_rate'] != null,
    );
  }
}

/// Builds a payslip-style earnings summary for the selected period and
/// opens the platform share sheet. Figures come from the driver's logged
/// shifts only — it is explicitly not a payslip; payroll in the admin
/// dashboard remains the record of what is actually paid.
Future<void> shareEarningsSummary({
  required String driverName,
  String? driverCode,
  required DateTime start,
  required DateTime end,
  required List<ShiftPayBreakdown> shifts,
  required bool isFixed,
  required double rateValue,
}) async {
  final money = NumberFormat.currency(locale: 'en_GB', symbol: '£');
  final dateFmt = DateFormat('d MMM yyyy');
  final dayFmt = DateFormat('EEE d MMM');
  final timeFmt = DateFormat('HH:mm');

  final sorted = [...shifts]..sort((a, b) => a.start.compareTo(b.start));
  final totalHours = sorted.fold(0.0, (sum, s) => sum + s.hours);
  final totalBase = sorted.fold(0.0, (sum, s) => sum + s.basePay);
  final totalNight = sorted.fold(0.0, (sum, s) => sum + s.nightOut);
  final totalExtras = sorted.fold(0.0, (sum, s) => sum + s.extras);
  final totalPay = sorted.fold(0.0, (sum, s) => sum + s.pay);

  pw.MemoryImage? logo;
  try {
    final bytes = await rootBundle.load('assets/images/tachyo_logo.png');
    logo = pw.MemoryImage(bytes.buffer.asUint8List());
  } catch (_) {}

  const red = PdfColor.fromInt(0xFFCC0000);
  const grey = PdfColor.fromInt(0xFF777777);
  const line = PdfColor.fromInt(0xFFE0E0E0);

  pw.Widget cell(String text, {bool bold = false, bool right = false, PdfColor? color}) => pw.Padding(
        padding: const pw.EdgeInsets.symmetric(vertical: 6, horizontal: 4),
        child: pw.Text(
          text,
          textAlign: right ? pw.TextAlign.right : pw.TextAlign.left,
          style: pw.TextStyle(fontSize: 9, fontWeight: bold ? pw.FontWeight.bold : null, color: color),
        ),
      );

  final doc = pw.Document(title: 'Tachyo earnings summary', author: 'Tachyo');
  doc.addPage(
    pw.MultiPage(
      pageFormat: PdfPageFormat.a4,
      margin: const pw.EdgeInsets.all(36),
      header: (context) => pw.Row(
        mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
        crossAxisAlignment: pw.CrossAxisAlignment.start,
        children: [
          if (logo != null) pw.Image(logo, height: 34) else pw.Text('tachyo.', style: const pw.TextStyle(fontSize: 20, fontWeight: pw.FontWeight.bold)),
          pw.Column(
            crossAxisAlignment: pw.CrossAxisAlignment.end,
            children: [
              pw.Text('Earnings summary', style: const pw.TextStyle(fontSize: 16, fontWeight: pw.FontWeight.bold)),
              pw.SizedBox(height: 2),
              pw.Text('${dateFmt.format(start)} – ${dateFmt.format(end)}', style: const pw.TextStyle(fontSize: 10, color: grey)),
            ],
          ),
        ],
      ),
      footer: (context) => pw.Row(
        mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
        children: [
          pw.Text('Generated ${DateFormat('d MMM yyyy, HH:mm').format(DateTime.now())}', style: const pw.TextStyle(fontSize: 8, color: grey)),
          pw.Text('Page ${context.pageNumber} of ${context.pagesCount}', style: const pw.TextStyle(fontSize: 8, color: grey)),
        ],
      ),
      build: (context) => [
        pw.SizedBox(height: 18),
        pw.Row(
          mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
          crossAxisAlignment: pw.CrossAxisAlignment.end,
          children: [
            pw.Column(
              crossAxisAlignment: pw.CrossAxisAlignment.start,
              children: [
                pw.Text(driverName, style: const pw.TextStyle(fontSize: 13, fontWeight: pw.FontWeight.bold)),
                if (driverCode != null && driverCode.isNotEmpty)
                  pw.Text('Driver ID $driverCode', style: const pw.TextStyle(fontSize: 10, color: grey)),
                pw.Text(
                  isFixed ? 'Day rate ${money.format(rateValue)}' : 'Hourly rate ${money.format(rateValue)}',
                  style: const pw.TextStyle(fontSize: 10, color: grey),
                ),
              ],
            ),
            pw.Column(
              crossAxisAlignment: pw.CrossAxisAlignment.end,
              children: [
                pw.Text('Period total', style: const pw.TextStyle(fontSize: 10, color: grey)),
                pw.Text(money.format(totalPay), style: const pw.TextStyle(fontSize: 22, fontWeight: pw.FontWeight.bold, color: red)),
                pw.Text('${sorted.length} shift${sorted.length == 1 ? '' : 's'} · ${totalHours.toStringAsFixed(1)} h', style: const pw.TextStyle(fontSize: 10, color: grey)),
              ],
            ),
          ],
        ),
        pw.SizedBox(height: 18),
        pw.Table(
          border: const pw.TableBorder(horizontalInside: pw.BorderSide(color: line, width: 0.5), bottom: pw.BorderSide(color: line, width: 0.5)),
          columnWidths: const {
            0: pw.FlexColumnWidth(2.2),
            1: pw.FlexColumnWidth(1.8),
            2: pw.FlexColumnWidth(1),
            3: pw.FlexColumnWidth(1.4),
            4: pw.FlexColumnWidth(1.4),
            5: pw.FlexColumnWidth(1.3),
            6: pw.FlexColumnWidth(1.5),
          },
          children: [
            pw.TableRow(
              decoration: const pw.BoxDecoration(color: PdfColor.fromInt(0xFFF5F5F5)),
              children: [
                cell('Date', bold: true),
                cell('Time', bold: true),
                cell('Hours', bold: true, right: true),
                cell('Base', bold: true, right: true),
                cell('Night out', bold: true, right: true),
                cell('Extras', bold: true, right: true),
                cell('Total', bold: true, right: true),
              ],
            ),
            for (final s in sorted)
              pw.TableRow(children: [
                cell(dayFmt.format(s.start) + (s.hasOverride ? ' *' : '')),
                cell('${timeFmt.format(s.start)} – ${s.end != null ? timeFmt.format(s.end!) : 'ongoing'}'),
                cell(s.hours.toStringAsFixed(2), right: true),
                cell(money.format(s.basePay), right: true),
                cell(s.nightOut > 0 ? money.format(s.nightOut) : '–', right: true),
                cell(s.extras > 0 ? money.format(s.extras) : '–', right: true),
                cell(money.format(s.pay), bold: true, right: true),
              ]),
            pw.TableRow(children: [
              cell('Total', bold: true),
              cell(''),
              cell(totalHours.toStringAsFixed(2), bold: true, right: true),
              cell(money.format(totalBase), bold: true, right: true),
              cell(money.format(totalNight), bold: true, right: true),
              cell(money.format(totalExtras), bold: true, right: true),
              cell(money.format(totalPay), bold: true, right: true, color: red),
            ]),
          ],
        ),
        if (sorted.any((s) => s.hasOverride)) ...[
          pw.SizedBox(height: 6),
          pw.Text('* Rate override applied to this shift.', style: const pw.TextStyle(fontSize: 8, color: grey)),
        ],
        pw.SizedBox(height: 16),
        pw.Text(
          'This summary is generated from the shifts logged in the Tachyo driver app for the period shown. '
          'It is not a payslip. Your employer\'s payroll is the final record of what you are paid, '
          'including tax, National Insurance and any adjustments.',
          style: const pw.TextStyle(fontSize: 8, color: grey, lineSpacing: 2),
        ),
      ],
    ),
  );

  final fileDate = DateFormat('yyyy-MM-dd');
  await Printing.sharePdf(
    bytes: await doc.save(),
    filename: 'tachyo-earnings-${fileDate.format(start)}_${fileDate.format(end)}.pdf',
  );
}
