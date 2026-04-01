import { useEffect, useMemo, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { AppController, UI } from './controller';
import {
  roleCanAdmin,
  roleCanPlan,
  roleDefaultTrack,
  roleRequestTargets,
  trackLabel,
  userRoleLabel,
  userRoles,
  assessmentTracks,
} from './models';
import type {
  AssessmentTemplate,
  AssessmentTrack,
  AutoScheduledTaskConfig,
  UserRole,
  WeekTask,
} from './models';
import { producerResourceStorageKey } from './backend/runtimeStore';
import { producerResourceSections } from './producerResources';
import { PricingModule } from './pricing/components/PricingModule';
import { authenticate, clearStoredRole, defaultCredentials, getStoredRole, storeRole } from './auth';
import './App.css';

type TabKey =
  | 'weekly'
  | 'calendar'
  | 'taskList'
  | 'mothersChart'
  | 'twoGalsChart'
  | 'flowerRoomRowChart'
  | 'admin'
  | 'supplies'
  | 'cloningProtocol'
  | 'growingTips'
  | 'ceoRequests'
  | 'sendRequest'
  | 'pricing';

type DraftPlan = {
  day: number;
  hours: number;
  forNextWeek: boolean;
  flowerRowNumber: number | null;
};

type AutoScheduledTaskDraft = AutoScheduledTaskConfig;
type CeoRequestSelection = UserRole | '__supply' | '';
type TransferRowDraft = { rowNumber: number | null; strainName: string };
type TransferQuestionDraft = { rows: TransferRowDraft[]; finalized: boolean };

const recurrenceOptions: Array<{ value: AutoScheduledTaskConfig['recurrence']; label: string }> = [
  { value: 'none', label: 'One-time' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
];

const monthLabelsShort = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

const flowerRowOrder = [9, 8, 7, 6, 5, 4, 3, 2, 1];

type TimelineEvent = {
  id: string;
  title: string;
  dateIso: string;
};

function normalized(value: string): string {
  return value.trim().toLowerCase();
}

function monthGridDays(monthCursor: Date): Date[] {
  const firstOfMonth = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), 1);
  const firstWeekdayMonZero = (firstOfMonth.getDay() + 6) % 7;
  const gridStart = new Date(firstOfMonth);
  gridStart.setDate(firstOfMonth.getDate() - firstWeekdayMonZero);
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    return date;
  });
}

