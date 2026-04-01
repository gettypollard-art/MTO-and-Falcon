import 'dart:convert';

enum UserRole { handler, manager }

enum FalconBehavior { perch, baitAway, baitToward }

enum SessionEventType {
  starling,
  flyingStart,
  flyingEnd,
  reward,
  pursuit,
  alert,
}

enum RewardSize { small, medium, large, pickUpPiece }

enum WingbeatQuality { strong, normal, weak }

enum PursuitOutcome { kill, chase, ignore, no }

enum FalconDistanceFromHandler { inView, outOfSight }

enum DesiredWeightTrend { higher, same, lower }

enum BoundaryClass { inside, perimeter, outside, unknown }

class SupportQuestion {
  SupportQuestion({
    required this.id,
    required this.handlerId,
    required this.questionText,
    required this.askedAt,
    this.answeredAt,
    this.answerText,
  });

  final String id;
  final String handlerId;
  final String questionText;
  final DateTime askedAt;
  final DateTime? answeredAt;
  final String? answerText;

  bool get isAnswered => answeredAt != null;

  SupportQuestion copyWith({DateTime? answeredAt, String? answerText}) {
    return SupportQuestion(
      id: id,
      handlerId: handlerId,
      questionText: questionText,
      askedAt: askedAt,
      answeredAt: answeredAt ?? this.answeredAt,
      answerText: answerText ?? this.answerText,
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'handlerId': handlerId,
    'questionText': questionText,
    'askedAt': askedAt.toIso8601String(),
    'answeredAt': answeredAt?.toIso8601String(),
    'answerText': answerText,
  };

  factory SupportQuestion.fromJson(Map<String, dynamic> json) =>
      SupportQuestion(
        id: json['id'] as String,
        handlerId: json['handlerId'] as String,
        questionText: json['questionText'] as String,
        askedAt: DateTime.parse(json['askedAt'] as String),
        answeredAt: (json['answeredAt'] as String?) == null
            ? null
            : DateTime.parse(json['answeredAt'] as String),
        answerText: json['answerText'] as String?,
      );
}

class AdminQuestion {
  AdminQuestion({
    required this.id,
    required this.handlerId,
    required this.questionText,
    required this.askedAt,
    this.answeredAt,
    this.answerText,
  });

  final String id;
  final String handlerId;
  final String questionText;
  final DateTime askedAt;
  final DateTime? answeredAt;
  final String? answerText;

  bool get isAnswered => answeredAt != null;

  AdminQuestion copyWith({DateTime? answeredAt, String? answerText}) {
    return AdminQuestion(
      id: id,
      handlerId: handlerId,
      questionText: questionText,
      askedAt: askedAt,
      answeredAt: answeredAt ?? this.answeredAt,
      answerText: answerText ?? this.answerText,
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'handlerId': handlerId,
    'questionText': questionText,
    'askedAt': askedAt.toIso8601String(),
    'answeredAt': answeredAt?.toIso8601String(),
    'answerText': answerText,
  };

  factory AdminQuestion.fromJson(Map<String, dynamic> json) => AdminQuestion(
    id: json['id'] as String,
    handlerId: json['handlerId'] as String,
    questionText: json['questionText'] as String,
    askedAt: DateTime.parse(json['askedAt'] as String),
    answeredAt: (json['answeredAt'] as String?) == null
        ? null
        : DateTime.parse(json['answeredAt'] as String),
    answerText: json['answerText'] as String?,
  );
}

class CustomerInputEntry {
  CustomerInputEntry({
    required this.id,
    required this.handlerId,
    required this.transcript,
    required this.createdAt,
  });

  final String id;
  final String handlerId;
  final String transcript;
  final DateTime createdAt;

  Map<String, dynamic> toJson() => {
    'id': id,
    'handlerId': handlerId,
    'transcript': transcript,
    'createdAt': createdAt.toIso8601String(),
  };

  factory CustomerInputEntry.fromJson(Map<String, dynamic> json) =>
      CustomerInputEntry(
        id: json['id'] as String,
        handlerId: json['handlerId'] as String,
        transcript: json['transcript'] as String,
        createdAt: DateTime.parse(json['createdAt'] as String),
      );
}

class SupplementalFeedEntry {
  SupplementalFeedEntry({
    required this.id,
    required this.handlerId,
    required this.falconId,
    required this.grams,
    required this.at,
  });

