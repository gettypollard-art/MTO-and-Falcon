import 'dart:math';

import 'package:flutter/foundation.dart';
import 'package:geolocator/geolocator.dart';

import 'local_store.dart';
import 'models.dart';

class FeedComplianceAlert {
  FeedComplianceAlert({
    required this.falconId,
    required this.falconName,
    required this.requiredGrams,
    required this.actualGrams,
  });

  final String falconId;
  final String falconName;
  final double requiredGrams;
  final double actualGrams;
}

class SessionPostFlightInput {
  SessionPostFlightInput({
    required this.maxAltitudeFt,
    required this.maxDistanceFromHandlerMiles,
    required this.totalDistanceFlownMiles,
    required this.maxSpeedMph,
    required this.desiredWeight,
    required this.keptStarlingsOut,
    required this.starlingsSeenInsideBoundary,
    required this.voiceTranscript,
  });

  final double maxAltitudeFt;
  final double maxDistanceFromHandlerMiles;
  final double totalDistanceFlownMiles;
  final double maxSpeedMph;
  final DesiredWeightTrend desiredWeight;
  final bool keptStarlingsOut;
  final bool starlingsSeenInsideBoundary;
  final String voiceTranscript;
}

class PostReturnChecklist {
  PostReturnChecklist({
    required this.awaitingCompletion,
    required this.rewardLogged,
    required this.pursuitLogged,
  });

  final bool awaitingCompletion;
  final bool rewardLogged;
  final bool pursuitLogged;

  bool get isComplete => rewardLogged && pursuitLogged;
}

class FalconAppController extends ChangeNotifier {
  FalconAppController(this._store);

  final LocalStore _store;

  AppData? _data;
  HandlerUser? _currentUser;
  bool _loading = true;
  int _idCounter = 0;

  bool get isLoading => _loading;
  HandlerUser? get currentUser => _currentUser;
  bool get isLoggedIn => _currentUser != null;

  AppData get data => _data!;

  List<HandlerUser> get handlers => data.handlers;
  List<HandlerUser> get handlerUsers =>
      data.handlers.where((user) => user.role == UserRole.handler).toList();
  List<FalconProfile> get falcons => data.falcons;
  List<FieldBoundary> get fields => data.fields;
  AdminSettings get settings => data.settings;

  List<SessionRecord> get allSessions {
    final sessions = [...currentUserSessions];
    sessions.sort((a, b) => b.startAt.compareTo(a.startAt));
    return sessions;
  }

  List<SessionRecord> get currentUserSessions {
    if (_currentUser == null) {
      return const [];
    }
    final sessions = data.sessions
        .where((s) => s.handlerId == _currentUser!.id)
        .toList();
    sessions.sort((a, b) => b.startAt.compareTo(a.startAt));
    return sessions;
  }

  List<SupportQuestion> get currentUserQuestions {
    if (_currentUser == null) {
      return const [];
    }
    final questions = data.supportQuestions
        .where((q) => q.handlerId == _currentUser!.id)
        .toList();
    questions.sort((a, b) => b.askedAt.compareTo(a.askedAt));
    return questions;
  }

  List<AdminQuestion> get currentUserAdminQuestions {
    if (_currentUser == null) {
      return const [];
    }
    final questions = data.adminQuestions
        .where((q) => q.handlerId == _currentUser!.id)
        .toList();
    questions.sort((a, b) => b.askedAt.compareTo(a.askedAt));
    return questions;
  }

  List<AdminQuestion> get unresolvedAdminQuestionsForCurrentUser {
    return currentUserAdminQuestions.where((q) => !q.isAnswered).toList();
  }

  List<CustomerInputEntry> get currentUserCustomerInputs {
    if (_currentUser == null) {
      return const [];
    }
    final entries = data.customerInputs
        .where((e) => e.handlerId == _currentUser!.id)
        .toList();
    entries.sort((a, b) => b.createdAt.compareTo(a.createdAt));
    return entries;
  }

  List<PatrolWithoutFalconEntry> get currentUserPatrolWithoutFalconEntries {
    if (_currentUser == null) {
      return const [];
    }
    final entries = data.patrolWithoutFalconEntries
        .where((entry) => entry.handlerId == _currentUser!.id)
        .toList();
    entries.sort((a, b) => b.startAt.compareTo(a.startAt));
    return entries;
  }

