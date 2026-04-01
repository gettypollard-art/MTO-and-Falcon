import 'dart:math' as math;

import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_timezone/flutter_timezone.dart';
import 'package:geolocator/geolocator.dart';
import 'package:timezone/data/latest_all.dart' as tzdata;
import 'package:timezone/timezone.dart' as tz;

class SunriseAlarmPlan {
  SunriseAlarmPlan({
    required this.sunriseAt,
    required this.firstAlarmAt,
    required this.secondAlarmAt,
  });

  final DateTime sunriseAt;
  final DateTime firstAlarmAt;
  final DateTime secondAlarmAt;
}

class NotificationService {
  NotificationService._();

  static final NotificationService instance = NotificationService._();

  static const int _beforeBedReminderId = 8100;
  static const int _sunriseAlarmOneId = 8101;
  static const int _sunriseAlarmTwoId = 8102;
  static const String beforeBedPayload = 'before_bed';

  final FlutterLocalNotificationsPlugin _notifications =
      FlutterLocalNotificationsPlugin();
  bool _initialized = false;

  Future<void> initialize({
    required void Function(String? payload) onTapNotification,
  }) async {
    if (_initialized) {
      return;
    }

    tzdata.initializeTimeZones();
    try {
      final timezoneName = await FlutterTimezone.getLocalTimezone();
      tz.setLocalLocation(tz.getLocation(timezoneName));
    } catch (_) {
      tz.setLocalLocation(tz.local);
    }

    const initSettings = InitializationSettings(
      iOS: DarwinInitializationSettings(),
      android: AndroidInitializationSettings('@mipmap/ic_launcher'),
    );

    await _notifications.initialize(
      initSettings,
      onDidReceiveNotificationResponse: (response) {
        onTapNotification(response.payload);
      },
    );

    final ios = _notifications
        .resolvePlatformSpecificImplementation<
          IOSFlutterLocalNotificationsPlugin
        >();
    await ios?.requestPermissions(alert: true, badge: true, sound: true);

    _initialized = true;
  }

  Future<void> scheduleDailyBeforeBedPrompt() async {
    await _notifications.zonedSchedule(
      _beforeBedReminderId,
      'Before Bed',
      'Complete your Before Bed checklist now.',
      _next8Pm(),
      _defaultDetails(),
      payload: beforeBedPayload,
      matchDateTimeComponents: DateTimeComponents.time,
      androidScheduleMode: AndroidScheduleMode.exactAllowWhileIdle,
    );
  }

  Future<SunriseAlarmPlan> scheduleSunriseAlarmsForNextFlightMorning() async {
    final position = await _resolvePosition();
    if (position == null) {
      throw StateError('Location is required to calculate sunrise alarms.');
    }

    final now = DateTime.now();
    final sunrise = _nextSunriseAfter(
      after: now,
      lat: position.latitude,
      lng: position.longitude,
    );
    if (sunrise == null) {
      throw StateError('Could not calculate sunrise for this location.');
    }

    final firstAlarm = sunrise.subtract(const Duration(hours: 1));
    final secondAlarm = sunrise.subtract(const Duration(minutes: 50));

    if (!firstAlarm.isAfter(now) || !secondAlarm.isAfter(now)) {
      throw StateError('Calculated alarm times are in the past.');
    }

    await _notifications.cancel(_sunriseAlarmOneId);
    await _notifications.cancel(_sunriseAlarmTwoId);

    await _notifications.zonedSchedule(
      _sunriseAlarmOneId,
      'Falcon Alarm 1',
      'One hour before sunrise.',
      tz.TZDateTime.from(firstAlarm, tz.local),
      _defaultDetails(),
      payload: 'sunrise_alarm_1',
      androidScheduleMode: AndroidScheduleMode.exactAllowWhileIdle,
    );

    await _notifications.zonedSchedule(
      _sunriseAlarmTwoId,
      'Falcon Alarm 2',
      '50 minutes before sunrise.',
      tz.TZDateTime.from(secondAlarm, tz.local),
      _defaultDetails(),
      payload: 'sunrise_alarm_2',
      androidScheduleMode: AndroidScheduleMode.exactAllowWhileIdle,
    );

    return SunriseAlarmPlan(
      sunriseAt: sunrise,
      firstAlarmAt: firstAlarm,
      secondAlarmAt: secondAlarm,
    );
  }