  final String id;
  final String handlerId;
  final String falconId;
  final double grams;
  final DateTime at;

  Map<String, dynamic> toJson() => {
    'id': id,
    'handlerId': handlerId,
    'falconId': falconId,
    'grams': grams,
    'at': at.toIso8601String(),
  };

  factory SupplementalFeedEntry.fromJson(Map<String, dynamic> json) =>
      SupplementalFeedEntry(
        id: json['id'] as String,
        handlerId: json['handlerId'] as String,
        falconId: json['falconId'] as String,
        grams: (json['grams'] as num).toDouble(),
        at: DateTime.parse(json['at'] as String),
      );
}

class PatrolWithoutFalconEntry {
  PatrolWithoutFalconEntry({
    required this.id,
    required this.handlerId,
    required this.startAt,
    this.endAt,
    this.synced = false,
  });

  final String id;
  final String handlerId;
  final DateTime startAt;
  final DateTime? endAt;
  final bool synced;

  PatrolWithoutFalconEntry copyWith({DateTime? endAt, bool? synced}) {
    return PatrolWithoutFalconEntry(
      id: id,
      handlerId: handlerId,
      startAt: startAt,
      endAt: endAt ?? this.endAt,
      synced: synced ?? this.synced,
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'handlerId': handlerId,
    'startAt': startAt.toIso8601String(),
    'endAt': endAt?.toIso8601String(),
    'synced': synced,
  };

  factory PatrolWithoutFalconEntry.fromJson(Map<String, dynamic> json) =>
      PatrolWithoutFalconEntry(
        id: json['id'] as String,
        handlerId: json['handlerId'] as String,
        startAt: DateTime.parse(json['startAt'] as String),
        endAt: (json['endAt'] as String?) == null
            ? null
            : DateTime.parse(json['endAt'] as String),
        synced: json['synced'] as bool? ?? false,
      );
}

class HandlerUser {
  HandlerUser({
    required this.id,
    required this.name,
    required this.pin,
    required this.role,
  });

  final String id;
  final String name;
  final String pin;
  final UserRole role;

  Map<String, dynamic> toJson() => {
    'id': id,
    'name': name,
    'pin': pin,
    'role': role.name,
  };

  factory HandlerUser.fromJson(Map<String, dynamic> json) => HandlerUser(
    id: json['id'] as String,
    name: json['name'] as String,
    pin: json['pin'] as String,
    role: _enumFromName(
      UserRole.values,
      json['role'] as String,
      UserRole.handler,
    ),
  );
}

class FalconProfile {
  FalconProfile({required this.id, required this.name, required this.tag});

  final String id;
  final String name;
  final String tag;

  Map<String, dynamic> toJson() => {'id': id, 'name': name, 'tag': tag};

  factory FalconProfile.fromJson(Map<String, dynamic> json) => FalconProfile(
    id: json['id'] as String,
    name: json['name'] as String,
    tag: json['tag'] as String,
  );
}

class GeoPoint {
  GeoPoint({required this.lat, required this.lng});

  final double lat;
  final double lng;

  Map<String, dynamic> toJson() => {'lat': lat, 'lng': lng};

  factory GeoPoint.fromJson(Map<String, dynamic> json) => GeoPoint(
    lat: (json['lat'] as num).toDouble(),
    lng: (json['lng'] as num).toDouble(),
  );
}

class FieldBoundary {
  FieldBoundary({
    required this.id,
    required this.name,
    required this.polygon,
    required this.perimeterMeters,
  });

  final String id;
  final String name;
  final List<GeoPoint> polygon;
  final double perimeterMeters;

  Map<String, dynamic> toJson() => {
    'id': id,
    'name': name,
    'polygon': polygon.map((p) => p.toJson()).toList(),
    'perimeterMeters': perimeterMeters,
  };

  factory FieldBoundary.fromJson(Map<String, dynamic> json) => FieldBoundary(
    id: json['id'] as String,
    name: json['name'] as String,
    polygon: (json['polygon'] as List<dynamic>)
        .map((item) => GeoPoint.fromJson(item as Map<String, dynamic>))
        .toList(),
    perimeterMeters: (json['perimeterMeters'] as num).toDouble(),
  );
}

class AdminSettings {
  AdminSettings({
    required this.feedSuggestionMinG,
    required this.feedSuggestionMaxG,
    required this.rewardSmallG,
    required this.rewardMediumG,
    required this.rewardLargeG,
    required this.rewardPickUpPieceG,
    required this.starlingQuickCounts,
  });