  PatrolWithoutFalconEntry? get activePatrolWithoutFalcon {
    final entries = currentUserPatrolWithoutFalconEntries
        .where((entry) => entry.endAt == null)
        .toList();
    if (entries.isEmpty) {
      return null;
    }
    entries.sort((a, b) => b.startAt.compareTo(a.startAt));
    return entries.first;
  }

  SessionRecord? get activeSession {
    final sessions = currentUserSessions.where((s) => s.endAt == null).toList();
    if (sessions.isEmpty) {
      return null;
    }
    sessions.sort((a, b) => b.startAt.compareTo(a.startAt));
    return sessions.first;
  }

  int get unsyncedCount =>
      currentUserSessions.where((session) => !session.synced).length;

  Future<void> initialize() async {
    _loading = true;
    notifyListeners();

    _data = await _store.load();
    _currentUser = _defaultBuildUser();
    _loading = false;
    notifyListeners();
  }

  bool login({required String handlerId, required String pin}) {
    final user = data.handlers.firstWhere(
      (u) => u.id == handlerId,
      orElse: () =>
          HandlerUser(id: '', name: '', pin: '', role: UserRole.handler),
    );

    if (user.id.isEmpty || user.pin != pin) {
      return false;
    }

    _currentUser = user;
    notifyListeners();
    return true;
  }

  void logout() {
    _currentUser = _defaultBuildUser();
    notifyListeners();
  }

  void useDefaultUser() {
    _currentUser = _defaultBuildUser();
    notifyListeners();
  }

  void useDefaultAdmin() {
    _currentUser = _defaultBuildAdmin() ?? _defaultBuildUser();
    notifyListeners();
  }

  Future<SessionRecord> startSession({
    required String falconId,
    required String fieldId,
    required FalconBehavior behavior,
    required double falconWeightG,
    required int plannedFoodG,
    required bool telemetryWorking,
    int? smallTidbitG,
    int? largeTidbitG,
    int? pickupPieceG,
    List<String> localWeather = const [],
  }) async {
    final user = _currentUser;
    if (user == null) {
      throw StateError('No logged in user.');
    }

    if (activeSession != null) {
      throw StateError('An active session already exists for this handler.');
    }

    final session = SessionRecord(
      id: _newId('session'),
      handlerId: user.id,
      falconId: falconId,
      fieldId: fieldId,
      startAt: DateTime.now(),
      preFlightBehavior: behavior,
      falconWeightG: falconWeightG,
      plannedFoodG: plannedFoodG,
      telemetryWorking: telemetryWorking,
      smallTidbitG: smallTidbitG,
      largeTidbitG: largeTidbitG,
      pickupPieceG: pickupPieceG,
      localWeather: localWeather,
      synced: false,
      events: const [],
    );

    final updatedSessions = [...data.sessions, session];
    await _saveData(data.copyWith(sessions: updatedSessions));
    return session;
  }

  Future<void> addFlyingStart(String sessionId, {String? flightType}) async {
    final session = sessionById(sessionId);
    if (isFlying(session)) {
      throw StateError('Falcon is already marked as flying.');
    }
    final checklist = postReturnChecklist(session);
    if (checklist.awaitingCompletion && !checklist.rewardLogged) {
      throw StateError('Complete reward logging before starting flight again.');
    }
    await _appendEvent(
      sessionId,
      SessionEvent(
        id: _newId('evt'),
        type: SessionEventType.flyingStart,
        at: DateTime.now(),
        note: flightType,
      ),
    );
  }

  Future<void> addFlyingEnd(String sessionId) async {
    final session = sessionById(sessionId);
    if (!isFlying(session)) {
      throw StateError('Falcon is not currently marked as flying.');
    }
    await _appendEvent(
      sessionId,
      SessionEvent(
        id: _newId('evt'),
        type: SessionEventType.flyingEnd,
        at: DateTime.now(),
      ),
    );
  }

  Future<void> addReward(
    String sessionId,
    RewardSize size, {
    int? gramsOverride,
  }) async {
    final session = sessionById(sessionId);
    if (isFlying(session)) {
      throw StateError('Reward can only be logged after Falcon Returns.');
    }
    final checklist = postReturnChecklist(session);
    if (!checklist.awaitingCompletion) {
      throw StateError('No pending return is waiting for reward.');
    }
    if (checklist.rewardLogged) {
      throw StateError('Reward is already logged for this return.');
    }
    final grams = gramsOverride ?? settings.gramsForReward(size);
    await _appendEvent(
      sessionId,
      SessionEvent(
        id: _newId('evt'),
        type: SessionEventType.reward,
        at: DateTime.now(),
        rewardSize: size,
        rewardG: grams,
      ),
    );

    final refreshed = sessionById(sessionId);
    final remaining = foodRemainingG(refreshed);
    final threshold = refreshed.plannedFoodG * 0.5;

    if (!refreshed.alert50Triggered && remaining <= threshold) {
      final updated = refreshed.copyWith(
        alert50Triggered: true,
        synced: false,
        events: [
          ...refreshed.events,
          SessionEvent(
            id: _newId('evt'),
            type: SessionEventType.alert,
            at: DateTime.now(),
            note: '50% food remaining reached.',
          ),
        ],
      );
      await _replaceSession(updated);
    }

    if (session.plannedFoodG <= 0) {
      return;
    }
  }

