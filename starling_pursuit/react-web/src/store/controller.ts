import type {
  AdminQuestion,
  AppData,
  CustomerInputEntry,
  DesiredWeightTrend,
  FalconBehavior,
  FalconProfile,
  FeedComplianceAlert,
  FieldBoundary,
  HandlerUser,
  PatrolWithoutFalconEntry,
  PostReturnChecklist,
  PursuitOutcome,
  RewardSize,
  SessionEvent,
  SessionRecord,
  SupplementalFeedEntry,
  SupportQuestion,
  WingbeatQuality,
  FalconDistanceFromHandler,
} from '../types/models';

const STORAGE_KEY = 'starling_pursuit_data';

let idCounter = 0;
function newId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${Date.now()}_${idCounter}`;
}

function seedData(): AppData {
  return {
    handlers: [
      { id: 'u1', name: 'Alex Handler', pin: '1111', role: 'handler' },
      { id: 'u2', name: 'Morgan Handler', pin: '2222', role: 'handler' },
      { id: 'u3', name: 'Taylor Manager', pin: '9999', role: 'manager' },
    ],
    falcons: [
      { id: 'f1', name: 'Astra', tag: 'AST-01' },
      { id: 'f2', name: 'Kest', tag: 'KES-02' },
      { id: 'f3', name: 'Nova', tag: 'NOV-03' },
    ],
    fields: [
      {
        id: 'field_1',
        name: 'Blueberry South Block',
        perimeterMeters: 30,
        polygon: [
          { lat: 47.6613, lng: -122.3179 },
          { lat: 47.6613, lng: -122.3129 },
          { lat: 47.6587, lng: -122.3129 },
          { lat: 47.6587, lng: -122.3179 },
        ],
      },
      {
        id: 'field_2',
        name: 'Blueberry North Block',
        perimeterMeters: 30,
        polygon: [
          { lat: 47.6641, lng: -122.3182 },
          { lat: 47.6641, lng: -122.3132 },
          { lat: 47.6616, lng: -122.3132 },
          { lat: 47.6616, lng: -122.3182 },
        ],
      },
    ],
    settings: {
      feedSuggestionMinG: 85,
      feedSuggestionMaxG: 120,
      rewardSmallG: 2,
      rewardMediumG: 5,
      rewardLargeG: 10,
      rewardPickUpPieceG: 0,
      starlingQuickCounts: [5, 25, 50, 100, 500],
    },
    sessions: [],
    supportQuestions: [],
    adminQuestions: [],
    customerInputs: [],
    supplementalFeeds: [],
    patrolWithoutFalconEntries: [],
  };
}

function loadData(): AppData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return seedData();
    return JSON.parse(raw) as AppData;
  } catch {
    return seedData();
  }
}

function saveData(data: AppData) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

// ── Controller class ──
export class AppController {
  private data: AppData;
  private currentUser: HandlerUser | null = null;
  private listeners: Set<() => void> = new Set();

  constructor() {
    this.data = loadData();
  }

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify() {
    this.listeners.forEach((fn) => fn());
  }

  private save() {
    saveData(this.data);
    this.notify();
  }

  // ── Auth ──
  get user() { return this.currentUser; }
  get isLoggedIn() { return this.currentUser !== null; }

  getData() { return this.data; }

  useDefaultUser() {
    const handler = this.data.handlers.find((h) => h.role === 'handler');
    this.currentUser = handler ?? null;
    this.notify();
  }

  useDefaultAdmin() {
    const admin = this.data.handlers.find((h) => h.role === 'manager');
    this.currentUser = admin ?? this.data.handlers[0] ?? null;
    this.notify();
  }

  login(handlerId: string, pin: string): boolean {
    const user = this.data.handlers.find((h) => h.id === handlerId && h.pin === pin);
    if (!user) return false;
    this.currentUser = user;
    this.notify();
    return true;
  }

  logout() {
    this.currentUser = null;
    this.notify();
  }

  // ── Accessors ──
  get handlers() { return this.data.handlers; }
  get handlerUsers() { return this.data.handlers.filter((h) => h.role === 'handler'); }
  get falcons() { return this.data.falcons; }
  get fields() { return this.data.fields; }
  get settings() { return this.data.settings; }

  handlerById(id: string): HandlerUser {
    return this.data.handlers.find((h) => h.id === id)!;
  }

  falconById(id: string): FalconProfile {
    return this.data.falcons.find((f) => f.id === id)!;
  }

  fieldById(id: string): FieldBoundary {
    return this.data.fields.find((f) => f.id === id)!;
  }

  // ── Sessions ──
  get currentUserSessions(): SessionRecord[] {
    if (!this.currentUser) return [];
    return this.data.sessions
      .filter((s) => s.handlerId === this.currentUser!.id)
      .sort((a, b) => new Date(b.startAt).getTime() - new Date(a.startAt).getTime());
  }

  sessionsForHandler(handlerId: string): SessionRecord[] {
    return this.data.sessions
      .filter((s) => s.handlerId === handlerId)
      .sort((a, b) => new Date(b.startAt).getTime() - new Date(a.startAt).getTime());
  }

  sessionsForFalcon(handlerId: string, falconId: string): SessionRecord[] {
    return this.data.sessions
      .filter((s) => s.handlerId === handlerId && s.falconId === falconId)
      .sort((a, b) => new Date(b.startAt).getTime() - new Date(a.startAt).getTime());
  }

  falconsForHandler(handlerId: string): FalconProfile[] {
    const falconIds = new Set(
      this.data.sessions.filter((s) => s.handlerId === handlerId).map((s) => s.falconId)
    );
    return this.data.falcons.filter((f) => falconIds.has(f.id));
  }

  get activeSession(): SessionRecord | null {
    if (!this.currentUser) return null;
    const active = this.data.sessions
      .filter((s) => s.handlerId === this.currentUser!.id && !s.endAt)
      .sort((a, b) => new Date(b.startAt).getTime() - new Date(a.startAt).getTime());
    return active[0] ?? null;
  }

  get unsyncedCount(): number {
    return this.currentUserSessions.filter((s) => !s.synced).length;
  }

  sessionById(sessionId: string): SessionRecord {
    return this.data.sessions.find((s) => s.id === sessionId)!;
  }

  // ── Session creation ──
  startSession(params: {
    falconId: string;
    fieldId: string;
    behavior: FalconBehavior;
    falconWeightG: number;
    plannedFoodG: number;
    telemetryWorking: boolean;
    smallTidbitG?: number;
    largeTidbitG?: number;
    pickupPieceG?: number;
    localWeather?: string[];
  }): SessionRecord {
    const session: SessionRecord = {
      id: newId('session'),
      handlerId: this.currentUser!.id,
      falconId: params.falconId,
      fieldId: params.fieldId,
      startAt: new Date().toISOString(),
      preFlightBehavior: params.behavior,
      falconWeightG: params.falconWeightG,
      plannedFoodG: params.plannedFoodG,
      telemetryWorking: params.telemetryWorking,
      smallTidbitG: params.smallTidbitG,
      largeTidbitG: params.largeTidbitG,
      pickupPieceG: params.pickupPieceG,
      localWeather: params.localWeather ?? [],
      alert50Triggered: false,
      synced: false,
      events: [],
    };
    this.data.sessions.push(session);
    this.save();
    return session;
  }

  // ── Events ──
  private appendEvent(sessionId: string, event: SessionEvent) {
    const session = this.data.sessions.find((s) => s.id === sessionId);
    if (session) {
      session.events.push(event);
      this.save();
    }
  }

  addFlyingStart(sessionId: string, flightType?: string) {
    this.appendEvent(sessionId, {
      id: newId('evt'),
      type: 'flyingStart',
      at: new Date().toISOString(),
      note: flightType,
    });
  }

  addFlyingEnd(sessionId: string) {
    this.appendEvent(sessionId, {
      id: newId('evt'),
      type: 'flyingEnd',
      at: new Date().toISOString(),
    });
  }

  addReward(sessionId: string, size: RewardSize, gramsOverride?: number) {
    const grams = gramsOverride ?? this.gramsForReward(size);
    this.appendEvent(sessionId, {
      id: newId('evt'),
      type: 'reward',
      at: new Date().toISOString(),
      rewardSize: size,
      rewardG: grams,
    });

    // Check 50% alert
    const session = this.sessionById(sessionId);
    const remaining = this.foodRemainingG(session);
    const threshold = session.plannedFoodG * 0.5;
    if (!session.alert50Triggered && remaining <= threshold) {
      session.alert50Triggered = true;
      session.events.push({
        id: newId('evt'),
        type: 'alert',
        at: new Date().toISOString(),
        note: '50% food remaining reached.',
      });
      this.save();
    }
  }

  addPursuit(sessionId: string, wingbeat: WingbeatQuality, intensity: number, outcome: PursuitOutcome, distanceFromHandler: FalconDistanceFromHandler) {
    this.appendEvent(sessionId, {
      id: newId('evt'),
      type: 'pursuit',
      at: new Date().toISOString(),
      wingbeat,
      pursuitIntensity: intensity,
      outcome,
      distanceFromHandler,
    });
  }

  addStarlingSighting(sessionId: string, count: number, categoryNote?: string) {
    this.appendEvent(sessionId, {
      id: newId('evt'),
      type: 'starling',
      at: new Date().toISOString(),
      starlingCount: count,
      boundaryClass: 'unknown',
      note: categoryNote,
    });
  }

  endSession(sessionId: string, input: {
    maxAltitudeFt: number;
    maxSpeedMph: number;
    desiredWeight: DesiredWeightTrend;
    keptStarlingsOut: boolean;
    starlingsSeenInsideBoundary: boolean;
    voiceTranscript: string;
  }) {
    const session = this.data.sessions.find((s) => s.id === sessionId);
    if (session) {
      session.endAt = new Date().toISOString();
      session.maxAltitudeFt = input.maxAltitudeFt;
      session.maxSpeedMph = input.maxSpeedMph;
      session.desiredWeight = input.desiredWeight;
      session.keptStarlingsOut = input.keptStarlingsOut;
      session.starlingsSeenInsideBoundary = input.starlingsSeenInsideBoundary;
      session.voiceTranscript = input.voiceTranscript;
      session.synced = false;
      this.save();
    }
  }

  markSessionSynced(sessionId: string) {
    const session = this.data.sessions.find((s) => s.id === sessionId);
    if (session) { session.synced = true; this.save(); }
  }

  markAllSessionsSynced() {
    const userId = this.currentUser?.id;
    this.data.sessions.forEach((s) => { if (s.handlerId === userId) s.synced = true; });
    this.save();
  }

  // ── Metrics ──
  gramsForReward(size: RewardSize): number {
    const s = this.data.settings;
    switch (size) {
      case 'small': return s.rewardSmallG;
      case 'medium': return s.rewardMediumG;
      case 'large': return s.rewardLargeG;
      case 'pickUpPiece': return s.rewardPickUpPieceG;
    }
  }

  foodUsedG(session: SessionRecord): number {
    return session.events
      .filter((e) => e.type === 'reward')
      .reduce((sum, e) => sum + (e.rewardG ?? 0), 0);
  }

  foodRemainingG(session: SessionRecord): number {
    return Math.max(0, session.plannedFoodG - this.foodUsedG(session));
  }

  completedFlights(session: SessionRecord): number {
    return session.events.filter((e) => e.type === 'flyingEnd').length;
  }

  isFlying(session: SessionRecord): boolean {
    const sorted = [...session.events].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
    let flying = false;
    for (const e of sorted) {
      if (e.type === 'flyingStart') flying = true;
      if (e.type === 'flyingEnd') flying = false;
    }
    return flying;
  }

  flyingMinutes(session: SessionRecord): number {
    const sorted = [...session.events].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
    let total = 0;
    let start: Date | null = null;
    for (const e of sorted) {
      if (e.type === 'flyingStart' && !start) start = new Date(e.at);
      if (e.type === 'flyingEnd' && start) {
        total += (new Date(e.at).getTime() - start.getTime()) / 60000;
        start = null;
      }
    }
    if (start) {
      total += (Date.now() - start.getTime()) / 60000;
    }
    return total;
  }

  sessionMinutes(session: SessionRecord): number {
    const end = session.endAt ? new Date(session.endAt) : new Date();
    return (end.getTime() - new Date(session.startAt).getTime()) / 60000;
  }

  sittingMinutes(session: SessionRecord): number {
    return Math.max(0, this.sessionMinutes(session) - this.flyingMinutes(session));
  }

  totalStarlingCount(session: SessionRecord): number {
    return session.events
      .filter((e) => e.type === 'starling')
      .reduce((sum, e) => sum + (e.starlingCount ?? 0), 0);
  }

  pursuitOutcomeCount(session: SessionRecord, outcome: PursuitOutcome): number {
    return session.events.filter((e) => e.type === 'pursuit' && e.outcome === outcome).length;
  }

  postReturnChecklist(session: SessionRecord): PostReturnChecklist {
    const sorted = [...session.events].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
    let lastFlyingEnd = -1;
    let lastReward = -1;
    let lastPursuit = -1;
    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i].type === 'flyingEnd') lastFlyingEnd = i;
      if (sorted[i].type === 'reward') lastReward = i;
      if (sorted[i].type === 'pursuit') lastPursuit = i;
    }
    const awaitingCompletion = lastFlyingEnd > lastReward;
    const rewardLogged = lastReward > lastFlyingEnd;
    const pursuitLogged = lastPursuit > lastFlyingEnd;
    return { awaitingCompletion, rewardLogged, pursuitLogged };
  }

  // ── Questions ──
  get currentUserQuestions(): SupportQuestion[] {
    if (!this.currentUser) return [];
    return this.data.supportQuestions
      .filter((q) => q.handlerId === this.currentUser!.id)
      .sort((a, b) => new Date(b.askedAt).getTime() - new Date(a.askedAt).getTime());
  }

  submitQuestion(text: string): SupportQuestion {
    const q: SupportQuestion = {
      id: newId('question'),
      handlerId: this.currentUser!.id,
      questionText: text.trim(),
      askedAt: new Date().toISOString(),
    };
    this.data.supportQuestions.push(q);
    this.save();
    // Simulate answer after 3s
    setTimeout(() => {
      q.answeredAt = new Date().toISOString();
      q.answerText = 'The question has been answered.';
      this.save();
    }, 3000);
    return q;
  }

  // ── Admin Questions ──
  adminQuestionsForHandler(handlerId: string): AdminQuestion[] {
    return this.data.adminQuestions
      .filter((q) => q.handlerId === handlerId)
      .sort((a, b) => new Date(b.askedAt).getTime() - new Date(a.askedAt).getTime());
  }

  askUserQuestion(handlerId: string, questionText: string) {
    const q: AdminQuestion = {
      id: newId('admin_q'),
      handlerId,
      questionText: questionText.trim(),
      askedAt: new Date().toISOString(),
    };
    this.data.adminQuestions.push(q);
    this.save();
  }

  get unresolvedAdminQuestionsForCurrentUser(): AdminQuestion[] {
    if (!this.currentUser) return [];
    return this.data.adminQuestions
      .filter((q) => q.handlerId === this.currentUser!.id && !q.answeredAt);
  }

  answerAdminQuestion(questionId: string, answerText: string) {
    const q = this.data.adminQuestions.find((q) => q.id === questionId);
    if (q) {
      q.answeredAt = new Date().toISOString();
      q.answerText = answerText.trim();
      this.save();
    }
  }

  // ── Customer Inputs ──
  get currentUserCustomerInputs(): CustomerInputEntry[] {
    if (!this.currentUser) return [];
    return this.data.customerInputs
      .filter((e) => e.handlerId === this.currentUser!.id)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  addCustomerInputTranscript(transcript: string) {
    const entry: CustomerInputEntry = {
      id: newId('customer_input'),
      handlerId: this.currentUser!.id,
      transcript: transcript.trim(),
      createdAt: new Date().toISOString(),
    };
    this.data.customerInputs.push(entry);
    this.save();
  }

  // ── Supplemental Feed ──
  addSupplementalFeedGrams(falconId: string, grams: number) {
    const entry: SupplementalFeedEntry = {
      id: newId('supp_feed'),
      handlerId: this.currentUser!.id,
      falconId,
      grams,
      at: new Date().toISOString(),
    };
    this.data.supplementalFeeds.push(entry);
    this.save();
  }

  // ── Feed Compliance ──
  feedComplianceAlerts(): FeedComplianceAlert[] {
    if (!this.currentUser) return [];
    const now = new Date();
    const start24 = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const alerts: FeedComplianceAlert[] = [];
    const s = this.data.settings;

    for (const falcon of this.data.falcons) {
      let fed = 0;
      for (const session of this.data.sessions) {
        if (session.handlerId !== this.currentUser!.id || session.falconId !== falcon.id) continue;
        for (const event of session.events) {
          if (event.type === 'reward' && new Date(event.at) >= start24) {
            fed += event.rewardG ?? 0;
          }
        }
      }
      for (const supp of this.data.supplementalFeeds) {
        if (supp.handlerId !== this.currentUser!.id || supp.falconId !== falcon.id) continue;
        if (new Date(supp.at) >= start24) fed += supp.grams;
      }

      const required = (s.feedSuggestionMinG + s.feedSuggestionMaxG) / 2;
      if (fed < required) {
        alerts.push({ falconId: falcon.id, falconName: falcon.name, requiredGrams: required, actualGrams: fed });
      }
    }
    return alerts;
  }

  feedComplianceAlertsForHandler(handlerId: string): FeedComplianceAlert[] {
    const now = new Date();
    const start24 = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const alerts: FeedComplianceAlert[] = [];
    const s = this.data.settings;

    for (const falcon of this.data.falcons) {
      let fed = 0;
      for (const session of this.data.sessions) {
        if (session.handlerId !== handlerId || session.falconId !== falcon.id) continue;
        for (const event of session.events) {
          if (event.type === 'reward' && new Date(event.at) >= start24) fed += event.rewardG ?? 0;
        }
      }
      for (const supp of this.data.supplementalFeeds) {
        if (supp.handlerId !== handlerId || supp.falconId !== falcon.id) continue;
        if (new Date(supp.at) >= start24) fed += supp.grams;
      }
      const required = (s.feedSuggestionMinG + s.feedSuggestionMaxG) / 2;
      if (fed < required) {
        alerts.push({ falconId: falcon.id, falconName: falcon.name, requiredGrams: required, actualGrams: fed });
      }
    }
    return alerts;
  }

  // ── Patrol ──
  get activePatrolWithoutFalcon(): PatrolWithoutFalconEntry | null {
    if (!this.currentUser) return null;
    const active = this.data.patrolWithoutFalconEntries
      .filter((e) => e.handlerId === this.currentUser!.id && !e.endAt);
    return active[0] ?? null;
  }

  get currentUserPatrolEntries(): PatrolWithoutFalconEntry[] {
    if (!this.currentUser) return [];
    return this.data.patrolWithoutFalconEntries
      .filter((e) => e.handlerId === this.currentUser!.id)
      .sort((a, b) => new Date(b.startAt).getTime() - new Date(a.startAt).getTime());
  }

  startPatrolWithoutFalcon(): PatrolWithoutFalconEntry {
    const entry: PatrolWithoutFalconEntry = {
      id: newId('patrol'),
      handlerId: this.currentUser!.id,
      startAt: new Date().toISOString(),
      synced: false,
    };
    this.data.patrolWithoutFalconEntries.push(entry);
    this.save();
    return entry;
  }

  stopPatrolWithoutFalcon(): PatrolWithoutFalconEntry {
    const active = this.activePatrolWithoutFalcon;
    if (!active) throw new Error('No active patrol.');
    active.endAt = new Date().toISOString();
    this.save();
    return active;
  }

  totalPatrolMinutes(since?: Date): number {
    const entries = this.currentUserPatrolEntries;
    let total = 0;
    for (const entry of entries) {
      const start = new Date(entry.startAt);
      if (since && start < since) continue;
      const end = entry.endAt ? new Date(entry.endAt) : new Date();
      total += (end.getTime() - start.getTime()) / 60000;
    }
    return total;
  }

  // ── Admin metrics ──
  flyingSessionsForHandlerBetween(handlerId: string, from: Date, to: Date): number {
    return this.data.sessions.filter((s) => {
      if (s.handlerId !== handlerId) return false;
      const hasFlying = s.events.some((e) => e.type === 'flyingStart' && new Date(e.at) >= from && new Date(e.at) < to);
      return hasFlying;
    }).length;
  }

  flyingMinutesForHandlerBetween(handlerId: string, _from: Date, _to: Date): number {
    let total = 0;
    for (const session of this.data.sessions) {
      if (session.handlerId !== handlerId) continue;
      total += this.flyingMinutes(session);
    }
    return total;
  }

  customerInputsForHandlerBetween(handlerId: string, from: Date, to: Date): number {
    return this.data.customerInputs.filter((e) =>
      e.handlerId === handlerId && new Date(e.createdAt) >= from && new Date(e.createdAt) < to
    ).length;
  }

  lastDataEntryAtForHandler(handlerId: string): Date | null {
    let latest: Date | null = null;
    for (const s of this.data.sessions) {
      if (s.handlerId !== handlerId) continue;
      const d = new Date(s.startAt);
      if (!latest || d > latest) latest = d;
    }
    return latest;
  }

  // ── Feed history ──
  lastFedAtForFalcon(falconId: string): Date | null {
    let latest: Date | null = null;
    for (const s of this.currentUserSessions) {
      if (s.falconId !== falconId) continue;
      for (const e of s.events) {
        if (e.type === 'reward') {
          const d = new Date(e.at);
          if (!latest || d > latest) latest = d;
        }
      }
    }
    return latest;
  }

  hoursSinceFalconLastFed(falconId: string): number | null {
    const last = this.lastFedAtForFalcon(falconId);
    if (!last) return null;
    return (Date.now() - last.getTime()) / 3600000;
  }
}

// Singleton instance
export const controller = new AppController();