  final int feedSuggestionMinG;
  final int feedSuggestionMaxG;
  final int rewardSmallG;
  final int rewardMediumG;
  final int rewardLargeG;
  final int rewardPickUpPieceG;
  final List<int> starlingQuickCounts;

  int gramsForReward(RewardSize size) {
    switch (size) {
      case RewardSize.small:
        return rewardSmallG;
      case RewardSize.medium:
        return rewardMediumG;
      case RewardSize.large:
        return rewardLargeG;
      case RewardSize.pickUpPiece:
        return rewardPickUpPieceG;
    }
  }

  Map<String, dynamic> toJson() => {
    'feedSuggestionMinG': feedSuggestionMinG,
    'feedSuggestionMaxG': feedSuggestionMaxG,
    'rewardSmallG': rewardSmallG,
    'rewardMediumG': rewardMediumG,
    'rewardLargeG': rewardLargeG,
    'rewardPickUpPieceG': rewardPickUpPieceG,
    'starlingQuickCounts': starlingQuickCounts,
  };

  factory AdminSettings.fromJson(Map<String, dynamic> json) => AdminSettings(
    feedSuggestionMinG: json['feedSuggestionMinG'] as int,
    feedSuggestionMaxG: json['feedSuggestionMaxG'] as int,
    rewardSmallG: json['rewardSmallG'] as int,
    rewardMediumG: json['rewardMediumG'] as int,
    rewardLargeG: json['rewardLargeG'] as int,
    rewardPickUpPieceG: json['rewardPickUpPieceG'] as int? ?? 0,
    starlingQuickCounts: (json['starlingQuickCounts'] as List<dynamic>)
        .map((item) => item as int)
        .toList(),
  );
}

class SessionEvent {
  SessionEvent({
    required this.id,
    required this.type,
    required this.at,
    this.lat,
    this.lng,
    this.starlingCount,
    this.boundaryClass,
    this.rewardSize,
    this.rewardG,
    this.wingbeat,
    this.pursuitIntensity,
    this.outcome,
    this.distanceFromHandler,
    this.note,
  });

  final String id;
  final SessionEventType type;
  final DateTime at;
  final double? lat;
  final double? lng;
  final int? starlingCount;
  final BoundaryClass? boundaryClass;
  final RewardSize? rewardSize;
  final int? rewardG;
  final WingbeatQuality? wingbeat;
  final int? pursuitIntensity;
  final PursuitOutcome? outcome;
  final FalconDistanceFromHandler? distanceFromHandler;
  final String? note;

  Map<String, dynamic> toJson() => {
    'id': id,
    'type': type.name,
    'at': at.toIso8601String(),
    'lat': lat,
    'lng': lng,
    'starlingCount': starlingCount,
    'boundaryClass': boundaryClass?.name,
    'rewardSize': rewardSize?.name,
    'rewardG': rewardG,
    'wingbeat': wingbeat?.name,
    'pursuitIntensity': pursuitIntensity,
    'outcome': outcome?.name,
    'distanceFromHandler': distanceFromHandler?.name,
    'note': note,
  };