  Future<void> addPursuit({
    required String sessionId,
    required WingbeatQuality wingbeat,
    required int intensity,
    required PursuitOutcome outcome,
    required FalconDistanceFromHandler distanceFromHandler,
  }) async {
    final session = sessionById(sessionId);
    if (isFlying(session)) {
      throw StateError('Pursuit can only be logged after Falcon Returns.');
    }
    if (intensity < 1 || intensity > 2) {
      throw StateError('Falcon response must be 1 (instant) or 2 (delayed).');
    }
    final checklist = postReturnChecklist(session);
    if (!checklist.awaitingCompletion) {
      throw StateError('No pending return is waiting for pursuit.');
    }
    if (checklist.pursuitLogged) {
      throw StateError('Pursuit is already logged for this return.');
    }

    await _appendEvent(
      sessionId,
      SessionEvent(
        id: _newId('evt'),
        type: SessionEventType.pursuit,
        at: DateTime.now(),
        wingbeat: wingbeat,
        pursuitIntensity: intensity,
        outcome: outcome,
        distanceFromHandler: distanceFromHandler,
      ),
    );
  }

  Future<SessionEvent> addStarlingSighting({
    required String sessionId,
    required int count,
    String? categoryNote,
  }) async {
    final session = sessionById(sessionId);
    final field = fields.firstWhere((f) => f.id == session.fieldId);
    final point = await _getLocationPoint();
    final boundaryClass = point == null
        ? BoundaryClass.unknown
        : classifyPoint(field, point);

    final event = SessionEvent(
      id: _newId('evt'),
      type: SessionEventType.starling,
      at: DateTime.now(),
      lat: point?.lat,
      lng: point?.lng,
      starlingCount: count,
      boundaryClass: boundaryClass,
      note: categoryNote,
    );

    await _appendEvent(sessionId, event);
    return event;
  }

  Future<void> endSession({
    required String sessionId,
    required SessionPostFlightInput input,
  }) async {
    final session = sessionById(sessionId);
    final updated = session.copyWith(
      endAt: DateTime.now(),
      maxAltitudeFt: input.maxAltitudeFt,
      maxDistanceFromHandlerMiles: input.maxDistanceFromHandlerMiles,
      totalDistanceFlownMiles: input.totalDistanceFlownMiles,
      maxSpeedMph: input.maxSpeedMph,
      desiredWeight: input.desiredWeight,
      keptStarlingsOut: input.keptStarlingsOut,
      starlingsSeenInsideBoundary: input.starlingsSeenInsideBoundary,
      voiceTranscript: input.voiceTranscript,
      synced: false,
    );

    await _replaceSession(updated);
  }

  Future<void> markSessionSynced(String sessionId) async {
    final session = sessionById(sessionId);
    await _replaceSession(session.copyWith(synced: true));
  }

  Future<void> markAllSessionsSynced() async {
    final userId = _requireCurrentUserId();
    final updated = data.sessions
        .map(
          (session) => session.handlerId == userId
              ? session.copyWith(synced: true)
              : session,
        )
        .toList();
    await _saveData(data.copyWith(sessions: updated));
  }

  Future<SupportQuestion> submitQuestion(String questionText) async {
    final userId = _requireCurrentUserId();
    final trimmed = questionText.trim();
    if (trimmed.isEmpty) {
      throw StateError('Question text is required.');
    }
    final question = SupportQuestion(
      id: _newId('question'),
      handlerId: userId,
      questionText: trimmed,
      askedAt: DateTime.now(),
    );
    final updated = [...data.supportQuestions, question];
    await _saveData(data.copyWith(supportQuestions: updated));
    return question;
  }

