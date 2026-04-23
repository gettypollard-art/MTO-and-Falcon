import type {
  AssessmentTemplate,
  AssessmentTrack,
  InboxMessage,
  PlannedAssessmentRequest,
  SuppliesRequestDraft,
  UserRole,
  WeekTask,
} from '../models';
import { getSupabaseClient, supabaseWorkspaceId } from './supabaseClient';

const runtimeSnapshotStoragePrefix = 'm.runtime_snapshot.v1';
const runtimeTable = 'app_backend_state';

export const producerResourceStorageKey = 'm.producer.resources.soil_supplies.v1';

export interface RuntimeSnapshot {
  version: number;
  templates: AssessmentTemplate[];
  requestsByTrack: Record<AssessmentTrack, PlannedAssessmentRequest[]>;
  explicitNextByTrack: Record<AssessmentTrack, WeekTask[]>;
  completedCalendarByTrack: Record<AssessmentTrack, WeekTask[]>;
  inboxByRole: Record<UserRole, InboxMessage[]>;
  suppliesDraftByTemplateId: Record<string, SuppliesRequestDraft>;
  weekStartByTrack: Record<AssessmentTrack, string>;
  notNeededThisWeekByTrack: Record<AssessmentTrack, string[]>;
  closingDoneByTrack: Record<AssessmentTrack, string[]>;
  dailyTaskChecksByRole: Record<UserRole, Record<string, string[]>>;
  dailyTaskAlertsSentByDate: Record<string, UserRole[]>;
  producerRestoredClosingDone: string[];
  producerResourceRows: Record<string, unknown>;
  updatedAtIso: string;
}

type RuntimeRow = {
  workspace_id: string;
  version: number | null;
  templates: unknown;
  requests_by_track: unknown;
  explicit_next_by_track: unknown;
  completed_calendar_by_track: unknown;
  inbox_by_role: unknown;
  supplies_draft_by_template_id: unknown;
  week_start_by_track: unknown;
  not_needed_this_week_by_track: unknown;
  closing_done_by_track: unknown;
  daily_task_checks_by_role: unknown;
  daily_task_alerts_sent_by_date: unknown;
  producer_restored_closing_done: unknown;
  producer_resource_rows: unknown;
  updated_at: string | null;
};

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function normalizeTrackRecord<T>(value: unknown, fallback: T): Record<AssessmentTrack, T> {
  const record = asRecord(value);
  return {
    producer: (record.producer as T) ?? fallback,
    generalManager: (record.generalManager as T) ?? fallback,
    joManager: (record.joManager as T) ?? fallback,
    flowerSales: (record.flowerSales as T) ?? fallback,
    budtenderTd: (record.budtenderTd as T) ?? fallback,
    budtenderTdJunior: (record.budtenderTdJunior as T) ?? fallback,
    budtenderJo: (record.budtenderJo as T) ?? fallback,
    budtenderJoJunior: (record.budtenderJoJunior as T) ?? fallback,
  };
}

function normalizeInbox(value: unknown): Record<UserRole, InboxMessage[]> {
  const record = asRecord(value);
  return {
    ceo: asArray<InboxMessage>(record.ceo),
    ceoExecutive: asArray<InboxMessage>(record.ceoExecutive),
    generalManager: asArray<InboxMessage>(record.generalManager),
    flowerSales: asArray<InboxMessage>(record.flowerSales),
    producer: asArray<InboxMessage>(record.producer),
    budtenderTd: asArray<InboxMessage>(record.budtenderTd),
    budtenderTdJunior: asArray<InboxMessage>(record.budtenderTdJunior),
    budtenderJo: asArray<InboxMessage>(record.budtenderJo),
    budtenderJoSenior: asArray<InboxMessage>(record.budtenderJoSenior),
    budtenderJoJunior: asArray<InboxMessage>(record.budtenderJoJunior),
  };
}