  factory SessionEvent.fromJson(Map<String, dynamic> json) => SessionEvent(
    id: json['id'] as String,
    type: _enumFromName(
      SessionEventType.values,
      json['type'] as String,
      SessionEventType.starling,
    ),
    at: DateTime.parse(json['at'] as String),
    lat: (json['lat'] as num?)?.toDouble(),
    lng: (json['lng'] as num?)?.toDouble(),
    starlingCount: json['starlingCount'] as int?,
    boundaryClass: _enumFromNullableName(
      BoundaryClass.values,
      json['boundaryClass'] as String?,
    ),
    rewardSize: _enumFromNullableName(
      RewardSize.values,
      json['rewardSize'] as String?,
    ),
    rewardG: json['rewardG'] as int?,
    wingbeat: _enumFromNullableName(
      WingbeatQuality.values,
      json['wingbeat'] as String?,
    ),
    pursuitIntensity: json['pursuitIntensity'] as int?,
    outcome: _enumFromNullableName(
      PursuitOutcome.values,
      json['outcome'] as String?,
    ),
    distanceFromHandler: _enumFromNullableName(
      FalconDistanceFromHandler.values,
      json['distanceFromHandler'] as String?,
    ),
    note: json['note'] as String?,
  );
}

class SessionRecord {
  SessionRecord({
    required this.id,
    required this.handlerId,
    required this.falconId,
    required this.fieldId,
    required this.startAt,
    required this.preFlightBehavior,
    required this.falconWeightG,
    required this.plannedFoodG,
    required this.telemetryWorking,
    this.smallTidbitG,
    this.largeTidbitG,
    this.pickupPieceG,
    this.localWeather = const [],
    this.endAt,
    this.maxAltitudeFt,
    this.maxDistanceFromHandlerMiles,
    this.totalDistanceFlownMiles,
    this.maxSpeedMph,
    this.desiredWeight,
    this.keptStarlingsOut,
    this.starlingsSeenInsideBoundary,
    this.voiceTranscript,
    this.alert50Triggered = false,
    this.synced = false,
    this.events = const [],
  });

  final String id;
  final String handlerId;
  final String falconId;
  final String fieldId;
  final DateTime startAt;
  final FalconBehavior preFlightBehavior;
  final double falconWeightG;
  final int plannedFoodG;
  final bool telemetryWorking;
  final int? smallTidbitG;
  final int? largeTidbitG;
  final int? pickupPieceG;
  final List<String> localWeather;

  final DateTime? endAt;
  final double? maxAltitudeFt;
  final double? maxDistanceFromHandlerMiles;
  final double? totalDistanceFlownMiles;
  final double? maxSpeedMph;
  final DesiredWeightTrend? desiredWeight;
  final bool? keptStarlingsOut;
  final bool? starlingsSeenInsideBoundary;
  final String? voiceTranscript;

  final bool alert50Triggered;
  final bool synced;
  final List<SessionEvent> events;