  Future<void> markQuestionAnswered({
    required String questionId,
    String answerText = 'The question has been answered.',
  }) async {
    final userId = _requireCurrentUserId();
    final idx = data.supportQuestions.indexWhere((q) => q.id == questionId);
    if (idx == -1) {
      throw StateError('Question not found.');
    }
    final question = data.supportQuestions[idx];
    if (question.handlerId != userId) {
      throw StateError('Access denied for this question.');
    }
    final updatedQuestion = question.copyWith(
      answeredAt: DateTime.now(),
      answerText: answerText,
    );
    final updated = [...data.supportQuestions];
    updated[idx] = updatedQuestion;
    await _saveData(data.copyWith(supportQuestions: updated));
  }

  Future<AdminQuestion> askUserQuestion({
    required String handlerId,
    required String questionText,
  }) async {
    final user = _currentUser;
    if (user == null || user.role != UserRole.manager) {
      throw StateError('Admin access required.');
    }
    final handler = data.handlers.firstWhere(
      (item) => item.id == handlerId,
      orElse: () =>
          HandlerUser(id: '', name: '', pin: '', role: UserRole.handler),
    );
    if (handler.id.isEmpty || handler.role != UserRole.handler) {
      throw StateError('Handler not found.');
    }
    final text = questionText.trim();
    if (text.isEmpty) {
      throw StateError('Enter a question before sending.');
    }
    final question = AdminQuestion(
      id: _newId('admin_q'),
      handlerId: handlerId,
      questionText: text,
      askedAt: DateTime.now(),
    );
    await _saveData(
      data.copyWith(adminQuestions: [...data.adminQuestions, question]),
    );
    return question;
  }

  Future<void> answerAdminQuestion({
    required String questionId,
    required String answerText,
  }) async {
    final user = _currentUser;
    if (user == null) {
      throw StateError('No logged in user.');
    }
    final idx = data.adminQuestions.indexWhere((q) => q.id == questionId);
    if (idx < 0) {
      throw StateError('Question not found.');
    }
    final question = data.adminQuestions[idx];
    if (question.handlerId != user.id) {
      throw StateError('This question is not assigned to you.');
    }
    final text = answerText.trim();
    if (text.isEmpty) {
      throw StateError('Answer is required.');
    }
    final updated = question.copyWith(
      answeredAt: DateTime.now(),
      answerText: text,
    );
    final all = [...data.adminQuestions];
    all[idx] = updated;
    await _saveData(data.copyWith(adminQuestions: all));
  }

  Future<CustomerInputEntry> addCustomerInputTranscript(
    String transcript,
  ) async {
    final userId = _requireCurrentUserId();
    final trimmed = transcript.trim();
    if (trimmed.isEmpty) {
      throw StateError('Transcript is required.');
    }
    final entry = CustomerInputEntry(
      id: _newId('customer_input'),
      handlerId: userId,
      transcript: trimmed,
      createdAt: DateTime.now(),
    );
    final updated = [...data.customerInputs, entry];
    await _saveData(data.copyWith(customerInputs: updated));
    return entry;
  }

  Future<PatrolWithoutFalconEntry> startPatrolWithoutFalcon() async {
    final userId = _requireCurrentUserId();
    if (activePatrolWithoutFalcon != null) {
      throw StateError('Patrol without falcon is already active.');
    }
    final entry = PatrolWithoutFalconEntry(
      id: _newId('patrol'),
      handlerId: userId,
      startAt: DateTime.now(),
      synced: false,
    );
    await _saveData(
      data.copyWith(
        patrolWithoutFalconEntries: [...data.patrolWithoutFalconEntries, entry],
      ),
    );
    return entry;
  }

  Future<PatrolWithoutFalconEntry> stopPatrolWithoutFalcon() async {
    final active = activePatrolWithoutFalcon;
    if (active == null) {
      throw StateError('No active patrol without falcon.');
    }
    final stopped = active.copyWith(endAt: DateTime.now(), synced: false);
    final updated = data.patrolWithoutFalconEntries
        .map((entry) => entry.id == stopped.id ? stopped : entry)
        .toList();
    await _saveData(data.copyWith(patrolWithoutFalconEntries: updated));
    return stopped;
  }

  SessionRecord sessionById(String sessionId) {
    final userId = _requireCurrentUserId();
    final session = data.sessions.firstWhere((s) => s.id == sessionId);
    if (session.handlerId != userId) {
      throw StateError('Access denied for this session.');
    }
    return session;
  }

  FalconProfile falconById(String falconId) =>
      data.falcons.firstWhere((falcon) => falcon.id == falconId);

