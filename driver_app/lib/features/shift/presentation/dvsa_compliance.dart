import 'package:flutter/material.dart';

// ============================================================
// DVSA Drivers' Hours & Road Transport Working Time compliance engine.
//
// Numbers below are the assimilated (retained-EU) drivers' hours rules
// enforced by DVSA for HGV drivers over 3.5t under an Operator Licence
// (Regulation (EC) 561/2006 as retained in GB law), plus the Road
// Transport (Working Time) Regulations 2005:
//
//   Daily driving   : 9h, extendable to 10h on at most 2 days a week
//   Weekly driving   : 56h (fixed week Mon 00:00 – Sun 24:00)
//   Fortnightly      : 90h over any 2 consecutive fixed weeks
//   Break            : 45 min after at most 4h30 continuous driving
//                       (or 15 min + 30 min split, in that order)
//   Daily rest       : 11h, reducible to 9h — at most 3 times between
//                       weekly rests
//   Weekly rest      : 45h, reducible to 24h — a reduction must be
//                       compensated by an equivalent block of rest
//                       before the end of the 3rd following week
//   Working time     : average 48h/week over the reference period,
//                       60h absolute maximum in any single week;
//                       10h max in any 24h period if night work is done
//
// Source: gov.uk "Drivers' hours: goods vehicles" (assimilated/AETR
// rules) and "Road Transport (Working Time) Regulations 2005" guidance.
//
// Every figure here is derived the same way the rest of this app's
// duty/driving numbers already are — GPS telemetry (speed + timestamps)
// and the shift record's own logged times — NOT a certified tachograph
// record. This is a monitoring/advisory tool for the driver and their
// transport manager, not a legal compliance certificate; DVSA roadside
// checks and audits use the vehicle's actual tachograph.
// ============================================================

const int dailyDrivingLimitMin = 9 * 60; // 540
const int dailyDrivingExtendedMin = 10 * 60; // 600
const int maxExtensionsPerWeek = 2;

const int weeklyDrivingLimitMin = 56 * 60; // 3360
const int fortnightlyDrivingLimitMin = 90 * 60; // 5400

const int continuousDrivingBreakTriggerMin = 270; // 4h30
const int requiredBreakMin = 45;

const int dailyRestRegularMin = 11 * 60; // 660
const int dailyRestReducedMin = 9 * 60; // 540
const int maxReducedRestsPerWeek = 3;

const int weeklyRestRegularMin = 45 * 60; // 2700
const int weeklyRestReducedMin = 24 * 60; // 1440
const int weeklyRestCompensationWeeks = 3;

const int wtdWeeklyAbsoluteMaxMin = 60 * 60; // 3600
const int wtdWeeklyAverageMin = 48 * 60; // 2880 — checked over a 17/26-week reference period, not shown as a single-week figure here

enum DailyDrivingStatus { withinLimit, extended, breach }

enum RestStatus { regular, reduced, breach, unknown }

class DvsaDayStatus {
  final DateTime day;
  final double drivingMinutes;
  final double workingMinutes;
  final DailyDrivingStatus drivingStatus;
  final bool canExtendToday;
  final double? restBeforeMinutes;
  final RestStatus restStatus;
  final bool breakSatisfied;
  const DvsaDayStatus({
    required this.day,
    required this.drivingMinutes,
    required this.workingMinutes,
    required this.drivingStatus,
    required this.canExtendToday,
    required this.restBeforeMinutes,
    required this.restStatus,
    required this.breakSatisfied,
  });
}

class DvsaWeekSummary {
  final DateTime weekStart; // Monday 00:00
  final double drivingMinutes;
  final double workingMinutes;
  final int extensionsUsed;
  final int reducedRestsUsed;
  final RestStatus weeklyRestStatus;
  final double? weeklyRestMinutes;
  const DvsaWeekSummary({
    required this.weekStart,
    required this.drivingMinutes,
    required this.workingMinutes,
    required this.extensionsUsed,
    required this.reducedRestsUsed,
    required this.weeklyRestStatus,
    required this.weeklyRestMinutes,
  });

  bool get weeklyDrivingBreach => drivingMinutes > weeklyDrivingLimitMin;
  bool get weeklyWorkingBreach => workingMinutes > wtdWeeklyAbsoluteMaxMin;
}

class DvsaResult {
  final List<DvsaDayStatus> days; // oldest first
  final DvsaWeekSummary thisWeek;
  final DvsaWeekSummary? lastWeek;
  final double fortnightDrivingMinutes;
  final bool fortnightBreach;
  const DvsaResult({
    required this.days,
    required this.thisWeek,
    required this.lastWeek,
    required this.fortnightDrivingMinutes,
    required this.fortnightBreach,
  });
}

DateTime _mondayOf(DateTime d) {
  final dayOnly = DateTime(d.year, d.month, d.day);
  return dayOnly.subtract(Duration(days: dayOnly.weekday - 1));
}

double _minutesBetween(DateTime a, DateTime b) => b.difference(a).inSeconds / 60.0;

