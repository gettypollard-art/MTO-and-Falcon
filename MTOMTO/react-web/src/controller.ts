import {
  assessmentTracks,
  dayLabels,
  roleDefaultTrack,
  trackLabel,
  userRoles,
} from './models';
import {
  loadRuntimeSnapshot,
  producerResourceStorageKey,
  saveRuntimeSnapshot,
  type RuntimeSnapshot,
} from './backend/runtimeStore';
import type {
  AssessmentTrack,
  AssessmentTemplate,
  FollowUpRule,
  InboxMessage,
  PlanAssessmentResult,
  PlannedAssessmentRequest,
  SeedEntry,
  SuppliesRequestDraft,
  UserRole,
  WeekTask,
} from './models';

const templatesStorageKey = 'm.templates.v1';
const suppliesDraftStorageKey = 'm.supplies_drafts.v1';
const completedCalendarStorageKey = 'm.completed_calendar.v1';
const inboxStorageKey = 'm.inbox.v1';
const runtimeSnapshotVersion = 1;

const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const dayHourLimit = 8;
const weekHourLimit = 40;

const producerRestoredClosingChecklist = [
  { id: 'rest-close-no-food', title: 'No food or dishes left out' },
  { id: 'rest-close-trash', title: 'Throw trash away' },
  { id: 'rest-close-water', title: 'Water off, check float valves' },
  { id: 'rest-close-overhead-lock', title: 'Overhead, lock doors, support flower drying in back' },
  { id: 'rest-close-overhead-lights', title: 'Overhead lights turned off' },
  { id: 'rest-close-tsheets', title: 'Sign out T-sheets' },
  { id: 'rest-close-log', title: 'Sign out of LOG' },
  { id: 'rest-close-gate', title: 'Lock gate' },
];

const retailBudtenderRoles: UserRole[] = [
  'budtenderTd',
  'budtenderTdJunior',
  'budtenderJo',
  'budtenderJoJunior',
];