  FieldBoundary fieldById(String fieldId) =>
      data.fields.firstWhere((field) => field.id == fieldId);

  HandlerUser handlerById(String handlerId) =>
      data.handlers.firstWhere((handler) => handler.id == handlerId);

  List<SessionRecord> sessionsForHandler(String handlerId) {
    final sessions = data.sessions
        .where((session) => session.handlerId == handlerId)
        .toList();
    sessions.sort((a, b) => b.startAt.compareTo(a.startAt));
    return sessions;
  }

  List<SessionRecord> sessionsForFalcon({
    required String handlerId,
    required String falconId,
  }) {
    final sessions = data.sessions
        .where(
          (session) =>
              session.handlerId == handlerId && session.falconId == falconId,
        )
        .toList();
    sessions.sort((a, b) => b.startAt.compareTo(a.startAt));
    return sessions;
  }

  List<FalconProfile> falconsForHandler(String handlerId) {
    final falconIds = data.sessions
        .where((session) => session.handlerId == handlerId)
        .map((session) => session.falconId)
        .toSet();
    final list =
        (falconIds.isEmpty
                ? data.falcons
                : data.falcons.where((falcon) => falconIds.contains(falcon.id)))
            .toList();
    list.sort((a, b) => a.name.compareTo(b.name));
    return list;
  }

  List<AdminQuestion> adminQuestionsForHandler(String handlerId) {
    final questions = data.adminQuestions
        .where((question) => question.handlerId == handlerId)
        .toList();
    questions.sort((a, b) => b.askedAt.compareTo(a.askedAt));
    return questions;
  }

  DateTime? lastDataEntryAtForHandler(String handlerId, {DateTime? reference}) {
    final ref = reference ?? DateTime.now();
    DateTime? latest;

    void track(DateTime? candidate) {
      if (candidate == null || candidate.isAfter(ref)) {
        return;
      }
      if (latest == null || candidate.isAfter(latest!)) {
        latest = candidate;
      }
    }

    for (final session in data.sessions.where(
      (s) => s.handlerId == handlerId,
    )) {
      track(session.startAt);
      track(session.endAt);
      for (final event in session.events) {
        track(event.at);
      }
    }

    for (final entry in data.customerInputs.where(
      (item) => item.handlerId == handlerId,
    )) {
      track(entry.createdAt);
    }

    for (final entry in data.supplementalFeeds.where(
      (item) => item.handlerId == handlerId,
    )) {
      track(entry.at);
    }

    for (final entry in data.patrolWithoutFalconEntries.where(
      (item) => item.handlerId == handlerId,
    )) {
      track(entry.startAt);
      track(entry.endAt);
    }

    for (final question in data.supportQuestions.where(
      (item) => item.handlerId == handlerId,
    )) {
      track(question.askedAt);
      track(question.answeredAt);
    }

    for (final question in data.adminQuestions.where(
      (item) => item.handlerId == handlerId,
    )) {
      track(question.answeredAt);
    }

    return latest;
  }

  int foodUsedG(SessionRecord session) {
    return session.events
        .where((e) => e.type == SessionEventType.reward)
        .map((e) => e.rewardG ?? 0)
        .fold<int>(0, (acc, value) => acc + value);
  }

  int foodRemainingG(SessionRecord session) {
    final remaining = session.plannedFoodG - foodUsedG(session);
    return max(remaining, 0);
  }

  double totalPatrolWithoutFalconMinutes({DateTime? since}) {
    final now = DateTime.now();
    var total = 0.0;
    for (final entry in currentUserPatrolWithoutFalconEntries) {
      final effectiveStart = (since != null && entry.startAt.isBefore(since))
          ? since
          : entry.startAt;
      final effectiveEnd = entry.endAt ?? now;
      if (!effectiveEnd.isAfter(effectiveStart)) {
        continue;
      }
      total += effectiveEnd.difference(effectiveStart).inSeconds / 60;
    }
    return total;
  }

  DateTime? lastFedAtForFalcon(String falconId, {DateTime? reference}) {
    final ref = reference ?? DateTime.now();
    DateTime? latest;
    for (final session in currentUserSessions) {
      if (session.falconId != falconId) {
        continue;
      }
      for (final event in session.events) {
        if (event.type != SessionEventType.reward || event.at.isAfter(ref)) {
          continue;
        }
        if (latest == null || event.at.isAfter(latest)) {
          latest = event.at;
        }
      }
    }
    return latest;
  }