function toIso(date: Date): string {
  const year = date.getFullYear().toString().padStart(4, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const cloningProtocolMaterials = [
  'Rockwool',
  'Trays',
  'Vented clone domes',
  'Rooting hormone (IBA, IAA, Clonex)',
  'Nutrient solution (Clonex Clone Solution)',
  'Sharp scalpel, knife, or razor blade',
  'Sharp scissors',
  'Cup with 70% isopropyl alcohol or ethanol',
];

const cloningProtocolSteps = [
  'Select healthy mother plants to take clones from. Remember: "garbage in, garbage out." Prepare mother plants with foliar spray (zinc, copper, amino acids / Microdose) on the underside of leaves 1-3 days before cuttings. Top dress with 1 tsp langbeinite. Water mother plants a few hours before taking clones.',
  'Prepare rockwool by rinsing with RO water, then soaking in fresh nutrient solution in a clean plastic tub for at least 1 hour and no more than 12 hours. If using veg liquid fertilizer, use about 1/3 strength. Adjust pH to about 5.5 and target conductivity around 100-300 ppm.',
  'Remove rockwool from nutrient solution and allow it to drain.',
  'Place rockwool into tray and bring to mother plants with clean sharp tools. Keep tools in 70% ethanol.',
  'For clone selection, target new growth with at least 2 nodes (3 preferred) and 3.5-4 inches of stem. Keep at least one leaf (2-3 ideal).',
  'Cut stem at a 45 degree angle, ideally with a branch node close to the cut. Avoid scissors for the stem cut.',
  'Immediately dip clone into rooting hormone, then gently insert into rockwool. Let the stem barely poke through the bottom of the rockwool. If pre-drilled holes are too large, squeeze rockwool around the stem or make a tighter adjacent insertion point.',
  'Clip leaf tips with clean sharp scissors to reduce transpiration and water loss.',
  'After tray is filled, lightly mist plants one time with nutrient foliar spray and cover with dome. Open vent holes.',
  'Place trays under low-intensity light (T4 bulbs) set to 16 hours of light. Keep circadian rhythm aligned with mother plants when possible. Target about 75 F and 70-90% humidity. Lift and replace domes once daily for gas exchange.',
];

const cloningProtocolHardeningOff = [
  'After 4-7 days, remove dome and monitor for wilting.',
  'If cuttings wilt within minutes or hours, replace dome and maintain humidity.',
  'Retry dome removal again after 1-2 days.',
  'Repeat until plants no longer wilt, then transplant into soil.',
  'Preferred transplant target: 1-2 gallon Organic Matters soil pretreated with microdose, iron sulfate, manganese sulfate, and epsom salt.',
];

const growingTipsSections: Array<{ heading: string; points: string[] }> = [
  {
    heading: 'Water Filtration',
    points: [
      'Carbon filters: change every ~5000 gallons.',
      'Typical cadence: about every 5 months in Flower, and about once per year in Veg.',
    ],
  },
  {
    heading: 'Spray Formula',
    points: ['1 tsp Dawn dish soap to 1 gallon filtered water.'],
  },
  {
    heading: 'Room Temperature',
    points: ['Target 78-80 F.'],
  },
  {
    heading: 'Soils and Testing',
    points: [
      'Flower beds target: PPM 600-800, pH 6.2-6.4 (cadmium target noted at pH 6.7).',
      'Slurry test: add 1 cup distilled water to 1/2 cup homogenized soil.',
      'Test pH and test EC.',
    ],
  },
  {
    heading: 'Watering',
    points: [
      'Water temperature target: 50-60 F.',
      'Use about 20-40 gallons of water per 4x4x1 bed.',
      'Use about 80 gallons to flush a bed if needed.',
      'Add clay (bentonite) to increase water retention and water less frequently.',
      'Target around 50 ppm; use RO water and/or blend city + RO water to get there.',
    ],
  },
  {
    heading: 'Plant Notes',
    points: [
      'Purpling can be a cold-defense response and may indicate phosphorus deficiency.',
      'Common deficiencies include potassium and magnesium; add potassium magnesium sulfate as needed.',
    ],
  },
];

function categoryDisplayName(raw: string): string {
  const normalized = raw.trim().toLowerCase();
  if (normalized === 'mothers inspection' || normalized === 'mothers') return 'Mother Inspection';
  if (normalized === '2 gal plants' || normalized === '2 gallon plants' || normalized === '2 gallons') return 'Two-Gal Plants';
  if (normalized === 'clones') return 'Clones';
  return raw;
}

function isTransferTaskLabel(title: string): boolean {
  return title.trim().toLowerCase().includes('transfer veg plants to flower room');
}

function sortAutoTaskDrafts(tasks: AutoScheduledTaskDraft[]): AutoScheduledTaskDraft[] {
  return [...tasks].sort(compareAutoTaskDraftChronology);
}

function compareAutoTaskDraftChronology(a: AutoScheduledTaskDraft, b: AutoScheduledTaskDraft): number {
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
  const recOrder = (value: AutoScheduledTaskDraft['recurrence']) => {
    if (value === 'weekly') return 1;
    if (value === 'monthly') return 2;
    if (value === 'yearly') return 3;
    return 4;
  };
  return recOrder(a.recurrence) - recOrder(b.recurrence);
}

function adminRoomSortIndex(room: string): number {
  const normalized = room.trim().toLowerCase().replaceAll(':', '');
  if (normalized.startsWith('veg room')) return 0;
  if (normalized.startsWith('flower room')) return 1;
  if (normalized.startsWith('drying room')) return 2;
  if (normalized.startsWith('west room')) return 3;
  if (normalized === 'other') return 4;
  return 99;
}

function adminVegCategorySortIndex(category: string): number {
  const normalized = category.trim().toLowerCase();
  if (normalized === 'mothers inspection' || normalized === 'mothers') return 0;
  if (normalized === '2 gal plants' || normalized === '2 gallon plants' || normalized === '2 gallons') return 1;
  if (normalized === 'clones') return 2;
  return 99;
}

function sortAdminTemplates(a: AssessmentTemplate, b: AssessmentTemplate): number {
  const roomIndexA = adminRoomSortIndex(a.room);
  const roomIndexB = adminRoomSortIndex(b.room);
  if (roomIndexA !== roomIndexB) return roomIndexA - roomIndexB;

  const roomA = a.room.trim().toLowerCase().replaceAll(':', '');
  const roomB = b.room.trim().toLowerCase().replaceAll(':', '');
  const bothVeg = roomA.startsWith('veg room') && roomB.startsWith('veg room');
  if (bothVeg) {
    const catIndexA = adminVegCategorySortIndex(a.category);
    const catIndexB = adminVegCategorySortIndex(b.category);
    if (catIndexA !== catIndexB) return catIndexA - catIndexB;
  }

  const byCategory = a.category.localeCompare(b.category);
  if (byCategory !== 0) return byCategory;
  const byPriority = a.priority - b.priority;
  if (byPriority !== 0) return byPriority;
  return a.title.localeCompare(b.title);
}

function LoginScreen({ onLogin }: { onLogin: (role: UserRole) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const role = authenticate(username, password);
    if (role) {
      onLogin(role);
    } else {
      setError('Invalid username or password.');
    }
  };

  return (
    <div className="login-screen">
      <div className="login-logo">
        <h1>MTO</h1>
        <p>Dispensary Management</p>
      </div>
      <div className="login-card">
        <h2>Sign In</h2>
        <form className="login-form" onSubmit={handleSubmit}>
          <label>
            Username
            <input
              type="text"
              value={username}
              onChange={(e) => { setUsername(e.target.value); setError(''); }}
              autoFocus
              autoComplete="username"
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(''); }}
              autoComplete="current-password"
            />
          </label>
          {error ? <p className="login-error">{error}</p> : null}
          <button type="submit" className="login-submit">Sign In</button>
        </form>
      </div>
      <div className="login-creds">
        <div className="login-creds-header">Test Credentials</div>
        <table>
          <thead>
            <tr>
              <th>Role</th>
              <th>Username</th>
              <th>Password</th>
            </tr>
          </thead>
          <tbody>
            {defaultCredentials.map((cred) => (
              <tr key={cred.role}>
                <td>{cred.label}</td>
                <td><code>{cred.username}</code></td>
                <td><code>{cred.password}</code></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function App() {
  const controller = useMemo(() => new AppController(), []);
  const [, setVersion] = useState(0);
  const [tab, setTab] = useState<TabKey>('weekly');
  const [showInbox, setShowInbox] = useState(false);
  const [showOverflow, setShowOverflow] = useState(false);
  const [showClosing, setShowClosing] = useState(false);
  const [showRestoredClosing, setShowRestoredClosing] = useState(false);
  const [ceoRequestViewRole, setCeoRequestViewRole] = useState<CeoRequestSelection>('');
  const [sendRequestTarget, setSendRequestTarget] = useState<UserRole | ''>('');
  const [loggedInRole, setLoggedInRole] = useState<UserRole | null>(() => getStoredRole());

  const handleLogin = (role: UserRole) => {
    storeRole(role);
    controller.setRole(role);
    setLoggedInRole(role);
    setTab('weekly');
  };

  const handleLogout = () => {
    clearStoredRole();
    setLoggedInRole(null);
  };

  useEffect(() => {
    const unsub = controller.subscribe(() => setVersion((v) => v + 1));
    void controller.loadInitialAssessments();
    if (loggedInRole) controller.setRole(loggedInRole);
    return unsub;
  }, [controller]);

  const canPlan = roleCanPlan(controller.selectedRole);
  const canAdmin = roleCanAdmin(controller.selectedRole);
  const requestTargets = roleRequestTargets[controller.selectedRole] ?? [];

  const availableTabs: TabKey[] = [
    'weekly',
    ...(canPlan ? ['calendar' as TabKey] : []),
    ...(controller.selectedRole === 'producer' ? ['taskList' as TabKey] : []),
    ...(controller.selectedRole === 'producer' ? ['mothersChart' as TabKey] : []),
    ...(controller.selectedRole === 'producer' ? ['twoGalsChart' as TabKey] : []),
    ...(controller.selectedRole === 'producer' ? ['flowerRoomRowChart' as TabKey] : []),
    ...(canAdmin ? ['admin' as TabKey] : []),
    ...(controller.selectedRole === 'producer' ? ['supplies' as TabKey] : []),
    ...(controller.selectedRole === 'producer' ? ['cloningProtocol' as TabKey] : []),
    ...(controller.selectedRole === 'producer' ? ['growingTips' as TabKey] : []),
    ...(controller.selectedRole === 'ceoExecutive' ? ['ceoRequests' as TabKey] : []),
    ...(requestTargets.length > 0 ? ['sendRequest' as TabKey] : []),
    ...((controller.selectedRole === 'ceo' || controller.selectedRole === 'ceoExecutive' || controller.selectedRole === 'generalManager' || controller.selectedRole === 'flowerSales') ? ['pricing' as TabKey] : []),
  ];
  const currentTab: TabKey = availableTabs.includes(tab) ? tab : 'weekly';

  if (!loggedInRole) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  return (
    <div className="app">
      <header className={`topbar ${controller.selectedRole === 'producer' ? 'topbar-producer' : ''}`}>

        {/* ── Navigation tabs (role-dependent) ── */}
        <div className={`topbar-nav ${controller.selectedRole === 'producer' ? 'topbar-nav-producer' : ''}`}>
          {controller.selectedRole === 'producer' ? (
            <>
              <div className="producer-tab-row">
                <button className={currentTab === 'weekly' ? 'active' : ''} onClick={() => setTab('weekly')}>
                  Weekly Tasks
                </button>
                <button
                  className={`task-list-tab ${currentTab === 'taskList' ? 'active' : ''}`}
                  onClick={() => setTab((prev) => (prev === 'taskList' ? 'weekly' : 'taskList'))}
                >
                  Two-Week List
                </button>
                {canPlan ? (
                  <button className={currentTab === 'calendar' ? 'active' : ''} onClick={() => setTab('calendar')}>
                    Calendar
                  </button>
                ) : null}
                <button
                  className={`supplies-tab ${currentTab === 'supplies' ? 'active' : ''}`}
                  onClick={() => setTab('supplies')}
                >
                  Supplies
                </button>
                {requestTargets.length > 0 ? (
                  <select
                    className="request-dropdown"
                    value={currentTab === 'sendRequest' ? (sendRequestTarget || '') : ''}
                    onChange={(e) => {
                      const role = e.target.value as UserRole;
                      setSendRequestTarget(role);
                      setTab('sendRequest');
                    }}
                  >
                    <option value="">Send Request…</option>
                    {requestTargets.map((role) => (
                      <option key={role} value={role}>{userRoleLabel[role]}</option>
                    ))}
                  </select>
                ) : null}
                {canPlan && currentTab === 'calendar' ? (
                  <>
                    <button onClick={() => controller.moveOneWeekBackward()}>← Week</button>
                    <button onClick={() => controller.moveOneWeekForward()}>Week →</button>
                  </>
                ) : null}
              </div>
              <div className="producer-tab-row producer-tab-row-label">
                <span className="producer-following-label">Period the Following</span>
              </div>
              <div className="producer-tab-row">
                <button
                  className={`mothers-tab ${currentTab === 'mothersChart' ? 'active' : ''}`}
                  onClick={() => setTab('mothersChart')}
                >
                  Mothers Chart
                </button>
                <button
                  className={`two-gals-tab ${currentTab === 'twoGalsChart' ? 'active' : ''}`}
                  onClick={() => setTab('twoGalsChart')}
                >
                  Two Gals
                </button>
                <button
                  className={`flower-row-chart-tab ${currentTab === 'flowerRoomRowChart' ? 'active' : ''}`}
                  onClick={() => setTab('flowerRoomRowChart')}
                >
                  Flower Room
                </button>
                <button
                  className={`cloning-protocol-tab ${currentTab === 'cloningProtocol' ? 'active' : ''}`}
                  onClick={() => setTab('cloningProtocol')}
                >
                  Cloning
                </button>
                <button
                  className={`growing-tips-tab ${currentTab === 'growingTips' ? 'active' : ''}`}
                  onClick={() => setTab('growingTips')}
                >
                  Growing Tips
                </button>
              </div>
            </>
          ) : (
            <>
              <button className={currentTab === 'weekly' ? 'active' : ''} onClick={() => setTab('weekly')}>
                Weekly Tasks
              </button>
              {canPlan ? (
                <button className={currentTab === 'calendar' ? 'active' : ''} onClick={() => setTab('calendar')}>
                  Calendar
                </button>
              ) : null}
              {canAdmin ? (
                <button className={currentTab === 'admin' ? 'active' : ''} onClick={() => setTab('admin')}>
                  Task Details
                </button>
              ) : null}
              {(controller.selectedRole === 'ceo' || controller.selectedRole === 'ceoExecutive' || controller.selectedRole === 'generalManager' || controller.selectedRole === 'flowerSales') ? (
                <button className={currentTab === 'pricing' ? 'active' : ''} onClick={() => setTab('pricing')}>
                  Pricing
                </button>
              ) : null}
              {controller.selectedRole === 'ceoExecutive' ? (
                <select
                  className="request-dropdown"
                  value={currentTab === 'ceoRequests' ? (ceoRequestViewRole || '') : ''}
                  onChange={(e) => {
                    const role = e.target.value as CeoRequestSelection;
                    setCeoRequestViewRole(role);
                    setTab('ceoRequests');
                  }}
                >
                  <option value="">View Requests…</option>
                  <option value="__supply">Supply Requests</option>
                  {userRoles
                    .filter((role) => role !== 'ceo' && role !== 'ceoExecutive')
                    .map((role) => (
                      <option key={role} value={role}>{userRoleLabel[role]} Requests</option>
                    ))}
                </select>
              ) : null}
              {requestTargets.length > 0 ? (
                <select
                  className="request-dropdown"
                  value={currentTab === 'sendRequest' ? (sendRequestTarget || '') : ''}
                  onChange={(e) => {
                    const role = e.target.value as UserRole;
                    setSendRequestTarget(role);
                    setTab('sendRequest');
                  }}
                >
                  <option value="">Send Request…</option>
                  {requestTargets.map((role) => (
                    <option key={role} value={role}>{userRoleLabel[role]}</option>
                  ))}
                </select>
              ) : null}
              {canPlan && currentTab === 'calendar' ? (
                <>
                  <button onClick={() => controller.moveOneWeekBackward()}>← Week</button>
                  <button onClick={() => controller.moveOneWeekForward()}>Week →</button>
                </>
              ) : null}
            </>
          )}
        </div>

        {/* ── Right-side actions ── */}
        <div className="topbar-actions">
          {controller.selectedRole === 'producer' && controller.overflowTasks.length > 0 ? (
            <button onClick={() => setShowOverflow(true)}>Overflow</button>
          ) : null}
          {controller.selectedRole === 'producer' && controller.closingTasksForActiveTrack().length > 0 ? (
            <button onClick={() => setShowClosing(true)}>Closing</button>
          ) : null}
          {controller.selectedRole === 'producer' ? (
            <button onClick={() => setShowRestoredClosing(true)}>Restored</button>
          ) : null}
          <button onClick={() => setShowInbox(true)}>
            Inbox {controller.unreadInboxCountForSelectedRole > 0 ? `(${controller.unreadInboxCountForSelectedRole})` : ''}
          </button>
          {(controller.selectedRole === 'ceo' || controller.selectedRole === 'ceoExecutive') ? (
            <select value={controller.ceoTrack} onChange={(e) => controller.setCeoTrack(e.target.value as AssessmentTrack)}>
              {assessmentTracks.map((track) => (
                <option key={track} value={track}>
                  {controller.selectedRole === 'ceo' ? 'Admin' : 'CEO'}: {trackLabel[track]}
                </option>
              ))}
            </select>
          ) : null}
          {controller.selectedRole === 'generalManager' ? (
            <select
              value={controller.generalManagerViewRole}
              onChange={(e) => controller.setGeneralManagerViewRole(e.target.value as UserRole)}
            >
              {userRoles
                .filter((role) => role !== 'ceo' && role !== 'ceoExecutive')
                .map((role) => (
                  <option key={role} value={role}>GM: {userRoleLabel[role]}</option>
                ))}
            </select>
          ) : null}
          {loggedInRole === 'ceo' ? (
            <select
              value={controller.selectedRole}
              onChange={(e) => {
                controller.setRole(e.target.value as UserRole);
                setTab('weekly');
              }}
            >
              {userRoles.map((role) => (
                <option key={role} value={role}>{userRoleLabel[role]}</option>
              ))}
            </select>
          ) : null}
          <div className="topbar-auth">
            <span className="topbar-user">{userRoleLabel[loggedInRole]}</span>
            <button className="topbar-logout" onClick={handleLogout}>Log Out</button>
          </div>
        </div>

      </header>

      <main className="content">
        {controller.isLoading ? <div className="card">Loading assessments...</div> : null}
        {!controller.isLoading && currentTab === 'weekly' ? <WeeklyPage controller={controller} /> : null}
        {!controller.isLoading && currentTab === 'calendar' && canPlan ? <CalendarPage controller={controller} /> : null}
        {!controller.isLoading && currentTab === 'taskList' && controller.selectedRole === 'producer' ? (
          <ProducerTwoWeekTaskListPage controller={controller} />
        ) : null}
        {!controller.isLoading && currentTab === 'mothersChart' && controller.selectedRole === 'producer' ? (
          <MothersFeedingPruningChartPage controller={controller} />
        ) : null}
        {!controller.isLoading && currentTab === 'twoGalsChart' && controller.selectedRole === 'producer' ? (
          <TwoGalsChartPage controller={controller} />
        ) : null}
        {!controller.isLoading && currentTab === 'flowerRoomRowChart' && controller.selectedRole === 'producer' ? (
          <FlowerRoomRowChartPage controller={controller} />
        ) : null}
        {!controller.isLoading && currentTab === 'admin' && canAdmin ? <AdminPage controller={controller} /> : null}
        {!controller.isLoading && currentTab === 'supplies' && controller.selectedRole === 'producer' ? (
          <ProducerResourcesPage controller={controller} />
        ) : null}
        {!controller.isLoading && currentTab === 'cloningProtocol' && controller.selectedRole === 'producer' ? (
          <CloningProtocolPage />
        ) : null}
        {!controller.isLoading && currentTab === 'growingTips' && controller.selectedRole === 'producer' ? (
          <GrowingTipsPage />
        ) : null}
        {!controller.isLoading && currentTab === 'ceoRequests' && controller.selectedRole === 'ceoExecutive' && ceoRequestViewRole === '__supply' ? (
          <CeoSupplyRequestsPage controller={controller} />
        ) : null}
        {!controller.isLoading && currentTab === 'ceoRequests' && controller.selectedRole === 'ceoExecutive' && ceoRequestViewRole && ceoRequestViewRole !== '__supply' ? (
          <CeoRoleRequestsPage controller={controller} sourceRole={ceoRequestViewRole} title={`${userRoleLabel[ceoRequestViewRole]} Requests`} />
        ) : null}
        {!controller.isLoading && currentTab === 'ceoRequests' && controller.selectedRole === 'ceoExecutive' && !ceoRequestViewRole ? (
          <div className="card"><p className="muted">Select a role from the &ldquo;View Requests From...&rdquo; dropdown above.</p></div>
        ) : null}
        {!controller.isLoading && currentTab === 'sendRequest' && sendRequestTarget ? (
          <SendRequestPage controller={controller} targetRole={sendRequestTarget as UserRole} />
        ) : null}
        {!controller.isLoading && currentTab === 'sendRequest' && !sendRequestTarget ? (
          <div className="card"><p className="muted">Select a recipient from the &ldquo;Send Request To...&rdquo; dropdown above.</p></div>
        ) : null}
        {!controller.isLoading && currentTab === 'pricing' ? (
          <PricingModule />
        ) : null}
      </main>

      {showOverflow ? (
        <Modal title={`Overflow Tasks (${controller.overflowTasks.filter((t) => t.completed).length}/${controller.overflowTasks.length})`} onClose={() => setShowOverflow(false)}>
          {controller.overflowTasks.length === 0 ? <p>No overflow tasks this week.</p> : null}
          {controller.overflowTasks.map((task) => (
            <label key={task.id} className="check-row">
              <input
                type="checkbox"
                checked={task.completed}
                disabled={task.completed && !roleCanAdmin(controller.selectedRole)}
                onChange={(e) => {
                  const ok = controller.toggleOverflowTaskCompletion(task.id, e.target.checked);
                  if (!ok && e.target.checked) {
                    alert('Send required task data/message before marking this task complete.');
                  }
                  if (!ok && !e.target.checked) {
                    alert('Completed tasks are locked. Only Admin can modify them.');
                  }
                }}
              />
              <span>
                {task.title} ({task.room}) - P{task.priority} - {controller.formatHoursLabel(task.estimatedHours)}
              </span>
            </label>
          ))}
        </Modal>
      ) : null}

      {showClosing ? (
        <Modal
          title={`Closing Tasks (${controller.closingTasksForActiveTrack().filter((t) => controller.isClosingTaskChecked(t.id)).length}/${controller.closingTasksForActiveTrack().length})`}
          onClose={() => setShowClosing(false)}
        >
          {controller.closingTasksForActiveTrack().length === 0 ? <p>No closing tasks configured.</p> : null}
          {controller.closingTasksForActiveTrack().map((task) => (
            <label key={task.id} className="check-row">
              <input
                type="checkbox"
                checked={controller.isClosingTaskChecked(task.id)}
                onChange={(e) => controller.setClosingTaskChecked(task.id, e.target.checked)}
              />
              <span>
                {task.title}
              </span>
            </label>
          ))}
        </Modal>
      ) : null}

      {showRestoredClosing ? (
        <Modal
          title={`Restored Closing List (${controller.restoredClosingTasksForProducer().filter((task) => controller.isRestoredClosingTaskChecked(task.id)).length}/${controller.restoredClosingTasksForProducer().length})`}
          onClose={() => setShowRestoredClosing(false)}
        >
          {controller.restoredClosingTasksForProducer().map((task) => (
            <label key={task.id} className="check-row">
              <input
                type="checkbox"
                checked={controller.isRestoredClosingTaskChecked(task.id)}
                onChange={(e) => controller.setRestoredClosingTaskChecked(task.id, e.target.checked)}
              />
              <span>{task.title}</span>
            </label>
          ))}
        </Modal>
      ) : null}

      {showInbox ? <InboxModal controller={controller} onClose={() => setShowInbox(false)} /> : null}
    </div>
  );
}

type ProducerResourceDraftRow = {
  checked: boolean;
  quantity: string;
  notes: string;
  neededBy: 'asap' | 'oneWeek' | 'twoWeeks' | 'threeWeeks';
};

function ProducerResourcesContent({ controller }: { controller: AppController }) {
  const supplyNeedOptions = [
    { value: 'asap', label: 'ASAP' },
    { value: 'oneWeek', label: '1 week' },
    { value: 'twoWeeks', label: '2 weeks' },
    { value: 'threeWeeks', label: '3 weeks' },
  ] as const;

  const allItems = useMemo(
    () =>
      producerResourceSections.flatMap((section) =>
        section.items.map((item) => ({
          ...item,
          sectionTitle: section.title,
        })),
      ),
    [],
  );

  const [rows, setRows] = useState<Record<string, ProducerResourceDraftRow>>(() => {
    const base = Object.fromEntries(
      allItems.map((item) => [
        item.id,
        {
          checked: false,
          quantity: '',
          notes: '',
          neededBy: 'asap',
        } satisfies ProducerResourceDraftRow,
      ]),
    ) as Record<string, ProducerResourceDraftRow>;
    try {
      const raw = localStorage.getItem(producerResourceStorageKey);
      if (!raw) return base;
      const decoded = JSON.parse(raw) as Record<string, Partial<ProducerResourceDraftRow>>;
      for (const item of allItems) {
        const row = decoded[item.id];
        if (!row) continue;
        base[item.id] = {
          checked: Boolean(row.checked),
          quantity: String(row.quantity ?? ''),
          notes: String(row.notes ?? ''),
          neededBy:
            row.neededBy === 'asap' ||
            row.neededBy === 'oneWeek' ||
            row.neededBy === 'twoWeeks' ||
            row.neededBy === 'threeWeeks'
              ? row.neededBy
              : 'asap',
        };
      }
      return base;
    } catch {
      return base;
    }
  });

  const [sendToGm, setSendToGm] = useState(false);
  const [sendToCeo, setSendToCeo] = useState(true);

  useEffect(() => {
    localStorage.setItem(producerResourceStorageKey, JSON.stringify(rows));
    controller.updateProducerResourceRows(rows as Record<string, unknown>);
  }, [rows, controller]);

  const checkedCount = allItems.filter((item) => rows[item.id]?.checked).length;

  const sendList = () => {
    const recipients: UserRole[] = [];
    if (sendToCeo) recipients.push('ceoExecutive');
    if (sendToGm) recipients.push('generalManager');
    if (recipients.length === 0) {
      alert('Select at least one recipient (CEO and/or GM).');
      return;
    }

    const selected = allItems.filter((item) => rows[item.id]?.checked);
    if (selected.length === 0) {
      alert('Select at least one shopping list item.');
      return;
    }

    const lines: string[] = ['Producer shopping list update:'];
    for (const section of producerResourceSections) {
      const sectionItems = section.items.filter((item) => rows[item.id]?.checked);
      if (sectionItems.length === 0) continue;
      lines.push('');
      lines.push(`[${section.title}]`);
      for (const item of sectionItems) {
        const row = rows[item.id];
        const extra: string[] = [];
        const neededByLabel =
          supplyNeedOptions.find((option) => option.value === row.neededBy)?.label ?? 'ASAP';
        extra.push(`needed by: ${neededByLabel}`);
        if (item.location) extra.push(`location: ${item.location}`);
        if (item.source) extra.push(`source: ${item.source}`);
        if (row.quantity.trim()) extra.push(`qty: ${row.quantity.trim()}`);
        if (row.notes.trim()) extra.push(`notes: ${row.notes.trim()}`);
        lines.push(`- ${item.label}${extra.length > 0 ? ` (${extra.join(', ')})` : ''}`);
      }
    }

    controller.sendInboxMessage({
      recipients,
      title: 'Soil and Supplies Shopping List',
      notes: lines.join('\n'),
      tags: ['Resources', 'Shopping List'],
      actionRequired: true,
    });
    alert('Shopping list sent.');
  };

  return (
    <>
      <div className="resource-head resource-head-compact">
        <span className="muted">
          Checked: {checkedCount}/{allItems.length}
        </span>
        <div className="button-row">
          <button
            onClick={() =>
              setRows((current) =>
                Object.fromEntries(
                  Object.entries(current).map(([id, row]) => [id, { ...row, checked: true }]),
                ) as Record<string, ProducerResourceDraftRow>,
              )
            }
          >
            Select all
          </button>
          <button
            onClick={() =>
              setRows((current) =>
                Object.fromEntries(
                  Object.entries(current).map(([id, row]) => [id, { ...row, checked: false }]),
                ) as Record<string, ProducerResourceDraftRow>,
              )
            }
          >
            Clear checks
          </button>
        </div>
        <div className="recipient-list">
          <label className="inline-check">
            <input type="checkbox" checked={sendToCeo} onChange={(e) => setSendToCeo(e.target.checked)} />
            Send to CEO
          </label>
          <label className="inline-check">
            <input type="checkbox" checked={sendToGm} onChange={(e) => setSendToGm(e.target.checked)} />
            Send to GM
          </label>
        </div>
        <button onClick={sendList}>Send selected list</button>
      </div>

      <div className="resource-sections">
        {producerResourceSections.map((section) => (
          <section key={section.id} className="resource-section">
            <h3>{section.title}</h3>
            <div className="resource-rows">
              {section.items.map((item) => {
                const row = rows[item.id] ?? { checked: false, quantity: '', notes: '', neededBy: 'asap' };
                return (
                  <article key={item.id} className="resource-row">
                    <label className="inline-check">
                      <input
                        type="checkbox"
                        checked={row.checked}
                        onChange={(e) =>
                          setRows((current) => ({
                            ...current,
                            [item.id]: { ...row, checked: e.target.checked },
                          }))
                        }
                      />
                      <span>{item.label}</span>
                    </label>
                    <div className="resource-need-pills">
                      {supplyNeedOptions.map((option) => (
                        <button
                          key={`${item.id}-${option.value}`}
                          type="button"
                          className={`day-pill ${row.neededBy === option.value ? 'active-day' : ''}`}
                          onClick={() =>
                            setRows((current) => ({
                              ...current,
                              [item.id]: { ...row, neededBy: option.value },
                            }))
                          }
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                    <input
                      placeholder="Quantity"
                      value={row.quantity}
                      onChange={(e) =>
                        setRows((current) => ({
                          ...current,
                          [item.id]: { ...row, quantity: e.target.value },
                        }))
                      }
                    />
                    <input
                      placeholder="Notes"
                      value={row.notes}
                      onChange={(e) =>
                        setRows((current) => ({
                          ...current,
                          [item.id]: { ...row, notes: e.target.value },
                        }))
                      }
                    />
                  </article>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}

function ProducerResourcesPage({ controller }: { controller: AppController }) {
  return (
    <div className="card producer-supplies-card">
      <div className="header-row">
        <h2>Request Soil & Supplies</h2>
      </div>
      <ProducerResourcesContent controller={controller} />
    </div>
  );
}

function CloningProtocolPage() {
  return (
    <div className="card producer-supplies-card">
      <div className="header-row">
        <h2>Cloning Protocol</h2>
      </div>
      <p className="muted">Producer reference protocol with materials and step-by-step process.</p>
      <section className="doc-section">
        <h3>Materials</h3>
        <ul className="doc-list">
          {cloningProtocolMaterials.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>
      <section className="doc-section">
        <h3>Procedure</h3>
        <ol className="doc-list-numbered">
          {cloningProtocolSteps.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ol>
      </section>
      <section className="doc-section">
        <h3>Hardening Off</h3>
        <ul className="doc-list">
          {cloningProtocolHardeningOff.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>
      <div className="inline-actions">
        <a
          className="doc-link-button"
          href="/assets/docs/cloning-protocol.docx"
          target="_blank"
          rel="noreferrer"
        >
          Open Cloning Protocol
        </a>
        <a className="doc-link-button secondary" href="/assets/docs/cloning-protocol.docx" download>
          Download
        </a>
      </div>
    </div>
  );
}

function GrowingTipsPage() {
  return (
    <div className="card producer-supplies-card">
      <div className="header-row">
        <h2>Growing Tips</h2>
      </div>
      <p className="muted">Producer quick-reference growing notes and targets.</p>
      {growingTipsSections.map((section) => (
        <section key={section.heading} className="doc-section">
          <h3>{section.heading}</h3>
          <ul className="doc-list">
            {section.points.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        </section>
      ))}
      <div className="inline-actions">
        <a className="doc-link-button" href="/assets/docs/growing-tips.docx" target="_blank" rel="noreferrer">
          Open Growing Tips
        </a>
        <a className="doc-link-button secondary" href="/assets/docs/growing-tips.docx" download>
          Download
        </a>
      </div>
    </div>
  );
}

function CeoSupplyRequestsPage({ controller }: { controller: AppController }) {
  const supplyMessages = controller.inboxByRole.ceoExecutive.filter(
    (message) =>
      message.title.toLowerCase().includes('shopping list')
      || message.tags.some((tag) => tag.toLowerCase().includes('resources') || tag.toLowerCase().includes('shopping')),
  );

  return (
    <div className="card producer-supplies-card">
      <h2>Producer Supply Requests</h2>
      <p className="muted">Supply lists sent from Producer to CEO.</p>
      <div className="calendar-list">
        {supplyMessages.map((message) => (
          <article key={message.id} className={`calendar-item ${message.isRead ? 'read' : 'unread'}`}>
            <strong>{message.title}</strong>
            <span>
              From: {userRoleLabel[message.fromRole]} {'->'} To: {userRoleLabel[message.toRole]}
            </span>
            <span>{new Date(message.createdAt).toLocaleString()}</span>
            <span>{message.notes || 'No notes'}</span>
            {!message.isRead ? (
              <button onClick={() => controller.markInboxMessageRead(message.id)}>Mark read</button>
            ) : null}
          </article>
        ))}
        {supplyMessages.length === 0 ? <p>No producer supply requests yet.</p> : null}
      </div>
    </div>
  );
}

function CeoRoleRequestsPage({
  controller,
  sourceRole,
  title,
}: {
  controller: AppController;
  sourceRole: UserRole;
  title: string;
}) {
  const roleMessages = controller.inboxByRole.ceoExecutive.filter(
    (message) => message.fromRole === sourceRole && message.toRole === 'ceoExecutive',
  );

  return (
    <div className="card producer-supplies-card">
      <h2>{title}</h2>
      <p className="muted">Messages sent to CEO from {userRoleLabel[sourceRole]}.</p>
      <div className="calendar-list">
        {roleMessages.map((message) => (
          <article key={message.id} className={`calendar-item ${message.isRead ? 'read' : 'unread'}`}>
            <strong>{message.title}</strong>
            <span>
              From: {userRoleLabel[message.fromRole]} {'->'} To: {userRoleLabel[message.toRole]}
            </span>
            <span>{new Date(message.createdAt).toLocaleString()}</span>
            <span>{message.notes || 'No notes'}</span>
            {message.actionRequired ? <span className="warning">Action required</span> : null}
            {!message.isRead ? (
              <button onClick={() => controller.markInboxMessageRead(message.id)}>Mark read</button>
            ) : null}
          </article>
        ))}
        {roleMessages.length === 0 ? <p>No requests yet.</p> : null}
      </div>
    </div>
  );
}

function ProducerTwoWeekTaskListPage({ controller }: { controller: AppController }) {
  const activeTrack = controller.activeTrack;
  const currentWeekStartIso = controller.weekStartByTrack[activeTrack];
  const currentWeekStart = currentWeekStartIso
    ? new Date(`${currentWeekStartIso}T00:00:00`)
    : new Date();
  const nextWeekStart = new Date(currentWeekStart);
  nextWeekStart.setDate(currentWeekStart.getDate() + 7);
  const nextWeekEnd = new Date(nextWeekStart);
  nextWeekEnd.setDate(nextWeekStart.getDate() + 7);

  const nextWeekTasks = controller.explicitNextByTrack[activeTrack].filter((task) => {
    if (!task.scheduledDateIso) return false;
    const date = new Date(`${task.scheduledDateIso}T00:00:00`);
    if (Number.isNaN(date.getTime())) return false;
    return date >= nextWeekStart && date < nextWeekEnd;
  });

  const nextWeekTasksForDay = (dayIndex: number) =>
    nextWeekTasks
      .filter((task) => task.day === dayIndex)
      .sort((a, b) => a.title.localeCompare(b.title));

  const nextWeekDayLoad = (dayIndex: number) =>
    nextWeekTasksForDay(dayIndex).reduce((sum, task) => sum + task.estimatedHours, 0);

  const weekRangeLabel = (weekStart: Date) => {
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    return `${weekStart.toLocaleDateString()} - ${weekEnd.toLocaleDateString()}`;
  };

  const dayDateLabel = (weekStart: Date, dayIndex: number) => {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + dayIndex);
    return `${date.getMonth() + 1}/${date.getDate()}`;
  };

  return (
    <div className="card summary">
      <h2>Task List for the Next Two Weeks</h2>
      <section className="week-block">
        <h3>This Week <small>{weekRangeLabel(currentWeekStart)}</small></h3>
        <div className="schedule-grid">
          {UI.dayLabels.map((day, index) => {
            const load = controller.dayLoad(index);
            const capClass = load >= 8 ? 'day-over-full' : load >= 7 ? 'day-near-full' : '';
            return (
            <div key={`this-${day}`} className={`day-col ${capClass}`}>
              <div className="day-head">
                <h4>
                  {day}
                  <span className="day-date-small">{dayDateLabel(currentWeekStart, index)}</span>
                </h4>
                <span className="day-load-small">
                  {load.toFixed(1)} / 8h
                </span>
              </div>
              {controller.tasksForDay(index).map((task) => (
                <label key={task.id} className="check-row">
                  <input
                    type="checkbox"
                    checked={task.completed}
                    disabled={task.completed && !roleCanAdmin(controller.selectedRole)}
                    onChange={(e) => {
                      const ok = controller.toggleThisWeekCompletion(task.id, e.target.checked);
                      if (!ok && e.target.checked) {
                        alert('Send required task data/message before marking this task complete.');
                      }
                      if (!ok && !e.target.checked) {
                        alert('Completed tasks are locked. Only Admin can modify them.');
                      }
                    }}
                  />
                  <span>
                    {task.title} ({controller.formatHoursLabel(task.estimatedHours)})
                  </span>
                </label>
              ))}
            </div>
            );
          })}
        </div>
      </section>
      <section className="week-block">
        <h3>Next Week <small>{weekRangeLabel(nextWeekStart)}</small></h3>
        <div className="schedule-grid">
          {UI.dayLabels.map((day, index) => {
            const load = nextWeekDayLoad(index);
            const capClass = load >= 8 ? 'day-over-full' : load >= 7 ? 'day-near-full' : '';
            return (
            <div key={`next-${day}`} className={`day-col ${capClass}`}>
              <div className="day-head">
                <h4>
                  {day}
                  <span className="day-date-small">{dayDateLabel(nextWeekStart, index)}</span>
                </h4>
                <span className="day-load-small">
                  {load.toFixed(1)} / 8h
                </span>
              </div>
              {nextWeekTasksForDay(index).map((task) => (
                <label key={task.id} className="check-row">
                  <input
                    type="checkbox"
                    checked={task.completed}
                    disabled={task.completed && !roleCanAdmin(controller.selectedRole)}
                    onChange={(e) => {
                      const ok = controller.toggleNextWeekCompletion(task.id, e.target.checked);
                      if (!ok && e.target.checked) {
                        alert('Send required task data/message before marking this task complete.');
                      }
                      if (!ok && !e.target.checked) {
                        alert('Completed tasks are locked. Only Admin can modify them.');
                      }
                    }}
                  />
                  <span>
                    {task.title} ({controller.formatHoursLabel(task.estimatedHours)})
                  </span>
                </label>
              ))}
            </div>
            );
          })}
        </div>
      </section>
      {controller.overflowTasks.length > 0 ? (
        <p className="warning">Overflow into next week: {controller.overflowTasks.length} tasks</p>
      ) : null}
    </div>
  );
}

function TwoMonthTimelineCalendar({
  title,
  description,
  events,
  emptyMessage,
}: {
  title: string;
  description: string;
  events: TimelineEvent[];
  emptyMessage: string;
}) {
  const [monthCursor, setMonthCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const eventsByIso = useMemo(() => {
    const grouped: Record<string, TimelineEvent[]> = {};
    for (const event of events) {
      if (!grouped[event.dateIso]) grouped[event.dateIso] = [];
      grouped[event.dateIso].push(event);
    }
    for (const iso of Object.keys(grouped)) {
      grouped[iso].sort((a, b) => a.title.localeCompare(b.title));
    }
    return grouped;
  }, [events]);

  const renderMonth = (monthDate: Date, keyPrefix: string) => {
    const days = monthGridDays(monthDate);
    const monthLabel = monthDate.toLocaleDateString(undefined, {
      month: 'long',
      year: 'numeric',
    });
    return (
      <section className="two-month-card" key={keyPrefix}>
        <h3>{monthLabel}</h3>
        <div className="month-grid">
          {UI.dayLabels.map((label) => (
            <div key={`${keyPrefix}-head-${label}`} className="month-head">
              {label}
            </div>
          ))}
          {days.map((date) => {
            const iso = toIso(date);
            const dayEvents = eventsByIso[iso] ?? [];
            const inCurrentMonth = date.getMonth() === monthDate.getMonth();
            return (
              <section key={`${keyPrefix}-${iso}`} className={`month-cell ${inCurrentMonth ? '' : 'outside-month'}`}>
                <h3>{date.getDate()}</h3>
                {dayEvents.length === 0 ? <p className="muted">No actions</p> : null}
                {dayEvents.map((event) => (
                  <article key={event.id} className="calendar-item calendar-item-tight">
                    <strong>{event.title}</strong>
                  </article>
                ))}
              </section>
            );
          })}
        </div>
      </section>
    );
  };

  const monthA = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), 1);
  const monthB = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1);

  return (
    <div className="card producer-supplies-card">
      <div className="month-nav">
        <h2>{title}</h2>
        <div className="button-row">
          <button
            onClick={() =>
              setMonthCursor((current) => new Date(current.getFullYear(), current.getMonth() - 2, 1))
            }
          >
            Previous 2 Months
          </button>
          <button
            onClick={() =>
              setMonthCursor((current) => new Date(current.getFullYear(), current.getMonth() + 2, 1))
            }
          >
            Next 2 Months
          </button>
        </div>
      </div>
      <p className="muted">{description}</p>
      {events.length === 0 ? <p>{emptyMessage}</p> : null}
      <div className="two-month-grid-wrap">
        {renderMonth(monthA, 'month-a')}
        {renderMonth(monthB, 'month-b')}
      </div>
    </div>
  );
}

function MothersFeedingPruningChartPage({ controller }: { controller: AppController }) {
  const source = controller.allScheduledCalendarTasksForActiveTrack();
  const events = source
    .filter((task) => task.completed && Boolean(task.scheduledDateIso))
    .filter((task) => {
      const room = normalized(task.room);
      const category = normalized(task.category);
      const title = normalized(task.title);
      if (!room.includes('veg room')) return false;
      if (!category.includes('mother')) return false;
      return title.includes('water') || title.includes('feed') || title.includes('prune');
    })
    .map((task) => ({
      id: `mother-${task.id}`,
      title: task.title,
      dateIso: task.scheduledDateIso,
    }));

  return (
    <TwoMonthTimelineCalendar
      title="Mothers Feeding and Pruning Chart"
      description="Completed Mother tasks are plotted by date in 2-month increments."
      events={events}
      emptyMessage="No completed Mother feeding/watering/pruning actions yet."
    />
  );
}

function TwoGalsChartPage({ controller }: { controller: AppController }) {
  const source = controller.allScheduledCalendarTasksForActiveTrack();
  const events = source
    .filter((task) => task.completed && Boolean(task.scheduledDateIso))
    .filter((task) => {
      const room = normalized(task.room);
      const category = normalized(task.category);
      const title = normalized(task.title);
      if (!room.includes('veg room')) return false;
      const isTwoGals = category.includes('2 gal') || title.includes('2 gal') || title.includes('two gal');
      if (!isTwoGals) return false;
      return title.includes('water') || title.includes('feed') || title.includes('top');
    })
    .map((task) => ({
      id: `two-gals-${task.id}`,
      title: task.title,
      dateIso: task.scheduledDateIso,
    }));

  return (
    <TwoMonthTimelineCalendar
      title="Two Gals"
      description="Completed Two Gals watering, topping, and feeding actions plotted by date."
      events={events}
      emptyMessage="No completed Two Gals water/feed/top actions yet."
    />
  );
}

function FlowerRoomRowChartPage({ controller }: { controller: AppController }) {
  const [selectedRow, setSelectedRow] = useState<number | null>(9);
  const allRowTasks = controller.allFlowerRoomLifecycleTasks();

  const tasksByRow = useMemo(() => {
    const grouped: Record<number, WeekTask[]> = {
      1: [],
      2: [],
      3: [],
      4: [],
      5: [],
      6: [],
      7: [],
      8: [],
      9: [],
    };
    for (const task of allRowTasks) {
      if (typeof task.flowerRowNumber !== 'number' || !task.scheduledDateIso) continue;
      const row = task.flowerRowNumber;
      if (row < 1 || row > 9) continue;
      grouped[row].push(task);
    }
    for (const row of flowerRowOrder) {
      grouped[row].sort((a, b) => (a.scheduledDateIso || '').localeCompare(b.scheduledDateIso || '') || a.title.localeCompare(b.title));
    }
    return grouped;
  }, [allRowTasks]);

  const completedByRow = useMemo(() => {
    const grouped: Record<number, WeekTask[]> = {
      1: [],
      2: [],
      3: [],
      4: [],
      5: [],
      6: [],
      7: [],
      8: [],
      9: [],
    };
    for (const row of flowerRowOrder) {
      grouped[row] = tasksByRow[row].filter((task) => task.completed);
    }
    return grouped;
  }, [tasksByRow]);

  const latestTransferByRow = useMemo(() => {
    const out: Record<number, string | null> = {
      1: null,
      2: null,
      3: null,
      4: null,
      5: null,
      6: null,
      7: null,
      8: null,
      9: null,
    };
    for (const row of flowerRowOrder) {
      const completedTransfer = completedByRow[row]
        .filter((task) => isTransferTaskLabel(task.title))
        .slice()
        .sort((a, b) => (b.scheduledDateIso || '').localeCompare(a.scheduledDateIso || ''))[0];
      if (completedTransfer?.scheduledDateIso) {
        out[row] = completedTransfer.scheduledDateIso;
        continue;
      }
      const scheduledTransfer = tasksByRow[row]
        .filter((task) => isTransferTaskLabel(task.title))
        .slice()
        .sort((a, b) => (b.scheduledDateIso || '').localeCompare(a.scheduledDateIso || ''))[0];
      out[row] = scheduledTransfer?.scheduledDateIso ?? null;
    }
    return out;
  }, [completedByRow, tasksByRow]);

  const selectedCompletedTasks = useMemo(
    () => (selectedRow ? completedByRow[selectedRow] ?? [] : []),
    [completedByRow, selectedRow],
  );
  const selectedCompletedEvents: TimelineEvent[] = selectedCompletedTasks.map((task) => ({
    id: `row-complete-${task.id}`,
    title: task.title,
    dateIso: task.scheduledDateIso,
  }));

  const selectedUpcomingTasks = useMemo(() => {
    if (!selectedRow) return [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return (tasksByRow[selectedRow] ?? [])
      .filter((task) => !task.completed)
      .filter((task) => {
        const date = new Date(`${task.scheduledDateIso}T00:00:00`);
        return !Number.isNaN(date.getTime()) && date >= today;
      })
      .sort((a, b) => (a.scheduledDateIso || '').localeCompare(b.scheduledDateIso || '') || a.title.localeCompare(b.title))
      .slice(0, 10);
  }, [selectedRow, tasksByRow]);

  const completedHistory = useMemo(
    () =>
      selectedCompletedTasks
        .slice()
        .sort((a, b) => (b.scheduledDateIso || '').localeCompare(a.scheduledDateIso || '') || a.title.localeCompare(b.title)),
    [selectedCompletedTasks],
  );

  const formatIso = (iso: string | null) => {
    if (!iso) return 'No actions logged';
    const date = new Date(`${iso}T00:00:00`);
    if (Number.isNaN(date.getTime())) return iso;
    return date.toLocaleDateString();
  };

  return (
    <>
      <div className="card flower-layout-card">
        <h2>Flower Room Calendar by Row</h2>
        <p className="muted">
          Tap a row to expand/collapse. Each row shows transplant date stamp and completed action count.
        </p>
        <div className="flower-layout-grid">
          {flowerRowOrder.map((row) => (
            <button
              key={`flower-row-calendar-${row}`}
              type="button"
              className={`flower-row-tile ${selectedRow === row ? 'active' : ''}`}
              onClick={() => setSelectedRow((current) => (current === row ? null : row))}
            >
              <strong>Row {row}</strong>
              <span>
                {latestTransferByRow[row]
                  ? `Transplant date stamp: ${formatIso(latestTransferByRow[row])}`
                  : 'No transplant date recorded'}
              </span>
              <span>{completedByRow[row].length} completed row action(s)</span>
            </button>
          ))}
        </div>
      </div>
      {selectedRow ? (
        <>
          <TwoMonthTimelineCalendar
            title={`Flower Room Row ${selectedRow} Timeline`}
            description="Completed row actions shown in two-month calendar view."
            events={selectedCompletedEvents}
            emptyMessage="No completed row actions yet."
          />
          <div className="card producer-supplies-card">
            <section className="doc-section">
              <h3>Upcoming Row Tasks (Next 1-10)</h3>
              {selectedUpcomingTasks.length === 0 ? <p>No upcoming tasks scheduled for this row.</p> : null}
              <div className="calendar-list">
                {selectedUpcomingTasks.map((task) => (
                  <article key={`upcoming-${task.id}`} className="calendar-item">
                    <strong>{task.title}</strong>
                    <span>Date: {formatIso(task.scheduledDateIso)}</span>
                    <span>Hours: {controller.formatHoursLabel(task.estimatedHours)}</span>
                  </article>
                ))}
              </div>
            </section>
            <section className="doc-section">
              <h3>Completed Row Task History</h3>
              {completedHistory.length === 0 ? <p>No completed task history yet.</p> : null}
              <div className="calendar-list">
                {completedHistory.map((task) => (
                  <article key={`history-${task.id}-${task.scheduledDateIso}`} className="calendar-item">
                    <strong>{task.title}</strong>
                    <span>Date: {formatIso(task.scheduledDateIso)}</span>
                    <span>Hours: {controller.formatHoursLabel(task.estimatedHours)}</span>
                  </article>
                ))}
              </div>
            </section>
          </div>
        </>
      ) : null}
    </>
  );
}

function WeeklyPage({ controller }: { controller: AppController }) {
  const [showAll, setShowAll] = useState(false);
  const [minimizeAllRooms, setMinimizeAllRooms] = useState(false);
  const [collapsedRooms, setCollapsedRooms] = useState<Record<string, boolean>>({});
  const [plannerTab, setPlannerTab] = useState<'room' | 'random'>('room');
  const [producerQuestionIndex, setProducerQuestionIndex] = useState(0);
  const [draftByTemplateId, setDraftByTemplateId] = useState<Record<string, DraftPlan>>({});
  const [transferQuestionByTemplateId, setTransferQuestionByTemplateId] = useState<Record<string, TransferQuestionDraft>>({});
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editDay, setEditDay] = useState(0);
  const [editHours, setEditHours] = useState(1);
  const [editWindow, setEditWindow] = useState<'thisWeek' | 'nextWeek'>('thisWeek');
  const [taskDataMessage, setTaskDataMessage] = useState('');
  const [isVoiceRecording, setIsVoiceRecording] = useState(false);
  const [customRandomTaskTitle, setCustomRandomTaskTitle] = useState('');
  const [customRandomTaskHours, setCustomRandomTaskHours] = useState(1);
  const [customRandomTaskDay, setCustomRandomTaskDay] = useState(0);
  const [showDailyChecklist, setShowDailyChecklist] = useState(false);
  const [dailyChecklistDateIso, setDailyChecklistDateIso] = useState(() => new Date().toISOString().slice(0, 10));

  const rawByRoom = controller.templatesByRoomForActiveTrack();
  const editingTask = editingTaskId
    ? controller.scheduledTaskById(editingTaskId)
    : undefined;
  const editingTemplate = editingTaskId
    ? controller.templateForScheduledTaskId(editingTaskId)
    : undefined;
  const notNeeded = controller.notNeededThisWeekByTrack[controller.activeTrack];
  const showAllInPlanner = controller.selectedRole === 'producer' ? false : showAll;

  const isScheduled = (templateId: string) =>
    Boolean(controller.findThisWeekRequest(templateId) || controller.findExplicitNextWeekTask(templateId));

  const byRoom: Record<string, AssessmentTemplate[]> = {};
  for (const [room, templates] of Object.entries(rawByRoom)) {
    const filtered = templates.filter((template) => {
      if (showAllInPlanner) return true;
      return !isScheduled(template.id) && !notNeeded.has(template.id);
    });
    if (filtered.length > 0 || showAllInPlanner) byRoom[room] = filtered;
  }

  const producerQuestionnaireEntries =
    controller.selectedRole === 'producer'
      ? Object.entries(rawByRoom).flatMap(([room, templates]) =>
          templates.map((template) => ({
            room,
            category: categoryDisplayName(template.category),
            template,
          })),
        )
      : [];
  const producerQuestionnaireTotal =
    controller.selectedRole === 'producer'
      ? producerQuestionnaireEntries.length
      : 0;
  const producerQuestionMaxIndex = Math.max(0, producerQuestionnaireTotal - 1);
  const producerQuestionCurrentIndex = Math.max(
    0,
    Math.min(producerQuestionIndex, producerQuestionMaxIndex),
  );
  const producerQuestionnaireCurrent =
    controller.selectedRole === 'producer'
      ? producerQuestionnaireEntries[producerQuestionCurrentIndex] ?? null
      : null;
  const producerQuestionnaireReviewed =
    controller.selectedRole === 'producer'
      ? producerQuestionCurrentIndex
      : 0;

  const getDraft = (template: AssessmentTemplate): DraftPlan => {
    const existing = draftByTemplateId[template.id];
    if (existing) return existing;
    const thisWeek = controller.findThisWeekRequest(template.id);
    if (thisWeek) {
      return {
        day: thisWeek.preferredDay,
        hours: thisWeek.estimatedHours,
        forNextWeek: false,
        flowerRowNumber: thisWeek.flowerRowNumber ?? null,
      };
    }
    const next = controller.findExplicitNextWeekTask(template.id);
    if (next) {
      return {
        day: next.day ?? 0,
        hours: next.estimatedHours,
        forNextWeek: true,
        flowerRowNumber: next.flowerRowNumber ?? null,
      };
    }
    return {
      day: 0,
      hours: template.defaultHours,
      forNextWeek: false,
      flowerRowNumber: null,
    };
  };

  const producerQuestionTemplate = producerQuestionnaireCurrent?.template ?? null;
  const producerQuestionDraft = producerQuestionTemplate ? getDraft(producerQuestionTemplate) : null;
  const getTransferQuestionDraft = (
    template: AssessmentTemplate,
    baseDraft: DraftPlan,
  ): TransferQuestionDraft => {
    const existing = transferQuestionByTemplateId[template.id];
    if (existing) return existing;
    return {
      rows: [{ rowNumber: baseDraft.flowerRowNumber ?? null, strainName: '' }],
      finalized: false,
    };
  };

  const updateTransferQuestionDraft = (
    templateId: string,
    updater: (current: TransferQuestionDraft) => TransferQuestionDraft,
  ) => {
    setTransferQuestionByTemplateId((prev) => {
      const current =
        prev[templateId]
        ?? {
          rows: [{ rowNumber: null, strainName: '' }],
          finalized: false,
        };
      return {
        ...prev,
        [templateId]: updater(current),
      };
    });
  };

  const moveProducerQuestion = (delta: number) => {
    setProducerQuestionIndex((current) => {
      const next = current + delta;
      if (next < 0) return 0;
      if (next > producerQuestionMaxIndex) return producerQuestionMaxIndex;
      return next;
    });
  };

  const jumpToProducerQuestion = (questionNumberOneBased: number) => {
    if (producerQuestionnaireTotal <= 0) {
      setProducerQuestionIndex(0);
      return;
    }
    const targetIndex = questionNumberOneBased - 1;
    if (targetIndex < 0) {
      setProducerQuestionIndex(0);
      return;
    }
    if (targetIndex > producerQuestionMaxIndex) {
      setProducerQuestionIndex(producerQuestionMaxIndex);
      return;
    }
    setProducerQuestionIndex(targetIndex);
  };

  const producerRequiresRowSelection = Boolean(
    producerQuestionTemplate
    && controller.templateRequiresFlowerRowSelection(producerQuestionTemplate),
  );
  const producerTransferDraft =
    producerQuestionTemplate && producerQuestionDraft && producerRequiresRowSelection
      ? getTransferQuestionDraft(producerQuestionTemplate, producerQuestionDraft)
      : null;
  const producerSelectedTransferRows =
    producerTransferDraft?.rows
      .filter((row) => typeof row.rowNumber === 'number')
      .map((row) => ({
        rowNumber: row.rowNumber as number,
        strainName: row.strainName.trim(),
      }))
      ?? [];
  const producerCanScheduleTransfer = !producerRequiresRowSelection
    || Boolean(producerTransferDraft?.finalized && producerSelectedTransferRows.length > 0);

  const openEditTask = (taskId: string) => {
    const task = controller.scheduledTaskById(taskId);
    if (!task) return;
    if (task.completed && !roleCanAdmin(controller.selectedRole)) {
      alert('Completed tasks are locked. Only Admin can edit them.');
      return;
    }
    setEditingTaskId(taskId);
    setEditDay(task.day ?? 0);
    setEditHours(task.estimatedHours);
    const currentWeekTask = controller.thisWeekSchedule.some((item) => item.id === taskId);
    setEditWindow(currentWeekTask ? 'thisWeek' : 'nextWeek');
    setTaskDataMessage('');
  };

  const startVoiceDictation = () => {
    type DictationResultEvent = {
      results: ArrayLike<ArrayLike<{ transcript: string }>>;
    };
    type DictationRecognizer = {
      lang: string;
      interimResults: boolean;
      maxAlternatives: number;
      onresult: ((event: DictationResultEvent) => void) | null;
      onerror: (() => void) | null;
      onend: (() => void) | null;
      start: () => void;
    };
    type DictationCtor = new () => DictationRecognizer;
    const voiceWindow = window as Window & {
      SpeechRecognition?: DictationCtor;
      webkitSpeechRecognition?: DictationCtor;
    };
    const speechApi = voiceWindow.SpeechRecognition || voiceWindow.webkitSpeechRecognition;
    if (!speechApi) {
      alert('Voice dictation is not supported in this browser.');
      return;
    }
    const recognition = new speechApi();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    setIsVoiceRecording(true);
    recognition.onresult = (event: DictationResultEvent) => {
      const transcript = event?.results?.[0]?.[0]?.transcript?.trim() ?? '';
      if (!transcript) return;
      setTaskDataMessage((current) => (current ? `${current}\n${transcript}` : transcript));
    };
    recognition.onerror = () => {
      setIsVoiceRecording(false);
    };
    recognition.onend = () => {
      setIsVoiceRecording(false);
    };
    recognition.start();
  };

  const scheduleFromDraft = (
    template: AssessmentTemplate,
    draft: DraftPlan,
    forNextWeek: boolean,
  ) => {
    if (!roleCanPlan(controller.selectedRole)) return false;
    if (controller.templateRequiresFlowerRowSelection(template) && !draft.flowerRowNumber) {
      alert('Select flower room row (1-9) before scheduling this task.');
      return false;
    }
    const lockedThisWeek = controller.findThisWeekRequest(template.id)?.completed ?? false;
    const lockedNextWeek = controller.findExplicitNextWeekTask(template.id)?.completed ?? false;
    if (!roleCanAdmin(controller.selectedRole) && (lockedThisWeek || lockedNextWeek)) {
      alert('Completed tasks are locked. Only Admin can modify them.');
      return false;
    }
    controller.setTemplateNotNeededThisWeek(template.id, false);
    const result = controller.planAssessment({
      template,
      hours: draft.hours,
      preferredDay: draft.day,
      forNextWeek,
      flowerRowNumber: draft.flowerRowNumber,
    });
    setDraftByTemplateId((prev) => ({
      ...prev,
      [template.id]: { ...draft, forNextWeek },
    }));
    if (!forNextWeek && result.assignedDay !== null && result.assignedDay !== result.requestedDay) {
      alert(`Task moved to ${UI.dayLabels[result.assignedDay]} due to day capacity.`);
    }
    return true;
  };

  const activeTrack = controller.activeTrack;
  const currentWeekStartIso = controller.weekStartByTrack[activeTrack];
  const currentWeekStart = currentWeekStartIso
    ? new Date(`${currentWeekStartIso}T00:00:00`)
    : new Date();
  const nextWeekStart = new Date(currentWeekStart);
  nextWeekStart.setDate(currentWeekStart.getDate() + 7);
  const nextWeekEnd = new Date(nextWeekStart);
  nextWeekEnd.setDate(nextWeekStart.getDate() + 7);

  const nextWeekTasks = controller.explicitNextByTrack[activeTrack].filter((task) => {
    if (!task.scheduledDateIso) return false;
    const date = new Date(`${task.scheduledDateIso}T00:00:00`);
    if (Number.isNaN(date.getTime())) return false;
    return date >= nextWeekStart && date < nextWeekEnd;
  });

  const nextWeekTasksForDay = (dayIndex: number) =>
    nextWeekTasks
      .filter((task) => task.day === dayIndex)
      .sort((a, b) => a.title.localeCompare(b.title));

  const nextWeekDayLoad = (dayIndex: number) =>
    nextWeekTasksForDay(dayIndex).reduce((sum, task) => sum + task.estimatedHours, 0);

  const weekRangeLabel = (weekStart: Date) => {
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    return `${weekStart.toLocaleDateString()} - ${weekEnd.toLocaleDateString()}`;
  };

  const dayDateLabel = (weekStart: Date, dayIndex: number) => {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + dayIndex);
    return `${date.getMonth() + 1}/${date.getDate()}`;
  };

  const checklistRoles = controller.dailyChecklistRoles();
  const isBudtenderChecklistRole = checklistRoles.includes(controller.selectedRole);
  const canViewChecklistSummary =
    controller.selectedRole === 'generalManager'
    || controller.selectedRole === 'budtenderJoSenior'
    || controller.selectedRole === 'ceoExecutive'
    || controller.selectedRole === 'ceo';
  const canUseDailyChecklist = isBudtenderChecklistRole || canViewChecklistSummary;

  useEffect(() => {
    if (!showDailyChecklist || !canViewChecklistSummary) return;
    controller.notifyRetailManagerForIncompleteDailyTasks(dailyChecklistDateIso, false);
  }, [showDailyChecklist, canViewChecklistSummary, dailyChecklistDateIso, controller]);

  return (
    <div className="grid">
      {canUseDailyChecklist ? (
        <div className="card">
          <div className="header-row">
            <h2>Daily Task Checklist</h2>
            <button onClick={() => setShowDailyChecklist((value) => !value)}>
              {showDailyChecklist ? 'Hide Daily Checklist' : 'Show Daily Checklist'}
            </button>
          </div>
          {showDailyChecklist ? (
            <div className="form-grid">
              <label>
                Checklist date
                <input
                  type="date"
                  value={dailyChecklistDateIso}
                  onChange={(e) => setDailyChecklistDateIso(e.target.value)}
                />
              </label>
              {isBudtenderChecklistRole ? (
                <>
                  <p className="muted">
                    Quick-check your daily duties. Your completion record stays visible to Retail Manager, GM, and CEO.
                  </p>
                  {controller.dailyChecklistTemplatesForRole(controller.selectedRole).map((template) => (
                    <label key={`daily-${template.id}`} className="check-row">
                      <input
                        type="checkbox"
                        checked={controller.isDailyChecklistTaskChecked(controller.selectedRole, dailyChecklistDateIso, template.id)}
                        onChange={(e) =>
                          controller.setDailyChecklistTaskChecked(
                            controller.selectedRole,
                            dailyChecklistDateIso,
                            template.id,
                            e.target.checked,
                          )
                        }
                      />
                      <span>{template.title}</span>
                    </label>
                  ))}
                  {controller.dailyChecklistTemplatesForRole(controller.selectedRole).length === 0 ? (
                    <p className="muted">No daily checklist templates yet for this role. Add tasks in Admin Editable Tasks.</p>
                  ) : null}
                </>
              ) : null}
              {canViewChecklistSummary ? (
                <>
                  <p className="muted">
                    Daily summary across all budtender roles for {dailyChecklistDateIso}.
                  </p>
                  {controller.dailyChecklistSummaryForManagers(dailyChecklistDateIso).map((summary) => (
                    <article key={`summary-${summary.role}`} className="calendar-item">
                      <strong>{userRoleLabel[summary.role]}</strong>
                      <span>
                        Completed: {summary.completed}/{summary.total}
                      </span>
                      <span>
                        {summary.pendingTitles.length === 0
                          ? 'All tasks complete'
                          : `Pending: ${summary.pendingTitles.join(', ')}`}
                      </span>
                    </article>
                  ))}
                  <div className="button-row">
                    <button
                      onClick={() => {
                        const sent = controller.notifyRetailManagerForIncompleteDailyTasks(dailyChecklistDateIso, true);
                        alert(
                          sent > 0
                            ? `Sent ${sent} incomplete-task notification(s) to Retail Manager.`
                            : 'No incomplete daily tasks found for this date.',
                        );
                      }}
                    >
                      Notify Retail Manager of Incomplete Tasks
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
      {controller.selectedRole !== 'producer' ? (
      <div className="card summary">
        <h2>Task List for the Next Two Weeks</h2>
        <section className="week-block">
          <h3>This Week <small>{weekRangeLabel(currentWeekStart)}</small></h3>
          <div className="schedule-grid">
            {UI.dayLabels.map((day, index) => {
              const load = controller.dayLoad(index);
              const capClass = load >= 8 ? 'day-over-full' : load >= 7 ? 'day-near-full' : '';
              return (
              <div key={`this-${day}`} className={`day-col ${capClass}`}>
                <div className="day-head">
                  <h4>
                    {day}
                    <span className="day-date-small">{dayDateLabel(currentWeekStart, index)}</span>
                  </h4>
                  <span className="day-load-small">
                    {load.toFixed(1)} / 8h
                  </span>
                </div>
                {controller.tasksForDay(index).map((task) => (
                <label key={task.id} className="check-row">
                  <input
                    type="checkbox"
                    checked={task.completed}
                    disabled={task.completed && !roleCanAdmin(controller.selectedRole)}
                    onChange={(e) => {
                      const ok = controller.toggleThisWeekCompletion(task.id, e.target.checked);
                      if (!ok && e.target.checked) {
                        alert('Send required task data/message before marking this task complete.');
                      }
                      if (!ok && !e.target.checked) {
                        alert('Completed tasks are locked. Only Admin can modify them.');
                      }
                    }}
                  />
                  <span>
                    {task.completed && !roleCanAdmin(controller.selectedRole) ? (
                      <>
                        {task.title} ({controller.formatHoursLabel(task.estimatedHours)})
                      </>
                    ) : (
                      <>
                        <button className="link-button" onClick={() => openEditTask(task.id)}>
                          {task.title}
                        </button>{' '}
                        ({controller.formatHoursLabel(task.estimatedHours)})
                      </>
                    )}
                  </span>
                  </label>
                ))}
              </div>
              );
            })}
          </div>
        </section>
        <section className="week-block">
          <h3>Next Week <small>{weekRangeLabel(nextWeekStart)}</small></h3>
          <div className="schedule-grid">
            {UI.dayLabels.map((day, index) => {
              const load = nextWeekDayLoad(index);
              const capClass = load >= 8 ? 'day-over-full' : load >= 7 ? 'day-near-full' : '';
              return (
              <div key={`next-${day}`} className={`day-col ${capClass}`}>
                <div className="day-head">
                  <h4>
                    {day}
                    <span className="day-date-small">{dayDateLabel(nextWeekStart, index)}</span>
                  </h4>
                  <span className="day-load-small">
                    {nextWeekDayLoad(index).toFixed(1)} / 8h
                  </span>
                </div>
                {nextWeekTasksForDay(index).map((task) => (
                  <label key={task.id} className="check-row">
                    <input
                      type="checkbox"
                      checked={task.completed}
                      disabled={task.completed && !roleCanAdmin(controller.selectedRole)}
                      onChange={(e) => {
                        const ok = controller.toggleNextWeekCompletion(task.id, e.target.checked);
                        if (!ok && e.target.checked) {
                          alert('Send required task data/message before marking this task complete.');
                        }
                        if (!ok && !e.target.checked) {
                          alert('Completed tasks are locked. Only Admin can modify them.');
                        }
                      }}
                    />
                    <span>
                      {task.completed && !roleCanAdmin(controller.selectedRole) ? (
                        <>
                          {task.title} ({controller.formatHoursLabel(task.estimatedHours)})
                        </>
                      ) : (
                        <>
                          <button className="link-button" onClick={() => openEditTask(task.id)}>
                            {task.title}
                          </button>{' '}
                          ({controller.formatHoursLabel(task.estimatedHours)})
                        </>
                      )}
                    </span>
                  </label>
                ))}
              </div>
              );
            })}
          </div>
        </section>
        {controller.overflowTasks.length > 0 ? (
          <p className="warning">Overflow into next week: {controller.overflowTasks.length} tasks</p>
        ) : null}
      </div>
      ) : null}

      <div className="card">
        <div className="header-row">
          <h2>{plannerTab === 'room' ? 'Task by Room' : 'Create new random task'}</h2>
          {controller.selectedRole === 'producer' && plannerTab === 'room' ? (
            <div className="button-row">
              <button
                onClick={() => moveProducerQuestion(-1)}
                disabled={producerQuestionnaireTotal === 0 || producerQuestionCurrentIndex <= 0}
              >
                Back Question
              </button>
              <button
                onClick={() => moveProducerQuestion(1)}
                disabled={producerQuestionnaireTotal === 0 || producerQuestionCurrentIndex >= producerQuestionMaxIndex}
              >
                Forward Question
              </button>
              <div className="question-jump-control">
                <label htmlFor="producer-question-jump">Jump to question</label>
                <input
                  id="producer-question-jump"
                  type="range"
                  min={1}
                  max={Math.max(1, producerQuestionnaireTotal)}
                  value={
                    producerQuestionnaireTotal > 0
                      ? producerQuestionCurrentIndex + 1
                      : 1
                  }
                  onChange={(e) => jumpToProducerQuestion(Number(e.target.value))}
                  disabled={producerQuestionnaireTotal <= 1}
                />
                <span className="question-jump-count">
                  {producerQuestionnaireTotal > 0
                    ? `${producerQuestionCurrentIndex + 1} / ${producerQuestionnaireTotal}`
                    : '0 / 0'}
                </span>
              </div>
            </div>
          ) : null}
          {controller.selectedRole === 'producer' ? (
            <div className="button-row">
              <button
                className={plannerTab === 'room' ? 'active-toggle' : ''}
                onClick={() => setPlannerTab('room')}
              >
                Tasks by Room
              </button>
              <button
                className={plannerTab === 'random' ? 'active-toggle' : ''}
                onClick={() => setPlannerTab('random')}
              >
                Create new random task
              </button>
            </div>
          ) : null}
          {controller.selectedRole !== 'producer' ? (
            <div className="button-row">
              <button onClick={() => setShowAll((v) => !v)}>
                {showAll ? 'Show unscheduled tasks' : 'Show all tasks'}
              </button>
              <button onClick={() => setMinimizeAllRooms((value) => !value)}>
                {minimizeAllRooms ? 'Expand All' : 'Minimize'}
              </button>
            </div>
          ) : null}
        </div>
        {plannerTab === 'random' ? (
          <div className="form-grid">
            <p className="muted">
              Enter the task name and allotted time, then choose when to schedule it.
            </p>
            <label>
              Task title
              <input
                value={customRandomTaskTitle}
                onChange={(e) => setCustomRandomTaskTitle(e.target.value)}
                placeholder="Write task title..."
              />
            </label>
            <label>
              Allotted time
              <select
                value={customRandomTaskHours}
                onChange={(e) => setCustomRandomTaskHours(Number(e.target.value))}
              >
                {UI.hourStepOptions().map((value) => (
                  <option key={value} value={value}>
                    {controller.formatHoursLabel(value)}
                  </option>
                ))}
              </select>
            </label>
            <div className="day-pill-row">
              {UI.dayLabels.map((label, dayIndex) => (
                <button
                  key={`custom-random-day-${label}`}
                  type="button"
                  className={`day-pill ${customRandomTaskDay === dayIndex ? 'active-day' : ''}`}
                  onClick={() => setCustomRandomTaskDay(dayIndex)}
                >
                  {label.slice(0, 3)}
                </button>
              ))}
            </div>
            <div className="button-row">
              <button
                onClick={() => {
                  const ok = controller.addRandomTaskToPlan({
                    title: customRandomTaskTitle,
                    hours: customRandomTaskHours,
                    preferredDay: customRandomTaskDay,
                    forNextWeek: false,
                  });
                  if (!ok) {
                    alert('Enter a task title first.');
                    return;
                  }
                  setCustomRandomTaskTitle('');
                }}
              >
                Schedule This Week
              </button>
              <button
                onClick={() => {
                  const ok = controller.addRandomTaskToPlan({
                    title: customRandomTaskTitle,
                    hours: customRandomTaskHours,
                    preferredDay: customRandomTaskDay,
                    forNextWeek: true,
                  });
                  if (!ok) {
                    alert('Enter a task title first.');
                    return;
                  }
                  setCustomRandomTaskTitle('');
                }}
              >
                Schedule Next Week
              </button>
            </div>
          </div>
        ) : null}
        {plannerTab === 'room' ? (
          <>
            {!roleCanPlan(controller.selectedRole) ? (
              <p className="muted">Read-only role: only planning roles can assign assessments.</p>
            ) : null}

            {controller.selectedRole === 'producer' ? (
              producerQuestionTemplate && producerQuestionDraft ? (
                <section className="room-block questionnaire-block">
                  <div className="room-head">
                    <h3>
                      {producerQuestionnaireCurrent?.room}{' '}
                      <small>
                        Question {producerQuestionnaireTotal === 0 ? 0 : producerQuestionnaireReviewed + 1} of {producerQuestionnaireTotal}
                      </small>
                    </h3>
                    <span className="muted">Category: {producerQuestionnaireCurrent?.category}</span>
                  </div>
                  <article key={producerQuestionTemplate.id} className="task-card compact questionnaire-card">
                    <div className="task-main">
                      <h4>{producerQuestionTemplate.title}</h4>
                      <p>
                        Estimated time to complete task:{' '}
                        {controller.formatHoursLabel(producerQuestionTemplate.defaultHours)}
                      </p>
                      <div className="task-controls inline-under-title">
                        <div className="day-pill-row">
                          {UI.dayLabels.map((label, idx) => (
                            <button
                              key={label}
                              className={`day-pill ${producerQuestionDraft.day === idx ? 'active-day' : ''}`}
                              onClick={() =>
                                setDraftByTemplateId((prev) => ({
                                  ...prev,
                                  [producerQuestionTemplate.id]: {
                                    ...producerQuestionDraft,
                                    day: idx,
                                  },
                                }))
                              }
                            >
                              {label.slice(0, 3)}
                            </button>
                          ))}
                        </div>

                        <label className="hours-field">
                          Hours
                          <select
                            value={producerQuestionDraft.hours}
                            onChange={(e) =>
                              setDraftByTemplateId((prev) => ({
                                ...prev,
                                [producerQuestionTemplate.id]: {
                                  ...producerQuestionDraft,
                                  hours: Number(e.target.value),
                                },
                              }))
                            }
                          >
                            {UI.hourStepOptions().map((value) => (
                              <option key={value} value={value}>
                                {controller.formatHoursLabel(value)}
                              </option>
                            ))}
                          </select>
                        </label>

                        {producerRequiresRowSelection && producerTransferDraft ? (
                          <div className="row-select-field">
                            <p className="muted">Which row will you be transplanting veg plants into?</p>
                            {producerTransferDraft.rows.map((rowDraft, rowIndex) => (
                              <div key={`transfer-row-${producerQuestionTemplate.id}-${rowIndex}`} className="task-action-row edit-window">
                                <label className="hours-field">
                                  {rowIndex + 1 === 1 ? 'Row' : `Additional row ${rowIndex + 1}`}
                                  <select
                                    value={rowDraft.rowNumber ?? ''}
                                    onChange={(e) =>
                                      updateTransferQuestionDraft(producerQuestionTemplate.id, (current) => ({
                                        ...current,
                                        rows: current.rows.map((item, idx) =>
                                          idx === rowIndex
                                            ? { ...item, rowNumber: e.target.value ? Number(e.target.value) : null }
                                            : item,
                                        ),
                                      }))
                                    }
                                  >
                                    <option value="">Select row</option>
                                    {Array.from({ length: 9 }, (_, idx) => 9 - idx).map((rowNumber) => (
                                      <option key={`row-${rowNumber}`} value={rowNumber}>
                                        Row {rowNumber}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <label className="hours-field">
                                  Enter strain name
                                  <input
                                    placeholder="Type strain name"
                                    value={rowDraft.strainName}
                                    onChange={(e) =>
                                      updateTransferQuestionDraft(producerQuestionTemplate.id, (current) => ({
                                        ...current,
                                        rows: current.rows.map((item, idx) =>
                                          idx === rowIndex ? { ...item, strainName: e.target.value } : item,
                                        ),
                                      }))
                                    }
                                  />
                                </label>
                              </div>
                            ))}
                            <div className="button-row">
                              <button
                                type="button"
                                onClick={() =>
                                  updateTransferQuestionDraft(producerQuestionTemplate.id, (current) => ({
                                    ...current,
                                    finalized: false,
                                    rows:
                                      current.rows.length >= 9
                                        ? current.rows
                                        : [...current.rows, { rowNumber: null, strainName: '' }],
                                  }))
                                }
                                disabled={producerTransferDraft.rows.length >= 9}
                              >
                                Transplant another row
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  updateTransferQuestionDraft(producerQuestionTemplate.id, (current) => ({
                                    ...current,
                                    finalized: true,
                                  }))
                                }
                              >
                                No more rows need to be transplanted
                              </button>
                            </div>
                            {producerTransferDraft.finalized ? (
                              <p className="muted">Rows finalized. Choose a scheduling option below.</p>
                            ) : (
                              <p className="muted">Finalize rows before scheduling this task.</p>
                            )}
                          </div>
                        ) : null}

                        <div className="task-action-row">
                          <button
                            onClick={() => {
                              let ok = false;
                              if (producerRequiresRowSelection && producerTransferDraft) {
                                if (!producerCanScheduleTransfer) {
                                  alert('Finalize transplant rows and select at least one row before scheduling.');
                                  return;
                                }
                                const [primaryRow, ...additionalRows] = producerSelectedTransferRows;
                                if (!primaryRow) {
                                  alert('Select at least one row before scheduling.');
                                  return;
                                }
                                const draftForPrimary = {
                                  ...producerQuestionDraft,
                                  flowerRowNumber: primaryRow.rowNumber,
                                };
                                setDraftByTemplateId((prev) => ({
                                  ...prev,
                                  [producerQuestionTemplate.id]: draftForPrimary,
                                }));
                                controller.removePlan(producerQuestionTemplate.id, false);
                                controller.removePlan(producerQuestionTemplate.id, true);
                                ok = scheduleFromDraft(producerQuestionTemplate, draftForPrimary, false);
                                if (ok && additionalRows.length > 0) {
                                  controller.planAdditionalTransferRows({
                                    template: producerQuestionTemplate,
                                    hours: draftForPrimary.hours,
                                    preferredDay: draftForPrimary.day,
                                    forNextWeek: false,
                                    rows: additionalRows,
                                  });
                                }
                              } else {
                                ok = scheduleFromDraft(producerQuestionTemplate, producerQuestionDraft, false);
                              }
                              if (ok) moveProducerQuestion(1);
                            }}
                            disabled={!producerCanScheduleTransfer}
                          >
                            Schedule this week
                          </button>
                          <button
                            onClick={() => {
                              controller.setTemplateNotNeededThisWeek(
                                producerQuestionTemplate.id,
                                true,
                              );
                              moveProducerQuestion(1);
                            }}
                          >
                            Not needed this week
                          </button>
                          <button
                            onClick={() => {
                              let ok = false;
                              if (producerRequiresRowSelection && producerTransferDraft) {
                                if (!producerCanScheduleTransfer) {
                                  alert('Finalize transplant rows and select at least one row before scheduling.');
                                  return;
                                }
                                const [primaryRow, ...additionalRows] = producerSelectedTransferRows;
                                if (!primaryRow) {
                                  alert('Select at least one row before scheduling.');
                                  return;
                                }
                                const draftForPrimary = {
                                  ...producerQuestionDraft,
                                  flowerRowNumber: primaryRow.rowNumber,
                                };
                                setDraftByTemplateId((prev) => ({
                                  ...prev,
                                  [producerQuestionTemplate.id]: draftForPrimary,
                                }));
                                controller.removePlan(producerQuestionTemplate.id, false);
                                controller.removePlan(producerQuestionTemplate.id, true);
                                ok = scheduleFromDraft(producerQuestionTemplate, draftForPrimary, true);
                                if (ok && additionalRows.length > 0) {
                                  controller.planAdditionalTransferRows({
                                    template: producerQuestionTemplate,
                                    hours: draftForPrimary.hours,
                                    preferredDay: draftForPrimary.day,
                                    forNextWeek: true,
                                    rows: additionalRows,
                                  });
                                }
                              } else {
                                ok = scheduleFromDraft(producerQuestionTemplate, producerQuestionDraft, true);
                              }
                              if (ok) moveProducerQuestion(1);
                            }}
                            disabled={!producerCanScheduleTransfer}
                          >
                            Schedule task next week
                          </button>
                        </div>
                      </div>
                      {producerQuestionTemplate.autoScheduledTasks.length > 0 ? (
                        <p className="scheduled-tag">
                          Auto-schedules {producerQuestionTemplate.autoScheduledTasks.length} related tasks
                        </p>
                      ) : null}
                    </div>
                  </article>
                </section>
              ) : (
                <p className="muted">
                  All tasks are reviewed. Open the &ldquo;Task List for Next Two Weeks&rdquo; tab to view the full plan.
                </p>
              )
            ) : (
              Object.entries(byRoom).map(([room, templates]) => (
                <section key={room} className="room-block">
                  <div className="room-head">
                    <h3>
                      {room} <small>{templates.length} tasks</small>
                    </h3>
                    <button
                      onClick={() =>
                        setCollapsedRooms((current) => ({
                          ...current,
                          [room]: !current[room],
                        }))
                      }
                    >
                      {collapsedRooms[room] ? 'Expand' : 'Minimize'}
                    </button>
                  </div>
                  {!minimizeAllRooms && !collapsedRooms[room] ? (
                    <>
                      {templates.length === 0 ? <p className="muted">No tasks in current filter.</p> : null}
                      {Object.entries(
                        templates.reduce<Record<string, AssessmentTemplate[]>>((acc, template) => {
                          const key = categoryDisplayName(template.category);
                          if (!acc[key]) acc[key] = [];
                          acc[key].push(template);
                          return acc;
                        }, {}),
                      ).map(([category, categoryTemplates]) => (
                        <div key={`${room}-${category}`} className="category-block">
                          <div className="category-head">
                            <h4>{category}</h4>
                            <span>{categoryTemplates.length} tasks</span>
                          </div>
                          <div className="task-list-grid gm-three-col">
                            {categoryTemplates.map((template) => {
                              const draft = getDraft(template);
                              const thisWeek = controller.findThisWeekRequest(template.id);
                              const nextWeek = controller.findExplicitNextWeekTask(template.id);
                              const requiresRowSelection = controller.templateRequiresFlowerRowSelection(template);
                              const scheduled = Boolean(thisWeek || nextWeek);
                              const lockedScheduled =
                                !roleCanAdmin(controller.selectedRole)
                                && Boolean(thisWeek?.completed || nextWeek?.completed);

                              return (
                                <article key={template.id} className="task-card compact">
                                  <div className="task-main">
                                    <h4>{template.title}</h4>
                                    <p>
                                      {scheduled
                                        ? `Scheduled: ${controller.formatHoursLabel(draft.hours)}`
                                        : `Estimated time to complete task: ${controller.formatHoursLabel(template.defaultHours)}`}
                                    </p>
                                    <div className="task-controls inline-under-title">
                                      <div className="day-pill-row">
                                        {UI.dayLabels.map((label, idx) => (
                                          <button
                                            key={label}
                                            className={`day-pill ${draft.day === idx ? 'active-day' : ''}`}
                                            onClick={() =>
                                              setDraftByTemplateId((prev) => ({
                                                ...prev,
                                                [template.id]: {
                                                  ...draft,
                                                  day: idx,
                                                },
                                              }))
                                            }
                                          >
                                            {label.slice(0, 3)}
                                          </button>
                                        ))}
                                      </div>

                                      <label className="hours-field">
                                        Hours
                                        <select
                                          value={draft.hours}
                                          onChange={(e) =>
                                            setDraftByTemplateId((prev) => ({
                                              ...prev,
                                              [template.id]: {
                                                ...draft,
                                                hours: Number(e.target.value),
                                              },
                                            }))
                                          }
                                        >
                                          {UI.hourStepOptions().map((value) => (
                                            <option key={value} value={value}>
                                              {controller.formatHoursLabel(value)}
                                            </option>
                                          ))}
                                        </select>
                                      </label>

                                      {requiresRowSelection ? (
                                        <label className="hours-field row-select-field">
                                          Which row will you be transplanting veg plants into?
                                          <select
                                            value={draft.flowerRowNumber ?? ''}
                                            onChange={(e) =>
                                              setDraftByTemplateId((prev) => ({
                                                ...prev,
                                                [template.id]: {
                                                  ...draft,
                                                  flowerRowNumber: e.target.value ? Number(e.target.value) : null,
                                                },
                                              }))
                                            }
                                          >
                                            <option value="">Select row</option>
                                            {Array.from({ length: 9 }, (_, idx) => 9 - idx).map((rowNumber) => (
                                              <option key={`row-${rowNumber}`} value={rowNumber}>
                                                Row {rowNumber}
                                              </option>
                                            ))}
                                          </select>
                                        </label>
                                      ) : null}

                                      <div className="task-action-row">
                                        <button
                                          className={!nextWeek && scheduled ? 'active-toggle' : ''}
                                          onClick={() => scheduleFromDraft(template, draft, false)}
                                        >
                                          Schedule this week
                                        </button>
                                        <button
                                          className={
                                            controller.isTemplateNotNeededThisWeek(template.id)
                                              ? 'active-toggle'
                                              : ''
                                          }
                                          onClick={() =>
                                            controller.setTemplateNotNeededThisWeek(
                                              template.id,
                                              !controller.isTemplateNotNeededThisWeek(template.id),
                                            )
                                          }
                                        >
                                          {controller.isTemplateNotNeededThisWeek(template.id)
                                            ? 'Not Needed: On'
                                            : 'Not needed this week'}
                                        </button>
                                        <button
                                          className={nextWeek ? 'active-toggle' : ''}
                                          onClick={() => scheduleFromDraft(template, draft, true)}
                                        >
                                          Schedule task next week
                                        </button>
                                      </div>
                                    </div>
                                    {template.autoScheduledTasks.length > 0 ? (
                                      <p className="scheduled-tag">
                                        Auto-schedules {template.autoScheduledTasks.length} related tasks
                                      </p>
                                    ) : null}
                                    {scheduled ? (
                                      <p className="scheduled-tag">
                                        Scheduled for {thisWeek ? 'this week' : 'next week'}
                                      </p>
                                    ) : null}
                                  </div>

                                  <div className="task-controls">
                                    {roleCanPlan(controller.selectedRole) && scheduled ? (
                                      <div className="button-row">
                                        <button
                                          disabled={lockedScheduled}
                                          onClick={() => controller.removePlan(template.id, Boolean(nextWeek))}
                                        >
                                          Remove
                                        </button>
                                      </div>
                                    ) : null}
                                  </div>
                                </article>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </>
                  ) : null}
                </section>
              ))
            )}
          </>
        ) : null}
      </div>
      {editingTaskId ? (
        <Modal title="Edit Scheduled Task" onClose={() => setEditingTaskId(null)}>
          <div className="task-card compact edit-task-card">
            <div className="task-main">
              <p>
                <strong>Edit Scheduled Task</strong>
              </p>
              <h4>{editingTask?.title ?? 'Task'}</h4>
              <p className="muted">Room: {editingTask?.room ?? 'N/A'}</p>

              <div className="task-controls inline-under-title">
                <div className="day-pill-row">
                  {UI.dayLabels.map((label, idx) => (
                    <button
                      key={label}
                      className={`day-pill ${editDay === idx ? 'active-day' : ''}`}
                      onClick={() => setEditDay(idx)}
                    >
                      {label.slice(0, 3)}
                    </button>
                  ))}
                </div>

                <label className="hours-field">
                  Hours
                  <select value={editHours} onChange={(e) => setEditHours(Number(e.target.value))}>
                    {UI.hourStepOptions().map((value) => (
                      <option key={value} value={value}>
                        {controller.formatHoursLabel(value)}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="task-action-row edit-window">
                  <button
                    className={editWindow === 'thisWeek' ? 'active-toggle' : ''}
                    onClick={() => setEditWindow('thisWeek')}
                  >
                    Schedule this week
                  </button>
                  <button
                    className={editWindow === 'nextWeek' ? 'active-toggle' : ''}
                    onClick={() => setEditWindow('nextWeek')}
                  >
                    Schedule next week
                  </button>
                </div>
              </div>
              <div className="button-row">
                <button
                  onClick={() => {
                    controller.updateScheduledTask(editingTaskId, {
                      title: editingTask?.title ?? '',
                      room: editingTask?.room ?? '',
                      preferredDay: editDay,
                      estimatedHours: editHours,
                      scheduleWindow: editWindow,
                    });
                    setEditingTaskId(null);
                  }}
                >
                  Save changes
                </button>
                <button onClick={() => setEditingTaskId(null)}>Cancel</button>
              </div>
              <div className="data-entry-box">
                <h4>Send Task Data / Message</h4>
                {editingTemplate?.sendDataToSpecificEmployee ? (
                  <p className="muted">
                    Recipient: {userRoleLabel[editingTemplate.dataRecipientRole]}
                  </p>
                ) : (
                  <p className="muted">
                    No recipient configured for this task in Admin settings.
                  </p>
                )}
                <textarea
                  rows={4}
                  value={taskDataMessage}
                  onChange={(e) => setTaskDataMessage(e.target.value)}
                  placeholder="Type task data or quick message..."
                />
                <div className="button-row">
                  <button
                    onClick={startVoiceDictation}
                    disabled={
                      isVoiceRecording ||
                      (editingTemplate ? !editingTemplate.allowVoiceDictation : true)
                    }
                  >
                    {isVoiceRecording ? 'Recording...' : 'Voice record'}
                  </button>
                  <button
                    onClick={() => {
                      if (!editingTaskId) return;
                      const sent = controller.sendTaskDataMessage(editingTaskId, taskDataMessage);
                      if (!sent) {
                        alert('Unable to send. Ensure recipient is configured and message is not empty.');
                        return;
                      }
                      setTaskDataMessage('');
                    }}
                  >
                    Send message
                  </button>
                </div>
              </div>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

function CalendarPage({ controller }: { controller: AppController }) {
  const tasks = controller.allScheduledCalendarTasksForActiveTrack();
  const [monthCursor, setMonthCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [expandedDayIso, setExpandedDayIso] = useState<string | null>(null);

  const tasksByIso = useMemo(() => {
    const map: Record<string, typeof tasks> = {};
    for (const task of tasks) {
      if (!task.scheduledDateIso) continue;
      if (!map[task.scheduledDateIso]) {
        map[task.scheduledDateIso] = [];
      }
      map[task.scheduledDateIso].push(task);
    }
    return map;
  }, [tasks]);

  const days = useMemo(() => {
    const firstOfMonth = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), 1);
    const firstWeekdayMonZero = (firstOfMonth.getDay() + 6) % 7;
    const gridStart = new Date(firstOfMonth);
    gridStart.setDate(firstOfMonth.getDate() - firstWeekdayMonZero);
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(gridStart);
      date.setDate(gridStart.getDate() + index);
      return date;
    });
  }, [monthCursor]);

  const monthLabel = monthCursor.toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });

  const expandedDayTasks = expandedDayIso ? tasksByIso[expandedDayIso] ?? [] : [];
  const expandedDayLabel = expandedDayIso
    ? new Date(`${expandedDayIso}T00:00:00`).toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : '';

  return (
    <div className="card">
      <div className="month-nav">
        <h2>Calendar Overview</h2>
        <div className="button-row">
          <button
            onClick={() =>
              setMonthCursor(
                (current) => new Date(current.getFullYear(), current.getMonth() - 1, 1),
              )
            }
          >
            Previous Month
          </button>
          <strong>{monthLabel}</strong>
          <button
            onClick={() =>
              setMonthCursor(
                (current) => new Date(current.getFullYear(), current.getMonth() + 1, 1),
              )
            }
          >
            Next Month
          </button>
        </div>
      </div>
      {tasks.length === 0 ? <p>No scheduled assessments yet.</p> : null}
      <div className="month-grid">
        {UI.dayLabels.map((label) => (
          <div key={label} className="month-head">
            {label}
          </div>
        ))}
        {days.map((date) => {
          const year = date.getFullYear().toString().padStart(4, '0');
          const month = (date.getMonth() + 1).toString().padStart(2, '0');
          const day = date.getDate().toString().padStart(2, '0');
          const iso = `${year}-${month}-${day}`;
          const dayTasks = tasksByIso[iso] ?? [];
          const inCurrentMonth = date.getMonth() === monthCursor.getMonth();
          return (
            <section
              key={iso}
              className={`month-cell ${inCurrentMonth ? '' : 'outside-month'}`}
              onDoubleClick={() => setExpandedDayIso(iso)}
            >
              <h3>{date.getDate()}</h3>
              {dayTasks.length === 0 ? <p className="muted">No tasks</p> : null}
              {dayTasks.map((task) => (
                <article key={task.id} className="calendar-item">
                  <strong>{task.title}</strong>
                  <span>{task.room}</span>
                  <span>{controller.formatHoursLabel(task.estimatedHours)}</span>
                  <span>{task.completed ? 'Complete' : 'Open'}</span>
                </article>
              ))}
            </section>
          );
        })}
      </div>
      <p className="muted small-note">Double-click a day to expand detailed view.</p>
      {expandedDayIso ? (
        <Modal title="Day Details" onClose={() => setExpandedDayIso(null)}>
          <div className="calendar-list">
            <h3>{expandedDayLabel}</h3>
            {expandedDayTasks.length === 0 ? <p>No scheduled tasks for this day.</p> : null}
            {expandedDayTasks.map((task) => (
              <article key={task.id} className="calendar-item">
                <strong>{task.title}</strong>
                <span>Room: {task.room}</span>
                <span>Hours: {controller.formatHoursLabel(task.estimatedHours)}</span>
                <span>Status: {task.completed ? 'Complete' : 'Open'}</span>
                <span>Category: {task.category}</span>
              </article>
            ))}
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

function AdminPage({ controller }: { controller: AppController }) {
  const [track, setTrack] = useState<AssessmentTrack>(controller.activeTrack);
  const [clearRole, setClearRole] = useState<UserRole>('producer');
  const [clearAllWeeks, setClearAllWeeks] = useState(false);
  const [clearFromDateIso, setClearFromDateIso] = useState(
    controller.weekStartByTrack[roleDefaultTrack.producer],
  );
  const [clearToDateIso, setClearToDateIso] = useState(
    controller.weekStartByTrack[roleDefaultTrack.producer],
  );
  const [clearSchedules, setClearSchedules] = useState(true);
  const [clearCalendarHistory, setClearCalendarHistory] = useState(true);
  const [title, setTitle] = useState('');
  const [room, setRoom] = useState('');
  const [category, setCategory] = useState('');
  const [priority, setPriority] = useState(3);
  const [hours, setHours] = useState(1);
  const [taskRecurrenceMode, setTaskRecurrenceMode] = useState<'none' | 'calendarDate' | 'everyDays' | 'monthly'>('none');
  const [taskRecurrenceDateIso, setTaskRecurrenceDateIso] = useState('');
  const [taskRecurrenceEveryDays, setTaskRecurrenceEveryDays] = useState(7);
  const [taskRecurrenceMonthlyDay, setTaskRecurrenceMonthlyDay] = useState(1);
  const [createAutoScheduledTasks, setCreateAutoScheduledTasks] = useState<AutoScheduledTaskDraft[]>([]);
  const [createSendDataToSpecificEmployee, setCreateSendDataToSpecificEmployee] = useState(false);
  const [createDataRecipientRole, setCreateDataRecipientRole] = useState<UserRole>('producer');
  const [createAllowVoiceDictation, setCreateAllowVoiceDictation] = useState(true);

  const templates = controller.templates
    .filter((template) => template.track === track)
    .slice()
    .sort(sortAdminTemplates);

  const onCreate = (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim() || !room.trim() || !category.trim()) {
      return;
    }
    controller.createTemplate({
      track,
      title,
      room,
      category,
      priority,
      defaultHours: hours,
      taskRecurrenceMode,
      taskRecurrenceDateIso,
      taskRecurrenceEveryDays,
      taskRecurrenceMonthlyDay,
      autoScheduledTasks: sortAutoTaskDrafts(createAutoScheduledTasks),
      sendDataToSpecificEmployee: createSendDataToSpecificEmployee,
      dataRecipientRole: createDataRecipientRole,
      allowVoiceDictation: createAllowVoiceDictation,
    });
    setTitle('');
    setRoom('');
    setCategory('');
    setPriority(3);
    setHours(1);
    setTaskRecurrenceMode('none');
    setTaskRecurrenceDateIso('');
    setTaskRecurrenceEveryDays(7);
    setTaskRecurrenceMonthlyDay(1);
    setCreateAutoScheduledTasks([]);
    setCreateSendDataToSpecificEmployee(false);
    setCreateDataRecipientRole('producer');
    setCreateAllowVoiceDictation(true);
  };

  const orderedCreateAutoTaskIndexes = createAutoScheduledTasks
    .map((_, index) => index)
    .sort((a, b) =>
      compareAutoTaskDraftChronology(createAutoScheduledTasks[a], createAutoScheduledTasks[b]),
    );

  const adminCleanupCard = (
    <div className="card">
      <h2>Admin Cleanup</h2>
      <div className="form-grid">
        <p className="muted">
          Choose the role, week range, and cleanup target (schedules, calendar history, or both).
        </p>
        <label>
          Role to clear
          <select
            value={clearRole}
            onChange={(e) => {
              const nextRole = e.target.value as UserRole;
              setClearRole(nextRole);
              const weekStart = controller.weekStartByTrack[roleDefaultTrack[nextRole]];
              setClearFromDateIso(weekStart);
              setClearToDateIso(weekStart);
            }}
          >
            {userRoles.map((role) => (
              <option key={role} value={role}>
                {userRoleLabel[role]}
              </option>
            ))}
          </select>
        </label>
        <label className="inline-check">
          <input
            type="checkbox"
            checked={clearAllWeeks}
            onChange={(e) => setClearAllWeeks(e.target.checked)}
          />
          Clear all weeks
        </label>
        {!clearAllWeeks ? (
          <>
            <label>
              From week (pick any date in week)
              <input
                type="date"
                value={clearFromDateIso}
                onChange={(e) => setClearFromDateIso(e.target.value)}
              />
            </label>
            <label>
              To week (pick any date in week)
              <input
                type="date"
                value={clearToDateIso}
                onChange={(e) => setClearToDateIso(e.target.value)}
              />
            </label>
          </>
        ) : null}
        <label className="inline-check">
          <input
            type="checkbox"
            checked={clearSchedules}
            onChange={(e) => setClearSchedules(e.target.checked)}
          />
          Clear role schedules
        </label>
        <label className="inline-check">
          <input
            type="checkbox"
            checked={clearCalendarHistory}
            onChange={(e) => setClearCalendarHistory(e.target.checked)}
          />
          Clear calendar history
        </label>
        <button
          onClick={() => {
            if (!clearSchedules && !clearCalendarHistory) {
              alert('Select at least one cleanup target.');
              return;
            }
            if (!clearAllWeeks && (!clearFromDateIso || !clearToDateIso)) {
              alert('Choose both a start week and end week.');
              return;
            }
            const targetParts: string[] = [];
            if (clearSchedules) targetParts.push('role schedules');
            if (clearCalendarHistory) targetParts.push('calendar history');
            const scope = clearAllWeeks
              ? 'all weeks'
              : `weeks between ${clearFromDateIso} and ${clearToDateIso}`;
            const confirmed = window.confirm(
              `Clear ${targetParts.join(' + ')} for ${userRoleLabel[clearRole]} (${scope})?`,
            );
            if (!confirmed) return;
            const ok = controller.clearRoleScheduleHistory(clearRole, {
              startDateIso: clearAllWeeks ? undefined : clearFromDateIso,
              endDateIso: clearAllWeeks ? undefined : clearToDateIso,
              clearSchedules,
              clearCalendarHistory,
            });
            if (!ok) {
              alert('Only admin role can clear schedules.');
              return;
            }
            alert(`Cleanup complete for ${userRoleLabel[clearRole]}.`);
          }}
        >
          Run Cleanup
        </button>
      </div>
    </div>
  );

  return (
    <div className="grid">
      <div className="card">
        <h2>Create New Task Template</h2>
        {controller.selectedRole === 'ceo' ? <p className="muted"><strong>Admin View</strong></p> : null}
        <form onSubmit={onCreate} className="form-grid">
          <label>
            Track
            <select value={track} onChange={(e) => setTrack(e.target.value as AssessmentTrack)}>
              {assessmentTracks.map((value) => (
                <option key={value} value={value}>
                  {trackLabel[value]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Title
            <input value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label>
            Room
            <input value={room} onChange={(e) => setRoom(e.target.value)} />
          </label>
          <label>
            Category
            <input value={category} onChange={(e) => setCategory(e.target.value)} />
          </label>
          <label>
            Priority
            <input type="number" min={1} max={5} value={priority} onChange={(e) => setPriority(Number(e.target.value))} />
          </label>
          <label>
            Default Hours
            <select value={hours} onChange={(e) => setHours(Number(e.target.value))}>
              {UI.hourStepOptions().map((value) => (
                <option key={value} value={value}>
                  {controller.formatHoursLabel(value)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Task Recurrence
            <select
              value={taskRecurrenceMode}
              onChange={(e) => setTaskRecurrenceMode(e.target.value as 'none' | 'calendarDate' | 'everyDays' | 'monthly')}
            >
              <option value="none">No recurrence</option>
              <option value="calendarDate">Calendar date</option>
              <option value="everyDays">Every certain days</option>
              <option value="monthly">Monthly (day of month)</option>
            </select>
          </label>
          {taskRecurrenceMode === 'calendarDate' ? (
            <label>
              Calendar Date
              <input
                type="date"
                value={taskRecurrenceDateIso}
                onChange={(e) => setTaskRecurrenceDateIso(e.target.value)}
              />
            </label>
          ) : null}
          {taskRecurrenceMode === 'everyDays' ? (
            <>
              <label>
                Start Date
                <input
                  type="date"
                  value={taskRecurrenceDateIso}
                  onChange={(e) => setTaskRecurrenceDateIso(e.target.value)}
                />
              </label>
              <label>
                Every How Many Days
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={taskRecurrenceEveryDays}
                  onChange={(e) => setTaskRecurrenceEveryDays(Number(e.target.value))}
                />
              </label>
            </>
          ) : null}
          {taskRecurrenceMode === 'monthly' ? (
            <label>
              Day Of Month
              <select
                value={taskRecurrenceMonthlyDay}
                onChange={(e) => setTaskRecurrenceMonthlyDay(Number(e.target.value))}
              >
                {Array.from({ length: 31 }, (_, day) => day + 1).map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <div className="linked-task-picker">
            <p className="muted">Auto-schedule new tasks (up to 7) when this task is scheduled.</p>
            {orderedCreateAutoTaskIndexes.map((index) => {
              const task = createAutoScheduledTasks[index];
              return (
              <div key={`create-auto-${index}`} className="auto-task-row">
                <input
                  placeholder="New task title"
                  value={task.title}
                  onChange={(e) =>
                    setCreateAutoScheduledTasks((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, title: e.target.value } : item,
                      ),
                    )
                  }
                />
                <select
                  value={task.recipientRole}
                  onChange={(e) =>
                    setCreateAutoScheduledTasks((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index
                          ? { ...item, recipientRole: e.target.value as UserRole }
                          : item,
                      ),
                    )
                  }
                >
                  {userRoles.map((role) => (
                    <option key={role} value={role}>
                      {userRoleLabel[role]}
                    </option>
                  ))}
                </select>
                <select
                  value={task.hours}
                  onChange={(e) =>
                    setCreateAutoScheduledTasks((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, hours: Number(e.target.value) } : item,
                      ),
                    )
                  }
                >
                  {UI.hourStepOptions().map((value) => (
                    <option key={value} value={value}>
                      {controller.formatHoursLabel(value)}
                    </option>
                  ))}
                </select>
                <input
                  type="date"
                  value={task.dueDateIso}
                  onChange={(e) =>
                    setCreateAutoScheduledTasks((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index
                          ? {
                              ...item,
                              dueDateIso: e.target.value,
                              daysUntilDue: e.target.value ? null : item.daysUntilDue,
                              recurrence: e.target.value ? 'none' : item.recurrence,
                              recurringWeekday: null,
                              recurringDayOfMonth: null,
                              recurringMonthOfYear: null,
                            }
                          : item,
                      ),
                    )
                  }
                />
                <select
                  value={task.daysUntilDue ?? ''}
                  onChange={(e) =>
                    setCreateAutoScheduledTasks((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index
                          ? {
                              ...item,
                              dueDateIso: e.target.value ? '' : item.dueDateIso,
                              daysUntilDue: e.target.value ? Number(e.target.value) : null,
                              recurrence: e.target.value ? 'none' : item.recurrence,
                              recurringWeekday: null,
                              recurringDayOfMonth: null,
                              recurringMonthOfYear: null,
                            }
                          : item,
                      ),
                    )
                  }
                >
                  <option value="">In how many days</option>
                  {Array.from({ length: 71 }, (_, dayOffset) => dayOffset).map((value) => (
                    <option key={value} value={value}>
                      {value} day{value === 1 ? '' : 's'}
                    </option>
                  ))}
                </select>
                <div className="day-pill-row recurring-row full-span">
                  {recurrenceOptions.map((option) => (
                    <button
                      key={`create-recur-type-${index}-${option.value}`}
                      type="button"
                      className={`day-pill ${task.recurrence === option.value ? 'active-day' : ''}`}
                      onClick={() =>
                        setCreateAutoScheduledTasks((current) =>
                          current.map((item, itemIndex) => {
                            if (itemIndex !== index) return item;
                            if (option.value === 'none') {
                              return {
                                ...item,
                                recurrence: 'none',
                                recurringWeekday: null,
                                recurringDayOfMonth: null,
                                recurringMonthOfYear: null,
                              };
                            }
                            return {
                              ...item,
                              dueDateIso: '',
                              daysUntilDue: null,
                              recurrence: option.value,
                              recurringWeekday: option.value === 'weekly' ? (item.recurringWeekday ?? 0) : null,
                              recurringDayOfMonth:
                                option.value === 'monthly' || option.value === 'yearly'
                                  ? (item.recurringDayOfMonth ?? 1)
                                  : null,
                              recurringMonthOfYear: option.value === 'yearly' ? (item.recurringMonthOfYear ?? 0) : null,
                            };
                          }),
                        )
                      }
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                {task.recurrence === 'weekly' ? (
                  <div className="day-pill-row recurring-row full-span">
                    {UI.dayLabels.map((label, weekday) => (
                      <button
                        key={`create-recurring-${index}-${label}`}
                        type="button"
                        className={`day-pill ${task.recurringWeekday === weekday ? 'active-day' : ''}`}
                        onClick={() =>
                          setCreateAutoScheduledTasks((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, recurringWeekday: weekday }
                                : item,
                            ),
                          )
                        }
                      >
                        {label.slice(0, 3)}
                      </button>
                    ))}
                  </div>
                ) : null}
                {task.recurrence === 'monthly' ? (
                  <select
                    className="full-span"
                    value={task.recurringDayOfMonth ?? 1}
                    onChange={(e) =>
                      setCreateAutoScheduledTasks((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, recurringDayOfMonth: Number(e.target.value) }
                            : item,
                        ),
                      )
                    }
                  >
                    {Array.from({ length: 31 }, (_, day) => day + 1).map((value) => (
                      <option key={value} value={value}>
                        Every month on day {value}
                      </option>
                    ))}
                  </select>
                ) : null}
                {task.recurrence === 'yearly' ? (
                  <div className="auto-yearly-row full-span">
                    <select
                      value={task.recurringMonthOfYear ?? 0}
                      onChange={(e) =>
                        setCreateAutoScheduledTasks((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, recurringMonthOfYear: Number(e.target.value) }
                              : item,
                          ),
                        )
                      }
                    >
                      {monthLabelsShort.map((label, monthIndex) => (
                        <option key={label} value={monthIndex}>
                          {label}
                        </option>
                      ))}
                    </select>
                    <select
                      value={task.recurringDayOfMonth ?? 1}
                      onChange={(e) =>
                        setCreateAutoScheduledTasks((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, recurringDayOfMonth: Number(e.target.value) }
                              : item,
                          ),
                        )
                      }
                    >
                      {Array.from({ length: 31 }, (_, day) => day + 1).map((value) => (
                        <option key={value} value={value}>
                          Day {value}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
                <button
                  className="full-span"
                  type="button"
                  onClick={() =>
                    setCreateAutoScheduledTasks((current) =>
                      current.filter((_, itemIndex) => itemIndex !== index),
                    )
                  }
                >
                  Remove
                </button>
              </div>
            );
            })}
            <button
              type="button"
              onClick={() =>
                setCreateAutoScheduledTasks((current) => {
                  if (current.length >= 7) return current;
                  return [
                    ...current,
                    {
                      title: '',
                      recipientRole: 'generalManager',
                      hours: 1,
                      dueDateIso: '',
                      daysUntilDue: null,
                      recurrence: 'none',
                      recurringWeekday: null,
                      recurringDayOfMonth: null,
                      recurringMonthOfYear: null,
                    },
                  ];
                })
              }
            >
              Add auto-scheduled task
            </button>
          </div>
          <label className="inline-check">
            <input
              type="checkbox"
              checked={createSendDataToSpecificEmployee}
              onChange={(e) => setCreateSendDataToSpecificEmployee(e.target.checked)}
            />
            Send task data/message to dedicated role
          </label>
          <label>
            Data recipient role
            <select
              value={createDataRecipientRole}
              onChange={(e) => setCreateDataRecipientRole(e.target.value as UserRole)}
              disabled={!createSendDataToSpecificEmployee}
            >
              {userRoles.map((role) => (
                <option key={role} value={role}>
                  {userRoleLabel[role]}
                </option>
              ))}
            </select>
          </label>
          <label className="inline-check">
            <input
              type="checkbox"
              checked={createAllowVoiceDictation}
              onChange={(e) => setCreateAllowVoiceDictation(e.target.checked)}
            />
            Allow voice dictation for task data
          </label>
          <button type="submit">Create</button>
        </form>
      </div>

      <div className="card">
        <h2>Admin Editable Tasks ({templates.length})</h2>
        <div className="calendar-list">
          {templates.map((template) => (
            <EditableTemplate key={template.id} template={template} controller={controller} />
          ))}
        </div>
      </div>

      {adminCleanupCard}
    </div>
  );
}

function EditableTemplate({ template, controller }: { template: AssessmentTemplate; controller: AppController }) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState({
    ...template,
    autoScheduledTasks: sortAutoTaskDrafts(template.autoScheduledTasks),
  });
  const orderedDraftAutoTaskIndexes = draft.autoScheduledTasks
    .map((_, index) => index)
    .sort((a, b) => compareAutoTaskDraftChronology(draft.autoScheduledTasks[a], draft.autoScheduledTasks[b]));

  return (
    <article className={`calendar-item template-item ${isEditing ? 'editing' : ''}`}>
      {!isEditing ? (
        <>
          <strong>{template.title}</strong>
          <span>{template.room}</span>
          <span>{template.category}</span>
          <span>
            P{template.priority} - {controller.formatHoursLabel(template.defaultHours)}
          </span>
          <span>{template.autoScheduledTasks.length} linked auto-tasks</span>
          <div className="template-actions">
            <button
              onClick={() => {
                setDraft({
                  ...template,
                  autoScheduledTasks: sortAutoTaskDrafts(template.autoScheduledTasks),
                });
                setIsEditing(true);
              }}
            >
              Edit
            </button>
            <button
              className="template-delete-button"
              onClick={() => {
                const confirmed = window.confirm(`Delete this task template: "${template.title}"?`);
                if (!confirmed) return;
                controller.deleteTemplate(template.id);
              }}
            >
              Delete Task
            </button>
          </div>
        </>
      ) : (
        <>
          <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
          <input value={draft.room} onChange={(e) => setDraft({ ...draft, room: e.target.value })} />
          <input value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} />
          <input
            type="number"
            min={1}
            max={5}
            value={draft.priority}
            onChange={(e) => setDraft({ ...draft, priority: Number(e.target.value) })}
          />
          <select
            value={draft.defaultHours}
            onChange={(e) => setDraft({ ...draft, defaultHours: Number(e.target.value) })}
          >
            {UI.hourStepOptions().map((value) => (
              <option key={value} value={value}>
                {controller.formatHoursLabel(value)}
              </option>
            ))}
          </select>
          <select
            value={draft.taskRecurrenceMode}
            onChange={(e) =>
              setDraft({
                ...draft,
                taskRecurrenceMode: e.target.value as 'none' | 'calendarDate' | 'everyDays' | 'monthly',
              })
            }
          >
            <option value="none">No recurrence</option>
            <option value="calendarDate">Calendar date</option>
            <option value="everyDays">Every certain days</option>
            <option value="monthly">Monthly (day of month)</option>
          </select>
          {draft.taskRecurrenceMode === 'calendarDate' ? (
            <input
              type="date"
              value={draft.taskRecurrenceDateIso}
              onChange={(e) => setDraft({ ...draft, taskRecurrenceDateIso: e.target.value })}
            />
          ) : null}
          {draft.taskRecurrenceMode === 'everyDays' ? (
            <>
              <input
                type="date"
                value={draft.taskRecurrenceDateIso}
                onChange={(e) => setDraft({ ...draft, taskRecurrenceDateIso: e.target.value })}
              />
              <input
                type="number"
                min={1}
                max={365}
                value={draft.taskRecurrenceEveryDays ?? 7}
                onChange={(e) => setDraft({ ...draft, taskRecurrenceEveryDays: Number(e.target.value) })}
              />
            </>
          ) : null}
          {draft.taskRecurrenceMode === 'monthly' ? (
            <select
              value={draft.taskRecurrenceMonthlyDay ?? 1}
              onChange={(e) => setDraft({ ...draft, taskRecurrenceMonthlyDay: Number(e.target.value) })}
            >
              {Array.from({ length: 31 }, (_, day) => day + 1).map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          ) : null}
          <div className="linked-task-picker">
            <p className="muted">Auto-schedule new tasks (up to 7) when this task is scheduled.</p>
            {orderedDraftAutoTaskIndexes.map((index) => {
              const task = draft.autoScheduledTasks[index];
              return (
              <div key={`edit-auto-${index}`} className="auto-task-row">
                <input
                  placeholder="New task title"
                  value={task.title}
                  onChange={(e) =>
                    setDraft((current) => ({
                      ...current,
                      autoScheduledTasks: current.autoScheduledTasks.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, title: e.target.value } : item,
                      ),
                    }))
                  }
                />
                <select
                  value={task.recipientRole}
                  onChange={(e) =>
                    setDraft((current) => ({
                      ...current,
                      autoScheduledTasks: current.autoScheduledTasks.map((item, itemIndex) =>
                        itemIndex === index
                          ? { ...item, recipientRole: e.target.value as UserRole }
                          : item,
                      ),
                    }))
                  }
                >
                  {userRoles.map((role) => (
                    <option key={role} value={role}>
                      {userRoleLabel[role]}
                    </option>
                  ))}
                </select>
                <select
                  value={task.hours}
                  onChange={(e) =>
                    setDraft((current) => ({
                      ...current,
                      autoScheduledTasks: current.autoScheduledTasks.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, hours: Number(e.target.value) } : item,
                      ),
                    }))
                  }
                >
                  {UI.hourStepOptions().map((value) => (
                    <option key={value} value={value}>
                      {controller.formatHoursLabel(value)}
                    </option>
                  ))}
                </select>
                <input
                  type="date"
                  value={task.dueDateIso}
                  onChange={(e) =>
                    setDraft((current) => ({
                      ...current,
                      autoScheduledTasks: current.autoScheduledTasks.map((item, itemIndex) =>
                        itemIndex === index
                          ? {
                              ...item,
                              dueDateIso: e.target.value,
                              daysUntilDue: e.target.value ? null : item.daysUntilDue,
                              recurrence: e.target.value ? 'none' : item.recurrence,
                              recurringWeekday: null,
                              recurringDayOfMonth: null,
                              recurringMonthOfYear: null,
                            }
                          : item,
                      ),
                    }))
                  }
                />
                <select
                  value={task.daysUntilDue ?? ''}
                  onChange={(e) =>
                    setDraft((current) => ({
                      ...current,
                      autoScheduledTasks: current.autoScheduledTasks.map((item, itemIndex) =>
                        itemIndex === index
                          ? {
                              ...item,
                              dueDateIso: e.target.value ? '' : item.dueDateIso,
                              daysUntilDue: e.target.value ? Number(e.target.value) : null,
                              recurrence: e.target.value ? 'none' : item.recurrence,
                              recurringWeekday: null,
                              recurringDayOfMonth: null,
                              recurringMonthOfYear: null,
                            }
                          : item,
                      ),
                    }))
                  }
                >
                  <option value="">In how many days</option>
                  {Array.from({ length: 71 }, (_, dayOffset) => dayOffset).map((value) => (
                    <option key={value} value={value}>
                      {value} day{value === 1 ? '' : 's'}
                    </option>
                  ))}
                </select>
                <div className="day-pill-row recurring-row full-span">
                  {recurrenceOptions.map((option) => (
                    <button
                      key={`edit-recur-type-${index}-${option.value}`}
                      type="button"
                      className={`day-pill ${task.recurrence === option.value ? 'active-day' : ''}`}
                      onClick={() =>
                        setDraft((current) => ({
                          ...current,
                          autoScheduledTasks: current.autoScheduledTasks.map((item, itemIndex) => {
                            if (itemIndex !== index) return item;
                            if (option.value === 'none') {
                              return {
                                ...item,
                                recurrence: 'none',
                                recurringWeekday: null,
                                recurringDayOfMonth: null,
                                recurringMonthOfYear: null,
                              };
                            }
                            return {
                              ...item,
                              dueDateIso: '',
                              daysUntilDue: null,
                              recurrence: option.value,
                              recurringWeekday: option.value === 'weekly' ? (item.recurringWeekday ?? 0) : null,
                              recurringDayOfMonth:
                                option.value === 'monthly' || option.value === 'yearly'
                                  ? (item.recurringDayOfMonth ?? 1)
                                  : null,
                              recurringMonthOfYear: option.value === 'yearly' ? (item.recurringMonthOfYear ?? 0) : null,
                            };
                          }),
                        }))
                      }
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                {task.recurrence === 'weekly' ? (
                  <div className="day-pill-row recurring-row full-span">
                    {UI.dayLabels.map((label, weekday) => (
                      <button
                        key={`edit-recurring-${index}-${label}`}
                        type="button"
                        className={`day-pill ${task.recurringWeekday === weekday ? 'active-day' : ''}`}
                        onClick={() =>
                          setDraft((current) => ({
                            ...current,
                            autoScheduledTasks: current.autoScheduledTasks.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, recurringWeekday: weekday }
                                : item,
                            ),
                          }))
                        }
                      >
                        {label.slice(0, 3)}
                      </button>
                    ))}
                  </div>
                ) : null}
                {task.recurrence === 'monthly' ? (
                  <select
                    className="full-span"
                    value={task.recurringDayOfMonth ?? 1}
                    onChange={(e) =>
                      setDraft((current) => ({
                        ...current,
                        autoScheduledTasks: current.autoScheduledTasks.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, recurringDayOfMonth: Number(e.target.value) }
                            : item,
                        ),
                      }))
                    }
                  >
                    {Array.from({ length: 31 }, (_, day) => day + 1).map((value) => (
                      <option key={value} value={value}>
                        Every month on day {value}
                      </option>
                    ))}
                  </select>
                ) : null}
                {task.recurrence === 'yearly' ? (
                  <div className="auto-yearly-row full-span">
                    <select
                      value={task.recurringMonthOfYear ?? 0}
                      onChange={(e) =>
                        setDraft((current) => ({
                          ...current,
                          autoScheduledTasks: current.autoScheduledTasks.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, recurringMonthOfYear: Number(e.target.value) }
                              : item,
                          ),
                        }))
                      }
                    >
                      {monthLabelsShort.map((label, monthIndex) => (
                        <option key={label} value={monthIndex}>
                          {label}
                        </option>
                      ))}
                    </select>
                    <select
                      value={task.recurringDayOfMonth ?? 1}
                      onChange={(e) =>
                        setDraft((current) => ({
                          ...current,
                          autoScheduledTasks: current.autoScheduledTasks.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, recurringDayOfMonth: Number(e.target.value) }
                              : item,
                          ),
                        }))
                      }
                    >
                      {Array.from({ length: 31 }, (_, day) => day + 1).map((value) => (
                        <option key={value} value={value}>
                          Day {value}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
                <button
                  className="full-span"
                  type="button"
                  onClick={() =>
                    setDraft((current) => ({
                      ...current,
                      autoScheduledTasks: current.autoScheduledTasks.filter(
                        (_, itemIndex) => itemIndex !== index,
                      ),
                    }))
                  }
                >
                  Remove
                </button>
              </div>
            );
            })}
            <button
              type="button"
              onClick={() =>
                setDraft((current) => {
                  if (current.autoScheduledTasks.length >= 7) return current;
                  return {
                    ...current,
                    autoScheduledTasks: [
                      ...current.autoScheduledTasks,
                      {
                        title: '',
                        recipientRole: 'generalManager',
                        hours: 1,
                        dueDateIso: '',
                        daysUntilDue: null,
                        recurrence: 'none',
                        recurringWeekday: null,
                        recurringDayOfMonth: null,
                        recurringMonthOfYear: null,
                      },
                    ],
                  };
                })
              }
            >
              Add auto-scheduled task
            </button>
          </div>
          <label className="inline-check">
            <input
              type="checkbox"
              checked={draft.sendDataToSpecificEmployee}
              onChange={(e) =>
                setDraft({ ...draft, sendDataToSpecificEmployee: e.target.checked })
              }
            />
            Send task data/message to dedicated role
          </label>
          <label>
            Data recipient role
            <select
              value={draft.dataRecipientRole}
              onChange={(e) =>
                setDraft({ ...draft, dataRecipientRole: e.target.value as UserRole })
              }
              disabled={!draft.sendDataToSpecificEmployee}
            >
              {userRoles.map((role) => (
                <option key={role} value={role}>
                  {userRoleLabel[role]}
                </option>
              ))}
            </select>
          </label>
          <label className="inline-check">
            <input
              type="checkbox"
              checked={draft.allowVoiceDictation}
              onChange={(e) =>
                setDraft({ ...draft, allowVoiceDictation: e.target.checked })
              }
            />
            Allow voice dictation
          </label>
          <div className="button-row">
            <button
              onClick={() => {
                controller.updateTemplate(draft);
                setIsEditing(false);
              }}
            >
              Save
            </button>
                <button
                  onClick={() => {
                    setDraft({
                      ...template,
                      autoScheduledTasks: sortAutoTaskDrafts(template.autoScheduledTasks),
                    });
                    setIsEditing(false);
                  }}
                >
              Cancel
            </button>
            <button
              onClick={() => {
                const confirmed = window.confirm(`Delete this task template: "${template.title}"?`);
                if (!confirmed) return;
                controller.deleteTemplate(template.id);
                setIsEditing(false);
              }}
            >
              Delete this task
            </button>
          </div>
        </>
      )}
    </article>
  );
}

function SendRequestPage({
  controller,
  targetRole,
}: {
  controller: AppController;
  targetRole: UserRole;
}) {
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [actionRequired, setActionRequired] = useState(false);
  const fromLabel = userRoleLabel[controller.selectedRole];
  const toLabel = userRoleLabel[targetRole];

  const onSend = (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) {
      alert('Enter a request title.');
      return;
    }
    controller.sendInboxMessage({
      recipients: [targetRole],
      title,
      notes,
      actionRequired,
    });
    alert(`Request sent to ${toLabel}.`);
    setTitle('');
    setNotes('');
    setActionRequired(false);
  };

  const sentMessages = controller.inboxByRole[targetRole].filter(
    (m) => m.fromRole === controller.selectedRole,
  );

  return (
    <div className="card producer-supplies-card">
      <h2>Send Request to {toLabel}</h2>
      <p className="muted">From: {fromLabel}</p>
      <form onSubmit={onSend} className="form-grid">
        <label>
          Request Title
          <input value={title} onChange={(e) => setTitle(e.target.value)} required />
        </label>
        <label>
          Details / Notes
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} />
        </label>
        <label className="inline-check">
          <input
            type="checkbox"
            checked={actionRequired}
            onChange={(e) => setActionRequired(e.target.checked)}
          />
          Action required
        </label>
        <button type="submit">Send Request</button>
      </form>
      {sentMessages.length > 0 ? (
        <>
          <h3 style={{ marginTop: '1rem' }}>Previously Sent ({sentMessages.length})</h3>
          <div className="calendar-list">
            {sentMessages.map((message) => (
              <article key={message.id} className={`calendar-item ${message.isRead ? 'read' : 'unread'}`}>
                <strong>{message.title}</strong>
                <span>{new Date(message.createdAt).toLocaleString()}</span>
                <span>{message.notes || 'No notes'}</span>
                {message.actionRequired ? <span className="warning">Action required</span> : null}
              </article>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

function InboxModal({ controller, onClose }: { controller: AppController; onClose: () => void }) {
  const emptyRecipientSelection = (): Record<UserRole, boolean> =>
    Object.fromEntries(userRoles.map((role) => [role, false])) as Record<UserRole, boolean>;

  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [actionRequired, setActionRequired] = useState(false);
  const [selectedRecipients, setSelectedRecipients] = useState<Record<UserRole, boolean>>(
    emptyRecipientSelection,
  );

  const recipients = userRoles.filter((role) => role !== controller.selectedRole);

  const onSend = (event: FormEvent) => {
    event.preventDefault();
    const recipientList = recipients.filter((role) => selectedRecipients[role]);
    controller.sendInboxMessage({
      recipients: recipientList,
      title,
      notes,
      actionRequired,
    });
    setTitle('');
    setNotes('');
    setActionRequired(false);
    setSelectedRecipients(emptyRecipientSelection());
  };

  return (
    <Modal title={`${userRoleLabel[controller.selectedRole]} Inbox`} onClose={onClose}>
      <div className="inbox-grid">
        <section>
          <div className="button-row">
            <button onClick={() => controller.markAllInboxMessagesReadForSelectedRole()}>Mark all as read</button>
          </div>
          <div className="calendar-list">
            {controller.inboxByRole[controller.selectedRole].map((message) => (
              <article key={message.id} className={`calendar-item ${message.isRead ? 'read' : 'unread'}`}>
                <strong>{message.title}</strong>
                <span>
                  {userRoleLabel[message.fromRole]} {'->'} {userRoleLabel[message.toRole]}
                </span>
                <span>{new Date(message.createdAt).toLocaleString()}</span>
                <span>{message.notes || 'No notes'}</span>
                {message.actionRequired ? <span className="warning">Action required</span> : null}
                {!message.isRead ? <button onClick={() => controller.markInboxMessageRead(message.id)}>Mark read</button> : null}
              </article>
            ))}
            {controller.inboxByRole[controller.selectedRole].length === 0 ? <p>No inbox messages.</p> : null}
          </div>
        </section>

        <section>
          <h3>Send Message</h3>
          <form onSubmit={onSend} className="form-grid">
            <label>
              Title
              <input value={title} onChange={(e) => setTitle(e.target.value)} required />
            </label>
            <label>
              Notes
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} />
            </label>
            <label className="inline-check">
              <input type="checkbox" checked={actionRequired} onChange={(e) => setActionRequired(e.target.checked)} />
              Action required
            </label>
            <div className="recipient-list">
              {recipients.map((role) => (
                <label key={role} className="inline-check">
                  <input
                    type="checkbox"
                    checked={selectedRecipients[role]}
                    onChange={(e) => setSelectedRecipients((prev) => ({ ...prev, [role]: e.target.checked }))}
                  />
                  {userRoleLabel[role]}
                </label>
              ))}
            </div>
            <button type="submit">Send</button>
          </form>
        </section>
      </div>
    </Modal>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal">
        <div className="modal-head">
          <h2>{title}</h2>
          <button onClick={onClose}>Close</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export default App;
