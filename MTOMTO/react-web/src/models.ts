export type UserRole =
  | 'ceo'
  | 'ceoExecutive'
  | 'generalManager'
  | 'flowerSales'
  | 'producer'
  | 'budtenderTd'
  | 'budtenderTdJunior'
  | 'budtenderJo'
  | 'budtenderJoSenior'
  | 'budtenderJoJunior';

export type AssessmentTrack = 'producer' | 'generalManager' | 'joManager' | 'budtenderTd' | 'budtenderTdJunior' | 'budtenderJo' | 'budtenderJoJunior';

export const userRoles: UserRole[] = [
  'ceo',
  'ceoExecutive',
  'generalManager',
  'flowerSales',
  'producer',
  'budtenderTd',
  'budtenderTdJunior',
  'budtenderJo',
  'budtenderJoSenior',
  'budtenderJoJunior',
];

export const assessmentTracks: AssessmentTrack[] = [
  'producer',
  'generalManager',
  'joManager',
  'budtenderTd',
  'budtenderTdJunior',
  'budtenderJo',
  'budtenderJoJunior',
];

export const dayLabels = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

export const userRoleLabel: Record<UserRole, string> = {
  ceo: 'Admin',
  ceoExecutive: 'CEO',
  generalManager: 'General Manager',
  flowerSales: 'Flower Sales',
  producer: 'Producer',
  budtenderTd: 'Budtender TD Denise',
  budtenderTdJunior: 'Budtender TD Joseph',
  budtenderJo: 'Budtender J-O Carson',
  budtenderJoSenior: 'Retail Manager Tyrell',
  budtenderJoJunior: 'Budtender J-O Amber',
};

export const trackLabel: Record<AssessmentTrack, string> = {
  producer: 'Producer',
  generalManager: 'General Manager',
  joManager: 'Retail Manager',
  budtenderTd: 'Budtender TD Denise',
  budtenderTdJunior: 'Budtender TD Joseph',
  budtenderJo: 'Budtender J-O Carson',
  budtenderJoJunior: 'Budtender J-O Amber',
};

export const roleDefaultTrack: Record<UserRole, AssessmentTrack> = {
  ceo: 'producer',
  ceoExecutive: 'producer',
  producer: 'producer',
  generalManager: 'generalManager',
  flowerSales: 'generalManager',
  budtenderTd: 'budtenderTd',
  budtenderTdJunior: 'budtenderTdJunior',
  budtenderJo: 'budtenderJo',
  budtenderJoSenior: 'joManager',
  budtenderJoJunior: 'budtenderJoJunior',
};

export function roleCanAdmin(role: UserRole): boolean {
  return role === 'ceo';
}

export const roleRequestTargets: Record<UserRole, UserRole[]> = {
  ceo: ['ceoExecutive', 'generalManager', 'flowerSales'],
  ceoExecutive: ['generalManager', 'flowerSales', 'producer', 'budtenderTd', 'budtenderTdJunior', 'budtenderJo', 'budtenderJoSenior', 'budtenderJoJunior'],
  producer: ['generalManager', 'flowerSales', 'ceoExecutive'],
  generalManager: ['ceoExecutive', 'flowerSales', 'producer', 'budtenderTd', 'budtenderTdJunior', 'budtenderJo', 'budtenderJoSenior', 'budtenderJoJunior'],
  flowerSales: ['generalManager', 'ceoExecutive'],
  budtenderTd: ['generalManager', 'flowerSales', 'ceoExecutive', 'budtenderJoSenior'],
  budtenderTdJunior: ['generalManager', 'flowerSales', 'ceoExecutive', 'budtenderJoSenior'],
  budtenderJo: ['generalManager', 'flowerSales', 'budtenderJoSenior', 'ceoExecutive'],
  budtenderJoSenior: ['generalManager', 'flowerSales', 'ceoExecutive', 'budtenderTd', 'budtenderTdJunior', 'budtenderJo', 'budtenderJoJunior'],
  budtenderJoJunior: ['generalManager', 'flowerSales', 'budtenderJoSenior', 'ceoExecutive'],
};