  double? hoursSinceFalconLastFed(String falconId, {DateTime? reference}) {
    final ref = reference ?? DateTime.now();
    final lastFed = lastFedAtForFalcon(falconId, reference: ref);
    if (lastFed == null) {
      return null;
    }
    final hours = ref.difference(lastFed).inSeconds / 3600;
    return max(hours, 0);
  }

  bool isFlying(SessionRecord session) {
    final starts = session.events
        .where((e) => e.type == SessionEventType.flyingStart)
        .length;
    final ends = session.events
        .where((e) => e.type == SessionEventType.flyingEnd)
        .length;
    return starts > ends;
  }

  int completedFlights(SessionRecord session) {
    return session.events
        .where((e) => e.type == SessionEventType.flyingEnd)
        .length;
  }

  double sessionMinutes(SessionRecord session) {
    final end = session.endAt ?? DateTime.now();
    return end.difference(session.startAt).inSeconds / 60;
  }

  double flyingMinutes(SessionRecord session) {
    final events = [...session.events]..sort((a, b) => a.at.compareTo(b.at));
    DateTime? start;
    Duration total = Duration.zero;

    for (final event in events) {
      if (event.type == SessionEventType.flyingStart && start == null) {
        start = event.at;
      } else if (event.type == SessionEventType.flyingEnd && start != null) {
        total += event.at.difference(start);
        start = null;
      }
    }

    if (start != null) {
      final end = session.endAt ?? DateTime.now();
      total += end.difference(start);
    }

    return total.inSeconds / 60;
  }

  int flyingSessionsForHandlerBetween({
    required String handlerId,
    required DateTime fromInclusive,
    DateTime? toExclusive,
  }) {
    final end = toExclusive ?? DateTime.now();
    if (!end.isAfter(fromInclusive)) {
      return 0;
    }
    var count = 0;
    for (final session in sessionsForHandler(handlerId)) {
      for (final event in session.events) {
        if (event.type != SessionEventType.flyingStart) {
          continue;
        }
        if (!event.at.isBefore(fromInclusive) && event.at.isBefore(end)) {
          count += 1;
        }
      }
    }
    return count;
  }

  double flyingMinutesForHandlerBetween({
    required String handlerId,
    required DateTime fromInclusive,
    DateTime? toExclusive,
  }) {
    final end = toExclusive ?? DateTime.now();
    if (!end.isAfter(fromInclusive)) {
      return 0;
    }

    Duration total = Duration.zero;
    for (final session in sessionsForHandler(handlerId)) {
      final events = [...session.events]..sort((a, b) => a.at.compareTo(b.at));
      DateTime? start;

      void addOverlap(DateTime segmentStart, DateTime segmentEnd) {
        if (!segmentEnd.isAfter(segmentStart)) {
          return;
        }
        final overlapStart = segmentStart.isBefore(fromInclusive)
            ? fromInclusive
            : segmentStart;
        final overlapEnd = segmentEnd.isAfter(end) ? end : segmentEnd;
        if (overlapEnd.isAfter(overlapStart)) {
          total += overlapEnd.difference(overlapStart);
        }
      }

      for (final event in events) {
        if (event.type == SessionEventType.flyingStart && start == null) {
          start = event.at;
        } else if (event.type == SessionEventType.flyingEnd && start != null) {
          addOverlap(start, event.at);
          start = null;
        }
      }

      if (start != null) {
        final segmentEnd = session.endAt ?? DateTime.now();
        addOverlap(start, segmentEnd);
      }
    }

    return total.inSeconds / 60;
  }

  int customerInputsForHandlerBetween({
    required String handlerId,
    required DateTime fromInclusive,
    DateTime? toExclusive,
  }) {
    final end = toExclusive ?? DateTime.now();
    if (!end.isAfter(fromInclusive)) {
      return 0;
    }
    return data.customerInputs
        .where((entry) => entry.handlerId == handlerId)
        .where((entry) => !entry.createdAt.isBefore(fromInclusive))
        .where((entry) => entry.createdAt.isBefore(end))
        .length;
  }

  double sittingMinutes(SessionRecord session) {
    final total = sessionMinutes(session);
    final flying = flyingMinutes(session);
    return max(total - flying, 0);
  }

  int totalStarlingCount(SessionRecord session) {
    return session.events
        .where((e) => e.type == SessionEventType.starling)
        .map((e) => e.starlingCount ?? 0)
        .fold<int>(0, (acc, value) => acc + value);
  }