function normalizeDailyChecks(value: unknown): Record<UserRole, Record<string, string[]>> {
  const record = asRecord(value);
  const roleRows = (role: UserRole): Record<string, string[]> => {
    const source = asRecord(record[role]);
    const out: Record<string, string[]> = {};
    for (const [dateIso, ids] of Object.entries(source)) {
      out[dateIso] = asArray<string>(ids);
    }
    return out;
  };
  return {
    ceo: roleRows('ceo'),
    ceoExecutive: roleRows('ceoExecutive'),
    generalManager: roleRows('generalManager'),
    flowerSales: roleRows('flowerSales'),
    producer: roleRows('producer'),
    budtenderTd: roleRows('budtenderTd'),
    budtenderTdJunior: roleRows('budtenderTdJunior'),
    budtenderJo: roleRows('budtenderJo'),
    budtenderJoSenior: roleRows('budtenderJoSenior'),
    budtenderJoJunior: roleRows('budtenderJoJunior'),
  };
}

function toSnapshotFromRow(row: RuntimeRow): RuntimeSnapshot {
  return {
    version: typeof row.version === 'number' ? row.version : 1,
    templates: asArray<AssessmentTemplate>(row.templates),
    requestsByTrack: normalizeTrackRecord(row.requests_by_track, [] as PlannedAssessmentRequest[]),
    explicitNextByTrack: normalizeTrackRecord(row.explicit_next_by_track, [] as WeekTask[]),
    completedCalendarByTrack: normalizeTrackRecord(row.completed_calendar_by_track, [] as WeekTask[]),
    inboxByRole: normalizeInbox(row.inbox_by_role),
    suppliesDraftByTemplateId: asRecord(row.supplies_draft_by_template_id) as Record<string, SuppliesRequestDraft>,
    weekStartByTrack: normalizeTrackRecord(row.week_start_by_track, ''),
    notNeededThisWeekByTrack: normalizeTrackRecord(row.not_needed_this_week_by_track, [] as string[]),
    closingDoneByTrack: normalizeTrackRecord(row.closing_done_by_track, [] as string[]),
    dailyTaskChecksByRole: normalizeDailyChecks(row.daily_task_checks_by_role),
    dailyTaskAlertsSentByDate: asRecord(row.daily_task_alerts_sent_by_date) as Record<string, UserRole[]>,
    producerRestoredClosingDone: asArray<string>(row.producer_restored_closing_done),
    producerResourceRows: asRecord(row.producer_resource_rows),
    updatedAtIso: typeof row.updated_at === 'string' ? row.updated_at : new Date().toISOString(),
  };
}

function localSnapshotKey(workspaceId: string): string {
  return `${runtimeSnapshotStoragePrefix}.${workspaceId}`;
}

function loadLocalRuntimeSnapshot(workspaceId: string): RuntimeSnapshot | null {
  try {
    const raw = localStorage.getItem(localSnapshotKey(workspaceId));
    if (!raw) return null;
    const decoded = JSON.parse(raw) as RuntimeSnapshot;
    if (!decoded || typeof decoded !== 'object') return null;
    return decoded;
  } catch {
    return null;
  }
}

function saveLocalRuntimeSnapshot(workspaceId: string, snapshot: RuntimeSnapshot): void {
  localStorage.setItem(localSnapshotKey(workspaceId), JSON.stringify(snapshot));
}