  SessionRecord copyWith({
    DateTime? endAt,
    double? maxAltitudeFt,
    double? maxDistanceFromHandlerMiles,
    double? totalDistanceFlownMiles,
    double? maxSpeedMph,
    DesiredWeightTrend? desiredWeight,
    bool? keptStarlingsOut,
    bool? starlingsSeenInsideBoundary,
    String? voiceTranscript,
    List<String>? localWeather,
    bool? alert50Triggered,
    bool? synced,
    List<SessionEvent>? events,
  }) {
    return SessionRecord(
      id: id,
      handlerId: handlerId,
      falconId: falconId,
      fieldId: fieldId,
      startAt: startAt,
      preFlightBehavior: preFlightBehavior,
      falconWeightG: falconWeightG,
      plannedFoodG: plannedFoodG,
      telemetryWorking: telemetryWorking,
      smallTidbitG: smallTidbitG,
      largeTidbitG: largeTidbitG,
      pickupPieceG: pickupPieceG,
      localWeather: localWeather ?? this.localWeather,
      endAt: endAt ?? this.endAt,
      maxAltitudeFt: maxAltitudeFt ?? this.maxAltitudeFt,
      maxDistanceFromHandlerMiles:
          maxDistanceFromHandlerMiles ?? this.maxDistanceFromHandlerMiles,
      totalDistanceFlownMiles:
          totalDistanceFlownMiles ?? this.totalDistanceFlownMiles,
      maxSpeedMph: maxSpeedMph ?? this.maxSpeedMph,
      desiredWeight: desiredWeight ?? this.desiredWeight,
      keptStarlingsOut: keptStarlingsOut ?? this.keptStarlingsOut,
      starlingsSeenInsideBoundary:
          starlingsSeenInsideBoundary ?? this.starlingsSeenInsideBoundary,
      voiceTranscript: voiceTranscript ?? this.voiceTranscript,
      alert50Triggered: alert50Triggered ?? this.alert50Triggered,
      synced: synced ?? this.synced,
      events: events ?? this.events,
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'handlerId': handlerId,
    'falconId': falconId,
    'fieldId': fieldId,
    'startAt': startAt.toIso8601String(),
    'preFlightBehavior': preFlightBehavior.name,
    'falconWeightG': falconWeightG,
    'plannedFoodG': plannedFoodG,
    'telemetryWorking': telemetryWorking,
    'smallTidbitG': smallTidbitG,
    'largeTidbitG': largeTidbitG,
    'pickupPieceG': pickupPieceG,
    'localWeather': localWeather,
    'endAt': endAt?.toIso8601String(),
    'maxAltitudeFt': maxAltitudeFt,
    'maxDistanceFromHandlerMiles': maxDistanceFromHandlerMiles,
    'totalDistanceFlownMiles': totalDistanceFlownMiles,
    'maxSpeedMph': maxSpeedMph,
    'desiredWeight': desiredWeight?.name,
    'keptStarlingsOut': keptStarlingsOut,
    'starlingsSeenInsideBoundary': starlingsSeenInsideBoundary,
    'voiceTranscript': voiceTranscript,
    'alert50Triggered': alert50Triggered,
    'synced': synced,
    'events': events.map((item) => item.toJson()).toList(),
  };

  factory SessionRecord.fromJson(Map<String, dynamic> json) => SessionRecord(
    id: json['id'] as String,
    handlerId: json['handlerId'] as String,
    falconId: json['falconId'] as String,
    fieldId: json['fieldId'] as String,
    startAt: DateTime.parse(json['startAt'] as String),
    preFlightBehavior: _enumFromName(
      FalconBehavior.values,
      json['preFlightBehavior'] as String,
      FalconBehavior.perch,
    ),
    falconWeightG: (json['falconWeightG'] as num).toDouble(),
    plannedFoodG: json['plannedFoodG'] as int,
    telemetryWorking: json['telemetryWorking'] as bool,
    smallTidbitG: json['smallTidbitG'] as int?,
    largeTidbitG: json['largeTidbitG'] as int?,
    pickupPieceG: json['pickupPieceG'] as int?,
    localWeather:
        (json['localWeather'] as List<dynamic>?)
            ?.map((item) => item as String)
            .toList() ??
        const [],
    endAt: (json['endAt'] as String?) == null
        ? null
        : DateTime.parse(json['endAt'] as String),
    maxAltitudeFt: (json['maxAltitudeFt'] as num?)?.toDouble(),
    maxDistanceFromHandlerMiles: (json['maxDistanceFromHandlerMiles'] as num?)
        ?.toDouble(),
    totalDistanceFlownMiles: (json['totalDistanceFlownMiles'] as num?)
        ?.toDouble(),
    maxSpeedMph: (json['maxSpeedMph'] as num?)?.toDouble(),
    desiredWeight: _enumFromNullableName(
      DesiredWeightTrend.values,
      json['desiredWeight'] as String?,
    ),
    keptStarlingsOut: json['keptStarlingsOut'] as bool?,
    starlingsSeenInsideBoundary: json['starlingsSeenInsideBoundary'] as bool?,
    voiceTranscript: json['voiceTranscript'] as String?,
    alert50Triggered: json['alert50Triggered'] as bool? ?? false,
    synced: json['synced'] as bool? ?? false,
    events: (json['events'] as List<dynamic>)
        .map((item) => SessionEvent.fromJson(item as Map<String, dynamic>))
        .toList(),
  );
}

class AppData {
  AppData({
    required this.handlers,
    required this.falcons,
    required this.fields,
    required this.settings,
    required this.sessions,
    required this.supportQuestions,
    required this.adminQuestions,
    required this.customerInputs,
    this.supplementalFeeds = const [],
    this.patrolWithoutFalconEntries = const [],
  });

  final List<HandlerUser> handlers;
  final List<FalconProfile> falcons;
  final List<FieldBoundary> fields;
  final AdminSettings settings;
  final List<SessionRecord> sessions;
  final List<SupportQuestion> supportQuestions;
  final List<AdminQuestion> adminQuestions;
  final List<CustomerInputEntry> customerInputs;
  final List<SupplementalFeedEntry> supplementalFeeds;
  final List<PatrolWithoutFalconEntry> patrolWithoutFalconEntries;