  int pursuitOutcomeCount(SessionRecord session, PursuitOutcome outcome) {
    return session.events
        .where(
          (e) => e.type == SessionEventType.pursuit && e.outcome == outcome,
        )
        .length;
  }

  List<FeedComplianceAlert> feedComplianceAlerts() {
    final userId = _requireCurrentUserId();
    return feedComplianceAlertsForHandler(userId);
  }

  List<FeedComplianceAlert> feedComplianceAlertsForHandler(String handlerId) {
    final now = DateTime.now();
    final windowStart = now.subtract(const Duration(hours: 24));
    final alerts = <FeedComplianceAlert>[];
    final userSessions = data.sessions
        .where((session) => session.handlerId == handlerId)
        .toList();
    final userFalconIds = userSessions
        .map((session) => session.falconId)
        .toSet();

    for (final falcon in falcons.where(
      (item) => userFalconIds.contains(item.id),
    )) {
      final falconSessions = userSessions
          .where((s) => s.falconId == falcon.id)
          .toList();
      if (falconSessions.isEmpty) {
        continue;
      }

      falconSessions.sort((a, b) => b.startAt.compareTo(a.startAt));
      final latestWeight = falconSessions.first.falconWeightG;
      final required = latestWeight * 0.10;

      double consumed = 0;
      for (final session in falconSessions) {
        for (final event in session.events) {
          if (event.type == SessionEventType.reward &&
              event.at.isAfter(windowStart)) {
            consumed += (event.rewardG ?? 0).toDouble();
          }
        }
      }
      for (final feed in data.supplementalFeeds) {
        if (feed.handlerId == handlerId &&
            feed.falconId == falcon.id &&
            feed.at.isAfter(windowStart)) {
          consumed += feed.grams;
        }
      }

      if (consumed + 0.0001 < required) {
        alerts.add(
          FeedComplianceAlert(
            falconId: falcon.id,
            falconName: falcon.name,
            requiredGrams: required,
            actualGrams: consumed,
          ),
        );
      }
    }

    alerts.sort((a, b) => a.falconName.compareTo(b.falconName));
    return alerts;
  }

  Future<void> addSupplementalFeedGrams({
    required String falconId,
    required double grams,
  }) async {
    if (grams <= 0) {
      throw StateError('Enter grams greater than zero.');
    }
    final userId = _requireCurrentUserId();
    final entry = SupplementalFeedEntry(
      id: _newId('supp_feed'),
      handlerId: userId,
      falconId: falconId,
      grams: grams,
      at: DateTime.now(),
    );
    await _saveData(
      data.copyWith(supplementalFeeds: [...data.supplementalFeeds, entry]),
    );
  }

  PostReturnChecklist postReturnChecklist(SessionRecord session) {
    final events = [...session.events]..sort((a, b) => a.at.compareTo(b.at));
    var lastFlyingEndIndex = -1;
    for (int i = events.length - 1; i >= 0; i--) {
      if (events[i].type == SessionEventType.flyingEnd) {
        lastFlyingEndIndex = i;
        break;
      }
    }

    if (lastFlyingEndIndex == -1) {
      return PostReturnChecklist(
        awaitingCompletion: false,
        rewardLogged: true,
        pursuitLogged: true,
      );
    }

    final hasNextFlyingStart = events
        .skip(lastFlyingEndIndex + 1)
        .any((event) => event.type == SessionEventType.flyingStart);
    if (hasNextFlyingStart) {
      return PostReturnChecklist(
        awaitingCompletion: false,
        rewardLogged: true,
        pursuitLogged: true,
      );
    }

    final eventsAfterReturn = events.skip(lastFlyingEndIndex + 1);
    final rewardLogged = eventsAfterReturn.any(
      (event) => event.type == SessionEventType.reward,
    );
    final pursuitLogged = eventsAfterReturn.any(
      (event) => event.type == SessionEventType.pursuit,
    );

    return PostReturnChecklist(
      awaitingCompletion: true,
      rewardLogged: rewardLogged,
      pursuitLogged: pursuitLogged,
    );
  }

  Future<void> _appendEvent(String sessionId, SessionEvent event) async {
    final session = sessionById(sessionId);
    final updated = session.copyWith(
      events: [...session.events, event],
      synced: false,
    );
    await _replaceSession(updated);
  }

  Future<void> _replaceSession(SessionRecord updatedSession) async {
    final sessions = data.sessions
        .map(
          (session) =>
              session.id == updatedSession.id ? updatedSession : session,
        )
        .toList();
    await _saveData(data.copyWith(sessions: sessions));
  }