function hasMeaningfulData(snapshot: RuntimeSnapshot): boolean {
  if (snapshot.templates.length > 0) return true;
  if (snapshot.requestsByTrack.producer.length > 0) return true;
  if (snapshot.requestsByTrack.generalManager.length > 0) return true;
  if (snapshot.requestsByTrack.joManager.length > 0) return true;
  if (snapshot.explicitNextByTrack.producer.length > 0) return true;
  if (snapshot.explicitNextByTrack.generalManager.length > 0) return true;
  if (snapshot.explicitNextByTrack.joManager.length > 0) return true;
  if (snapshot.completedCalendarByTrack.producer.length > 0) return true;
  if (snapshot.completedCalendarByTrack.generalManager.length > 0) return true;
  if (snapshot.completedCalendarByTrack.joManager.length > 0) return true;
  if (snapshot.inboxByRole.ceo.length > 0) return true;
  if (snapshot.inboxByRole.ceoExecutive.length > 0) return true;
  if (snapshot.inboxByRole.generalManager.length > 0) return true;
  if (snapshot.inboxByRole.flowerSales.length > 0) return true;
  if (snapshot.inboxByRole.producer.length > 0) return true;
  if (snapshot.inboxByRole.budtenderTd.length > 0) return true;
  if (snapshot.inboxByRole.budtenderTdJunior.length > 0) return true;
  if (snapshot.inboxByRole.budtenderJo.length > 0) return true;
  if (snapshot.inboxByRole.budtenderJoSenior.length > 0) return true;
  if (snapshot.inboxByRole.budtenderJoJunior.length > 0) return true;
  if (Object.keys(snapshot.suppliesDraftByTemplateId).length > 0) return true;
  if (snapshot.producerRestoredClosingDone.length > 0) return true;
  for (const byDate of Object.values(snapshot.dailyTaskChecksByRole)) {
    for (const ids of Object.values(byDate)) {
      if (ids.length > 0) return true;
    }
  }
  for (const roles of Object.values(snapshot.dailyTaskAlertsSentByDate)) {
    if (roles.length > 0) return true;
  }
  if (Object.keys(snapshot.producerResourceRows).length > 0) return true;
  return false;
}

export async function loadRuntimeSnapshot(): Promise<RuntimeSnapshot | null> {
  const client = getSupabaseClient();
  if (!client) {
    return loadLocalRuntimeSnapshot(supabaseWorkspaceId);
  }

  const { data, error } = await client
    .from(runtimeTable)
    .select('*')
    .eq('workspace_id', supabaseWorkspaceId)
    .maybeSingle();

  if (error) {
    console.warn('Supabase load failed, using local runtime snapshot fallback.', error.message);
    return loadLocalRuntimeSnapshot(supabaseWorkspaceId);
  }
  if (!data) {
    return loadLocalRuntimeSnapshot(supabaseWorkspaceId);
  }

  const remoteSnapshot = toSnapshotFromRow(data as RuntimeRow);
  const localSnapshot = loadLocalRuntimeSnapshot(supabaseWorkspaceId);
  if (!localSnapshot) return remoteSnapshot;

  const remoteHasData = hasMeaningfulData(remoteSnapshot);
  if (!remoteHasData) return localSnapshot;

  const remoteTs = Date.parse(remoteSnapshot.updatedAtIso);
  const localTs = Date.parse(localSnapshot.updatedAtIso);
  if (Number.isFinite(localTs) && Number.isFinite(remoteTs) && localTs > remoteTs) {
    return localSnapshot;
  }

  return remoteSnapshot;
}

export async function saveRuntimeSnapshot(snapshot: RuntimeSnapshot): Promise<void> {
  saveLocalRuntimeSnapshot(supabaseWorkspaceId, snapshot);

  const client = getSupabaseClient();
  if (!client) return;

  const payload = {
    workspace_id: supabaseWorkspaceId,
    version: snapshot.version,
    templates: snapshot.templates,
    requests_by_track: snapshot.requestsByTrack,
    explicit_next_by_track: snapshot.explicitNextByTrack,
    completed_calendar_by_track: snapshot.completedCalendarByTrack,
    inbox_by_role: snapshot.inboxByRole,
    supplies_draft_by_template_id: snapshot.suppliesDraftByTemplateId,
    week_start_by_track: snapshot.weekStartByTrack,
    not_needed_this_week_by_track: snapshot.notNeededThisWeekByTrack,
    closing_done_by_track: snapshot.closingDoneByTrack,
    daily_task_checks_by_role: snapshot.dailyTaskChecksByRole,
    daily_task_alerts_sent_by_date: snapshot.dailyTaskAlertsSentByDate,
    producer_restored_closing_done: snapshot.producerRestoredClosingDone,
    producer_resource_rows: snapshot.producerResourceRows,
    updated_at: snapshot.updatedAtIso,
  };

  const { error } = await client
    .from(runtimeTable)
    .upsert(payload, { onConflict: 'workspace_id' });

  if (error) {
    console.warn('Supabase save failed. Local fallback state is still saved.', error.message);
  }
}