  NotificationDetails _defaultDetails() {
    const ios = DarwinNotificationDetails(presentSound: true);
    const android = AndroidNotificationDetails(
      'falcon_ops',
      'Falcon Operations',
      channelDescription: 'Flight operations reminders and alarms.',
      importance: Importance.max,
      priority: Priority.high,
    );
    return const NotificationDetails(iOS: ios, android: android);
  }

  tz.TZDateTime _next8Pm() {
    final now = tz.TZDateTime.now(tz.local);
    var scheduled = tz.TZDateTime(tz.local, now.year, now.month, now.day, 20);
    if (!scheduled.isAfter(now)) {
      scheduled = scheduled.add(const Duration(days: 1));
    }
    return scheduled;
  }

  Future<Position?> _resolvePosition() async {
    final serviceEnabled = await Geolocator.isLocationServiceEnabled();
    if (!serviceEnabled) {
      return null;
    }

    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }

    if (permission == LocationPermission.denied ||
        permission == LocationPermission.deniedForever) {
      return null;
    }

    return Geolocator.getCurrentPosition(
      locationSettings: const LocationSettings(
        accuracy: LocationAccuracy.medium,
      ),
    );
  }

  DateTime? _nextSunriseAfter({
    required DateTime after,
    required double lat,
    required double lng,
  }) {
    for (var dayOffset = 0; dayOffset < 5; dayOffset++) {
      final day = DateTime(
        after.year,
        after.month,
        after.day,
      ).add(Duration(days: dayOffset));
      final sunrise = _calculateSunriseLocal(day: day, lat: lat, lng: lng);
      if (sunrise != null && sunrise.isAfter(after)) {
        return sunrise;
      }
    }
    return null;
  }

  DateTime? _calculateSunriseLocal({
    required DateTime day,
    required double lat,
    required double lng,
  }) {
    const zenith = 90.833;
    final dayOfYear =
        DateTime(
          day.year,
          day.month,
          day.day,
        ).difference(DateTime(day.year, 1, 1)).inDays +
        1;
    final lngHour = lng / 15.0;
    final t = dayOfYear + ((6 - lngHour) / 24);

    final m = (0.9856 * t) - 3.289;
    final l = _normalizeDegrees(
      m + (1.916 * _sinDeg(m)) + (0.020 * _sinDeg(2 * m)) + 282.634,
    );
    var ra = _normalizeDegrees(_radToDeg(math.atan(0.91764 * _tanDeg(l))));

    final lQuadrant = (l / 90).floor() * 90;
    final raQuadrant = (ra / 90).floor() * 90;
    ra = (ra + (lQuadrant - raQuadrant)) / 15;

    final sinDec = 0.39782 * _sinDeg(l);
    final cosDec = math.cos(math.asin(sinDec));
    final cosH =
        (_cosDeg(zenith) - (sinDec * _sinDeg(lat))) / (cosDec * _cosDeg(lat));

    if (cosH > 1 || cosH < -1) {
      return null;
    }

    var h = 360 - _radToDeg(math.acos(cosH));
    h = h / 15;

    final tLocal = h + ra - (0.06571 * t) - 6.622;
    final ut = _normalizeHours(tLocal - lngHour);
    final minutes = (ut * 60).round();
    final utcSunrise = DateTime.utc(
      day.year,
      day.month,
      day.day,
    ).add(Duration(minutes: minutes));
    return utcSunrise.toLocal();
  }

  double _normalizeDegrees(double value) {
    var normalized = value % 360;
    if (normalized < 0) {
      normalized += 360;
    }
    return normalized;
  }

  double _normalizeHours(double value) {
    var normalized = value % 24;
    if (normalized < 0) {
      normalized += 24;
    }
    return normalized;
  }

  double _sinDeg(double degrees) => math.sin(_degToRad(degrees));
  double _cosDeg(double degrees) => math.cos(_degToRad(degrees));
  double _tanDeg(double degrees) => math.tan(_degToRad(degrees));
  double _degToRad(double degrees) => degrees * math.pi / 180.0;
  double _radToDeg(double radians) => radians * 180.0 / math.pi;
}