/// One shift's already-computed driving/working minutes, plus its own
/// start/end — the engine only needs this much, not the raw GPS pings
/// (those are reduced to drivingMinutes by the caller, reusing the same
/// telemetry classification the simple Hours table already uses).
class ShiftHoursInput {
  final DateTime start;
  final DateTime? end;
  final double drivingMinutes;
  final double workingMinutes;
  final double longestContinuousDrivingMinutes;
  const ShiftHoursInput({
    required this.start,
    required this.end,
    required this.drivingMinutes,
    required this.workingMinutes,
    required this.longestContinuousDrivingMinutes,
  });
}

/// Computes DVSA compliance for the week containing `now` and the week
/// before it, from a list of shifts that should cover at least those two
/// weeks (the caller fetches a rolling ~15-day window so this is right
/// regardless of whatever date range the driver has the calendar set
/// to — regulatory standing is about now, not a browsed history range).
DvsaResult computeDvsaCompliance(List<ShiftHoursInput> shifts, DateTime now) {
  final sorted = [...shifts]..sort((a, b) => a.start.compareTo(b.start));
  final thisMonday = _mondayOf(now);
  final lastMonday = thisMonday.subtract(const Duration(days: 7));

  // ── Per-day totals within the two-week window ────────────────────
  final byDay = <DateTime, List<ShiftHoursInput>>{};
  for (final s in sorted) {
    if (s.start.isBefore(lastMonday)) continue;
    final key = DateTime(s.start.year, s.start.month, s.start.day);
    (byDay[key] ??= []).add(s);
  }

  // ── Rest between consecutive shifts, and per-week reduced-rest count ──
  final restBeforeByShiftStart = <DateTime, double?>{};
  for (var i = 0; i < sorted.length; i++) {
    if (i == 0) {
      restBeforeByShiftStart[sorted[i].start] = null;
      continue;
    }
    final prevEnd = sorted[i - 1].end;
    if (prevEnd == null) {
      restBeforeByShiftStart[sorted[i].start] = null;
      continue;
    }
    restBeforeByShiftStart[sorted[i].start] = _minutesBetween(prevEnd, sorted[i].start);
  }

  RestStatus restStatusFor(double? minutes) {
    if (minutes == null) return RestStatus.unknown;
    if (minutes >= dailyRestRegularMin) return RestStatus.regular;
    if (minutes >= dailyRestReducedMin) return RestStatus.reduced;
    return RestStatus.breach;
  }

  DvsaWeekSummary summariseWeek(DateTime weekStart) {
    final weekEnd = weekStart.add(const Duration(days: 7));
    final weekShifts = sorted.where((s) => !s.start.isBefore(weekStart) && s.start.isBefore(weekEnd)).toList();
    final drivingMinutes = weekShifts.fold(0.0, (sum, s) => sum + s.drivingMinutes);
    final workingMinutes = weekShifts.fold(0.0, (sum, s) => sum + s.workingMinutes);

    // Extensions used: count each CALENDAR DAY in the week (not each
    // shift) whose total driving exceeds the plain 9h limit — the first
    // 2 such days are the allowed extensions, in chronological order;
    // any further one is a limit breach rather than a 3rd extension.
    final weekDays = <DateTime, double>{};
    for (final s in weekShifts) {
      final key = DateTime(s.start.year, s.start.month, s.start.day);
      weekDays[key] = (weekDays[key] ?? 0) + s.drivingMinutes;
    }
    final overNineDays = weekDays.entries.where((e) => e.value > dailyDrivingLimitMin).toList()
      ..sort((a, b) => a.key.compareTo(b.key));
    final extensionsUsed = overNineDays.length > maxExtensionsPerWeek ? maxExtensionsPerWeek : overNineDays.length;

    // Reduced daily rests used this week: a rest before any shift
    // starting in this week that fell in the 9–11h reduced band.
    final reducedRestsUsed = weekShifts
        .where((s) => restStatusFor(restBeforeByShiftStart[s.start]) == RestStatus.reduced)
        .length;

    // Weekly rest: the longest gap that starts inside this week (between
    // the end of a shift in this week and the start of the next one,
    // including one that starts after the week ends) — the standard
    // pattern is one long rest block taken at the end of the working
    // week. Undetermined ("unknown") rather than "breach" if the week
    // isn't over yet or there's no later shift to measure up to.
    double? longestGap;
    for (final s in weekShifts) {
      final end = s.end;
      if (end == null) continue;
      final next = sorted.where((o) => o.start.isAfter(end)).cast<ShiftHoursInput?>().fold<ShiftHoursInput?>(null, (best, o) {
        if (o == null) return best;
        if (best == null || o.start.isBefore(best.start)) return o;
        return best;
      });
      if (next == null) continue;
      final gap = _minutesBetween(end, next.start);
      if (longestGap == null || gap > longestGap!) longestGap = gap;
    }
    final weeklyRestStatus = longestGap == null
        ? RestStatus.unknown
        : longestGap! >= weeklyRestRegularMin
            ? RestStatus.regular
            : longestGap! >= weeklyRestReducedMin
                ? RestStatus.reduced
                : RestStatus.breach;

    return DvsaWeekSummary(
      weekStart: weekStart,
      drivingMinutes: drivingMinutes,
      workingMinutes: workingMinutes,
      extensionsUsed: extensionsUsed,
      reducedRestsUsed: reducedRestsUsed,
      weeklyRestStatus: longestGap == null ? RestStatus.unknown : weeklyRestStatus,
      weeklyRestMinutes: longestGap,
    );
  }

  final thisWeek = summariseWeek(thisMonday);
  final lastWeekHasData = sorted.any((s) => !s.start.isBefore(lastMonday) && s.start.isBefore(thisMonday));
  final lastWeek = lastWeekHasData ? summariseWeek(lastMonday) : null;
  final fortnightDriving = thisWeek.drivingMinutes + (lastWeek?.drivingMinutes ?? 0);

  // ── Per-day rows, oldest first ────────────────────────────────────
  final days = byDay.entries.map((entry) {
    final dayShifts = entry.value;
    final drivingMinutes = dayShifts.fold(0.0, (sum, s) => sum + s.drivingMinutes);
    final workingMinutes = dayShifts.fold(0.0, (sum, s) => sum + s.workingMinutes);
    final longestContinuous = dayShifts.fold(0.0, (m, s) => s.longestContinuousDrivingMinutes > m ? s.longestContinuousDrivingMinutes : m);

    final week = entry.key.isBefore(thisMonday) ? lastWeek : thisWeek;
    final status = drivingMinutes > dailyDrivingExtendedMin
        ? DailyDrivingStatus.breach
        : drivingMinutes > dailyDrivingLimitMin
            ? DailyDrivingStatus.extended
            : DailyDrivingStatus.withinLimit;

    // "Can extend today" looks at whether the week (as of today, i.e.
    // excluding days after this one) still has an extension free and
    // headroom under the 56h weekly cap for the extra hour.
    final extensionsUsedByToday = (week ?? thisWeek).extensionsUsed;
    final canExtend = status != DailyDrivingStatus.breach &&
        extensionsUsedByToday < maxExtensionsPerWeek &&
        ((week ?? thisWeek).drivingMinutes) <= weeklyDrivingLimitMin;

    // Rest before the first shift of the day.
    final firstShift = dayShifts.reduce((a, b) => a.start.isBefore(b.start) ? a : b);
    final restBefore = restBeforeByShiftStart[firstShift.start];

    return DvsaDayStatus(
      day: entry.key,
      drivingMinutes: drivingMinutes,
      workingMinutes: workingMinutes,
      drivingStatus: status,
      canExtendToday: canExtend,
      restBeforeMinutes: restBefore,
      restStatus: restStatusFor(restBefore),
      breakSatisfied: longestContinuous <= continuousDrivingBreakTriggerMin,
    );
  }).toList()
    ..sort((a, b) => a.day.compareTo(b.day));

  return DvsaResult(
    days: days,
    thisWeek: thisWeek,
    lastWeek: lastWeek,
    fortnightDrivingMinutes: fortnightDriving,
    fortnightBreach: fortnightDriving > fortnightlyDrivingLimitMin,
  );
}