function currentWeekStart(): Date {
  const now = new Date();
  const dow = now.getDay() === 0 ? 7 : now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (dow - 1));
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function isoDate(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseIso(dateIso: string): Date | null {
  if (!dateIso) return null;
  const parsed = new Date(`${dateIso}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function weekStartForDate(value: Date): Date {
  const normalized = new Date(value);
  const dow = normalized.getDay() === 0 ? 7 : normalized.getDay();
  normalized.setDate(normalized.getDate() - (dow - 1));
  normalized.setHours(0, 0, 0, 0);
  return normalized;
}

function clampPriority(value: number): number {
  return Math.max(1, Math.min(5, Math.round(value)));
}

function hourStepOptions(min = 5 / 60, max = 8): number[] {
  const values: number[] = [];
  let current = min;
  while (current <= max + 0.0001) {
    values.push(Number(current.toFixed(4)));
    current += 5 / 60;
  }
  return values;
}

function clampHours(value: number): number {
  const options = hourStepOptions();
  if (value <= options[0]) return options[0];
  if (value >= options[options.length - 1]) return options[options.length - 1];
  let best = options[0];
  let bestDistance = Math.abs(value - best);
  for (const option of options.slice(1)) {
    const distance = Math.abs(value - option);
    if (distance < bestDistance) {
      best = option;
      bestDistance = distance;
    }
  }
  return best;
}

function normalizeRecurrence(value: unknown): 'none' | 'weekly' | 'monthly' | 'yearly' {
  if (value === 'weekly' || value === 'monthly' || value === 'yearly') return value;
  return 'none';
}

function compareRooms(a: string, b: string): number {
  const ai = roomSortIndex(a);
  const bi = roomSortIndex(b);
  if (ai !== bi) return ai - bi;
  return a.toLowerCase().localeCompare(b.toLowerCase());
}

function roomSortIndex(room: string): number {
  const normalized = room.toLowerCase().replaceAll(':', '').trim();
  if (normalized.startsWith('veg room')) return 0;
  if (normalized.startsWith('flower room')) return 1;
  if (normalized.startsWith('drying room')) return 2;
  if (normalized.startsWith('west room')) return 3;
  if (normalized === 'other') return 4;
  return 99;
}

function categorySortIndex(category: string, room: string): number {
  const normalizedRoom = room.toLowerCase().replaceAll(':', '').trim();
  const normalizedCategory = category.toLowerCase().trim();
  if (normalizedRoom.startsWith('veg room')) {
    if (normalizedCategory === 'mothers inspection' || normalizedCategory === 'mothers') return 0;
    if (normalizedCategory === '2 gal plants' || normalizedCategory === '2 gallon plants' || normalizedCategory === '2 gallons') return 1;
    if (normalizedCategory === 'clones') return 2;
  }
  return 99;
}

function compareCategories(a: string, b: string, room: string): number {
  const ai = categorySortIndex(a, room);
  const bi = categorySortIndex(b, room);
  if (ai !== bi) return ai - bi;
  return a.toLowerCase().localeCompare(b.toLowerCase());
}

function isProducerClosingDutyTemplate(template: Pick<AssessmentTemplate, 'track' | 'category'>): boolean {
  return template.track === 'producer' && template.category.trim().toLowerCase() === 'closing duties';
}

function normalizeClosingDutyTitle(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replaceAll(':', '')
    .replaceAll('-', ' ')
    .replaceAll(',', ' ')
    .replace(/\s+/g, ' ');
}

function closingDutySortIndex(title: string): number {
  const normalized = normalizeClosingDutyTitle(title);
  if (normalized === 'no food or dishes left out') return 0;
  if (
    normalized === 'throw trash away' ||
    normalized === 'throw trash away and seal' ||
    normalized === 'trash thrown away and sealed'
  ) {
    return 1;
  }
  if (
    normalized === 'water off check float valves' ||
    normalized === 'veg and flower water off check float valves'
  ) return 2;
  if (
    normalized === 'overhead lock doors support flower drying in back' ||
    normalized === 'lock doors support flower drying and back' ||
    normalized === 'lock doors support flower drying and back door'
  ) {
    return 3;
  }
  if (normalized === 'overhead lights turned off' || normalized === 'lights turned off') return 4;
  if (
    normalized === 'sign out t sheets' ||
    normalized === 'sign out tsheets' ||
    normalized === 't sheets sign out' ||
    normalized === 'tsheets sign out'
  ) {
    return 5;
  }
  if (
    normalized === 'sign out on log' ||
    normalized === 'sign out log' ||
    normalized === 'sign out' ||
    normalized === 'sign logbook' ||
    normalized === 'sign log sheet' ||
    normalized === 'sign out of log'
  ) {
    return 6;
  }
  if (normalized === 'set alarm if no one else is in the building') return 7;
  if (normalized === 'lock gate') return 8;
  return 99;
}

function workdayIndex(date: Date): number {
  const dow = date.getDay() === 0 ? 7 : date.getDay();
  const idx = dow - 1;
  if (idx < 0) return 0;
  if (idx > 6) return 6;
  return idx;
}

function nextOrSameWeekday(baseDate: Date, targetWeekday: number): Date {
  const target = Math.max(0, Math.min(6, Math.floor(targetWeekday)));
  const current = workdayIndex(baseDate);
  const offset = (target - current + 7) % 7;
  const resolved = new Date(baseDate);
  resolved.setDate(baseDate.getDate() + offset);
  return resolved;
}

function nextOrSameMonthlyDate(baseDate: Date, dayOfMonth: number): Date {
  const desiredDay = Math.max(1, Math.min(31, Math.floor(dayOfMonth)));
  const candidate = new Date(baseDate);
  candidate.setDate(Math.min(desiredDay, new Date(candidate.getFullYear(), candidate.getMonth() + 1, 0).getDate()));
  if (candidate < baseDate) {
    candidate.setMonth(candidate.getMonth() + 1);
    candidate.setDate(Math.min(desiredDay, new Date(candidate.getFullYear(), candidate.getMonth() + 1, 0).getDate()));
  }
  return candidate;
}

function nextOrSameYearlyDate(baseDate: Date, monthOfYear: number, dayOfMonth: number): Date {
  const safeMonth = Math.max(0, Math.min(11, Math.floor(monthOfYear)));
  const safeDay = Math.max(1, Math.min(31, Math.floor(dayOfMonth)));
  const candidate = new Date(baseDate.getFullYear(), safeMonth, 1);
  candidate.setDate(Math.min(safeDay, new Date(candidate.getFullYear(), safeMonth + 1, 0).getDate()));
  if (candidate < baseDate) {
    candidate.setFullYear(candidate.getFullYear() + 1);
    candidate.setDate(Math.min(safeDay, new Date(candidate.getFullYear(), safeMonth + 1, 0).getDate()));
  }
  return candidate;
}

function normalizeFollowUps(template: AssessmentTemplate): FollowUpRule[] {
  const source =
    template.followUpRules.length > 0
      ? template.followUpRules
      : template.followUpTitle.trim()
      ? [
          {
            title: template.followUpTitle.trim(),
            priority: template.followUpPriority,
            hours: template.followUpHours,
            assignedRole: 'producer' as UserRole,
            daysOffset: 7,
          },
        ]
      : [];

  const seen = new Set<string>();
  const out: FollowUpRule[] = [];
  for (const rule of source) {
    const title = rule.title.trim();
    if (!title) continue;
    const normalized: FollowUpRule = {
      title,
      priority: clampPriority(rule.priority),
      hours: clampHours(rule.hours),
      assignedRole: rule.assignedRole,
      daysOffset: Math.max(0, Math.min(70, Math.floor(rule.daysOffset))),
    };
    const key = `${normalized.title.toLowerCase()}|${normalized.priority}|${normalized.hours.toFixed(4)}|${normalized.assignedRole}|${normalized.daysOffset}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
    if (out.length >= 5) break;
  }
  return out;
}

function normalizeTaskTitle(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replaceAll(':', '')
    .replaceAll('-', ' ')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ');
}

type ProducerTemplateMigrationUpdate = {
  title?: string;
  defaultHours?: number;
  remove?: boolean;
};

function producerRoomBucket(room: string): 'veg' | 'flower' | 'drying' | 'west' | 'other' | 'unknown' {
  const normalized = room.trim().toLowerCase();
  if (normalized.startsWith('veg room')) return 'veg';
  if (normalized.startsWith('flower room')) return 'flower';
  if (normalized.startsWith('drying room')) return 'drying';
  if (normalized.startsWith('west room')) return 'west';
  if (normalized === 'other') return 'other';
  return 'unknown';
}

function producerTemplateMigrationKey(bucket: string, title: string): string {
  return `${bucket}|${normalizeTaskTitle(title)}`;
}

const producerTemplateMigrationUpdates: Record<string, ProducerTemplateMigrationUpdate> = {
  [producerTemplateMigrationKey('veg', 'pH Soil Mother, send data to GM/CEO')]: {
    title: 'pH Soil Mother, send data to GM/CEO',
    defaultHours: 30 / 60,
  },
  [producerTemplateMigrationKey('veg', 'Plant death report tag numbers list send to TD Manager ZB')]: {
    title: 'Plant death report tag numbers list sent to TD Manager ZB',
    defaultHours: 10 / 60,
  },
  [producerTemplateMigrationKey('veg', 'Plant death report tag numbers list sent to TD Manager ZB')]: {
    title: 'Plant death report tag numbers list sent to TD Manager ZB',
    defaultHours: 10 / 60,
  },
  [producerTemplateMigrationKey('flower', 'Plant death report tag numbers list send to TD Manager ZB')]: {
    title: 'Plant death report tag numbers list sent to TD Manager ZB',
    defaultHours: 10 / 60,
  },
  [producerTemplateMigrationKey('flower', 'Plant death report tag numbers list sent to TD Manager ZB')]: {
    title: 'Plant death report tag numbers list sent to TD Manager ZB',
    defaultHours: 10 / 60,
  },
  [producerTemplateMigrationKey('veg', 'Spray Soap and Water')]: {
    title: 'Spray soap and water',
    defaultHours: 20 / 60,
  },
  [producerTemplateMigrationKey('veg', 'Water Mothers')]: { defaultHours: 20 / 60 },
  [producerTemplateMigrationKey('veg', 'Inspect for Bugs')]: {
    title: 'Inspect for bugs',
    defaultHours: 10 / 60,
  },
  [producerTemplateMigrationKey('veg', 'Feed')]: { defaultHours: 10 / 60 },
  [producerTemplateMigrationKey('veg', 'Prune Moms')]: { defaultHours: 30 / 60 },
  [producerTemplateMigrationKey('veg', 'Rotate/Prune Mothers so they are not touching eachother')]: {
    title: 'Rotate/Prune Mothers so they are not touching each other',
    defaultHours: 20 / 60,
  },
  [producerTemplateMigrationKey('veg', 'Rotate/Prune Mothers so they are not touching each other')]: {
    title: 'Rotate/Prune Mothers so they are not touching each other',
    defaultHours: 20 / 60,
  },
  [producerTemplateMigrationKey('veg', 'Schedule Mother to watered again')]: {
    title: 'Schedule Mother to water again',
    defaultHours: 20 / 60,
  },
  [producerTemplateMigrationKey('veg', 'Schedule Mother to water again')]: {
    title: 'Schedule Mother to water again',
    defaultHours: 20 / 60,
  },
  [producerTemplateMigrationKey('veg', 'Do they need to be topped? Stay below 16"')]: {
    title: 'Do they need to be topped? Stay below 16 inches.',
    defaultHours: 10 / 60,
  },
  [producerTemplateMigrationKey('veg', 'Do they need to be topped? Stay below 16 inches.')]: {
    title: 'Do they need to be topped? Stay below 16 inches.',
    defaultHours: 10 / 60,
  },
  [producerTemplateMigrationKey('veg', 'Veg Plants made Tag numbers list send to TD Manager ZB')]: {
    title: 'Veg plants made tag numbers list sent to TD Manager ZB',
    defaultHours: 20 / 60,
  },
  [producerTemplateMigrationKey('veg', 'Veg plants made tag numbers list sent to TD Manager ZB')]: {
    title: 'Veg plants made tag numbers list sent to TD Manager ZB',
    defaultHours: 20 / 60,
  },
  [producerTemplateMigrationKey('veg', 'Water 2 Gals')]: {
    title: 'Water 2 gallons',
    defaultHours: 20 / 60,
  },
  [producerTemplateMigrationKey('veg', 'Water 2 Gallons')]: {
    title: 'Water 2 gallons',
    defaultHours: 20 / 60,
  },
  [producerTemplateMigrationKey('veg', 'Schedule Next watering')]: { defaultHours: 10 / 60 },
  [producerTemplateMigrationKey('veg', 'Actually make schedule next watering')]: { defaultHours: 5 / 60 },
  [producerTemplateMigrationKey('veg', 'Transfer Veg plants to Flower Room')]: {
    title: 'Transfer veg plants to flower room',
    defaultHours: 1,
  },
  [producerTemplateMigrationKey('veg', 'Transfer veg plants to flower room')]: {
    title: 'Transfer veg plants to flower room',
    defaultHours: 1,
  },
  [producerTemplateMigrationKey('veg', 'Increase Light intensity or timer to 18-22 hours')]: {
    title: 'Increase light intensity or timer to 18 to 22 hours',
    defaultHours: 5 / 60,
  },
  [producerTemplateMigrationKey('veg', 'Increase light intensity or timer to 18 to 22 hours')]: {
    title: 'Increase light intensity or timer to 18 to 22 hours',
    defaultHours: 5 / 60,
  },
  [producerTemplateMigrationKey('veg', 'Remove dead leaves')]: { defaultHours: 10 / 60 },
  [producerTemplateMigrationKey('veg', 'Spread out the Canopy')]: {
    title: 'Spread out the canopy',
    defaultHours: 10 / 60,
  },
  [producerTemplateMigrationKey('veg', 'Spread out the canopy')]: {
    title: 'Spread out the canopy',
    defaultHours: 10 / 60,
  },
  [producerTemplateMigrationKey('veg', 'Mother Replacement candidates')]: {
    title: 'Mother replacement candidates',
    defaultHours: 10 / 60,
  },
  [producerTemplateMigrationKey('veg', 'Mother replacement candidates')]: {
    title: 'Mother replacement candidates',
    defaultHours: 10 / 60,
  },
  [producerTemplateMigrationKey('veg', 'Do you need clean the trough')]: {
    title: 'Do you need to clean the trough?',
    defaultHours: 30 / 60,
  },
  [producerTemplateMigrationKey('veg', 'Do you need to clean the trough?')]: {
    title: 'Do you need to clean the trough?',
    defaultHours: 30 / 60,
  },
  [producerTemplateMigrationKey('veg', 'Do you need to Change out RO Filters')]: {
    title: 'Do you need to change out RO filters?',
    defaultHours: 5 / 60,
  },
  [producerTemplateMigrationKey('veg', 'Do you need to change out RO filters?')]: {
    title: 'Do you need to change out RO filters?',
    defaultHours: 5 / 60,
  },
  [producerTemplateMigrationKey('veg', 'Do you need to vacuum')]: { defaultHours: 30 / 60 },
  [producerTemplateMigrationKey('veg', 'Clones made Tag numbers list send to TD General Manager ZB')]: {
    title: 'Clones made tag numbers list sent to TD General Manager ZB',
    defaultHours: 10 / 60,
  },
  [producerTemplateMigrationKey('veg', 'Clones made tag numbers list sent to TD General Manager ZB')]: {
    title: 'Clones made tag numbers list sent to TD General Manager ZB',
    defaultHours: 10 / 60,
  },
  [producerTemplateMigrationKey('veg', 'Humidity level check')]: { defaultHours: 5 / 60 },
  [producerTemplateMigrationKey('veg', 'Water clones')]: { defaultHours: 10 / 60 },
  [producerTemplateMigrationKey('veg', 'Are Roots Visible, schedule when to pot')]: {
    title: 'Are roots visible? Schedule when to pot.',
    defaultHours: 5 / 60,
  },
  [producerTemplateMigrationKey('veg', 'Are roots visible? Schedule when to pot.')]: {
    title: 'Are roots visible? Schedule when to pot.',
    defaultHours: 5 / 60,
  },
  [producerTemplateMigrationKey('veg', 'Do we need to make more clones')]: { defaultHours: 5 / 60 },
  [producerTemplateMigrationKey('flower', 'Do you need to Deleaf 30%')]: { remove: true },
  [producerTemplateMigrationKey('flower', 'Do you need to de-leaf 30%')]: { remove: true },
  [producerTemplateMigrationKey('flower', 'Harvest, Buck, Wet Trim, place buds in drying baskets in Drying Room')]: {
    title: 'Harvest buck wet trim. Place buds in drying baskets in drying room per row.',
    defaultHours: 4,
  },
  [producerTemplateMigrationKey('flower', 'Harvest buck wet trim. Place buds in drying baskets in drying room per row.')]: {
    title: 'Harvest buck wet trim. Place buds in drying baskets in drying room per row.',
    defaultHours: 4,
  },
  [producerTemplateMigrationKey('flower', 'Harvested Plants Tag numbers list send to TD Manager ZB')]: {
    title: 'Harvested plants tag numbers list sent to TD Manager ZB',
    defaultHours: 15 / 60,
  },
  [producerTemplateMigrationKey('flower', 'Harvested plants tag numbers list sent to TD Manager ZB')]: {
    title: 'Harvested plants tag numbers list sent to TD Manager ZB',
    defaultHours: 15 / 60,
  },
  [producerTemplateMigrationKey('flower', 'Soil samples take and send into Logan Labs')]: {
    title: 'Soil samples take and send into Logan Labs',
    defaultHours: 1,
  },
  [producerTemplateMigrationKey('flower', 'Water Rows')]: {
    title: 'Water rows',
    defaultHours: 2,
  },
  [producerTemplateMigrationKey('flower', 'Water rows')]: {
    title: 'Water rows',
    defaultHours: 2,
  },
  [producerTemplateMigrationKey('flower', 'Add Soil Amendments and Rototil Soil')]: {
    title: 'Add soil amendments and rototill soil 3 rows',
    defaultHours: 2,
  },
  [producerTemplateMigrationKey('flower', 'Add soil amendments and rototill soil 3 rows')]: {
    title: 'Add soil amendments and rototill soil 3 rows',
    defaultHours: 2,
  },
  [producerTemplateMigrationKey('flower', 'Check for bugs')]: { defaultHours: 20 / 60 },
  [producerTemplateMigrationKey('flower', 'Do you need to Deleaf 100%')]: { remove: true },
  [producerTemplateMigrationKey('flower', 'Do you need to de-leaf 100%')]: { remove: true },
  [producerTemplateMigrationKey('flower', 'pH Soil day 30')]: { defaultHours: 30 / 60 },
  [producerTemplateMigrationKey('flower', 'Record High Humidity')]: { remove: true },
  [producerTemplateMigrationKey('flower', 'Record High Temp')]: { remove: true },
  [producerTemplateMigrationKey('flower', 'Record Low Humidity')]: { remove: true },
  [producerTemplateMigrationKey('flower', 'Record Low Temp')]: { remove: true },
  [producerTemplateMigrationKey('flower', 'Do you need to Prop up Plants with Stakes')]: {
    title: 'Do you need to prop up plants with stakes?',
    defaultHours: 20 / 60,
  },
  [producerTemplateMigrationKey('flower', 'Do you need to prop up plants with stakes?')]: {
    title: 'Do you need to prop up plants with stakes?',
    defaultHours: 20 / 60,
  },
  [producerTemplateMigrationKey('flower', 'Do you need to vacuum')]: { defaultHours: 2 },
  [producerTemplateMigrationKey('flower', 'Exhaust fans running')]: { defaultHours: 5 / 60 },
  [producerTemplateMigrationKey('flower', 'Do you need clean the trough')]: {
    title: 'Do you need to clean the trough?',
    defaultHours: 20 / 60,
  },
  [producerTemplateMigrationKey('flower', 'Do you need to clean the trough?')]: {
    title: 'Do you need to clean the trough?',
    defaultHours: 20 / 60,
  },
  [producerTemplateMigrationKey('flower', 'Do you need to Change out RO Filters')]: {
    title: 'Do you need to change out RO filters?',
    defaultHours: 10 / 60,
  },
  [producerTemplateMigrationKey('flower', 'Do you need to change out RO filters?')]: {
    title: 'Do you need to change out RO filters?',
    defaultHours: 10 / 60,
  },
  [producerTemplateMigrationKey('flower', 'Lights working')]: { defaultHours: 5 / 60 },
  [producerTemplateMigrationKey('drying', 'Check moisture levels of buds with humidity probe, enter humidity level….when moisture is at 14%, then dry trim')]: {
    title: 'Check moisture levels on buds etc.',
    defaultHours: 10 / 60,
  },
  [producerTemplateMigrationKey('drying', 'Check moisture levels on buds etc.')]: {
    title: 'Check moisture levels on buds etc.',
    defaultHours: 10 / 60,
  },
  [producerTemplateMigrationKey('drying', 'Dry trim touchup and bag, create Metrc tag, report tag to ZB and weight of package')]: {
    title: 'Dry trim, touch up, and bag. Create metric tag report tag ZB and weight of package.',
    defaultHours: 1,
  },
  [producerTemplateMigrationKey('drying', 'Dry trim, touch up, and bag. Create metric tag report tag ZB and weight of package.')]: {
    title: 'Dry trim, touch up, and bag. Create metric tag report tag ZB and weight of package.',
    defaultHours: 1,
  },
  [producerTemplateMigrationKey('drying', 'Mold present')]: { defaultHours: 5 / 60 },
  [producerTemplateMigrationKey('west', 'Vacuum and clean')]: {
    title: 'Vacuum and clean west room',
    defaultHours: 1,
  },
  [producerTemplateMigrationKey('west', 'Vacuum and clean west room')]: {
    title: 'Vacuum and clean west room',
    defaultHours: 1,
  },
  [producerTemplateMigrationKey('other', 'No food or dishes left out')]: { defaultHours: 5 / 60 },
  [producerTemplateMigrationKey('other', 'Overhead lights turned off')]: {
    title: 'Lights turned off',
    defaultHours: 5 / 60,
  },
  [producerTemplateMigrationKey('other', 'Lights turned off')]: { defaultHours: 5 / 60 },
  [producerTemplateMigrationKey('other', 'Overhead, lock doors, support flower drying in back')]: {
    remove: true,
  },
  [producerTemplateMigrationKey('other', 'Sign out of LOG')]: { defaultHours: 5 / 60 },
  [producerTemplateMigrationKey('other', 'Sign out T-sheets')]: { defaultHours: 5 / 60 },
  [producerTemplateMigrationKey('other', 'Throw trash away')]: { defaultHours: 5 / 60 },
  [producerTemplateMigrationKey('other', 'Water off, check float valves')]: {
    title: 'Veg and Flower water off. Check float valves.',
    defaultHours: 5 / 60,
  },
  [producerTemplateMigrationKey('other', 'Veg and Flower water off. Check float valves.')]: { defaultHours: 5 / 60 },
  [producerTemplateMigrationKey('other', 'Set alarm if no one else is in the building')]: { defaultHours: 5 / 60 },
  [producerTemplateMigrationKey('other', 'Lock gate')]: { defaultHours: 5 / 60 },
  [producerTemplateMigrationKey('other', 'Do you need any soil ingredients: List of items needs to be generated of materials:')]: {
    title: 'Do you need any soil ingredients list items to be generated materials?',
    defaultHours: 5 / 60,
  },
  [producerTemplateMigrationKey('other', 'Do you need any soil ingredients list items to be generated materials?')]: {
    title: 'Do you need any soil ingredients list items to be generated materials?',
    defaultHours: 5 / 60,
  },
  [producerTemplateMigrationKey('other', 'Equipment item, when do you need it replaced by')]: {
    title: 'Equipment item: when do you need it replaced by?',
    defaultHours: 10 / 60,
  },
  [producerTemplateMigrationKey('other', 'Equipment item: when do you need it replaced by?')]: {
    title: 'Equipment item: when do you need it replaced by?',
    defaultHours: 10 / 60,
  },
  [producerTemplateMigrationKey('other', 'Check other reservoirs')]: { defaultHours: 5 / 60 },
  [producerTemplateMigrationKey('other', 'Check that timers are good')]: { defaultHours: 5 / 60 },
  [producerTemplateMigrationKey('other', 'Dehumidifier dryer working properly')]: { defaultHours: 5 / 60 },
  [producerTemplateMigrationKey('other', 'Look for leaks in troughs')]: {
    title: 'Look for leaks in trough',
    defaultHours: 5 / 60,
  },
  [producerTemplateMigrationKey('other', 'Look for leaks in trough')]: {
    title: 'Look for leaks in trough',
    defaultHours: 5 / 60,
  },
  [producerTemplateMigrationKey('other', 'Take garbage outside')]: { defaultHours: 10 / 60 },
};

function isTransferVegToFlowerTaskTitle(title: string): boolean {
  const normalized = normalizeTaskTitle(title);
  return normalized.includes('transfer veg plants to flower room');
}

function isRoFilterTaskTitle(title: string): boolean {
  const normalized = normalizeTaskTitle(title);
  return normalized.includes('change out ro filters');
}

function normalizeFlowerRowNumber(value: number | null | undefined): number | null {
  if (typeof value !== 'number') return null;
  const safe = Math.floor(value);
  if (safe < 1 || safe > 9) return null;
  return safe;
}

function compareAutoScheduledTaskChronology(
  a: Pick<AssessmentTemplate['autoScheduledTasks'][number], 'daysUntilDue' | 'dueDateIso' | 'recurrence'>,
  b: Pick<AssessmentTemplate['autoScheduledTasks'][number], 'daysUntilDue' | 'dueDateIso' | 'recurrence'>,
): number {
  const aDays = typeof a.daysUntilDue === 'number' ? a.daysUntilDue : null;
  const bDays = typeof b.daysUntilDue === 'number' ? b.daysUntilDue : null;
  if (aDays !== null && bDays !== null) return aDays - bDays;
  if (aDays !== null) return -1;
  if (bDays !== null) return 1;

  const aDue = a.dueDateIso ? Date.parse(`${a.dueDateIso}T00:00:00`) : Number.NaN;
  const bDue = b.dueDateIso ? Date.parse(`${b.dueDateIso}T00:00:00`) : Number.NaN;
  const aValidDue = Number.isFinite(aDue);
  const bValidDue = Number.isFinite(bDue);
  if (aValidDue && bValidDue) return aDue - bDue;
  if (aValidDue) return -1;
  if (bValidDue) return 1;

  const recOrder = (value: string): number => {
    if (value === 'weekly') return 1;
    if (value === 'monthly') return 2;
    if (value === 'yearly') return 3;
    return 4;
  };
  return recOrder(a.recurrence) - recOrder(b.recurrence);
}

export class AppController {
  static dayLabels = dayLabels;
  static dayHourLimit = dayHourLimit;
  static weekHourLimit = weekHourLimit;
  static hourStepOptions = hourStepOptions;

  private listeners = new Set<() => void>();
  private idCounter = 1;
  private didLoadInitialAssessments = false;
  private loadInitialPromise: Promise<void> | null = null;
  private runtimeSaveTimer: number | null = null;
  private isSavingRuntimeSnapshot = false;

  isLoading = true;
  selectedRole: UserRole = 'producer';
  adminEditMode = false;

  templates: AssessmentTemplate[] = [];

  requestsByTrack: Record<AssessmentTrack, PlannedAssessmentRequest[]> = {
    producer: [],
    generalManager: [],
    joManager: [],
    budtenderTd: [],
    budtenderTdJunior: [],
    budtenderJo: [],
    budtenderJoJunior: [],
  };

  explicitNextByTrack: Record<AssessmentTrack, WeekTask[]> = {
    producer: [],
    generalManager: [],
    joManager: [],
    budtenderTd: [],
    budtenderTdJunior: [],
    budtenderJo: [],
    budtenderJoJunior: [],
  };

  thisWeekByTrack: Record<AssessmentTrack, WeekTask[]> = {
    producer: [],
    generalManager: [],
    joManager: [],
    budtenderTd: [],
    budtenderTdJunior: [],
    budtenderJo: [],
    budtenderJoJunior: [],
  };

  overflowByTrack: Record<AssessmentTrack, WeekTask[]> = {
    producer: [],
    generalManager: [],
    joManager: [],
    budtenderTd: [],
    budtenderTdJunior: [],
    budtenderJo: [],
    budtenderJoJunior: [],
  };

  completedCalendarByTrack: Record<AssessmentTrack, WeekTask[]> = {
    producer: [],
    generalManager: [],
    joManager: [],
    budtenderTd: [],
    budtenderTdJunior: [],
    budtenderJo: [],
    budtenderJoJunior: [],
  };

  dailyLoadsByTrack: Record<AssessmentTrack, Record<number, number>> = {
    producer: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 },
    generalManager: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 },
    joManager: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 },
    budtenderTd: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 },
    budtenderTdJunior: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 },
    budtenderJo: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 },
    budtenderJoJunior: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 },
  };

  weekLoadByTrack: Record<AssessmentTrack, number> = {
    producer: 0,
    generalManager: 0,
    joManager: 0,
    budtenderTd: 0,
    budtenderTdJunior: 0,
    budtenderJo: 0,
    budtenderJoJunior: 0,
  };

  weekStartByTrack: Record<AssessmentTrack, string> = {
    producer: isoDate(currentWeekStart()),
    generalManager: isoDate(currentWeekStart()),
    joManager: isoDate(currentWeekStart()),
    budtenderTd: isoDate(currentWeekStart()),
    budtenderTdJunior: isoDate(currentWeekStart()),
    budtenderJo: isoDate(currentWeekStart()),
    budtenderJoJunior: isoDate(currentWeekStart()),
  };

  notNeededThisWeekByTrack: Record<AssessmentTrack, Set<string>> = {
    producer: new Set(),
    generalManager: new Set(),
    joManager: new Set(),
    budtenderTd: new Set(),
    budtenderTdJunior: new Set(),
    budtenderJo: new Set(),
    budtenderJoJunior: new Set(),
  };

  closingDoneByTrack: Record<AssessmentTrack, Set<string>> = {
    producer: new Set(),
    generalManager: new Set(),
    joManager: new Set(),
    budtenderTd: new Set(),
    budtenderTdJunior: new Set(),
    budtenderJo: new Set(),
    budtenderJoJunior: new Set(),
  };

  producerRestoredClosingDone = new Set<string>();

  inboxByRole: Record<UserRole, InboxMessage[]> = {
    ceo: [],
    ceoExecutive: [],
    generalManager: [],
    flowerSales: [],
    producer: [],
    budtenderTd: [],
    budtenderTdJunior: [],
    budtenderJo: [],
    budtenderJoSenior: [],
    budtenderJoJunior: [],
  };

  dailyTaskChecksByRole: Record<UserRole, Record<string, Set<string>>> = {
    ceo: {},
    ceoExecutive: {},
    generalManager: {},
    flowerSales: {},
    producer: {},
    budtenderTd: {},
    budtenderTdJunior: {},
    budtenderJo: {},
    budtenderJoSenior: {},
    budtenderJoJunior: {},
  };

  dailyTaskAlertsSentByDate: Record<string, Set<UserRole>> = {};

  suppliesDraftByTemplateId: Record<string, SuppliesRequestDraft> = {};

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
    if (this.didLoadInitialAssessments && !this.isLoading) {
      this.queueRuntimeSnapshotSave();
    }
  }

  get activeTrack(): AssessmentTrack {
    return roleDefaultTrack[this.selectedRole];
  }

  get canModifyBackend(): boolean {
    return this.adminEditMode;
  }

  get weekLoad(): number {
    return this.weekLoadByTrack[this.activeTrack] ?? 0;
  }

  get thisWeekSchedule(): WeekTask[] {
    return [...this.thisWeekByTrack[this.activeTrack]];
  }

  get overflowTasks(): WeekTask[] {
    return [...this.overflowByTrack[this.activeTrack]];
  }

  get unreadInboxCountForSelectedRole(): number {
    return this.inboxByRole[this.selectedRole].filter((m) => !m.isRead).length;
  }

  get weekLabel(): string {
    const weekStartIso = this.weekStartByTrack[this.activeTrack];
    const weekStart = parseIso(weekStartIso) ?? currentWeekStart();
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    return `Week of ${this.formatDate(weekStart)} - ${this.formatDate(weekEnd)}`;
  }

  formatDate(value: Date): string {
    return `${monthNames[value.getMonth()]} ${value.getDate()}, ${value.getFullYear()}`;
  }

  formatHoursLabel(hours: number): string {
    const totalMinutes = Math.round(hours * 60);
    if (totalMinutes < 60) return `${totalMinutes}m`;
    const whole = Math.floor(totalMinutes / 60);
    const remainder = totalMinutes % 60;
    if (remainder === 0) return `${whole}h`;
    return `${whole}h ${remainder}m`;
  }

  templateRequiresFlowerRowSelection(template: Pick<AssessmentTemplate, 'track' | 'title'>): boolean {
    return template.track === 'producer' && isTransferVegToFlowerTaskTitle(template.title);
  }

  allFlowerRoomLifecycleTasks(): WeekTask[] {
    const track: AssessmentTrack = 'producer';
    const fromRequests: WeekTask[] = this.requestsByTrack[track].map((request) => ({
      id: request.id,
      track,
      sourceTemplateId: request.templateId,
      title: request.title,
      room: request.room,
      category: request.category,
      priority: request.priority,
      estimatedHours: request.estimatedHours,
      day: request.preferredDay,
      completed: request.completed,
      fromOverflow: false,
      isFollowUp: false,
      sendCompletionMessage: request.sendCompletionMessage,
      completionNotifyRole: request.completionNotifyRole,
      completionActionRequiredByDefault: request.completionActionRequiredByDefault,
      sendDataToSpecificEmployee: request.sendDataToSpecificEmployee,
      dataRecipientRole: request.dataRecipientRole,
      allowVoiceDictation: request.allowVoiceDictation,
      dataSubmitted: request.dataSubmitted,
      defaultDataEntryText: request.defaultDataEntryText,
      scheduledDateIso: request.scheduledDateIso,
      flowerRowNumber: request.flowerRowNumber ?? null,
      flowerLifecycleId: request.flowerLifecycleId,
    }));
    const combined = [
      ...fromRequests,
      ...this.explicitNextByTrack[track],
      ...this.completedCalendarByTrack[track],
    ];
    const seen = new Set<string>();
    const unique = combined.filter((task) => {
      const key = task.id;
      if (seen.has(key)) return false;
      seen.add(key);
      return normalizeFlowerRowNumber(task.flowerRowNumber) !== null;
    });
    unique.sort((a, b) => {
      const aDate = parseIso(a.scheduledDateIso);
      const bDate = parseIso(b.scheduledDateIso);
      if (aDate && bDate) {
        const byDate = aDate.getTime() - bDate.getTime();
        if (byDate !== 0) return byDate;
      }
      const rowA = normalizeFlowerRowNumber(a.flowerRowNumber) ?? 0;
      const rowB = normalizeFlowerRowNumber(b.flowerRowNumber) ?? 0;
      if (rowA !== rowB) return rowB - rowA;
      return a.title.localeCompare(b.title);
    });
    return unique;
  }

  async loadInitialAssessments(): Promise<void> {
    if (this.didLoadInitialAssessments) {
      return;
    }
    if (this.loadInitialPromise) {
      await this.loadInitialPromise;
      return;
    }

    this.loadInitialPromise = this.loadInitialAssessmentsInternal();
    await this.loadInitialPromise;
  }

  private async loadInitialAssessmentsInternal(): Promise<void> {
    this.isLoading = true;
    this.notify();

    const loadedFromRuntime = await this.loadRuntimeSnapshotIfAvailable();
    const loaded = loadedFromRuntime || this.loadTemplatesFromStorage();
    if (!loaded) {
      await this.loadTrackFile('/assets/data/producer_assessments.json', 'producer');
      await this.loadTrackFile('/assets/data/general_manager_assessments.json', 'generalManager');
      await this.loadTrackFile('/assets/data/jo_manager_assessments.json', 'joManager');
    }

    const migrated = this.migrateLegacyTemplateTitles();
    const ensured = this.ensureRequiredTemplates();
    let templatesChanged = migrated || ensured;
    if (loaded) {
      const syncedGeneralManager = await this.syncTrackFileTemplates(
        '/assets/data/general_manager_assessments.json',
        'generalManager',
      );
      const syncedJoeManager = await this.syncTrackFileTemplates(
        '/assets/data/jo_manager_assessments.json',
        'joManager',
      );
      templatesChanged = templatesChanged || syncedGeneralManager || syncedJoeManager;
    }
    this.dedupeTemplates();
    this.sortTemplates();
    if (loaded && templatesChanged && !loadedFromRuntime) {
      this.persistTemplates();
    }

    if (!loadedFromRuntime) {
      this.loadSuppliesDraftsFromStorage();
      this.loadCompletedCalendarFromStorage();
      this.loadInboxFromStorage();
    }

    for (const track of assessmentTracks) {
      this.recomputeTrack(track);
    }

    if (!loadedFromRuntime && loaded) {
      this.queueRuntimeSnapshotSave();
    }

    this.isLoading = false;
    this.didLoadInitialAssessments = true;
    this.loadInitialPromise = null;
    this.notify();
  }

  private async loadRuntimeSnapshotIfAvailable(): Promise<boolean> {
    try {
      const snapshot = await loadRuntimeSnapshot();
      if (!snapshot) return false;
      this.applyRuntimeSnapshot(snapshot);
      this.syncIdCounterFromAllKnownIds();
      return true;
    } catch (error) {
      console.warn('Failed to load runtime snapshot from Supabase/local fallback.', error);
      return false;
    }
  }

  private applyRuntimeSnapshot(snapshot: RuntimeSnapshot): void {
    this.templates = Array.isArray(snapshot.templates) ? snapshot.templates : [];
    this.requestsByTrack = {
      producer: Array.isArray(snapshot.requestsByTrack?.producer) ? snapshot.requestsByTrack.producer : [],
      generalManager: Array.isArray(snapshot.requestsByTrack?.generalManager) ? snapshot.requestsByTrack.generalManager : [],
      joManager: Array.isArray(snapshot.requestsByTrack?.joManager) ? snapshot.requestsByTrack.joManager : [],
      budtenderTd: Array.isArray(snapshot.requestsByTrack?.budtenderTd) ? snapshot.requestsByTrack.budtenderTd : [],
      budtenderTdJunior: Array.isArray(snapshot.requestsByTrack?.budtenderTdJunior) ? snapshot.requestsByTrack.budtenderTdJunior : [],
      budtenderJo: Array.isArray(snapshot.requestsByTrack?.budtenderJo) ? snapshot.requestsByTrack.budtenderJo : [],
      budtenderJoJunior: Array.isArray(snapshot.requestsByTrack?.budtenderJoJunior) ? snapshot.requestsByTrack.budtenderJoJunior : [],
    };
    this.explicitNextByTrack = {
      producer: Array.isArray(snapshot.explicitNextByTrack?.producer) ? snapshot.explicitNextByTrack.producer : [],
      generalManager: Array.isArray(snapshot.explicitNextByTrack?.generalManager) ? snapshot.explicitNextByTrack.generalManager : [],
      joManager: Array.isArray(snapshot.explicitNextByTrack?.joManager) ? snapshot.explicitNextByTrack.joManager : [],
      budtenderTd: Array.isArray(snapshot.explicitNextByTrack?.budtenderTd) ? snapshot.explicitNextByTrack.budtenderTd : [],
      budtenderTdJunior: Array.isArray(snapshot.explicitNextByTrack?.budtenderTdJunior) ? snapshot.explicitNextByTrack.budtenderTdJunior : [],
      budtenderJo: Array.isArray(snapshot.explicitNextByTrack?.budtenderJo) ? snapshot.explicitNextByTrack.budtenderJo : [],
      budtenderJoJunior: Array.isArray(snapshot.explicitNextByTrack?.budtenderJoJunior) ? snapshot.explicitNextByTrack.budtenderJoJunior : [],
    };
    this.completedCalendarByTrack = {
      producer: Array.isArray(snapshot.completedCalendarByTrack?.producer) ? snapshot.completedCalendarByTrack.producer : [],
      generalManager: Array.isArray(snapshot.completedCalendarByTrack?.generalManager)
        ? snapshot.completedCalendarByTrack.generalManager
        : [],
      joManager: Array.isArray(snapshot.completedCalendarByTrack?.joManager) ? snapshot.completedCalendarByTrack.joManager : [],
      budtenderTd: Array.isArray(snapshot.completedCalendarByTrack?.budtenderTd) ? snapshot.completedCalendarByTrack.budtenderTd : [],
      budtenderTdJunior: Array.isArray(snapshot.completedCalendarByTrack?.budtenderTdJunior) ? snapshot.completedCalendarByTrack.budtenderTdJunior : [],
      budtenderJo: Array.isArray(snapshot.completedCalendarByTrack?.budtenderJo) ? snapshot.completedCalendarByTrack.budtenderJo : [],
      budtenderJoJunior: Array.isArray(snapshot.completedCalendarByTrack?.budtenderJoJunior) ? snapshot.completedCalendarByTrack.budtenderJoJunior : [],
    };
    const adminInbox = Array.isArray(snapshot.inboxByRole?.ceo) ? snapshot.inboxByRole.ceo : [];
    const ceoExecutiveInbox = Array.isArray(snapshot.inboxByRole?.ceoExecutive)
      ? snapshot.inboxByRole.ceoExecutive
      : [];
    this.inboxByRole = {
      ceo: ceoExecutiveInbox.length > 0 ? adminInbox : [],
      ceoExecutive: ceoExecutiveInbox.length > 0 ? ceoExecutiveInbox : adminInbox,
      generalManager: Array.isArray(snapshot.inboxByRole?.generalManager) ? snapshot.inboxByRole.generalManager : [],
      flowerSales: Array.isArray(snapshot.inboxByRole?.flowerSales) ? snapshot.inboxByRole.flowerSales : [],
      producer: Array.isArray(snapshot.inboxByRole?.producer) ? snapshot.inboxByRole.producer : [],
      budtenderTd: Array.isArray(snapshot.inboxByRole?.budtenderTd) ? snapshot.inboxByRole.budtenderTd : [],
      budtenderTdJunior: Array.isArray(snapshot.inboxByRole?.budtenderTdJunior) ? snapshot.inboxByRole.budtenderTdJunior : [],
      budtenderJo: Array.isArray(snapshot.inboxByRole?.budtenderJo) ? snapshot.inboxByRole.budtenderJo : [],
      budtenderJoSenior: Array.isArray(snapshot.inboxByRole?.budtenderJoSenior) ? snapshot.inboxByRole.budtenderJoSenior : [],
      budtenderJoJunior: Array.isArray(snapshot.inboxByRole?.budtenderJoJunior) ? snapshot.inboxByRole.budtenderJoJunior : [],
    };
    const emptyDailyChecks: Record<UserRole, Record<string, Set<string>>> = {
      ceo: {},
      ceoExecutive: {},
      generalManager: {},
      flowerSales: {},
      producer: {},
      budtenderTd: {},
      budtenderTdJunior: {},
      budtenderJo: {},
      budtenderJoSenior: {},
      budtenderJoJunior: {},
    };
    for (const role of userRoles) {
      const byDate = snapshot.dailyTaskChecksByRole?.[role];
      if (!byDate || typeof byDate !== 'object') continue;
      for (const [dateIso, checkedIds] of Object.entries(byDate)) {
        emptyDailyChecks[role][dateIso] = new Set(Array.isArray(checkedIds) ? checkedIds : []);
      }
    }
    this.dailyTaskChecksByRole = emptyDailyChecks;
    this.dailyTaskAlertsSentByDate = {};
    const alertSource = snapshot.dailyTaskAlertsSentByDate;
    if (alertSource && typeof alertSource === 'object') {
      for (const [dateIso, roles] of Object.entries(alertSource)) {
        this.dailyTaskAlertsSentByDate[dateIso] = new Set(
          Array.isArray(roles) ? (roles as UserRole[]) : [],
        );
      }
    }
    this.suppliesDraftByTemplateId =
      typeof snapshot.suppliesDraftByTemplateId === 'object' && snapshot.suppliesDraftByTemplateId !== null
        ? snapshot.suppliesDraftByTemplateId
        : {};
    this.weekStartByTrack = {
      producer: String(snapshot.weekStartByTrack?.producer ?? isoDate(currentWeekStart())),
      generalManager: String(snapshot.weekStartByTrack?.generalManager ?? isoDate(currentWeekStart())),
      joManager: String(snapshot.weekStartByTrack?.joManager ?? isoDate(currentWeekStart())),
      budtenderTd: String(snapshot.weekStartByTrack?.budtenderTd ?? isoDate(currentWeekStart())),
      budtenderTdJunior: String(snapshot.weekStartByTrack?.budtenderTdJunior ?? isoDate(currentWeekStart())),
      budtenderJo: String(snapshot.weekStartByTrack?.budtenderJo ?? isoDate(currentWeekStart())),
      budtenderJoJunior: String(snapshot.weekStartByTrack?.budtenderJoJunior ?? isoDate(currentWeekStart())),
    };
    this.notNeededThisWeekByTrack = {
      producer: new Set(Array.isArray(snapshot.notNeededThisWeekByTrack?.producer) ? snapshot.notNeededThisWeekByTrack.producer : []),
      generalManager: new Set(
        Array.isArray(snapshot.notNeededThisWeekByTrack?.generalManager)
          ? snapshot.notNeededThisWeekByTrack.generalManager
          : [],
      ),
      joManager: new Set(Array.isArray(snapshot.notNeededThisWeekByTrack?.joManager) ? snapshot.notNeededThisWeekByTrack.joManager : []),
      budtenderTd: new Set(Array.isArray(snapshot.notNeededThisWeekByTrack?.budtenderTd) ? snapshot.notNeededThisWeekByTrack.budtenderTd : []),
      budtenderTdJunior: new Set(Array.isArray(snapshot.notNeededThisWeekByTrack?.budtenderTdJunior) ? snapshot.notNeededThisWeekByTrack.budtenderTdJunior : []),
      budtenderJo: new Set(Array.isArray(snapshot.notNeededThisWeekByTrack?.budtenderJo) ? snapshot.notNeededThisWeekByTrack.budtenderJo : []),
      budtenderJoJunior: new Set(Array.isArray(snapshot.notNeededThisWeekByTrack?.budtenderJoJunior) ? snapshot.notNeededThisWeekByTrack.budtenderJoJunior : []),
    };
    this.closingDoneByTrack = {
      producer: new Set(Array.isArray(snapshot.closingDoneByTrack?.producer) ? snapshot.closingDoneByTrack.producer : []),
      generalManager: new Set(
        Array.isArray(snapshot.closingDoneByTrack?.generalManager)
          ? snapshot.closingDoneByTrack.generalManager
          : [],
      ),
      joManager: new Set(Array.isArray(snapshot.closingDoneByTrack?.joManager) ? snapshot.closingDoneByTrack.joManager : []),
      budtenderTd: new Set(Array.isArray(snapshot.closingDoneByTrack?.budtenderTd) ? snapshot.closingDoneByTrack.budtenderTd : []),
      budtenderTdJunior: new Set(Array.isArray(snapshot.closingDoneByTrack?.budtenderTdJunior) ? snapshot.closingDoneByTrack.budtenderTdJunior : []),
      budtenderJo: new Set(Array.isArray(snapshot.closingDoneByTrack?.budtenderJo) ? snapshot.closingDoneByTrack.budtenderJo : []),
      budtenderJoJunior: new Set(Array.isArray(snapshot.closingDoneByTrack?.budtenderJoJunior) ? snapshot.closingDoneByTrack.budtenderJoJunior : []),
    };
    this.producerRestoredClosingDone = new Set(
      Array.isArray(snapshot.producerRestoredClosingDone) ? snapshot.producerRestoredClosingDone : [],
    );
    if (snapshot.producerResourceRows && typeof snapshot.producerResourceRows === 'object') {
      localStorage.setItem(producerResourceStorageKey, JSON.stringify(snapshot.producerResourceRows));
    }
  }

  private buildRuntimeSnapshot(): RuntimeSnapshot {
    let producerResourceRows: Record<string, unknown> = {};
    try {
      const raw = localStorage.getItem(producerResourceStorageKey);
      if (raw) {
        const decoded = JSON.parse(raw);
        if (decoded && typeof decoded === 'object') {
          producerResourceRows = decoded as Record<string, unknown>;
        }
      }
    } catch {
      producerResourceRows = {};
    }

    return {
      version: runtimeSnapshotVersion,
      templates: this.templates,
      requestsByTrack: this.requestsByTrack,
      explicitNextByTrack: this.explicitNextByTrack,
      completedCalendarByTrack: this.completedCalendarByTrack,
      inboxByRole: this.inboxByRole,
      suppliesDraftByTemplateId: this.suppliesDraftByTemplateId,
      weekStartByTrack: this.weekStartByTrack,
      notNeededThisWeekByTrack: {
        producer: Array.from(this.notNeededThisWeekByTrack.producer),
        generalManager: Array.from(this.notNeededThisWeekByTrack.generalManager),
        joManager: Array.from(this.notNeededThisWeekByTrack.joManager),
        budtenderTd: Array.from(this.notNeededThisWeekByTrack.budtenderTd),
        budtenderTdJunior: Array.from(this.notNeededThisWeekByTrack.budtenderTdJunior),
        budtenderJo: Array.from(this.notNeededThisWeekByTrack.budtenderJo),
        budtenderJoJunior: Array.from(this.notNeededThisWeekByTrack.budtenderJoJunior),
      },
      closingDoneByTrack: {
        producer: Array.from(this.closingDoneByTrack.producer),
        generalManager: Array.from(this.closingDoneByTrack.generalManager),
        joManager: Array.from(this.closingDoneByTrack.joManager),
        budtenderTd: Array.from(this.closingDoneByTrack.budtenderTd),
        budtenderTdJunior: Array.from(this.closingDoneByTrack.budtenderTdJunior),
        budtenderJo: Array.from(this.closingDoneByTrack.budtenderJo),
        budtenderJoJunior: Array.from(this.closingDoneByTrack.budtenderJoJunior),
      },
      dailyTaskChecksByRole: {
        ceo: Object.fromEntries(Object.entries(this.dailyTaskChecksByRole.ceo).map(([dateIso, ids]) => [dateIso, Array.from(ids)])),
        ceoExecutive: Object.fromEntries(
          Object.entries(this.dailyTaskChecksByRole.ceoExecutive).map(([dateIso, ids]) => [dateIso, Array.from(ids)]),
        ),
        generalManager: Object.fromEntries(
          Object.entries(this.dailyTaskChecksByRole.generalManager).map(([dateIso, ids]) => [dateIso, Array.from(ids)]),
        ),
        flowerSales: Object.fromEntries(
          Object.entries(this.dailyTaskChecksByRole.flowerSales).map(([dateIso, ids]) => [dateIso, Array.from(ids)]),
        ),
        producer: Object.fromEntries(
          Object.entries(this.dailyTaskChecksByRole.producer).map(([dateIso, ids]) => [dateIso, Array.from(ids)]),
        ),
        budtenderTd: Object.fromEntries(
          Object.entries(this.dailyTaskChecksByRole.budtenderTd).map(([dateIso, ids]) => [dateIso, Array.from(ids)]),
        ),
        budtenderTdJunior: Object.fromEntries(
          Object.entries(this.dailyTaskChecksByRole.budtenderTdJunior).map(([dateIso, ids]) => [dateIso, Array.from(ids)]),
        ),
        budtenderJo: Object.fromEntries(
          Object.entries(this.dailyTaskChecksByRole.budtenderJo).map(([dateIso, ids]) => [dateIso, Array.from(ids)]),
        ),
        budtenderJoSenior: Object.fromEntries(
          Object.entries(this.dailyTaskChecksByRole.budtenderJoSenior).map(([dateIso, ids]) => [dateIso, Array.from(ids)]),
        ),
        budtenderJoJunior: Object.fromEntries(
          Object.entries(this.dailyTaskChecksByRole.budtenderJoJunior).map(([dateIso, ids]) => [dateIso, Array.from(ids)]),
        ),
      },
      dailyTaskAlertsSentByDate: Object.fromEntries(
        Object.entries(this.dailyTaskAlertsSentByDate).map(([dateIso, roles]) => [dateIso, Array.from(roles)]),
      ) as Record<string, UserRole[]>,
      producerRestoredClosingDone: Array.from(this.producerRestoredClosingDone),
      producerResourceRows,
      updatedAtIso: new Date().toISOString(),
    };
  }

  private queueRuntimeSnapshotSave(): void {
    if (this.isSavingRuntimeSnapshot) return;
    if (this.runtimeSaveTimer !== null) {
      window.clearTimeout(this.runtimeSaveTimer);
    }
    this.runtimeSaveTimer = window.setTimeout(() => {
      this.runtimeSaveTimer = null;
      void this.saveRuntimeSnapshotNow();
    }, 450);
  }

  private async saveRuntimeSnapshotNow(): Promise<void> {
    if (this.isSavingRuntimeSnapshot || this.isLoading || !this.didLoadInitialAssessments) return;
    this.isSavingRuntimeSnapshot = true;
    try {
      await saveRuntimeSnapshot(this.buildRuntimeSnapshot());
    } catch (error) {
      console.warn('Failed to save runtime snapshot.', error);
    } finally {
      this.isSavingRuntimeSnapshot = false;
    }
  }

  updateProducerResourceRows(rows: Record<string, unknown>): void {
    localStorage.setItem(producerResourceStorageKey, JSON.stringify(rows));
    this.queueRuntimeSnapshotSave();
  }

  private async loadTrackFile(path: string, track: AssessmentTrack): Promise<void> {
    const response = await fetch(path);
    const decoded = (await response.json()) as SeedEntry[];
    for (const entry of decoded) {
      this.templates.push(this.seedEntryToTemplate(track, entry));
    }
  }

  private seedEntryToTemplate(track: AssessmentTrack, entry: SeedEntry): AssessmentTemplate {
    return {
      id: this.newId('seed'),
      track,
      title: String(entry.title ?? '').trim(),
      room: String(entry.room ?? 'General').trim(),
      category: String(entry.category ?? 'General').trim(),
      priority: clampPriority(entry.priority ?? 3),
      defaultHours: clampHours(entry.defaultHours ?? 1),
      autoFollowUp: false,
      followUpTitle: '',
      followUpPriority: 3,
      followUpHours: 1,
      followUpRules: [],
      sendCompletionMessage: false,
      completionNotifyRole: 'generalManager',
      completionActionRequiredByDefault: true,
      sendDataToSpecificEmployee: false,
      dataRecipientRole: 'producer',
      allowVoiceDictation: true,
      taskRecurrenceMode: 'none',
      taskRecurrenceDateIso: '',
      taskRecurrenceEveryDays: null,
      taskRecurrenceMonthlyDay: null,
      autoScheduledTasks: [],
    };
  }

  private templateMatchKey(track: AssessmentTrack, title: string, room: string): string {
    return [
      track,
      title.trim().toLowerCase(),
      room.trim().toLowerCase(),
    ].join('|');
  }

  private async syncTrackFileTemplates(path: string, track: AssessmentTrack): Promise<boolean> {
    const response = await fetch(path);
    const decoded = (await response.json()) as SeedEntry[];
    let changed = false;
    const byKey = new Map<string, number>();
    for (let i = 0; i < this.templates.length; i += 1) {
      const template = this.templates[i];
      if (template.track !== track) continue;
      byKey.set(this.templateMatchKey(track, template.title, template.room), i);
    }

    for (const entry of decoded) {
      const title = String(entry.title ?? '').trim();
      const room = String(entry.room ?? 'General').trim();
      if (!title || !room) continue;
      const key = this.templateMatchKey(track, title, room);
      const existingIndex = byKey.get(key);
      const normalizedCategory = String(entry.category ?? 'General').trim();
      const normalizedPriority = clampPriority(entry.priority ?? 3);
      const normalizedHours = clampHours(entry.defaultHours ?? 1);

      if (typeof existingIndex === 'number') {
        const existing = this.templates[existingIndex];
        if (
          existing.category !== normalizedCategory ||
          existing.priority !== normalizedPriority ||
          existing.defaultHours !== normalizedHours
        ) {
          this.templates[existingIndex] = {
            ...existing,
            category: normalizedCategory,
            priority: normalizedPriority,
            defaultHours: normalizedHours,
          };
          changed = true;
        }
        continue;
      }

      const template = this.seedEntryToTemplate(track, entry);
      this.templates.push(template);
      byKey.set(key, this.templates.length - 1);
      changed = true;
    }
    return changed;
  }

  setRole(role: UserRole): void {
    this.selectedRole = role;
    this.notify();
  }

  setAdminEditMode(enabled: boolean): void {
    this.adminEditMode = enabled;
    this.notify();
  }

  markInboxMessageRead(id: string): void {
    const messages = this.inboxByRole[this.selectedRole];
    const idx = messages.findIndex((m) => m.id === id);
    if (idx < 0 || messages[idx].isRead) return;
    messages[idx] = { ...messages[idx], isRead: true };
    this.persistInboxToStorage();
    this.notify();
  }

  markAllInboxMessagesReadForSelectedRole(): void {
    const messages = this.inboxByRole[this.selectedRole];
    let changed = false;
    for (let i = 0; i < messages.length; i += 1) {
      if (!messages[i].isRead) {
        messages[i] = { ...messages[i], isRead: true };
        changed = true;
      }
    }
    if (changed) {
      this.persistInboxToStorage();
      this.notify();
    }
  }

  sendInboxMessage(input: {
    recipients: UserRole[];
    title: string;
    notes: string;
    tags?: string[];
    actionRequired?: boolean;
  }): void {
    const title = input.title.trim();
    if (!title || input.recipients.length === 0) return;
    const now = new Date().toISOString();
    const unique = Array.from(new Set(input.recipients));
    for (const recipient of unique) {
      if (recipient === this.selectedRole) continue;
      this.inboxByRole[recipient].unshift({
        id: this.newId('msg'),
        fromRole: this.selectedRole,
        toRole: recipient,
        title,
        notes: input.notes.trim(),
        tags: input.tags ?? [],
        createdAt: now,
        actionRequired: Boolean(input.actionRequired),
        isRead: false,
      });
    }
    this.persistInboxToStorage();
    this.notify();
  }

  templatesByRoomForActiveTrack(): Record<string, AssessmentTemplate[]> {
    const filtered = this.templates.filter(
      (t) => t.track === this.activeTrack && !isProducerClosingDutyTemplate(t),
    );
    filtered.sort((a, b) => {
      const byRoom = compareRooms(a.room, b.room);
      if (byRoom !== 0) return byRoom;
      const byCategory = compareCategories(a.category, b.category, a.room);
      if (byCategory !== 0) return byCategory;
      const byPriority = a.priority - b.priority;
      if (byPriority !== 0) return byPriority;
      return a.title.localeCompare(b.title);
    });
    const grouped: Record<string, AssessmentTemplate[]> = {};
    for (const t of filtered) {
      if (!grouped[t.room]) grouped[t.room] = [];
      grouped[t.room].push(t);
    }
    return grouped;
  }

  allScheduledCalendarTasksForActiveTrack(): WeekTask[] {
    const combined = [
      ...this.thisWeekByTrack[this.activeTrack],
      ...this.explicitNextByTrack[this.activeTrack],
      ...this.completedCalendarByTrack[this.activeTrack],
    ];
    combined.sort((a, b) => {
      const aDate = parseIso(a.scheduledDateIso);
      const bDate = parseIso(b.scheduledDateIso);
      if (aDate && bDate) {
        const byDate = aDate.getTime() - bDate.getTime();
        if (byDate !== 0) return byDate;
      }
      const byPriority = a.priority - b.priority;
      if (byPriority !== 0) return byPriority;
      return a.title.localeCompare(b.title);
    });

    const seen = new Set<string>();
    const unique: WeekTask[] = [];
    for (const task of combined) {
      const key = task.id;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(task);
      }
    }
    return unique;
  }

  private normalizeChecklistDate(dateIso: string): string {
    const parsed = parseIso(dateIso);
    return parsed ? isoDate(parsed) : isoDate(new Date());
  }

  dailyChecklistRoles(): UserRole[] {
    return [...retailBudtenderRoles];
  }

  dailyChecklistTemplatesForRole(role: UserRole): AssessmentTemplate[] {
    const track = roleDefaultTrack[role];
    return this.templates
      .filter((template) => template.track === track)
      .sort((a, b) => {
        const byRoom = compareRooms(a.room, b.room);
        if (byRoom !== 0) return byRoom;
        const byPriority = a.priority - b.priority;
        if (byPriority !== 0) return byPriority;
        return a.title.localeCompare(b.title);
      });
  }

  isDailyChecklistTaskChecked(role: UserRole, dateIso: string, templateId: string): boolean {
    const safeDate = this.normalizeChecklistDate(dateIso);
    return this.dailyTaskChecksByRole[role][safeDate]?.has(templateId) ?? false;
  }

  setDailyChecklistTaskChecked(role: UserRole, dateIso: string, templateId: string, checked: boolean): void {
    const safeDate = this.normalizeChecklistDate(dateIso);
    if (!this.dailyTaskChecksByRole[role][safeDate]) {
      this.dailyTaskChecksByRole[role][safeDate] = new Set<string>();
    }
    if (checked) {
      this.dailyTaskChecksByRole[role][safeDate].add(templateId);
    } else {
      this.dailyTaskChecksByRole[role][safeDate].delete(templateId);
    }
    this.notifyRetailManagerForIncompleteDailyTasks(safeDate, false);
    this.notify();
  }

  dailyChecklistCompletionForRole(role: UserRole, dateIso: string): {
    total: number;
    completed: number;
    pendingTitles: string[];
  } {
    const safeDate = this.normalizeChecklistDate(dateIso);
    const templates = this.dailyChecklistTemplatesForRole(role);
    const checked = this.dailyTaskChecksByRole[role][safeDate] ?? new Set<string>();
    const completed = templates.filter((template) => checked.has(template.id)).length;
    const pendingTitles = templates
      .filter((template) => !checked.has(template.id))
      .map((template) => template.title);
    return {
      total: templates.length,
      completed,
      pendingTitles,
    };
  }

  dailyChecklistSummaryForManagers(dateIso: string): Array<{
    role: UserRole;
    total: number;
    completed: number;
    pendingTitles: string[];
  }> {
    const safeDate = this.normalizeChecklistDate(dateIso);
    return this.dailyChecklistRoles().map((role) => {
      const completion = this.dailyChecklistCompletionForRole(role, safeDate);
      return {
        role,
        total: completion.total,
        completed: completion.completed,
        pendingTitles: completion.pendingTitles,
      };
    });
  }

  notifyRetailManagerForIncompleteDailyTasks(dateIso: string, force = false): number {
    const safeDate = this.normalizeChecklistDate(dateIso);
    if (!this.dailyTaskAlertsSentByDate[safeDate]) {
      this.dailyTaskAlertsSentByDate[safeDate] = new Set<UserRole>();
    }

    let sent = 0;
    for (const role of this.dailyChecklistRoles()) {
      const summary = this.dailyChecklistCompletionForRole(role, safeDate);
      if (summary.total === 0 || summary.pendingTitles.length === 0) continue;
      if (!force && this.dailyTaskAlertsSentByDate[safeDate].has(role)) continue;

      const notes = [
        `Date: ${safeDate}`,
        `Role: ${role}`,
        `Completed: ${summary.completed}/${summary.total}`,
        'Pending tasks:',
        ...summary.pendingTitles.map((title) => `- ${title}`),
      ].join('\n');

      const originalSender = this.selectedRole;
      this.selectedRole = role;
      this.sendInboxMessage({
        recipients: ['budtenderJoSenior'],
        title: `Incomplete daily checklist - ${safeDate}`,
        notes,
        tags: ['Daily Checklist', safeDate],
        actionRequired: true,
      });
      this.selectedRole = originalSender;

      this.dailyTaskAlertsSentByDate[safeDate].add(role);
      sent += 1;
    }
    if (sent > 0) {
      this.notify();
    }
    return sent;
  }

  closingTasksForActiveTrack(): AssessmentTemplate[] {
    return this.templates
      .filter((t) => t.track === this.activeTrack && isProducerClosingDutyTemplate(t))
      .sort((a, b) => {
        const ai = closingDutySortIndex(a.title);
        const bi = closingDutySortIndex(b.title);
        if (ai !== bi) return ai - bi;
        return a.title.localeCompare(b.title);
      });
  }

  isClosingTaskChecked(templateId: string): boolean {
    return this.closingDoneByTrack[this.activeTrack].has(templateId);
  }

  setClosingTaskChecked(templateId: string, checked: boolean): void {
    const set = this.closingDoneByTrack[this.activeTrack];
    if (checked) set.add(templateId);
    else set.delete(templateId);
    this.notify();
  }

  restoredClosingTasksForProducer(): Array<{ id: string; title: string }> {
    return producerRestoredClosingChecklist;
  }

  isRestoredClosingTaskChecked(taskId: string): boolean {
    return this.producerRestoredClosingDone.has(taskId);
  }

  setRestoredClosingTaskChecked(taskId: string, checked: boolean): void {
    if (checked) this.producerRestoredClosingDone.add(taskId);
    else this.producerRestoredClosingDone.delete(taskId);
    this.notify();
  }

  isTemplateNotNeededThisWeek(templateId: string): boolean {
    return this.notNeededThisWeekByTrack[this.activeTrack].has(templateId);
  }

  setTemplateNotNeededThisWeek(templateId: string, value: boolean): void {
    const track = this.activeTrack;
    const canAdmin = this.canModifyBackend;
    if (value) {
      this.notNeededThisWeekByTrack[track].add(templateId);
      this.requestsByTrack[track] = this.requestsByTrack[track].filter((r) => {
        if (r.templateId !== templateId || r.category === 'Auto Follow-up') return true;
        if (r.completed && !canAdmin) return true;
        return false;
      });
      this.explicitNextByTrack[track] = this.explicitNextByTrack[track].filter(
        (t) => {
          if (t.sourceTemplateId !== templateId || t.isFollowUp || t.fromOverflow) return true;
          if (t.completed && !canAdmin) return true;
          return false;
        },
      );
    } else {
      this.notNeededThisWeekByTrack[track].delete(templateId);
    }
    this.recomputeTrack(track);
    this.notify();
  }

  findThisWeekRequest(templateId: string): PlannedAssessmentRequest | undefined {
    return this.requestsByTrack[this.activeTrack].find(
      (r) => r.templateId === templateId && r.category !== 'Auto Follow-up',
    );
  }

  findExplicitNextWeekTask(templateId: string): WeekTask | undefined {
    const weekStart = parseIso(this.weekStartByTrack[this.activeTrack]) ?? currentWeekStart();
    const nextStart = new Date(weekStart);
    nextStart.setDate(weekStart.getDate() + 7);
    const nextEnd = new Date(nextStart);
    nextEnd.setDate(nextStart.getDate() + 7);
    return this.explicitNextByTrack[this.activeTrack].find((task) => {
      const d = parseIso(task.scheduledDateIso);
      const inNext = d && d >= nextStart && d < nextEnd;
      return Boolean(inNext && task.sourceTemplateId === templateId && !task.isFollowUp && !task.fromOverflow);
    });
  }

  planAssessment(input: {
    template: AssessmentTemplate;
    hours: number;
    preferredDay: number;
    forNextWeek: boolean;
    flowerRowNumber?: number | null;
    skipLinkedScheduling?: boolean;
  }): PlanAssessmentResult {
    const track = this.activeTrack;
    const hours = clampHours(input.hours);
    const safeDay = Math.max(0, Math.min(6, Math.floor(input.preferredDay)));
    const flowerRowNumber = normalizeFlowerRowNumber(input.flowerRowNumber);
    const existingThisWeek = this.requestsByTrack[track].find(
      (request) => request.templateId === input.template.id && request.category !== 'Auto Follow-up',
    );
    const existingNextWeek = this.explicitNextByTrack[track].find(
      (task) => task.sourceTemplateId === input.template.id && !task.isFollowUp && !task.fromOverflow,
    );
    if (
      !this.canModifyBackend
      && ((existingThisWeek?.completed ?? false) || (existingNextWeek?.completed ?? false))
    ) {
      return {
        requestedDay: safeDay,
        assignedDay:
          (typeof existingThisWeek?.preferredDay === 'number' ? existingThisWeek.preferredDay : null)
          ?? (typeof existingNextWeek?.day === 'number' ? existingNextWeek.day : null),
      };
    }
    const weekStart = parseIso(this.weekStartByTrack[track]) ?? currentWeekStart();
    const assignmentDate = new Date(weekStart);
    assignmentDate.setDate(weekStart.getDate() + safeDay + (input.forNextWeek ? 7 : 0));

    let scheduledId = '';

    if (input.forNextWeek) {
      this.requestsByTrack[track] = this.requestsByTrack[track].filter(
        (r) => r.templateId !== input.template.id || r.category === 'Auto Follow-up',
      );

      const list = this.explicitNextByTrack[track];
      const idx = list.findIndex((t) => t.sourceTemplateId === input.template.id && !t.isFollowUp && !t.fromOverflow);
      const lifecycleId =
        idx < 0
          ? (flowerRowNumber ? this.newId('rowlife') : undefined)
          : (list[idx].flowerLifecycleId ?? (flowerRowNumber ? this.newId('rowlife') : undefined));
      const task: WeekTask = {
        id: idx < 0 ? this.newId('next') : list[idx].id,
        track,
        sourceTemplateId: input.template.id,
        title: flowerRowNumber ? `${input.template.title} (Row ${flowerRowNumber})` : input.template.title,
        room: input.template.room,
        category: input.template.category,
        priority: input.template.priority,
        estimatedHours: hours,
        day: safeDay,
        completed: false,
        fromOverflow: false,
        isFollowUp: false,
        sendCompletionMessage: input.template.sendCompletionMessage,
        completionNotifyRole: input.template.completionNotifyRole,
        completionActionRequiredByDefault: input.template.completionActionRequiredByDefault,
        sendDataToSpecificEmployee: input.template.sendDataToSpecificEmployee,
        dataRecipientRole: input.template.dataRecipientRole,
        allowVoiceDictation: input.template.allowVoiceDictation,
        dataSubmitted: false,
        defaultDataEntryText: '',
        scheduledDateIso: isoDate(assignmentDate),
        flowerRowNumber,
        flowerLifecycleId: lifecycleId,
      };
      if (idx < 0) list.push(task);
      else list[idx] = task;
      scheduledId = task.id;
    } else {
      this.explicitNextByTrack[track] = this.explicitNextByTrack[track].filter(
        (t) => t.sourceTemplateId !== input.template.id || t.isFollowUp || t.fromOverflow,
      );
      const list = this.requestsByTrack[track];
      const idx = list.findIndex((r) => r.templateId === input.template.id && r.category !== 'Auto Follow-up');
      const lifecycleId =
        idx < 0
          ? (flowerRowNumber ? this.newId('rowlife') : undefined)
          : (list[idx].flowerLifecycleId ?? (flowerRowNumber ? this.newId('rowlife') : undefined));
      const request: PlannedAssessmentRequest = {
        id: idx < 0 ? this.newId('req') : list[idx].id,
        track,
        templateId: input.template.id,
        title: flowerRowNumber ? `${input.template.title} (Row ${flowerRowNumber})` : input.template.title,
        room: input.template.room,
        category: input.template.category,
        priority: input.template.priority,
        estimatedHours: hours,
        preferredDay: safeDay,
        createdAt: idx < 0 ? new Date().toISOString() : list[idx].createdAt,
        completed: idx < 0 ? false : list[idx].completed,
        followUpGenerated: idx < 0 ? false : list[idx].followUpGenerated,
        sendCompletionMessage: input.template.sendCompletionMessage,
        completionNotifyRole: input.template.completionNotifyRole,
        completionActionRequiredByDefault: input.template.completionActionRequiredByDefault,
        sendDataToSpecificEmployee: input.template.sendDataToSpecificEmployee,
        dataRecipientRole: input.template.dataRecipientRole,
        allowVoiceDictation: input.template.allowVoiceDictation,
        dataSubmitted: false,
        defaultDataEntryText: '',
        scheduledDateIso: isoDate(assignmentDate),
        flowerRowNumber,
        flowerLifecycleId: lifecycleId,
      };
      if (idx < 0) list.push(request);
      else list[idx] = request;
      scheduledId = request.id;
    }

    const touched = new Set<AssessmentTrack>([track]);
    for (const t of this.syncAutoPlannedFollowUps(input.template, assignmentDate)) touched.add(t);
    if (!input.skipLinkedScheduling) {
      this.removeGeneratedLinkedTasks(input.template.id);
      for (const t of this.scheduleGeneratedLinkedTasks(input.template, assignmentDate)) {
        touched.add(t);
      }
    }
    for (const t of touched) this.recomputeTrack(t);
    this.notify();

    let assignedDay: number | null = null;
    if (!input.forNextWeek) {
      assignedDay = this.thisWeekByTrack[track].find((t) => t.id === scheduledId)?.day ?? null;
    }

    return { requestedDay: safeDay, assignedDay };
  }

  planAdditionalTransferRows(input: {
    template: AssessmentTemplate;
    hours: number;
    preferredDay: number;
    forNextWeek: boolean;
    rows: Array<{ rowNumber: number; strainName?: string }>;
  }): void {
    const track = this.activeTrack;
    const hours = clampHours(input.hours);
    const safeDay = Math.max(0, Math.min(6, Math.floor(input.preferredDay)));
    const weekStart = parseIso(this.weekStartByTrack[track]) ?? currentWeekStart();
    const targetDate = new Date(weekStart);
    targetDate.setDate(weekStart.getDate() + safeDay + (input.forNextWeek ? 7 : 0));

    let changed = false;
    for (const row of input.rows) {
      const safeRow = normalizeFlowerRowNumber(row.rowNumber);
      if (!safeRow) continue;
      const strainName = (row.strainName ?? '').trim();
      const titleSuffix = strainName ? ` - ${strainName}` : '';
      this.scheduleManualLinkedTask({
        track,
        templateId: input.template.id,
        title: `${input.template.title} (Row ${safeRow})${titleSuffix}`,
        room: input.template.room,
        category: input.template.category,
        priority: input.template.priority,
        hours,
        targetDate,
        flowerRowNumber: safeRow,
        flowerLifecycleId: this.newId('rowlife'),
      });
      changed = true;
    }

    if (changed) {
      this.recomputeTrack(track);
      this.notify();
    }
  }

  removePlan(templateId: string, fromNextWeek: boolean): void {
    const track = this.activeTrack;
    const canAdmin = this.canModifyBackend;
    if (fromNextWeek) {
      this.explicitNextByTrack[track] = this.explicitNextByTrack[track].filter(
        (t) => {
          if (t.sourceTemplateId !== templateId || t.isFollowUp || t.fromOverflow) return true;
          if (t.completed && !canAdmin) return true;
          return false;
        },
      );
    } else {
      this.requestsByTrack[track] = this.requestsByTrack[track].filter(
        (r) => {
          if (r.templateId !== templateId || r.category === 'Auto Follow-up') return true;
          if (r.completed && !canAdmin) return true;
          return false;
        },
      );
    }
    const touched = this.removeAutoPlannedFollowUps(templateId);
    touched.add(track);
    for (const t of touched) this.recomputeTrack(t);
    this.notify();
  }

  toggleThisWeekCompletion(requestId: string, completed: boolean): boolean {
    return this.setTaskCompletion(requestId, completed);
  }

  toggleNextWeekCompletion(taskId: string, completed: boolean): boolean {
    return this.setNextWeekTaskCompletion(taskId, completed);
  }

  toggleOverflowTaskCompletion(overflowTaskId: string, completed: boolean): boolean {
    const requestId = overflowTaskId.startsWith('overflow-') ? overflowTaskId.slice('overflow-'.length) : overflowTaskId;
    return this.setTaskCompletion(requestId, completed);
  }

  scheduledTaskById(taskId: string): WeekTask | undefined {
    const track = this.activeTrack;
    return [...this.thisWeekByTrack[track], ...this.explicitNextByTrack[track]].find(
      (task) => task.id === taskId,
    );
  }

  templateForScheduledTaskId(taskId: string): AssessmentTemplate | undefined {
    const task = this.scheduledTaskById(taskId);
    if (!task) return undefined;
    return this.templates.find((template) => template.id === task.sourceTemplateId);
  }

  sendTaskDataMessage(taskId: string, message: string): boolean {
    const task = this.scheduledTaskById(taskId);
    const template = this.templateForScheduledTaskId(taskId);
    if (!task || !template) return false;
    if (!template.sendDataToSpecificEmployee) return false;
    const notes = message.trim();
    if (!notes) return false;

    this.sendInboxMessage({
      recipients: [template.dataRecipientRole],
      title: `Task Data: ${task.title}`,
      notes,
      tags: ['Task Data', task.room],
      actionRequired: false,
    });

    const track = this.activeTrack;
    const requestIndex = this.requestsByTrack[track].findIndex((request) => request.id === taskId);
    if (requestIndex >= 0) {
      const request = this.requestsByTrack[track][requestIndex];
      this.requestsByTrack[track][requestIndex] = { ...request, dataSubmitted: true };
      this.recomputeTrack(track);
      this.notify();
      return true;
    }

    const nextIndex = this.explicitNextByTrack[track].findIndex((item) => item.id === taskId);
    if (nextIndex >= 0) {
      const nextTask = this.explicitNextByTrack[track][nextIndex];
      this.explicitNextByTrack[track][nextIndex] = { ...nextTask, dataSubmitted: true };
      this.recomputeTrack(track);
      this.notify();
    }
    return true;
  }

  updateScheduledTask(
    taskId: string,
    input: {
      title: string;
      room: string;
      preferredDay: number;
      estimatedHours: number;
      scheduleWindow: 'thisWeek' | 'nextWeek';
    },
  ): void {
    const track = this.activeTrack;
    const safeDay = Math.max(0, Math.min(6, Math.floor(input.preferredDay)));
    const safeHours = clampHours(input.estimatedHours);
    const weekStart = parseIso(this.weekStartByTrack[track]) ?? currentWeekStart();
    const thisWeekDate = new Date(weekStart);
    thisWeekDate.setDate(weekStart.getDate() + safeDay);
    const nextWeekDate = new Date(weekStart);
    nextWeekDate.setDate(weekStart.getDate() + 7 + safeDay);

    const requests = this.requestsByTrack[track];
    const reqIdx = requests.findIndex((request) => request.id === taskId);
    if (reqIdx >= 0) {
      const request = requests[reqIdx];
      if (request.completed && !this.canModifyBackend) {
        return;
      }
      if (input.scheduleWindow === 'thisWeek') {
        requests[reqIdx] = {
          ...request,
          title: input.title.trim() || request.title,
          room: input.room.trim() || request.room,
          preferredDay: safeDay,
          estimatedHours: safeHours,
          scheduledDateIso: isoDate(thisWeekDate),
        };
      } else {
        requests.splice(reqIdx, 1);
        const existingIdx = this.explicitNextByTrack[track].findIndex((task) => task.id === taskId);
        const nextTask: WeekTask = {
          id: existingIdx >= 0 ? this.explicitNextByTrack[track][existingIdx].id : taskId,
          track,
          sourceTemplateId: request.templateId,
          title: input.title.trim() || request.title,
          room: input.room.trim() || request.room,
          category: request.category,
          priority: request.priority,
          estimatedHours: safeHours,
          day: safeDay,
          completed: request.completed,
          fromOverflow: false,
          isFollowUp: false,
          sendCompletionMessage: request.sendCompletionMessage,
          completionNotifyRole: request.completionNotifyRole,
          completionActionRequiredByDefault: request.completionActionRequiredByDefault,
          sendDataToSpecificEmployee: request.sendDataToSpecificEmployee,
          dataRecipientRole: request.dataRecipientRole,
          allowVoiceDictation: request.allowVoiceDictation,
          dataSubmitted: request.dataSubmitted,
          defaultDataEntryText: request.defaultDataEntryText,
          scheduledDateIso: isoDate(nextWeekDate),
          flowerRowNumber: request.flowerRowNumber ?? null,
          flowerLifecycleId: request.flowerLifecycleId,
        };
        if (existingIdx >= 0) this.explicitNextByTrack[track][existingIdx] = nextTask;
        else this.explicitNextByTrack[track].push(nextTask);
      }
      this.recomputeTrack(track);
      this.notify();
      return;
    }

    const nextTasks = this.explicitNextByTrack[track];
    const nextIdx = nextTasks.findIndex((task) => task.id === taskId);
    if (nextIdx < 0) return;
    const task = nextTasks[nextIdx];
    if (task.completed && !this.canModifyBackend) return;

    if (input.scheduleWindow === 'nextWeek') {
      nextTasks[nextIdx] = {
        ...task,
        title: input.title.trim() || task.title,
        room: input.room.trim() || task.room,
        day: safeDay,
        estimatedHours: safeHours,
        scheduledDateIso: isoDate(nextWeekDate),
      };
    } else {
      nextTasks.splice(nextIdx, 1);
      this.requestsByTrack[track].push({
        id: task.id,
        track,
        templateId: task.sourceTemplateId,
        title: input.title.trim() || task.title,
        room: input.room.trim() || task.room,
        category: task.category,
        priority: task.priority,
        estimatedHours: safeHours,
        preferredDay: safeDay,
        createdAt: new Date().toISOString(),
        completed: task.completed,
        followUpGenerated: false,
        sendCompletionMessage: task.sendCompletionMessage,
        completionNotifyRole: task.completionNotifyRole,
        completionActionRequiredByDefault: task.completionActionRequiredByDefault,
        sendDataToSpecificEmployee: task.sendDataToSpecificEmployee,
        dataRecipientRole: task.dataRecipientRole,
        allowVoiceDictation: task.allowVoiceDictation,
        dataSubmitted: task.dataSubmitted,
        defaultDataEntryText: task.defaultDataEntryText,
        scheduledDateIso: isoDate(thisWeekDate),
        flowerRowNumber: task.flowerRowNumber ?? null,
        flowerLifecycleId: task.flowerLifecycleId,
      });
    }

    this.recomputeTrack(track);
    this.notify();
  }

  private setTaskCompletion(requestId: string, completed: boolean): boolean {
    const track = this.activeTrack;
    const list = this.requestsByTrack[track];
    const idx = list.findIndex((r) => r.id === requestId);
    if (idx < 0) return false;
    const existing = list[idx];
    if (!this.canModifyBackend && existing.completed && !completed) {
      return false;
    }

    let request = { ...existing, completed };
    if (completed && request.sendDataToSpecificEmployee && !request.dataSubmitted) {
      return false;
    }

    if (completed && !request.followUpGenerated) {
      const template = this.templates.find((t) => t.id === request.templateId);
      let generated = false;
      if (template && template.autoFollowUp) {
        const touched = this.completeFollowUpsForTemplate(template);
        for (const t of touched) this.recomputeTrack(t);
        generated = true;
      }
      if (template) {
        const completionDate = parseIso(request.scheduledDateIso) ?? new Date();
        const touched = this.completeSpecialLinkedTasksForCompletion(template, request, completionDate);
        if (touched.size > 0) {
          for (const t of touched) this.recomputeTrack(t);
          generated = true;
        }
      }
      if (generated) {
        request = { ...request, followUpGenerated: true };
      }
    }

    list[idx] = request;
    if (completed) {
      this.upsertCompletedCalendarTask(track, {
        id: request.id,
        track,
        sourceTemplateId: request.templateId,
        title: request.title,
        room: request.room,
        category: request.category,
        priority: request.priority,
        estimatedHours: request.estimatedHours,
        day: request.preferredDay,
        completed: true,
        fromOverflow: false,
        isFollowUp: false,
        sendCompletionMessage: request.sendCompletionMessage,
        completionNotifyRole: request.completionNotifyRole,
        completionActionRequiredByDefault: request.completionActionRequiredByDefault,
        sendDataToSpecificEmployee: request.sendDataToSpecificEmployee,
        dataRecipientRole: request.dataRecipientRole,
        allowVoiceDictation: request.allowVoiceDictation,
        dataSubmitted: request.dataSubmitted,
        defaultDataEntryText: request.defaultDataEntryText,
        scheduledDateIso: request.scheduledDateIso,
        flowerRowNumber: request.flowerRowNumber ?? null,
        flowerLifecycleId: request.flowerLifecycleId,
      });
    } else {
      this.removeCompletedCalendarTask(track, request.id);
    }
    this.recomputeTrack(track);
    this.notify();
    return true;
  }

  private setNextWeekTaskCompletion(taskId: string, completed: boolean): boolean {
    const track = this.activeTrack;
    const list = this.explicitNextByTrack[track];
    const idx = list.findIndex((task) => task.id === taskId);
    if (idx < 0) return false;
    const existing = list[idx];
    if (!this.canModifyBackend && existing.completed && !completed) {
      return false;
    }
    if (completed && existing.sendDataToSpecificEmployee && !existing.dataSubmitted) {
      return false;
    }

    if (completed && !existing.completed) {
      const template = this.templates.find((t) => t.id === existing.sourceTemplateId);
      if (template && template.autoFollowUp) {
        const touched = this.completeFollowUpsForTemplate(template);
        for (const t of touched) this.recomputeTrack(t);
      }
      if (template) {
        const asRequest: PlannedAssessmentRequest = {
          id: existing.id,
          track: existing.track,
          templateId: existing.sourceTemplateId,
          title: existing.title,
          room: existing.room,
          category: existing.category,
          priority: existing.priority,
          estimatedHours: existing.estimatedHours,
          preferredDay: Math.max(0, Math.min(6, existing.day ?? 0)),
          createdAt: new Date().toISOString(),
          completed: true,
          followUpGenerated: false,
          sendCompletionMessage: existing.sendCompletionMessage,
          completionNotifyRole: existing.completionNotifyRole,
          completionActionRequiredByDefault: existing.completionActionRequiredByDefault,
          sendDataToSpecificEmployee: existing.sendDataToSpecificEmployee,
          dataRecipientRole: existing.dataRecipientRole,
          allowVoiceDictation: existing.allowVoiceDictation,
          dataSubmitted: existing.dataSubmitted,
          defaultDataEntryText: existing.defaultDataEntryText,
          scheduledDateIso: existing.scheduledDateIso,
          flowerRowNumber: existing.flowerRowNumber ?? null,
          flowerLifecycleId: existing.flowerLifecycleId,
        };
        const completionDate = parseIso(existing.scheduledDateIso) ?? new Date();
        const touched = this.completeSpecialLinkedTasksForCompletion(template, asRequest, completionDate);
        if (touched.size > 0) {
          for (const t of touched) this.recomputeTrack(t);
        }
      }
    }

    const updated: WeekTask = { ...existing, completed };
    list[idx] = updated;
    if (completed) {
      this.upsertCompletedCalendarTask(track, {
        ...updated,
        completed: true,
      });
    } else {
      this.removeCompletedCalendarTask(track, updated.id);
    }

    this.recomputeTrack(track);
    this.notify();
    return true;
  }

  private upsertCompletedCalendarTask(track: AssessmentTrack, task: WeekTask): void {
    const list = this.completedCalendarByTrack[track];
    const idx = list.findIndex((item) => item.id === task.id);
    if (idx >= 0) {
      list[idx] = task;
    } else {
      list.push(task);
    }
    this.persistCompletedCalendarToStorage();
  }

  private removeCompletedCalendarTask(track: AssessmentTrack, taskId: string): void {
    this.completedCalendarByTrack[track] = this.completedCalendarByTrack[track].filter(
      (task) => task.id !== taskId,
    );
    this.persistCompletedCalendarToStorage();
  }

  dayLoad(dayIndex: number): number {
    return this.dailyLoadsByTrack[this.activeTrack][dayIndex] ?? 0;
  }

  tasksForDay(dayIndex: number): WeekTask[] {
    return this.thisWeekByTrack[this.activeTrack]
      .filter((task) => task.day === dayIndex)
      .sort((a, b) => (a.priority - b.priority) || a.title.localeCompare(b.title));
  }

  startNextWeek(): void {
    const track = this.activeTrack;
    const carry: PlannedAssessmentRequest[] = [];
    const currentStart = parseIso(this.weekStartByTrack[track]) ?? currentWeekStart();
    const nextStart = new Date(currentStart);
    nextStart.setDate(currentStart.getDate() + 7);
    const nextEndExclusive = new Date(nextStart);
    nextEndExclusive.setDate(nextStart.getDate() + 7);

    for (const request of this.requestsByTrack[track]) {
      if (request.completed) continue;
      const existingDate = parseIso(request.scheduledDateIso);
      const target = existingDate ?? new Date(nextStart.getTime() + request.preferredDay * 86400000);
      carry.push({ ...request, id: this.newId('req'), createdAt: new Date().toISOString(), completed: false, followUpGenerated: false, scheduledDateIso: isoDate(target) });
    }

    for (const task of this.explicitNextByTrack[track]) {
      const taskDate = parseIso(task.scheduledDateIso);
      if (taskDate && taskDate >= nextStart && taskDate < nextEndExclusive) {
        carry.push(this.taskToRequest(task, track));
      }
    }

    this.explicitNextByTrack[track] = this.explicitNextByTrack[track].filter((task) => {
      const taskDate = parseIso(task.scheduledDateIso);
      if (!taskDate) return true;
      return !(taskDate >= nextStart && taskDate < nextEndExclusive);
    });

    this.requestsByTrack[track] = carry;
    this.weekStartByTrack[track] = isoDate(nextStart);
    this.notNeededThisWeekByTrack[track].clear();
    this.closingDoneByTrack[track].clear();

    this.recomputeTrack(track);
    this.notify();
  }

  moveOneWeekForward(): void {
    this.startNextWeek();
  }

  moveOneWeekBackward(): void {
    const track = this.activeTrack;
    const current = parseIso(this.weekStartByTrack[track]) ?? currentWeekStart();
    const previous = new Date(current);
    previous.setDate(current.getDate() - 7);
    this.weekStartByTrack[track] = isoDate(previous);
    this.recomputeTrack(track);
    this.notify();
  }

  clearRoleScheduleHistory(
    role: UserRole,
    options?: {
      startDateIso?: string;
      endDateIso?: string;
      clearSchedules?: boolean;
      clearCalendarHistory?: boolean;
    },
  ): boolean {
    if (!this.canModifyBackend) {
      return false;
    }

    const clearSchedules = options?.clearSchedules ?? true;
    const clearCalendarHistory = options?.clearCalendarHistory ?? true;
    if (!clearSchedules && !clearCalendarHistory) {
      return true;
    }

    const track = roleDefaultTrack[role];
    const startDate = options?.startDateIso ? parseIso(options.startDateIso) : null;
    const endDate = options?.endDateIso ? parseIso(options.endDateIso) : null;
    const hasRange = Boolean(startDate && endDate);

    if (hasRange) {
      const startWeek = weekStartForDate(startDate as Date);
      const endWeek = weekStartForDate(endDate as Date);
      const lowWeek = startWeek <= endWeek ? startWeek : endWeek;
      const highWeek = startWeek <= endWeek ? endWeek : startWeek;
      const highWeekExclusive = new Date(highWeek);
      highWeekExclusive.setDate(highWeekExclusive.getDate() + 7);
      const inRange = (scheduledDateIso: string): boolean => {
        const date = parseIso(scheduledDateIso);
        if (!date) return false;
        return date >= lowWeek && date < highWeekExclusive;
      };

      if (clearSchedules) {
        this.requestsByTrack[track] = this.requestsByTrack[track].filter(
          (request) => !inRange(request.scheduledDateIso),
        );
        this.explicitNextByTrack[track] = this.explicitNextByTrack[track].filter(
          (task) => !inRange(task.scheduledDateIso),
        );
      }
      if (clearCalendarHistory) {
        this.completedCalendarByTrack[track] = this.completedCalendarByTrack[track].filter(
          (task) => !inRange(task.scheduledDateIso),
        );
        this.persistCompletedCalendarToStorage();
      }
    } else {
      if (clearSchedules) {
        this.requestsByTrack[track] = [];
        this.explicitNextByTrack[track] = [];
        this.notNeededThisWeekByTrack[track].clear();
        this.closingDoneByTrack[track].clear();
      }
      if (clearCalendarHistory) {
        this.completedCalendarByTrack[track] = [];
        this.persistCompletedCalendarToStorage();
      }
    }

    this.thisWeekByTrack[track] = [];
    this.overflowByTrack[track] = [];
    this.dailyLoadsByTrack[track] = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
    this.weekLoadByTrack[track] = 0;
    this.recomputeTrack(track);
    this.notify();
    return true;
  }

  addRandomTaskToPlan(input: {
    title: string;
    hours: number;
    preferredDay?: number;
    forNextWeek?: boolean;
  }): boolean {
    const title = input.title.trim();
    if (!title) return false;

    const track = this.activeTrack;
    const preferredDay =
      typeof input.preferredDay === 'number'
        ? Math.max(0, Math.min(6, Math.floor(input.preferredDay)))
        : 0;
    const safeHours = clampHours(input.hours);
    const forNextWeek = Boolean(input.forNextWeek);

    const weekStart = parseIso(this.weekStartByTrack[track]) ?? currentWeekStart();
    const scheduledDate = new Date(weekStart);
    scheduledDate.setDate(weekStart.getDate() + preferredDay + (forNextWeek ? 7 : 0));
    const scheduledIso = isoDate(scheduledDate);
    const templateId = this.newId('custom-template');

    if (forNextWeek) {
      this.explicitNextByTrack[track].push({
        id: this.newId('next'),
        track,
        sourceTemplateId: templateId,
        title,
        room: 'Custom',
        category: 'Random Task',
        priority: 3,
        estimatedHours: safeHours,
        day: preferredDay,
        completed: false,
        fromOverflow: false,
        isFollowUp: false,
        sendCompletionMessage: false,
        completionNotifyRole: 'generalManager',
        completionActionRequiredByDefault: true,
        sendDataToSpecificEmployee: false,
        dataRecipientRole: 'producer',
        allowVoiceDictation: true,
        dataSubmitted: false,
        defaultDataEntryText: '',
        scheduledDateIso: scheduledIso,
      });
    } else {
      this.requestsByTrack[track].push({
        id: this.newId('req'),
        track,
        templateId,
        title,
        room: 'Custom',
        category: 'Random Task',
        priority: 3,
        estimatedHours: safeHours,
        preferredDay,
        createdAt: new Date().toISOString(),
        completed: false,
        followUpGenerated: false,
        sendCompletionMessage: false,
        completionNotifyRole: 'generalManager',
        completionActionRequiredByDefault: true,
        sendDataToSpecificEmployee: false,
        dataRecipientRole: 'producer',
        allowVoiceDictation: true,
        dataSubmitted: false,
        defaultDataEntryText: '',
        scheduledDateIso: scheduledIso,
      });
    }

    this.recomputeTrack(track);
    this.notify();
    return true;
  }

  createTemplate(input: {
    track: AssessmentTrack;
    title: string;
    room: string;
    category: string;
    priority: number;
    defaultHours: number;
    autoFollowUp?: boolean;
    followUpTitle?: string;
    followUpPriority?: number;
    followUpHours?: number;
    autoScheduledTasks?: Array<{
      title: string;
      recipientRole: UserRole;
      hours: number;
      dueDateIso: string;
      daysUntilDue: number | null;
      recurrence: 'none' | 'weekly' | 'monthly' | 'yearly';
      recurringWeekday: number | null;
      recurringDayOfMonth: number | null;
      recurringMonthOfYear: number | null;
    }>;
    taskRecurrenceMode?: 'none' | 'calendarDate' | 'everyDays' | 'monthly';
    taskRecurrenceDateIso?: string;
    taskRecurrenceEveryDays?: number | null;
    taskRecurrenceMonthlyDay?: number | null;
    sendDataToSpecificEmployee?: boolean;
    dataRecipientRole?: UserRole;
    allowVoiceDictation?: boolean;
  }): AssessmentTemplate | null {
    if (!this.canModifyBackend) return null;

    const created: AssessmentTemplate = {
      id: this.newId('tmpl'),
      track: input.track,
      title: input.title.trim(),
      room: input.room.trim(),
      category: input.category.trim(),
      priority: clampPriority(input.priority),
      defaultHours: clampHours(input.defaultHours),
      autoFollowUp: Boolean(input.autoFollowUp),
      followUpTitle: (input.followUpTitle ?? '').trim(),
      followUpPriority: clampPriority(input.followUpPriority ?? 3),
      followUpHours: clampHours(input.followUpHours ?? 1),
      followUpRules: [],
      sendCompletionMessage: false,
      completionNotifyRole: 'generalManager',
      completionActionRequiredByDefault: true,
      sendDataToSpecificEmployee: Boolean(input.sendDataToSpecificEmployee),
      dataRecipientRole: input.dataRecipientRole ?? 'producer',
      allowVoiceDictation: input.allowVoiceDictation ?? true,
      taskRecurrenceMode:
        input.taskRecurrenceMode === 'calendarDate' ||
        input.taskRecurrenceMode === 'everyDays' ||
        input.taskRecurrenceMode === 'monthly'
          ? input.taskRecurrenceMode
          : 'none',
      taskRecurrenceDateIso: String(input.taskRecurrenceDateIso ?? '').trim(),
      taskRecurrenceEveryDays:
        typeof input.taskRecurrenceEveryDays === 'number'
          ? Math.max(1, Math.min(365, Math.floor(input.taskRecurrenceEveryDays)))
          : null,
      taskRecurrenceMonthlyDay:
        typeof input.taskRecurrenceMonthlyDay === 'number'
          ? Math.max(1, Math.min(31, Math.floor(input.taskRecurrenceMonthlyDay)))
          : null,
      autoScheduledTasks: (input.autoScheduledTasks ?? [])
        .map((task) => ({
          title: task.title.trim(),
          recipientRole: task.recipientRole,
          hours: clampHours(task.hours),
          dueDateIso: task.dueDateIso?.trim() ?? '',
          daysUntilDue:
            typeof task.daysUntilDue === 'number'
              ? Math.max(0, Math.min(70, Math.floor(task.daysUntilDue)))
              : null,
          recurrence: normalizeRecurrence(task.recurrence),
          recurringWeekday:
            typeof task.recurringWeekday === 'number'
              ? Math.max(0, Math.min(6, Math.floor(task.recurringWeekday)))
              : null,
          recurringDayOfMonth:
            typeof task.recurringDayOfMonth === 'number'
              ? Math.max(1, Math.min(31, Math.floor(task.recurringDayOfMonth)))
              : null,
          recurringMonthOfYear:
            typeof task.recurringMonthOfYear === 'number'
              ? Math.max(0, Math.min(11, Math.floor(task.recurringMonthOfYear)))
              : null,
        }))
        .filter((task) => task.title)
        .sort(compareAutoScheduledTaskChronology)
        .slice(0, 7),
    };
    this.templates.push(created);

    this.sortTemplates();
    this.persistTemplates();
    this.notify();
    return created;
  }

  updateTemplate(updated: AssessmentTemplate): void {
    if (!this.canModifyBackend) return;
    const idx = this.templates.findIndex((t) => t.id === updated.id);
    if (idx < 0) return;
    this.templates[idx] = {
      ...updated,
      title: updated.title.trim(),
      room: updated.room.trim(),
      category: updated.category.trim(),
      priority: clampPriority(updated.priority),
      defaultHours: clampHours(updated.defaultHours),
      followUpPriority: clampPriority(updated.followUpPriority),
      followUpHours: clampHours(updated.followUpHours),
      taskRecurrenceMode:
        updated.taskRecurrenceMode === 'calendarDate' ||
        updated.taskRecurrenceMode === 'everyDays' ||
        updated.taskRecurrenceMode === 'monthly'
          ? updated.taskRecurrenceMode
          : 'none',
      taskRecurrenceDateIso: String(updated.taskRecurrenceDateIso ?? '').trim(),
      taskRecurrenceEveryDays:
        typeof updated.taskRecurrenceEveryDays === 'number'
          ? Math.max(1, Math.min(365, Math.floor(updated.taskRecurrenceEveryDays)))
          : null,
      taskRecurrenceMonthlyDay:
        typeof updated.taskRecurrenceMonthlyDay === 'number'
          ? Math.max(1, Math.min(31, Math.floor(updated.taskRecurrenceMonthlyDay)))
          : null,
      autoScheduledTasks: (updated.autoScheduledTasks ?? [])
        .map((task) => ({
          title: task.title.trim(),
          recipientRole: task.recipientRole,
          hours: clampHours(task.hours),
          dueDateIso: task.dueDateIso?.trim() ?? '',
          daysUntilDue:
            typeof task.daysUntilDue === 'number'
              ? Math.max(0, Math.min(70, Math.floor(task.daysUntilDue)))
              : null,
          recurrence: normalizeRecurrence(task.recurrence),
          recurringWeekday:
            typeof task.recurringWeekday === 'number'
              ? Math.max(0, Math.min(6, Math.floor(task.recurringWeekday)))
              : null,
          recurringDayOfMonth:
            typeof task.recurringDayOfMonth === 'number'
              ? Math.max(1, Math.min(31, Math.floor(task.recurringDayOfMonth)))
              : null,
          recurringMonthOfYear:
            typeof task.recurringMonthOfYear === 'number'
              ? Math.max(0, Math.min(11, Math.floor(task.recurringMonthOfYear)))
              : null,
        }))
        .filter((task) => task.title)
        .sort(compareAutoScheduledTaskChronology)
        .slice(0, 7),
    };
    this.sortTemplates();
    this.persistTemplates();
    this.notify();
  }

  deleteTemplate(templateId: string): void {
    if (!this.canModifyBackend) return;
    const before = this.templates.length;
    this.templates = this.templates.filter((template) => template.id !== templateId);
    if (this.templates.length === before) return;

    let completedCalendarChanged = false;
    for (const track of assessmentTracks) {
      this.requestsByTrack[track] = this.requestsByTrack[track].filter(
        (request) => request.templateId !== templateId,
      );
      this.explicitNextByTrack[track] = this.explicitNextByTrack[track].filter(
        (task) => task.sourceTemplateId !== templateId,
      );
      const completedBefore = this.completedCalendarByTrack[track].length;
      this.completedCalendarByTrack[track] = this.completedCalendarByTrack[track].filter(
        (task) => task.sourceTemplateId !== templateId,
      );
      if (this.completedCalendarByTrack[track].length !== completedBefore) {
        completedCalendarChanged = true;
      }
      this.notNeededThisWeekByTrack[track].delete(templateId);
      this.closingDoneByTrack[track].delete(templateId);
      this.recomputeTrack(track);
    }

    if (completedCalendarChanged) {
      this.persistCompletedCalendarToStorage();
    }
    this.persistTemplates();
    this.notify();
  }

  private recomputeTrack(track: AssessmentTrack): void {
    this.syncRecurringTemplatesForTrack(track);
    const requests = [...this.requestsByTrack[track]].sort((a, b) => {
      const byPriority = a.priority - b.priority;
      if (byPriority !== 0) return byPriority;
      return a.createdAt.localeCompare(b.createdAt);
    });

    const schedule: WeekTask[] = [];
    const overflow: WeekTask[] = [];
    const dayLoads: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };

    let weekLoad = 0;

    for (const request of requests) {
      if (weekLoad + request.estimatedHours > weekHourLimit) {
        overflow.push(this.requestToOverflowTask(request, track));
        continue;
      }

      const assignedDay = this.findDayWithCapacity(request.preferredDay, request.estimatedHours, dayLoads);
      if (assignedDay === null) {
        overflow.push(this.requestToOverflowTask(request, track));
        continue;
      }

      dayLoads[assignedDay] = dayLoads[assignedDay] + request.estimatedHours;
      weekLoad += request.estimatedHours;

      schedule.push({
        id: request.id,
        track,
        sourceTemplateId: request.templateId,
        title: request.title,
        room: request.room,
        category: request.category,
        priority: request.priority,
        estimatedHours: request.estimatedHours,
        day: assignedDay,
        completed: request.completed,
        fromOverflow: false,
        isFollowUp: false,
        sendCompletionMessage: request.sendCompletionMessage,
        completionNotifyRole: request.completionNotifyRole,
        completionActionRequiredByDefault: request.completionActionRequiredByDefault,
        sendDataToSpecificEmployee: request.sendDataToSpecificEmployee,
        dataRecipientRole: request.dataRecipientRole,
        allowVoiceDictation: request.allowVoiceDictation,
        dataSubmitted: request.dataSubmitted,
        defaultDataEntryText: request.defaultDataEntryText,
        scheduledDateIso: request.scheduledDateIso,
        flowerRowNumber: request.flowerRowNumber ?? null,
        flowerLifecycleId: request.flowerLifecycleId,
      });
    }

    this.thisWeekByTrack[track] = schedule;
    this.overflowByTrack[track] = overflow;
    this.dailyLoadsByTrack[track] = dayLoads;
    this.weekLoadByTrack[track] = weekLoad;
  }

  private syncRecurringTemplatesForTrack(track: AssessmentTrack): void {
    const weekStart = parseIso(this.weekStartByTrack[track]) ?? currentWeekStart();
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 7);
    const existingKeys = new Set<string>(
      this.requestsByTrack[track].map((request) => `${request.templateId}|${request.scheduledDateIso}`),
    );

    for (const template of this.templates) {
      if (template.track !== track) continue;
      if (
        template.taskRecurrenceMode !== 'calendarDate' &&
        template.taskRecurrenceMode !== 'everyDays' &&
        template.taskRecurrenceMode !== 'monthly'
      ) {
        continue;
      }

      let dueDate: Date | null = null;
      if (template.taskRecurrenceMode === 'calendarDate') {
        const configured = parseIso(template.taskRecurrenceDateIso);
        if (configured && configured >= weekStart && configured < weekEnd) {
          dueDate = configured;
        }
      } else if (template.taskRecurrenceMode === 'everyDays') {
        const anchor = parseIso(template.taskRecurrenceDateIso) ?? weekStart;
        const interval =
          typeof template.taskRecurrenceEveryDays === 'number'
            ? Math.max(1, Math.min(365, Math.floor(template.taskRecurrenceEveryDays)))
            : 1;
        const diffDays = Math.floor((weekStart.getTime() - anchor.getTime()) / 86400000);
        const steps = diffDays <= 0 ? 0 : Math.ceil(diffDays / interval);
        const candidate = new Date(anchor);
        candidate.setDate(anchor.getDate() + steps * interval);
        if (candidate >= weekStart && candidate < weekEnd) {
          dueDate = candidate;
        }
      } else if (template.taskRecurrenceMode === 'monthly') {
        const day =
          typeof template.taskRecurrenceMonthlyDay === 'number'
            ? Math.max(1, Math.min(31, Math.floor(template.taskRecurrenceMonthlyDay)))
            : 1;
        const thisMonth = new Date(weekStart.getFullYear(), weekStart.getMonth(), 1);
        const nextMonth = new Date(weekStart.getFullYear(), weekStart.getMonth() + 1, 1);
        for (const monthRef of [thisMonth, nextMonth]) {
          const lastDay = new Date(monthRef.getFullYear(), monthRef.getMonth() + 1, 0).getDate();
          const candidate = new Date(monthRef.getFullYear(), monthRef.getMonth(), Math.min(day, lastDay));
          if (candidate >= weekStart && candidate < weekEnd) {
            dueDate = candidate;
            break;
          }
        }
      }

      if (!dueDate) continue;
      const dueIso = isoDate(dueDate);
      const dedupeKey = `${template.id}|${dueIso}`;
      if (existingKeys.has(dedupeKey)) continue;
      existingKeys.add(dedupeKey);
      this.requestsByTrack[track].push({
        id: this.newId('req'),
        track,
        templateId: template.id,
        title: template.title,
        room: template.room,
        category: template.category,
        priority: template.priority,
        estimatedHours: template.defaultHours,
        preferredDay: workdayIndex(dueDate),
        createdAt: new Date().toISOString(),
        completed: false,
        followUpGenerated: false,
        sendCompletionMessage: template.sendCompletionMessage,
        completionNotifyRole: template.completionNotifyRole,
        completionActionRequiredByDefault: template.completionActionRequiredByDefault,
        sendDataToSpecificEmployee: template.sendDataToSpecificEmployee,
        dataRecipientRole: template.dataRecipientRole,
        allowVoiceDictation: template.allowVoiceDictation,
        dataSubmitted: false,
        defaultDataEntryText: '',
        scheduledDateIso: dueIso,
        flowerRowNumber: null,
      });
    }
  }

  private requestToOverflowTask(request: PlannedAssessmentRequest, track: AssessmentTrack): WeekTask {
    return {
      id: `overflow-${request.id}`,
      track,
      sourceTemplateId: request.templateId,
      title: request.title,
      room: request.room,
      category: request.category,
      priority: request.priority,
      estimatedHours: request.estimatedHours,
      day: null,
      completed: request.completed,
      fromOverflow: true,
      isFollowUp: false,
      sendCompletionMessage: request.sendCompletionMessage,
      completionNotifyRole: request.completionNotifyRole,
      completionActionRequiredByDefault: request.completionActionRequiredByDefault,
      sendDataToSpecificEmployee: request.sendDataToSpecificEmployee,
      dataRecipientRole: request.dataRecipientRole,
      allowVoiceDictation: request.allowVoiceDictation,
      dataSubmitted: request.dataSubmitted,
      defaultDataEntryText: request.defaultDataEntryText,
      scheduledDateIso: request.scheduledDateIso,
      flowerRowNumber: request.flowerRowNumber ?? null,
      flowerLifecycleId: request.flowerLifecycleId,
    };
  }

  private findDayWithCapacity(preferredDay: number, hours: number, dayLoads: Record<number, number>): number | null {
    for (let day = preferredDay; day < 7; day += 1) {
      if ((dayLoads[day] ?? 0) + hours <= dayHourLimit) return day;
    }
    return null;
  }

  private removeAutoPlannedFollowUps(templateId: string): Set<AssessmentTrack> {
    const touched = new Set<AssessmentTrack>();
    for (const track of assessmentTracks) {
      const requestsBefore = this.requestsByTrack[track].length;
      this.requestsByTrack[track] = this.requestsByTrack[track].filter(
        (r) => !(r.templateId === templateId && r.category === 'Auto Follow-up'),
      );
      if (this.requestsByTrack[track].length !== requestsBefore) touched.add(track);

      const nextBefore = this.explicitNextByTrack[track].length;
      this.explicitNextByTrack[track] = this.explicitNextByTrack[track].filter(
        (t) => !(t.sourceTemplateId === templateId && t.isFollowUp && t.category === 'Auto Follow-up'),
      );
      if (this.explicitNextByTrack[track].length !== nextBefore) touched.add(track);
    }
    return touched;
  }

  private removeGeneratedLinkedTasks(templateId: string): void {
    for (const track of assessmentTracks) {
      this.requestsByTrack[track] = this.requestsByTrack[track].filter(
        (request) =>
          !(
            request.templateId === templateId &&
            request.category === 'Linked Auto Task'
          ),
      );
      this.explicitNextByTrack[track] = this.explicitNextByTrack[track].filter(
        (task) =>
          !(
            task.sourceTemplateId === templateId &&
            task.category === 'Linked Auto Task'
          ),
      );
    }
  }

  private scheduleGeneratedLinkedTasks(
    template: AssessmentTemplate,
    assignmentDate: Date,
  ): Set<AssessmentTrack> {
    const touched = new Set<AssessmentTrack>();
    for (const linked of template.autoScheduledTasks.slice(0, 7)) {
      const title = linked.title.trim();
      if (!title) continue;
      const targetTrack = roleDefaultTrack[linked.recipientRole];
      touched.add(targetTrack);
      const configuredDueDate = linked.dueDateIso
        ? parseIso(linked.dueDateIso)
        : null;
      const configuredDays =
        typeof linked.daysUntilDue === 'number' && linked.daysUntilDue >= 0
          ? Math.max(0, Math.min(70, Math.floor(linked.daysUntilDue)))
          : null;
      const recurringWeekday =
        typeof linked.recurringWeekday === 'number'
          ? Math.max(0, Math.min(6, Math.floor(linked.recurringWeekday)))
          : null;
      const recurringDayOfMonth =
        typeof linked.recurringDayOfMonth === 'number'
          ? Math.max(1, Math.min(31, Math.floor(linked.recurringDayOfMonth)))
          : null;
      const recurringMonthOfYear =
        typeof linked.recurringMonthOfYear === 'number'
          ? Math.max(0, Math.min(11, Math.floor(linked.recurringMonthOfYear)))
          : null;
      const recurrence = normalizeRecurrence(linked.recurrence);
      const offsetDate = configuredDays
        !== null
        ? new Date(assignmentDate.getTime() + configuredDays * 86400000)
        : null;
      let recurringDate: Date | null = null;
      if (recurrence === 'weekly' && recurringWeekday !== null) {
        recurringDate = nextOrSameWeekday(assignmentDate, recurringWeekday);
      } else if (recurrence === 'monthly' && recurringDayOfMonth !== null) {
        recurringDate = nextOrSameMonthlyDate(assignmentDate, recurringDayOfMonth);
      } else if (
        recurrence === 'yearly' &&
        recurringMonthOfYear !== null &&
        recurringDayOfMonth !== null
      ) {
        recurringDate = nextOrSameYearlyDate(
          assignmentDate,
          recurringMonthOfYear,
          recurringDayOfMonth,
        );
      }
      const targetDate = configuredDueDate ?? offsetDate ?? recurringDate ?? assignmentDate;
      const weekStart = parseIso(this.weekStartByTrack[targetTrack]) ?? currentWeekStart();
      const nextWeekStart = new Date(weekStart);
      nextWeekStart.setDate(weekStart.getDate() + 7);
      const inCurrentWeek = targetDate >= weekStart && targetDate < nextWeekStart;
      const preferredDay = workdayIndex(targetDate);
      const payload = {
        track: targetTrack,
        templateId: template.id,
        title,
        room: template.room,
        category: 'Linked Auto Task',
        priority: clampPriority(template.priority),
        estimatedHours: clampHours(linked.hours),
        sendCompletionMessage: false,
        completionNotifyRole: 'generalManager' as UserRole,
        completionActionRequiredByDefault: true,
          sendDataToSpecificEmployee: true,
          dataRecipientRole: linked.recipientRole,
          allowVoiceDictation: true,
          dataSubmitted: false,
          defaultDataEntryText: '',
        };

      if (inCurrentWeek) {
        this.requestsByTrack[targetTrack].push({
          id: this.newId('req'),
          ...payload,
          preferredDay,
          createdAt: new Date().toISOString(),
          completed: false,
          followUpGenerated: false,
          scheduledDateIso: isoDate(targetDate),
        });
      } else {
        this.explicitNextByTrack[targetTrack].push({
          id: this.newId('next'),
          sourceTemplateId: template.id,
          ...payload,
          day: preferredDay,
          completed: false,
          fromOverflow: false,
          isFollowUp: false,
          scheduledDateIso: isoDate(targetDate),
        });
      }
    }
    if (isRoFilterTaskTitle(template.title)) {
      const targetTrack = template.track;
      touched.add(targetTrack);
      const targetDate = new Date(assignmentDate);
      targetDate.setDate(targetDate.getDate() + 180);
      this.scheduleManualLinkedTask({
        track: targetTrack,
        templateId: template.id,
        title: 'Change out RO filters again (180-day follow-up)',
        room: template.room,
        category: 'Linked Auto Task',
        priority: 2,
        hours: 0.5,
        targetDate,
        flowerRowNumber: null,
      });
    }
    return touched;
  }

  private scheduleManualLinkedTask(input: {
    track: AssessmentTrack;
    templateId: string;
    title: string;
    room: string;
    category: string;
    priority: number;
    hours: number;
    targetDate: Date;
    flowerRowNumber?: number | null;
    flowerLifecycleId?: string;
  }): void {
    const weekStart = parseIso(this.weekStartByTrack[input.track]) ?? currentWeekStart();
    const nextWeekStart = new Date(weekStart);
    nextWeekStart.setDate(weekStart.getDate() + 7);
    const inCurrentWeek = input.targetDate >= weekStart && input.targetDate < nextWeekStart;
    const preferredDay = workdayIndex(input.targetDate);
    const safeRow = normalizeFlowerRowNumber(input.flowerRowNumber);

    if (inCurrentWeek) {
      this.requestsByTrack[input.track].push({
        id: this.newId('req'),
        track: input.track,
        templateId: input.templateId,
        title: input.title.trim(),
        room: input.room.trim(),
        category: input.category.trim(),
        priority: clampPriority(input.priority),
        estimatedHours: clampHours(input.hours),
        preferredDay,
        createdAt: new Date().toISOString(),
        completed: false,
        followUpGenerated: false,
        sendCompletionMessage: false,
        completionNotifyRole: 'generalManager',
        completionActionRequiredByDefault: true,
        sendDataToSpecificEmployee: false,
        dataRecipientRole: 'producer',
        allowVoiceDictation: true,
        dataSubmitted: false,
        defaultDataEntryText: '',
        scheduledDateIso: isoDate(input.targetDate),
        flowerRowNumber: safeRow,
        flowerLifecycleId: input.flowerLifecycleId,
      });
      return;
    }

    this.explicitNextByTrack[input.track].push({
      id: this.newId('next'),
      track: input.track,
      sourceTemplateId: input.templateId,
      title: input.title.trim(),
      room: input.room.trim(),
      category: input.category.trim(),
      priority: clampPriority(input.priority),
      estimatedHours: clampHours(input.hours),
      day: preferredDay,
      completed: false,
      fromOverflow: false,
      isFollowUp: false,
      sendCompletionMessage: false,
      completionNotifyRole: 'generalManager',
      completionActionRequiredByDefault: true,
      sendDataToSpecificEmployee: false,
      dataRecipientRole: 'producer',
      allowVoiceDictation: true,
      dataSubmitted: false,
      defaultDataEntryText: '',
      scheduledDateIso: isoDate(input.targetDate),
      flowerRowNumber: safeRow,
      flowerLifecycleId: input.flowerLifecycleId,
    });
  }

  private completeSpecialLinkedTasksForCompletion(
    template: AssessmentTemplate,
    request: PlannedAssessmentRequest,
    completionDate: Date,
  ): Set<AssessmentTrack> {
    const touched = new Set<AssessmentTrack>();
    if (isTransferVegToFlowerTaskTitle(template.title) || isTransferVegToFlowerTaskTitle(request.title)) {
      const row = normalizeFlowerRowNumber(request.flowerRowNumber);
      if (!row) return touched;
      const lifecycleId = request.flowerLifecycleId ?? request.id;
      const track: AssessmentTrack = 'producer';
      touched.add(track);
      const followUps: Array<{ offsetDays: number; title: string; hours: number }> = [
        { offsetDays: 14, title: 'Prune 30% of leaves off', hours: 2 },
        { offsetDays: 30, title: 'pH reading of the soil for this row', hours: 1.5 },
        { offsetDays: 55, title: 'Take soil samples, collect soil samples, mail to Logan Labs', hours: 2 },
        { offsetDays: 60, title: 'Remove all leaves', hours: 2 },
        { offsetDays: 63, title: 'Harvest that particular row', hours: 3 },
        { offsetDays: 67, title: 'Reamend that particular row with fresh nutrients and amendments', hours: 2 },
      ];
      for (const followUp of followUps) {
        const targetDate = new Date(completionDate);
        targetDate.setDate(completionDate.getDate() + followUp.offsetDays);
        this.scheduleManualLinkedTask({
          track,
          templateId: template.id,
          title: `${followUp.title} (Row ${row})`,
          room: 'FLOWER ROOM',
          category: 'Linked Auto Task',
          priority: 1,
          hours: followUp.hours,
          targetDate,
          flowerRowNumber: row,
          flowerLifecycleId: lifecycleId,
        });
      }
    }

    return touched;
  }

  private syncAutoPlannedFollowUps(template: AssessmentTemplate, assignmentDate: Date): Set<AssessmentTrack> {
    const touched = this.removeAutoPlannedFollowUps(template.id);
    if (!template.autoFollowUp) return touched;

    for (const rule of normalizeFollowUps(template)) {
      const targetTrack = roleDefaultTrack[rule.assignedRole];
      touched.add(targetTrack);
      const followUpDate = new Date(assignmentDate);
      followUpDate.setDate(assignmentDate.getDate() + rule.daysOffset);
      const resolvedDay = workdayIndex(followUpDate);

      const weekStart = parseIso(this.weekStartByTrack[targetTrack]) ?? currentWeekStart();
      const nextWeekStart = new Date(weekStart);
      nextWeekStart.setDate(weekStart.getDate() + 7);
      const inCurrentWeek = followUpDate >= weekStart && followUpDate < nextWeekStart;

      if (inCurrentWeek) {
        this.requestsByTrack[targetTrack].push({
          id: this.newId('req'),
          track: targetTrack,
          templateId: template.id,
          title: rule.title,
          room: template.room,
          category: 'Auto Follow-up',
          priority: clampPriority(rule.priority),
          estimatedHours: clampHours(rule.hours),
          preferredDay: resolvedDay,
          createdAt: new Date().toISOString(),
          completed: false,
          followUpGenerated: false,
          sendCompletionMessage: false,
          completionNotifyRole: 'generalManager',
          completionActionRequiredByDefault: true,
          sendDataToSpecificEmployee: false,
          dataRecipientRole: 'producer',
          allowVoiceDictation: true,
          dataSubmitted: false,
          defaultDataEntryText: '',
          scheduledDateIso: isoDate(followUpDate),
        });
      } else {
        this.explicitNextByTrack[targetTrack].push({
          id: this.newId('follow'),
          track: targetTrack,
          sourceTemplateId: template.id,
          title: rule.title,
          room: template.room,
          category: 'Auto Follow-up',
          priority: clampPriority(rule.priority),
          estimatedHours: clampHours(rule.hours),
          day: resolvedDay,
          completed: false,
          fromOverflow: false,
          isFollowUp: true,
          sendCompletionMessage: false,
          completionNotifyRole: 'generalManager',
          completionActionRequiredByDefault: true,
          sendDataToSpecificEmployee: false,
          dataRecipientRole: 'producer',
          allowVoiceDictation: true,
          dataSubmitted: false,
          defaultDataEntryText: '',
          scheduledDateIso: isoDate(followUpDate),
        });
      }
    }
    return touched;
  }

  private completeFollowUpsForTemplate(template: AssessmentTemplate): Set<AssessmentTrack> {
    const touched = new Set<AssessmentTrack>();
    for (const rule of normalizeFollowUps(template)) {
      const targetTrack = roleDefaultTrack[rule.assignedRole];
      touched.add(targetTrack);
      const followUpDate = new Date();
      followUpDate.setDate(followUpDate.getDate() + rule.daysOffset);
      const resolvedDay = workdayIndex(followUpDate);
      const weekStart = parseIso(this.weekStartByTrack[targetTrack]) ?? currentWeekStart();
      const nextWeekStart = new Date(weekStart);
      nextWeekStart.setDate(weekStart.getDate() + 7);
      const inCurrentWeek = followUpDate >= weekStart && followUpDate < nextWeekStart;

      if (inCurrentWeek) {
        this.requestsByTrack[targetTrack].push({
          id: this.newId('req'),
          track: targetTrack,
          templateId: template.id,
          title: rule.title,
          room: template.room,
          category: template.category,
          priority: clampPriority(rule.priority),
          estimatedHours: clampHours(rule.hours),
          preferredDay: resolvedDay,
          createdAt: new Date().toISOString(),
          completed: false,
          followUpGenerated: false,
          sendCompletionMessage: false,
          completionNotifyRole: 'generalManager',
          completionActionRequiredByDefault: true,
          sendDataToSpecificEmployee: false,
          dataRecipientRole: 'producer',
          allowVoiceDictation: true,
          dataSubmitted: false,
          defaultDataEntryText: '',
          scheduledDateIso: isoDate(followUpDate),
        });
      } else {
        this.explicitNextByTrack[targetTrack].push({
          id: this.newId('follow'),
          track: targetTrack,
          sourceTemplateId: template.id,
          title: rule.title,
          room: template.room,
          category: template.category,
          priority: clampPriority(rule.priority),
          estimatedHours: clampHours(rule.hours),
          day: resolvedDay,
          completed: false,
          fromOverflow: false,
          isFollowUp: true,
          sendCompletionMessage: false,
          completionNotifyRole: 'generalManager',
          completionActionRequiredByDefault: true,
          sendDataToSpecificEmployee: false,
          dataRecipientRole: 'producer',
          allowVoiceDictation: true,
          dataSubmitted: false,
          defaultDataEntryText: '',
          scheduledDateIso: isoDate(followUpDate),
        });
      }
    }
    return touched;
  }

  private taskToRequest(task: WeekTask, track: AssessmentTrack): PlannedAssessmentRequest {
    const weekStart = parseIso(this.weekStartByTrack[track]) ?? currentWeekStart();
    const fallback = new Date(weekStart);
    fallback.setDate(weekStart.getDate() + Math.max(0, Math.min(6, task.day ?? 0)));
    return {
      id: this.newId('req'),
      track,
      templateId: task.sourceTemplateId,
      title: task.title,
      room: task.room,
      category: task.category,
      priority: task.priority,
      estimatedHours: task.estimatedHours,
      preferredDay: Math.max(0, Math.min(6, task.day ?? 0)),
      createdAt: new Date().toISOString(),
      completed: false,
      followUpGenerated: false,
      sendCompletionMessage: task.sendCompletionMessage,
      completionNotifyRole: task.completionNotifyRole,
      completionActionRequiredByDefault: task.completionActionRequiredByDefault,
      sendDataToSpecificEmployee: task.sendDataToSpecificEmployee,
      dataRecipientRole: task.dataRecipientRole,
      allowVoiceDictation: task.allowVoiceDictation,
      dataSubmitted: task.dataSubmitted,
      defaultDataEntryText: task.defaultDataEntryText,
      scheduledDateIso: task.scheduledDateIso || isoDate(fallback),
      flowerRowNumber: task.flowerRowNumber ?? null,
      flowerLifecycleId: task.flowerLifecycleId,
    };
  }

  private newId(prefix: string): string {
    const id = `${prefix}-${this.idCounter}`;
    this.idCounter += 1;
    return id;
  }

  private sortTemplates(): void {
    this.templates.sort((a, b) => {
      const byTrack = assessmentTracks.indexOf(a.track) - assessmentTracks.indexOf(b.track);
      if (byTrack !== 0) return byTrack;
      const byRoom = compareRooms(a.room, b.room);
      if (byRoom !== 0) return byRoom;
      const byPriority = a.priority - b.priority;
      if (byPriority !== 0) return byPriority;
      return a.title.localeCompare(b.title);
    });
  }

  private migrateLegacyTemplateTitles(): boolean {
    let changed = false;
    const migrated: AssessmentTemplate[] = [];
    for (const template of this.templates) {
      const normalizedTitle = normalizeTaskTitle(template.title);
      if (
        (template.track === 'generalManager' || template.track === 'joManager') &&
        normalizedTitle === 'camera check'
      ) {
        changed = true;
        migrated.push({ ...template, title: 'Check cameras via time stamp' });
        continue;
      }
      if (
        template.track === 'producer' &&
        template.room.trim().toLowerCase() === 'other' &&
        template.category.trim().toLowerCase() === 'closing duties'
      ) {
        const normalizedClosingTitle = normalizeClosingDutyTitle(template.title);
        if (
          normalizedClosingTitle === 'sign out on log' ||
          normalizedClosingTitle === 'sign out log' ||
          normalizedClosingTitle === 'sign out' ||
          normalizedClosingTitle === 'sign logbook' ||
          normalizedClosingTitle === 'sign log sheet' ||
          normalizedClosingTitle === 'sign out of log'
        ) {
          changed = true;
          migrated.push({ ...template, title: 'Sign out of LOG', defaultHours: clampHours(5 / 60) });
          continue;
        }
        if (
          normalizedClosingTitle === 'sign out t sheets' ||
          normalizedClosingTitle === 'sign out tsheets' ||
          normalizedClosingTitle === 't sheets sign out' ||
          normalizedClosingTitle === 'tsheets sign out'
        ) {
          changed = true;
          migrated.push({ ...template, title: 'Sign out T-sheets', defaultHours: clampHours(5 / 60) });
          continue;
        }
        if (normalizedClosingTitle === 'trash thrown away and sealed') {
          changed = true;
          migrated.push({ ...template, title: 'Throw trash away', defaultHours: clampHours(5 / 60) });
          continue;
        }
        if (normalizedClosingTitle === 'water off check float valves') {
          changed = true;
          migrated.push({
            ...template,
            title: 'Veg and Flower water off. Check float valves.',
            defaultHours: clampHours(5 / 60),
          });
          continue;
        }
        if (normalizedClosingTitle === 'overhead lights turned off') {
          changed = true;
          migrated.push({ ...template, title: 'Lights turned off', defaultHours: clampHours(5 / 60) });
          continue;
        }
        if (
          normalizedClosingTitle === 'overhead lock doors support flower drying in back' ||
          normalizedClosingTitle === 'lock doors support flower drying and back' ||
          normalizedClosingTitle === 'lock doors support flower drying and back door'
        ) {
          changed = true;
          continue;
        }
        if (normalizedClosingTitle === 'throw trash away and seal') {
          changed = true;
          migrated.push({ ...template, title: 'Throw trash away', defaultHours: clampHours(5 / 60) });
          continue;
        }
      }
      if (template.track === 'producer') {
        if (normalizeTaskTitle(template.title) === 'test task') {
          changed = true;
          continue;
        }
        const update = producerTemplateMigrationUpdates[
          producerTemplateMigrationKey(producerRoomBucket(template.room), template.title)
        ];
        if (update?.remove) {
          changed = true;
          continue;
        }
        if (update) {
          const next = { ...template };
          if (update.title && next.title !== update.title) {
            next.title = update.title;
            changed = true;
          }
          if (typeof update.defaultHours === 'number') {
            const normalizedHours = clampHours(update.defaultHours);
            if (next.defaultHours !== normalizedHours) {
              next.defaultHours = normalizedHours;
              changed = true;
            }
          }
          migrated.push(next);
          continue;
        }
      }
      migrated.push(template);
    }
    this.templates = migrated;
    return changed;
  }

  private ensureRequiredTemplates(): boolean {
    const required = [
      {
        track: 'producer' as AssessmentTrack,
        title: 'pH Soil Mother, send data to GM/CEO',
        room: 'VEG ROOM',
        category: 'Mothers Inspection',
        priority: 1,
        defaultHours: 30 / 60,
      },
      {
        track: 'producer' as AssessmentTrack,
        title: 'No food or dishes left out',
        room: 'OTHER',
        category: 'Closing Duties',
        priority: 1,
        defaultHours: 5 / 60,
      },
      {
        track: 'producer' as AssessmentTrack,
        title: 'Throw trash away',
        room: 'OTHER',
        category: 'Closing Duties',
        priority: 1,
        defaultHours: 5 / 60,
      },
      {
        track: 'producer' as AssessmentTrack,
        title: 'Veg and Flower water off. Check float valves.',
        room: 'OTHER',
        category: 'Closing Duties',
        priority: 1,
        defaultHours: 5 / 60,
      },
      {
        track: 'producer' as AssessmentTrack,
        title: 'Lights turned off',
        room: 'OTHER',
        category: 'Closing Duties',
        priority: 1,
        defaultHours: 5 / 60,
      },
      {
        track: 'producer' as AssessmentTrack,
        title: 'Sign out of LOG',
        room: 'OTHER',
        category: 'Closing Duties',
        priority: 1,
        defaultHours: 5 / 60,
      },
      {
        track: 'producer' as AssessmentTrack,
        title: 'Sign out T-sheets',
        room: 'OTHER',
        category: 'Closing Duties',
        priority: 1,
        defaultHours: 5 / 60,
      },
      {
        track: 'producer' as AssessmentTrack,
        title: 'Set alarm if no one else is in the building',
        room: 'OTHER',
        category: 'Closing Duties',
        priority: 1,
        defaultHours: 5 / 60,
      },
      {
        track: 'producer' as AssessmentTrack,
        title: 'Lock gate',
        room: 'OTHER',
        category: 'Closing Duties',
        priority: 1,
        defaultHours: 5 / 60,
      },
      {
        track: 'producer' as AssessmentTrack,
        title: 'Dehumidifier dryer working properly',
        room: 'OTHER',
        category: 'Other',
        priority: 2,
        defaultHours: 5 / 60,
      },
      {
        track: 'producer' as AssessmentTrack,
        title: 'Check other reservoirs',
        room: 'OTHER',
        category: 'Other',
        priority: 2,
        defaultHours: 5 / 60,
      },
      {
        track: 'producer' as AssessmentTrack,
        title: 'Look for leaks in trough',
        room: 'OTHER',
        category: 'Other',
        priority: 2,
        defaultHours: 5 / 60,
      },
      {
        track: 'producer' as AssessmentTrack,
        title: 'Take garbage outside',
        room: 'OTHER',
        category: 'Other',
        priority: 3,
        defaultHours: 10 / 60,
      },
      {
        track: 'producer' as AssessmentTrack,
        title: 'Check that timers are good',
        room: 'OTHER',
        category: 'Other',
        priority: 2,
        defaultHours: 5 / 60,
      },
      {
        track: 'generalManager' as AssessmentTrack,
        title: 'Check cameras via time stamp',
        room: 'Retail TD',
        category: 'General Manager',
        priority: 1,
        defaultHours: 1,
      },
      {
        track: 'generalManager' as AssessmentTrack,
        title: 'Look for incoming metric transfers',
        room: 'Retail TD',
        category: 'General Manager',
        priority: 1,
        defaultHours: 1,
      },
      {
        track: 'generalManager' as AssessmentTrack,
        title: 'Check cleaning supplies',
        room: 'Retail TD',
        category: 'General Manager',
        priority: 2,
        defaultHours: 1,
      },
      {
        track: 'generalManager' as AssessmentTrack,
        title: 'Check supplies for retail store',
        room: 'Retail TD',
        category: 'General Manager',
        priority: 2,
        defaultHours: 1,
      },
      {
        track: 'generalManager' as AssessmentTrack,
        title: 'Check exit bags, MJ stickers, latex gloves',
        room: 'Retail TD',
        category: 'General Manager',
        priority: 2,
        defaultHours: 1,
      },
      {
        track: 'generalManager' as AssessmentTrack,
        title: 'Visually check for leaks',
        room: 'Retail TD',
        category: 'General Manager',
        priority: 2,
        defaultHours: 1,
      },
      {
        track: 'generalManager' as AssessmentTrack,
        title: 'Check mail',
        room: 'Retail TD',
        category: 'General Manager',
        priority: 3,
        defaultHours: 1,
      },
      {
        track: 'generalManager' as AssessmentTrack,
        title: 'Pick up garbage outside building',
        room: 'Retail TD',
        category: 'General Manager',
        priority: 3,
        defaultHours: 1,
      },
      {
        track: 'generalManager' as AssessmentTrack,
        title: 'Take garbage to waste transfer station',
        room: 'Retail TD',
        category: 'General Manager',
        priority: 3,
        defaultHours: 1,
      },
      {
        track: 'generalManager' as AssessmentTrack,
        title: 'Water plants outside',
        room: 'Retail TD',
        category: 'General Manager',
        priority: 3,
        defaultHours: 1,
      },
      {
        track: 'generalManager' as AssessmentTrack,
        title: 'Recycling taken out',
        room: 'Retail TD',
        category: 'General Manager',
        priority: 3,
        defaultHours: 1,
      },
      {
        track: 'generalManager' as AssessmentTrack,
        title: 'Get change from the bank for the till',
        room: 'Retail TD',
        category: 'General Manager',
        priority: 2,
        defaultHours: 1,
      },
      {
        track: 'generalManager' as AssessmentTrack,
        title: 'Order paraphernalia, drams, cones, tubes',
        room: 'Retail TD',
        category: 'General Manager',
        priority: 2,
        defaultHours: 1,
      },
      {
        track: 'generalManager' as AssessmentTrack,
        title: 'Talk with Tyrel',
        room: 'Joe retail',
        category: 'General Manager',
        priority: 1,
        defaultHours: 1,
      },
      {
        track: 'generalManager' as AssessmentTrack,
        title: 'Talk with Bud Tenders',
        room: 'Joe retail',
        category: 'General Manager',
        priority: 1,
        defaultHours: 1,
      },
      {
        track: 'generalManager' as AssessmentTrack,
        title: 'Make sure Google Calendar for employees is filled out six months in advance',
        room: 'Joe retail',
        category: 'General Manager',
        priority: 1,
        defaultHours: 2,
      },
      {
        track: 'budtenderTd' as AssessmentTrack,
        title: 'TD opening duties checklist',
        room: 'Retail TD',
        category: 'Daily Opening Duties',
        priority: 1,
        defaultHours: 0.75,
      },
      {
        track: 'budtenderTd' as AssessmentTrack,
        title: 'TD closing duties checklist',
        room: 'Retail TD',
        category: 'Daily Closing Duties',
        priority: 1,
        defaultHours: 0.75,
      },
      {
        track: 'budtenderTd' as AssessmentTrack,
        title: 'TD budtender daily floor tasks',
        room: 'Retail TD',
        category: 'Daily Duties',
        priority: 2,
        defaultHours: 1,
      },
      {
        track: 'budtenderTdJunior' as AssessmentTrack,
        title: 'TD opening duties checklist',
        room: 'Retail TD',
        category: 'Daily Opening Duties',
        priority: 1,
        defaultHours: 0.75,
      },
      {
        track: 'budtenderTdJunior' as AssessmentTrack,
        title: 'TD closing duties checklist',
        room: 'Retail TD',
        category: 'Daily Closing Duties',
        priority: 1,
        defaultHours: 0.75,
      },
      {
        track: 'budtenderTdJunior' as AssessmentTrack,
        title: 'TD budtender daily floor tasks',
        room: 'Retail TD',
        category: 'Daily Duties',
        priority: 2,
        defaultHours: 1,
      },
      {
        track: 'budtenderJo' as AssessmentTrack,
        title: 'J-O opening duties checklist',
        room: 'Retail JO',
        category: 'Daily Opening Duties',
        priority: 1,
        defaultHours: 0.75,
      },
      {
        track: 'budtenderJo' as AssessmentTrack,
        title: 'J-O closing duties checklist',
        room: 'Retail JO',
        category: 'Daily Closing Duties',
        priority: 1,
        defaultHours: 0.75,
      },
      {
        track: 'budtenderJo' as AssessmentTrack,
        title: 'J-O budtender daily floor tasks',
        room: 'Retail JO',
        category: 'Daily Duties',
        priority: 2,
        defaultHours: 1,
      },
      {
        track: 'budtenderJoJunior' as AssessmentTrack,
        title: 'J-O opening duties checklist',
        room: 'Retail JO',
        category: 'Daily Opening Duties',
        priority: 1,
        defaultHours: 0.75,
      },
      {
        track: 'budtenderJoJunior' as AssessmentTrack,
        title: 'J-O closing duties checklist',
        room: 'Retail JO',
        category: 'Daily Closing Duties',
        priority: 1,
        defaultHours: 0.75,
      },
      {
        track: 'budtenderJoJunior' as AssessmentTrack,
        title: 'J-O budtender daily floor tasks',
        room: 'Retail JO',
        category: 'Daily Duties',
        priority: 2,
        defaultHours: 1,
      },
    ];

    let added = false;
    for (const template of required) {
      const exists = this.templates.some(
        (item) =>
          item.track === template.track &&
          item.title.trim().toLowerCase() === template.title.toLowerCase() &&
          item.room.trim().toLowerCase() === template.room.toLowerCase() &&
          item.category.trim().toLowerCase() === template.category.toLowerCase(),
      );
      if (exists) continue;
      added = true;
      this.templates.push({
        id: this.newId('seed'),
        track: template.track,
        title: template.title,
        room: template.room,
        category: template.category,
        priority: clampPriority(template.priority),
        defaultHours: clampHours(template.defaultHours),
        autoFollowUp: false,
        followUpTitle: '',
        followUpPriority: 3,
        followUpHours: 1,
        followUpRules: [],
        sendCompletionMessage: false,
        completionNotifyRole: 'generalManager',
        completionActionRequiredByDefault: true,
        sendDataToSpecificEmployee: false,
        dataRecipientRole: 'producer',
        allowVoiceDictation: true,
        taskRecurrenceMode: 'none',
        taskRecurrenceDateIso: '',
        taskRecurrenceEveryDays: null,
        taskRecurrenceMonthlyDay: null,
        autoScheduledTasks: [],
      });
    }
    return added;
  }

  private dedupeTemplates(): void {
    const seen = new Set<string>();
    const unique: AssessmentTemplate[] = [];
    for (const template of this.templates) {
      const key = [
        template.track,
        template.title.trim().toLowerCase(),
        template.room.trim().toLowerCase(),
        template.category.trim().toLowerCase(),
        String(template.priority),
        template.defaultHours.toFixed(4),
        template.taskRecurrenceMode,
        template.taskRecurrenceDateIso ?? '',
        String(template.taskRecurrenceEveryDays ?? ''),
        String(template.taskRecurrenceMonthlyDay ?? ''),
      ].join('|');
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      unique.push(template);
    }
    this.templates = unique;
  }

  private loadTemplatesFromStorage(): boolean {
    try {
      const raw = localStorage.getItem(templatesStorageKey);
      if (!raw) return false;
      const decoded = JSON.parse(raw);
      if (!Array.isArray(decoded) || decoded.length === 0) return false;
      const asRecord = (value: unknown): Record<string, unknown> =>
        typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
      this.templates = (decoded as AssessmentTemplate[]).map((template) => {
        const templateRecord = asRecord(template);
        const rawTasks = templateRecord.autoScheduledTasks;
        const normalizedTasks = Array.isArray(rawTasks)
          ? rawTasks
              .map((task) => {
                const taskRecord = asRecord(task);
                return {
                  title: String(taskRecord.title ?? '').trim(),
                  recipientRole: (taskRecord.recipientRole ?? 'generalManager') as UserRole,
                  hours: clampHours(Number(taskRecord.hours ?? 1)),
                  dueDateIso: String(taskRecord.dueDateIso ?? '').trim(),
                  daysUntilDue:
                    typeof taskRecord.daysUntilDue === 'number'
                      ? Math.max(0, Math.min(70, Math.floor(taskRecord.daysUntilDue)))
                      : null,
                  recurrence:
                    normalizeRecurrence(taskRecord.recurrence) !== 'none'
                      ? normalizeRecurrence(taskRecord.recurrence)
                      : typeof taskRecord.recurringWeekday === 'number'
                        ? 'weekly'
                        : 'none',
                  recurringWeekday:
                    typeof taskRecord.recurringWeekday === 'number'
                      ? Math.max(0, Math.min(6, Math.floor(taskRecord.recurringWeekday)))
                      : null,
                  recurringDayOfMonth:
                    typeof taskRecord.recurringDayOfMonth === 'number'
                      ? Math.max(1, Math.min(31, Math.floor(taskRecord.recurringDayOfMonth)))
                      : null,
                  recurringMonthOfYear:
                    typeof taskRecord.recurringMonthOfYear === 'number'
                      ? Math.max(0, Math.min(11, Math.floor(taskRecord.recurringMonthOfYear)))
                      : null,
                };
              })
              .filter((task) => task.title)
              .sort(compareAutoScheduledTaskChronology)
              .slice(0, 7)
          : [];
        const taskRecurrenceMode =
          templateRecord.taskRecurrenceMode === 'calendarDate' ||
          templateRecord.taskRecurrenceMode === 'everyDays' ||
          templateRecord.taskRecurrenceMode === 'monthly'
            ? templateRecord.taskRecurrenceMode
            : 'none';
        return {
          ...template,
          taskRecurrenceMode,
          taskRecurrenceDateIso: String(templateRecord.taskRecurrenceDateIso ?? '').trim(),
          taskRecurrenceEveryDays:
            typeof templateRecord.taskRecurrenceEveryDays === 'number'
              ? Math.max(1, Math.min(365, Math.floor(templateRecord.taskRecurrenceEveryDays)))
              : null,
          taskRecurrenceMonthlyDay:
            typeof templateRecord.taskRecurrenceMonthlyDay === 'number'
              ? Math.max(1, Math.min(31, Math.floor(templateRecord.taskRecurrenceMonthlyDay)))
              : null,
          autoScheduledTasks: normalizedTasks,
        };
      });
      this.syncIdCounterFromExistingIds();
      return true;
    } catch {
      return false;
    }
  }

  private persistTemplates(): void {
    localStorage.setItem(templatesStorageKey, JSON.stringify(this.templates));
  }

  private loadSuppliesDraftsFromStorage(): void {
    try {
      const raw = localStorage.getItem(suppliesDraftStorageKey);
      if (!raw) return;
      const decoded = JSON.parse(raw) as Record<string, SuppliesRequestDraft>;
      this.suppliesDraftByTemplateId = decoded ?? {};
    } catch {
      this.suppliesDraftByTemplateId = {};
    }
  }

  private loadCompletedCalendarFromStorage(): void {
    try {
      const raw = localStorage.getItem(completedCalendarStorageKey);
      if (!raw) return;
      const decoded = JSON.parse(raw) as Record<string, WeekTask[]>;
      const normalizeTasks = (items: unknown): WeekTask[] => {
        if (!Array.isArray(items)) return [];
        return items
          .map((item) => item as Partial<WeekTask>)
          .filter((item) => Boolean(item?.id && item?.title))
          .map((item) => ({
            id: item.id as string,
            track: (item.track as AssessmentTrack) ?? 'producer',
            sourceTemplateId: (item.sourceTemplateId as string) ?? '',
            title: (item.title as string) ?? '',
            room: (item.room as string) ?? 'General',
            category: (item.category as string) ?? 'Completed',
            priority: clampPriority(Number(item.priority ?? 3)),
            estimatedHours: clampHours(Number(item.estimatedHours ?? 1)),
            day: typeof item.day === 'number' ? Math.max(0, Math.min(6, item.day)) : null,
            completed: true,
            fromOverflow: Boolean(item.fromOverflow),
            isFollowUp: Boolean(item.isFollowUp),
            sendCompletionMessage: Boolean(item.sendCompletionMessage),
            completionNotifyRole: (item.completionNotifyRole as UserRole) ?? 'generalManager',
            completionActionRequiredByDefault: Boolean(
              item.completionActionRequiredByDefault ?? true,
            ),
            sendDataToSpecificEmployee: Boolean(item.sendDataToSpecificEmployee),
            dataRecipientRole: (item.dataRecipientRole as UserRole) ?? 'producer',
            allowVoiceDictation: Boolean(item.allowVoiceDictation ?? true),
            dataSubmitted: Boolean(item.dataSubmitted),
            defaultDataEntryText: (item.defaultDataEntryText as string) ?? '',
            scheduledDateIso: (item.scheduledDateIso as string) ?? '',
            flowerRowNumber: normalizeFlowerRowNumber(item.flowerRowNumber as number | null | undefined),
            flowerLifecycleId:
              typeof item.flowerLifecycleId === 'string' ? item.flowerLifecycleId : undefined,
          }));
      };

      this.completedCalendarByTrack = {
        producer: normalizeTasks(decoded?.producer),
        generalManager: normalizeTasks(decoded?.generalManager),
        joManager: normalizeTasks(decoded?.joManager),
        budtenderTd: normalizeTasks(decoded?.budtenderTd),
        budtenderTdJunior: normalizeTasks(decoded?.budtenderTdJunior),
        budtenderJo: normalizeTasks(decoded?.budtenderJo),
        budtenderJoJunior: normalizeTasks(decoded?.budtenderJoJunior),
      };
    } catch {
      this.completedCalendarByTrack = {
        producer: [],
        generalManager: [],
        joManager: [],
        budtenderTd: [],
        budtenderTdJunior: [],
        budtenderJo: [],
        budtenderJoJunior: [],
      };
    }
  }

  private persistCompletedCalendarToStorage(): void {
    localStorage.setItem(
      completedCalendarStorageKey,
      JSON.stringify(this.completedCalendarByTrack),
    );
  }

  private loadInboxFromStorage(): void {
    const empty: Record<UserRole, InboxMessage[]> = {
      ceo: [],
      ceoExecutive: [],
      generalManager: [],
      flowerSales: [],
      producer: [],
      budtenderTd: [],
      budtenderTdJunior: [],
      budtenderJo: [],
      budtenderJoSenior: [],
      budtenderJoJunior: [],
    };
    try {
      const raw = localStorage.getItem(inboxStorageKey);
      if (!raw) {
        this.inboxByRole = empty;
        return;
      }
      const decoded = JSON.parse(raw) as Partial<Record<UserRole, unknown>>;
      const normalize = (value: unknown): InboxMessage[] => {
        if (!Array.isArray(value)) return [];
        return value
          .map((item) => item as Partial<InboxMessage>)
          .filter((item) => Boolean(item?.id && item?.title))
          .map((item) => ({
            id: String(item.id ?? ''),
            fromRole: (item.fromRole as UserRole) ?? 'producer',
            toRole: (item.toRole as UserRole) ?? 'generalManager',
            title: String(item.title ?? '').trim(),
            notes: String(item.notes ?? ''),
            tags: Array.isArray(item.tags) ? item.tags.map((tag) => String(tag)) : [],
            createdAt: String(item.createdAt ?? new Date().toISOString()),
            actionRequired: Boolean(item.actionRequired),
            isRead: Boolean(item.isRead),
          }))
          .filter((item) => item.id && item.title);
      };
      this.inboxByRole = {
        ceo: normalize((decoded as Record<string, unknown>)?.admin),
        ceoExecutive: normalize((decoded as Record<string, unknown>)?.ceoExecutive ?? decoded?.ceo),
        generalManager: normalize(decoded?.generalManager),
        flowerSales: normalize(decoded?.flowerSales),
        producer: normalize(decoded?.producer),
        budtenderTd: normalize(decoded?.budtenderTd),
        budtenderTdJunior: normalize(decoded?.budtenderTdJunior),
        budtenderJo: normalize(decoded?.budtenderJo),
        budtenderJoSenior: normalize(decoded?.budtenderJoSenior),
        budtenderJoJunior: normalize(decoded?.budtenderJoJunior),
      };
      this.syncIdCounterFromInboxMessages();
    } catch {
      this.inboxByRole = empty;
    }
  }

  private persistInboxToStorage(): void {
    localStorage.setItem(inboxStorageKey, JSON.stringify(this.inboxByRole));
  }

  private syncIdCounterFromInboxMessages(): void {
    let max = this.idCounter - 1;
    for (const role of userRoles) {
      for (const message of this.inboxByRole[role]) {
        const match = /-(\d+)$/.exec(message.id);
        const value = Number(match?.[1]);
        if (!Number.isNaN(value) && value > max) max = value;
      }
    }
    this.idCounter = Math.max(this.idCounter, max + 1);
  }

  private syncIdCounterFromAllKnownIds(): void {
    let max = this.idCounter - 1;
    const consider = (id: string | undefined | null): void => {
      if (!id) return;
      const match = /-(\d+)$/.exec(id);
      const value = Number(match?.[1]);
      if (!Number.isNaN(value) && value > max) max = value;
    };

    for (const template of this.templates) {
      consider(template.id);
    }
    for (const track of assessmentTracks) {
      for (const request of this.requestsByTrack[track]) {
        consider(request.id);
        consider(request.templateId);
      }
      for (const task of this.explicitNextByTrack[track]) {
        consider(task.id);
        consider(task.sourceTemplateId);
      }
      for (const task of this.completedCalendarByTrack[track]) {
        consider(task.id);
        consider(task.sourceTemplateId);
      }
    }
    for (const role of userRoles) {
      for (const message of this.inboxByRole[role]) {
        consider(message.id);
      }
    }
    this.idCounter = Math.max(this.idCounter, max + 1);
  }

  private syncIdCounterFromExistingIds(): void {
    let max = 0;
    for (const template of this.templates) {
      const match = /-(\d+)$/.exec(template.id);
      const value = Number(match?.[1]);
      if (!Number.isNaN(value) && value > max) max = value;
    }
    this.idCounter = Math.max(this.idCounter, max + 1);
  }
}

export const UI = {
  dayLabels,
  dayHourLimit,
  weekHourLimit,
  hourStepOptions,
  userRoles,
  trackLabel,
};
