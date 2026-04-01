import { useNavigate } from 'react-router-dom';
import { useController } from '../store/useController';
import { fmtDateTime, fmtDuration } from '../utils/helpers';
import { useState } from 'react';

export default function HomePage() {
  const ctrl = useController();
  const navigate = useNavigate();
  const user = ctrl.user!;
  const activeSession = ctrl.activeSession;
  const feedAlerts = ctrl.feedComplianceAlerts();
  const activePatrol = ctrl.activePatrolWithoutFalcon;
  const unsyncedCount = ctrl.unsyncedCount;
  const adminQuestions = ctrl.unresolvedAdminQuestionsForCurrentUser;
  const [suppGrams, setSuppGrams] = useState<Record<string, string>>({});

  function handleSync() {
    ctrl.markAllSessionsSynced();
  }

  function handleSupplementalFeed(falconId: string) {
    const g = parseFloat(suppGrams[falconId] || '0');
    if (g > 0) {
      ctrl.addSupplementalFeedGrams(falconId, g);
      setSuppGrams(prev => ({ ...prev, [falconId]: '' }));
    }
  }

  const navItems = [
    { icon: '🌙', label: 'Before Bed Checklist', path: '/before-bed' },
    { icon: '🌤', label: 'Local Weather', path: '/local-weather' },
    { icon: '📊', label: 'Starling Timeline', path: '/starling-timeline' },
    { icon: '💬', label: 'Customer Input', path: '/customer-input' },
    { icon: 'ℹ️', label: 'Other Information', path: '/other-info' },
  ];

  return (
    <div className="page">
      <div className="app-bar">
        <button onClick={() => { ctrl.logout(); navigate('/'); }}>←</button>
        <h1>Welcome, {user.name}</h1>
        <div className="actions">
          <button onClick={() => navigate('/ask-question')} title="Ask a Question">❓</button>
          <button onClick={handleSync} style={{ position: 'relative' }}>
            🔄
            {unsyncedCount > 0 && <span className="badge" style={{ position: 'absolute', top: -4, right: -4 }}>{unsyncedCount}</span>}
          </button>
        </div>
      </div>
      <div className="page-content" style={{ animation: 'fadeIn .4s ease-out' }}>
        {/* Admin questions alert */}
        {adminQuestions.length > 0 && (
          <div className="card" style={{ background: 'var(--warning-bg)', border: '1.5px solid var(--warning-border)', marginBottom: 16 }}>
            <p style={{ fontWeight: 700, fontSize: 14, color: 'var(--warning)', marginBottom: 4 }}>
              📋 {adminQuestions.length} unanswered question{adminQuestions.length > 1 ? 's' : ''} from admin
            </p>
            {adminQuestions.map(q => (
              <div key={q.id} style={{ marginTop: 10, padding: 12, background: 'rgba(255,255,255,.6)', borderRadius: 'var(--radius-sm)' }}>
                <p style={{ fontSize: 13, fontWeight: 500, marginBottom: 6 }}>{q.questionText}</p>
                <input placeholder="Type your answer and press Enter..." style={{ width: '100%' }}
                  onKeyDown={e => { if (e.key === 'Enter') { ctrl.answerAdminQuestion(q.id, (e.target as HTMLInputElement).value); (e.target as HTMLInputElement).value = ''; } }} />
              </div>
            ))}
          </div>
        )}

        {/* Active session resume */}
        {activeSession && (
          <div className="card" style={{ background: 'var(--warning-bg)', border: '1.5px solid var(--warning-border)', marginBottom: 16 }}>
            <div className="flex-row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontWeight: 800, fontSize: 15, color: 'var(--warning)' }}>Active Session</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--warning)', background: 'var(--warning-border)', padding: '2px 10px', borderRadius: 'var(--radius-full)' }}>In Progress</span>
            </div>
            <p style={{ fontSize: 14, fontWeight: 600 }}>{ctrl.falconById(activeSession.falconId).name}</p>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{fmtDateTime(activeSession.startAt)} &middot; {fmtDuration(ctrl.sessionMinutes(activeSession))}</p>
            <button className="btn-filled btn-full mt-12" style={{ padding: 12 }} onClick={() => navigate(`/live-session/${activeSession.id}`)}>Resume Session</button>
          </div>
        )}

        {/* Start new session */}
        {!activeSession && (
          <button className="btn-filled btn-icon btn-full" style={{
            padding: '16px 20px', fontSize: 15, marginBottom: 16, borderRadius: 'var(--radius-md)',
            boxShadow: '0 4px 16px rgba(26,58,92,.25)',
          }}
            onClick={() => navigate('/ready-to-fly')}>
            🦅 Start New Falcon Flying Session
          </button>
        )}

        {/* Patrol controls */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="flex-row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <p style={{ fontWeight: 700, fontSize: 14 }}>Patrol Without Falcon</p>
              {activePatrol && (
                <p style={{ fontSize: 12, color: 'var(--success)', fontWeight: 600, marginTop: 2 }}>⏱ Since {fmtDateTime(activePatrol.startAt)}</p>
              )}
            </div>
            {activePatrol ? (
              <button className="btn-danger btn-sm" onClick={() => ctrl.stopPatrolWithoutFalcon()}>Stop Patrol</button>
            ) : (
              <button className="btn-outlined btn-sm" onClick={() => ctrl.startPatrolWithoutFalcon()}>Start Patrol</button>
            )}
          </div>
        </div>

        {/* Feed compliance alerts */}
        {feedAlerts.length > 0 && (
          <div className="card" style={{ background: 'var(--danger)', color: '#fff', border: 'none', marginBottom: 16, boxShadow: '0 4px 16px rgba(220,38,38,.2)' }}>
            <p style={{ fontWeight: 800, fontSize: 15, marginBottom: 8 }}>⚠ Feed Alerts</p>
            {feedAlerts.map(alert => (
              <div key={alert.falconId} style={{ marginTop: 8, padding: 12, background: 'rgba(255,255,255,.12)', borderRadius: 'var(--radius-sm)' }}>
                <p style={{ fontWeight: 700, fontSize: 14 }}>{alert.falconName}</p>
                <p style={{ fontSize: 12, opacity: .85, marginTop: 2 }}>
                  Required: {alert.requiredGrams}g &middot; Fed: {alert.actualGrams.toFixed(1)}g &middot; Need: {(alert.requiredGrams - alert.actualGrams).toFixed(1)}g more
                </p>
                <div className="flex-row mt-8">
                  <input type="number" placeholder="grams" style={{ width: 100, background: '#fff', color: '#000', border: 'none', borderRadius: 'var(--radius-sm)' }}
                    value={suppGrams[alert.falconId] || ''} onChange={e => setSuppGrams(prev => ({ ...prev, [alert.falconId]: e.target.value }))} />
                  <button className="btn-sm" style={{ background: 'rgba(255,255,255,.2)', color: '#fff' }} onClick={() => handleSupplementalFeed(alert.falconId)}>
                    Add Feed
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Navigation grid */}
        <div className="section-title" style={{ marginTop: 8 }}>Quick Access</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10, marginBottom: 20 }}>
          {navItems.map(item => (
            <div key={item.path} className="card card-clickable" style={{ textAlign: 'center', padding: '16px 12px' }}
              onClick={() => navigate(item.path)}>
              <div style={{ fontSize: 24, marginBottom: 6 }}>{item.icon}</div>
              <p style={{ fontSize: 13, fontWeight: 600 }}>{item.label}</p>
            </div>
          ))}
        </div>

        {/* Recent sessions */}
        {ctrl.currentUserSessions.length > 0 && (
          <div>
            <div className="section-title">Recent Sessions</div>
            {ctrl.currentUserSessions.slice(0, 5).map(s => (
              <div key={s.id} className="card card-clickable" onClick={() => navigate(`/session-summary/${s.id}`)}>
                <div className="flex-row" style={{ justifyContent: 'space-between' }}>
                  <span style={{ fontWeight: 700, fontSize: 14 }}>{ctrl.falconById(s.falconId).name}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{fmtDateTime(s.startAt)}</span>
                </div>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>
                  {ctrl.completedFlights(s)} flights &middot; {fmtDuration(ctrl.flyingMinutes(s))} flying &middot; {ctrl.foodUsedG(s).toFixed(1)}g fed
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
