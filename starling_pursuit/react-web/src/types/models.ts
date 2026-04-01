// ── Enums ──
export type UserRole = 'handler' | 'manager';
export type FalconBehavior = 'perch' | 'baitAway' | 'baitToward';
export type SessionEventType = 'starling' | 'flyingStart' | 'flyingEnd' | 'reward' | 'pursuit' | 'alert';
export type RewardSize = 'small' | 'medium' | 'large' | 'pickUpPiece';
export type WingbeatQuality = 'strong' | 'normal' | 'weak';
export type PursuitOutcome = 'kill' | 'chase' | 'ignore' | 'no';
export type FalconDistanceFromHandler = 'inView' | 'outOfSight';
export type DesiredWeightTrend = 'higher' | 'same' | 'lower';
export type BoundaryClass = 'inside' | 'perimeter' | 'outside' | 'unknown';

// ── Data Models ──
export interface HandlerUser {
  id: string;
  name: string;
  pin: string;
  role: UserRole;
}

export interface FalconProfile {
  id: string;
  name: string;
  tag: string;
}

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface FieldBoundary {
  id: string;
  name: string;
  polygon: GeoPoint[];
  perimeterMeters: number;
}

export interface AdminSettings {
  feedSuggestionMinG: number;
  feedSuggestionMaxG: number;
  rewardSmallG: number;
  rewardMediumG: number;
  rewardLargeG: number;
  rewardPickUpPieceG: number;
  starlingQuickCounts: number[];
}

export interface SessionEvent {
  id: string;
  type: SessionEventType;
  at: string; // ISO string
  lat?: number;
  lng?: number;
  starlingCount?: number;
  boundaryClass?: BoundaryClass;
  rewardSize?: RewardSize;
  rewardG?: number;
  wingbeat?: WingbeatQuality;
  pursuitIntensity?: number;
  outcome?: PursuitOutcome;
  distanceFromHandler?: FalconDistanceFromHandler;
  note?: string;
}

export interface SessionRecord {
  id: string;
  handlerId: string;
  falconId: string;
  fieldId: string;
  startAt: string;
  preFlightBehavior: FalconBehavior;
  falconWeightG: number;
  plannedFoodG: number;
  telemetryWorking: boolean;
  smallTidbitG?: number;
  largeTidbitG?: number;
  pickupPieceG?: number;
  localWeather: string[];
  endAt?: string;
  maxAltitudeFt?: number;
  maxDistanceFromHandlerMiles?: number;
  totalDistanceFlownMiles?: number;
  maxSpeedMph?: number;
  desiredWeight?: DesiredWeightTrend;
  keptStarlingsOut?: boolean;
  starlingsSeenInsideBoundary?: boolean;
  voiceTranscript?: string;
  alert50Triggered: boolean;
  synced: boolean;
  events: SessionEvent[];
}

export interface SupportQuestion {
  id: string;
  handlerId: string;
  questionText: string;
  askedAt: string;
  answeredAt?: string;
  answerText?: string;
}

export interface AdminQuestion {
  id: string;
  handlerId: string;
  questionText: string;
  askedAt: string;
  answeredAt?: string;
  answerText?: string;
}

export interface CustomerInputEntry {
  id: string;
  handlerId: string;
  transcript: string;
  createdAt: string;
}

export interface SupplementalFeedEntry {
  id: string;
  handlerId: string;
  falconId: string;
  grams: number;
  at: string;
}

export interface PatrolWithoutFalconEntry {
  id: string;
  handlerId: string;
  startAt: string;
  endAt?: string;
  synced: boolean;
}

export interface AppData {
  handlers: HandlerUser[];
  falcons: FalconProfile[];
  fields: FieldBoundary[];
  settings: AdminSettings;
  sessions: SessionRecord[];
  supportQuestions: SupportQuestion[];
  adminQuestions: AdminQuestion[];
  customerInputs: CustomerInputEntry[];
  supplementalFeeds: SupplementalFeedEntry[];
  patrolWithoutFalconEntries: PatrolWithoutFalconEntry[];
}

export interface FeedComplianceAlert {
  falconId: string;
  falconName: string;
  requiredGrams: number;
  actualGrams: number;
}

export interface PostReturnChecklist {
  awaitingCompletion: boolean;
  rewardLogged: boolean;
  pursuitLogged: boolean;
}