export function roleCanPlan(role: UserRole): boolean {
  return (
    role === 'ceo' ||
    role === 'ceoExecutive' ||
    role === 'generalManager' ||
    role === 'producer' ||
    role === 'budtenderTd' ||
    role === 'budtenderJo' ||
    role === 'budtenderJoSenior'
  );
}

export interface FollowUpRule {
  title: string;
  priority: number;
  hours: number;
  assignedRole: UserRole;
  daysOffset: number;
}

export interface AutoScheduledTaskConfig {
  title: string;
  recipientRole: UserRole;
  hours: number;
  dueDateIso: string;
  daysUntilDue: number | null;
  recurrence: 'none' | 'weekly' | 'monthly' | 'yearly';
  recurringWeekday: number | null;
  recurringDayOfMonth: number | null;
  recurringMonthOfYear: number | null;
}

export interface AssessmentTemplate {
  id: string;
  track: AssessmentTrack;
  title: string;
  room: string;
  category: string;
  priority: number;
  defaultHours: number;
  autoFollowUp: boolean;
  followUpTitle: string;
  followUpPriority: number;
  followUpHours: number;
  followUpRules: FollowUpRule[];
  sendCompletionMessage: boolean;
  completionNotifyRole: UserRole;
  completionActionRequiredByDefault: boolean;
  sendDataToSpecificEmployee: boolean;
  dataRecipientRole: UserRole;
  dataRecipientRoles?: UserRole[];
  allowVoiceDictation: boolean;
  taskRecurrenceMode: 'none' | 'calendarDate' | 'everyDays' | 'monthly';
  taskRecurrenceDateIso: string;
  taskRecurrenceEveryDays: number | null;
  taskRecurrenceMonthlyDay: number | null;
  autoScheduledTasks: AutoScheduledTaskConfig[];
}

export interface PlannedAssessmentRequest {
  id: string;
  track: AssessmentTrack;
  templateId: string;
  title: string;
  room: string;
  category: string;
  priority: number;
  estimatedHours: number;
  preferredDay: number;
  createdAt: string;
  completed: boolean;
  followUpGenerated: boolean;
  sendCompletionMessage: boolean;
  completionNotifyRole: UserRole;
  completionActionRequiredByDefault: boolean;
  sendDataToSpecificEmployee: boolean;
  dataRecipientRole: UserRole;
  allowVoiceDictation: boolean;
  dataSubmitted: boolean;
  defaultDataEntryText: string;
  scheduledDateIso: string;
  flowerRowNumber?: number | null;
  flowerLifecycleId?: string;
}

export interface WeekTask {
  id: string;
  track: AssessmentTrack;
  sourceTemplateId: string;
  title: string;
  room: string;
  category: string;
  priority: number;
  estimatedHours: number;
  day: number | null;
  completed: boolean;
  fromOverflow: boolean;
  isFollowUp: boolean;
  sendCompletionMessage: boolean;
  completionNotifyRole: UserRole;
  completionActionRequiredByDefault: boolean;
  sendDataToSpecificEmployee: boolean;
  dataRecipientRole: UserRole;
  allowVoiceDictation: boolean;
  dataSubmitted: boolean;
  defaultDataEntryText: string;
  scheduledDateIso: string;
  flowerRowNumber?: number | null;
  flowerLifecycleId?: string;
}

export interface InboxMessage {
  id: string;
  fromRole: UserRole;
  toRole: UserRole;
  title: string;
  notes: string;
  tags: string[];
  createdAt: string;
  actionRequired: boolean;
  isRead: boolean;
}

export interface SuppliesRequestDraft {
  notes: string;
  neededByIso: string;
}

export interface PlanAssessmentResult {
  requestedDay: number;
  assignedDay: number | null;
}

export interface SeedEntry {
  title: string;
  room: string;
  category: string;
  priority: number;
  defaultHours: number;
}