  AppData copyWith({
    List<HandlerUser>? handlers,
    List<FalconProfile>? falcons,
    List<FieldBoundary>? fields,
    AdminSettings? settings,
    List<SessionRecord>? sessions,
    List<SupportQuestion>? supportQuestions,
    List<AdminQuestion>? adminQuestions,
    List<CustomerInputEntry>? customerInputs,
    List<SupplementalFeedEntry>? supplementalFeeds,
    List<PatrolWithoutFalconEntry>? patrolWithoutFalconEntries,
  }) {
    return AppData(
      handlers: handlers ?? this.handlers,
      falcons: falcons ?? this.falcons,
      fields: fields ?? this.fields,
      settings: settings ?? this.settings,
      sessions: sessions ?? this.sessions,
      supportQuestions: supportQuestions ?? this.supportQuestions,
      adminQuestions: adminQuestions ?? this.adminQuestions,
      customerInputs: customerInputs ?? this.customerInputs,
      supplementalFeeds: supplementalFeeds ?? this.supplementalFeeds,
      patrolWithoutFalconEntries:
          patrolWithoutFalconEntries ?? this.patrolWithoutFalconEntries,
    );
  }

  Map<String, dynamic> toJson() => {
    'handlers': handlers.map((item) => item.toJson()).toList(),
    'falcons': falcons.map((item) => item.toJson()).toList(),
    'fields': fields.map((item) => item.toJson()).toList(),
    'settings': settings.toJson(),
    'sessions': sessions.map((item) => item.toJson()).toList(),
    'supportQuestions': supportQuestions.map((item) => item.toJson()).toList(),
    'adminQuestions': adminQuestions.map((item) => item.toJson()).toList(),
    'customerInputs': customerInputs.map((item) => item.toJson()).toList(),
    'supplementalFeeds': supplementalFeeds
        .map((item) => item.toJson())
        .toList(),
    'patrolWithoutFalconEntries': patrolWithoutFalconEntries
        .map((item) => item.toJson())
        .toList(),
  };

  factory AppData.fromJson(Map<String, dynamic> json) => AppData(
    handlers: (json['handlers'] as List<dynamic>)
        .map((item) => HandlerUser.fromJson(item as Map<String, dynamic>))
        .toList(),
    falcons: (json['falcons'] as List<dynamic>)
        .map((item) => FalconProfile.fromJson(item as Map<String, dynamic>))
        .toList(),
    fields: (json['fields'] as List<dynamic>)
        .map((item) => FieldBoundary.fromJson(item as Map<String, dynamic>))
        .toList(),
    settings: AdminSettings.fromJson(json['settings'] as Map<String, dynamic>),
    sessions: (json['sessions'] as List<dynamic>)
        .map((item) => SessionRecord.fromJson(item as Map<String, dynamic>))
        .toList(),
    supportQuestions:
        (json['supportQuestions'] as List<dynamic>?)
            ?.map(
              (item) => SupportQuestion.fromJson(item as Map<String, dynamic>),
            )
            .toList() ??
        const [],
    adminQuestions:
        (json['adminQuestions'] as List<dynamic>?)
            ?.map(
              (item) => AdminQuestion.fromJson(item as Map<String, dynamic>),
            )
            .toList() ??
        const [],
    customerInputs:
        (json['customerInputs'] as List<dynamic>?)
            ?.map(
              (item) =>
                  CustomerInputEntry.fromJson(item as Map<String, dynamic>),
            )
            .toList() ??
        const [],
    supplementalFeeds:
        (json['supplementalFeeds'] as List<dynamic>?)
            ?.map(
              (item) =>
                  SupplementalFeedEntry.fromJson(item as Map<String, dynamic>),
            )
            .toList() ??
        const [],
    patrolWithoutFalconEntries:
        (json['patrolWithoutFalconEntries'] as List<dynamic>?)
            ?.map(
              (item) => PatrolWithoutFalconEntry.fromJson(
                item as Map<String, dynamic>,
              ),
            )
            .toList() ??
        const [],
  );

  String toEncodedJson() => jsonEncode(toJson());

  factory AppData.fromEncodedJson(String raw) =>
      AppData.fromJson(jsonDecode(raw) as Map<String, dynamic>);
}

T _enumFromName<T extends Enum>(List<T> values, String name, T fallback) {
  for (final value in values) {
    if (value.name == name) {
      return value;
    }
  }
  return fallback;
}

T? _enumFromNullableName<T extends Enum>(List<T> values, String? name) {
  if (name == null) {
    return null;
  }
  for (final value in values) {
    if (value.name == name) {
      return value;
    }
  }
  return null;
}