  Future<void> _saveData(AppData next) async {
    _data = next;
    await _store.save(next);
    notifyListeners();
  }

  String _newId(String prefix) {
    _idCounter += 1;
    return '${prefix}_${DateTime.now().microsecondsSinceEpoch}_$_idCounter';
  }

  Future<GeoPoint?> _getLocationPoint() async {
    try {
      final enabled = await Geolocator.isLocationServiceEnabled();
      if (!enabled) {
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

      try {
        final position = await Geolocator.getCurrentPosition(
          locationSettings: const LocationSettings(
            accuracy: LocationAccuracy.best,
            timeLimit: Duration(seconds: 10),
          ),
        );
        return GeoPoint(lat: position.latitude, lng: position.longitude);
      } catch (_) {
        final lastKnown = await Geolocator.getLastKnownPosition();
        if (lastKnown != null) {
          return GeoPoint(lat: lastKnown.latitude, lng: lastKnown.longitude);
        }
        return null;
      }
    } catch (_) {
      return null;
    }
  }

  String _requireCurrentUserId() {
    final userId = _currentUser?.id;
    if (userId == null) {
      throw StateError('No logged in user.');
    }
    return userId;
  }

  HandlerUser? _defaultBuildUser() {
    final loaded = _data;
    if (loaded == null || loaded.handlers.isEmpty) {
      return null;
    }
    return loaded.handlers.firstWhere(
      (user) => user.name == 'Alex Handler',
      orElse: () => loaded.handlers.first,
    );
  }

  HandlerUser? _defaultBuildAdmin() {
    final loaded = _data;
    if (loaded == null || loaded.handlers.isEmpty) {
      return null;
    }
    return loaded.handlers.firstWhere(
      (user) => user.role == UserRole.manager,
      orElse: () => loaded.handlers.first,
    );
  }
}

BoundaryClass classifyPoint(FieldBoundary field, GeoPoint point) {
  final inside = _isPointInPolygon(point, field.polygon);
  final edgeDistance = _distanceToPolygonEdgeMeters(point, field.polygon);

  if (edgeDistance <= field.perimeterMeters) {
    return BoundaryClass.perimeter;
  }
  if (inside) {
    return BoundaryClass.inside;
  }
  return BoundaryClass.outside;
}

bool _isPointInPolygon(GeoPoint point, List<GeoPoint> polygon) {
  if (polygon.length < 3) {
    return false;
  }

  var intersects = false;
  for (int i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    final pi = polygon[i];
    final pj = polygon[j];

    final condition = (pi.lng > point.lng) != (pj.lng > point.lng);
    if (!condition) {
      continue;
    }

    final slope = (pj.lat - pi.lat) / (pj.lng - pi.lng);
    final testLat = slope * (point.lng - pi.lng) + pi.lat;
    if (point.lat < testLat) {
      intersects = !intersects;
    }
  }
  return intersects;
}

double _distanceToPolygonEdgeMeters(GeoPoint point, List<GeoPoint> polygon) {
  if (polygon.length < 2) {
    return double.infinity;
  }

  double minMeters = double.infinity;

  for (int i = 0; i < polygon.length; i++) {
    final a = polygon[i];
    final b = polygon[(i + 1) % polygon.length];
    final candidate = _distancePointToSegmentMeters(point, a, b);
    if (candidate < minMeters) {
      minMeters = candidate;
    }
  }

  return minMeters;
}

double _distancePointToSegmentMeters(GeoPoint p, GeoPoint a, GeoPoint b) {
  final refLat = p.lat * pi / 180;
  const metersPerLat = 111320.0;
  final metersPerLng = cos(refLat) * 111320.0;

  double toX(GeoPoint gp) => (gp.lng - p.lng) * metersPerLng;
  double toY(GeoPoint gp) => (gp.lat - p.lat) * metersPerLat;

  final ax = toX(a);
  final ay = toY(a);
  final bx = toX(b);
  final by = toY(b);

  final abx = bx - ax;
  final aby = by - ay;
  final apx = -ax;
  final apy = -ay;

  final lenSquared = abx * abx + aby * aby;
  if (lenSquared == 0) {
    return sqrt(ax * ax + ay * ay);
  }

  final t = (apx * abx + apy * aby) / lenSquared;
  final clamped = t.clamp(0.0, 1.0);

  final cx = ax + abx * clamped;
  final cy = ay + aby * clamped;

  return sqrt(cx * cx + cy * cy);
}