String formatDvsaMinutes(double totalMinutes) {
  final m = totalMinutes.round().clamp(0, 1 << 30);
  final h = m ~/ 60;
  final mm = m % 60;
  if (h == 0) return '${mm}m';
  if (mm == 0) return '${h}h';
  return '${h}h ${mm}m';
}

const Color dvsaGreen = Color(0xFF10B981);
const Color dvsaAmber = Color(0xFFF59E0B);
const Color dvsaRed = Color(0xFFCC0000);
const Color dvsaMuted = Color(0xFF999999);

Color colorForDrivingStatus(DailyDrivingStatus s) {
  switch (s) {
    case DailyDrivingStatus.withinLimit:
      return dvsaGreen;
    case DailyDrivingStatus.extended:
      return dvsaAmber;
    case DailyDrivingStatus.breach:
      return dvsaRed;
  }
}

String labelForDrivingStatus(DailyDrivingStatus s) {
  switch (s) {
    case DailyDrivingStatus.withinLimit:
      return 'Within 9h';
    case DailyDrivingStatus.extended:
      return 'Extended (10h)';
    case DailyDrivingStatus.breach:
      return 'Over limit';
  }
}

Color colorForRestStatus(RestStatus s) {
  switch (s) {
    case RestStatus.regular:
      return dvsaGreen;
    case RestStatus.reduced:
      return dvsaAmber;
    case RestStatus.breach:
      return dvsaRed;
    case RestStatus.unknown:
      return dvsaMuted;
  }
}

String labelForRestStatus(RestStatus s) {
  switch (s) {
    case RestStatus.regular:
      return 'Regular rest';
    case RestStatus.reduced:
      return 'Reduced rest';
    case RestStatus.breach:
      return 'Rest breach';
    case RestStatus.unknown:
      return 'No data';
  }
}
