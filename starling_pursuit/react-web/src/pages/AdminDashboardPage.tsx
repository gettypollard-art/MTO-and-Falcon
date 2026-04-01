import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useController } from '../store/useController';
import { fmtHours, fmtAgo } from '../utils/helpers';

export default function AdminDashboardPage() {
  const ctrl = useController();
  const navigate = useNavigate();
  const handlers = ctrl.handlerUsers;

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

  return (
    <div className="page">
      <div className="app-bar">
        <button onClick={() => { ctrl.logout(); navigate('/'); }}>←</button>
        <h1>Admin Dashboard</h1>
      </div>
      <div className="page-content" style={{ animation: 'fadeIn .4s ease-out' }}>
        {/* Top metric */}
        <div className="card" style={{ padding: 20, marginBottom: 16, background: 'var(--info-bg)', border: '1px solid var(--info-border)' }}>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Handlers</p>
          <p style={{ fontSize: 32, fontWeight: 900, color: 'var(--primary)' }}>{handlers.length}</p>
        </div>

        {/* Per-handler cards */}
        {handlers.map(h => <HandlerCard key={h.id} handlerId={h.id} ctrl={ctrl} now={now} todayStart={todayStart} todayEnd={todayEnd} navigate={navigate} />)}
      </div>
    </div>
  );
}

function HandlerCard({ handlerId, ctrl, now, todayStart, todayEnd, navigate }: any) {
  const handler = ctrl.handlerById(handlerId);
  const [expanded, setExpanded] = useState(false);
  const [voiceDialogOpen, setVoiceDialogOpen] = useState(false);
  const [feedDialogOpen, setFeedDialogOpen] = useState(false);

  const flyingSessions = ctrl.flyingSessionsForHandlerBetween(handlerId, todayStart, todayEnd);
  const flyingMinutes = ctrl.flyingMinutesForHandlerBetween(handlerId, todayStart, todayEnd);
  const customerInputs = ctrl.customerInputsForHandlerBetween(handlerId, todayStart, todayEnd);

  const feedAlerts = ctrl.feedComplianceAlertsForHandler(handlerId);
  const lastEntry = ctrl.lastDataEntryAtForHandler(handlerId);
  const hoursSinceEntry = lastEntry ? (now.getTime() - lastEntry.getTime()) / 3600000 : null;

  const voiceNotes = ctrl.sessionsForHandler(handlerId).filter((s: any) => s.voiceTranscript).length;

  const falcons = ctrl.falconsForHandler(handlerId);

  return (
    <div className="card mb-8">
      <p style={{ fontWeight: 800, fontSize: 16 }}>{handler.name}</p>

      <div className="flex-row flex-wrap gap-4 mt-4">
        <MetricBox label="Flying Sessions" value={String(flyingSessions)} />
        <MetricBox label="Flying Hours" value={fmtHours(flyingMinutes)} />
        <MetricBox label="Voice Notes" value={String(voiceNotes)} onClick={() => setVoiceDialogOpen(!voiceDialogOpen)} />
        <MetricBox label="Customer Input" value={customerInputs > 0 ? 'Active' : 'No Entry'} />
        <MetricBox label="Feed Alerts" value={String(feedAlerts.length)} onClick={() => setFeedDialogOpen(!feedDialogOpen)}
          style={feedAlerts.length > 0 ? { borderColor: 'var(--danger)', color: 'var(--danger)' } : undefined} />
        <MetricBox label="Data Entry 24h"
          value={hoursSinceEntry !== null ? `${hoursSinceEntry.toFixed(1)}h` : 'N/A'}
          style={hoursSinceEntry !== null && hoursSinceEntry > 24 ? { borderColor: 'var(--danger)', color: 'var(--danger)' } : undefined} />
      </div>

      {/* Voice notes dialog */}
      {voiceDialogOpen && (
        <div className="card" style={{ marginTop: 12, background: 'var(--info-bg)', border: '1px solid var(--info-border)', padding: 16 }}>
          <p style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Voice Notes</p>
          {ctrl.sessionsForHandler(handlerId).filter((s: any) => s.voiceTranscript).map((s: any) => (
            <div key={s.id} style={{ fontSize: 12, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
              <p style={{ fontWeight: 600 }}>{ctrl.falconById(s.falconId).name} – {fmtAgo(s.startAt)}</p>
              <p style={{ fontStyle: 'italic', color: 'var(--text-secondary)' }}>“{s.voiceTranscript}”</p>
            </div>
          ))}
        </div>
      )}

      {/* Feed alerts dialog */}
      {feedDialogOpen && feedAlerts.length > 0 && (
        <div className="card" style={{ marginTop: 12, background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', padding: 16 }}>
          <p style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Feed Alerts</p>
          {feedAlerts.map((a: any) => (
            <div key={a.falconId} style={{ fontSize: 12, marginTop: 4 }}>
              <span style={{ fontWeight: 600 }}>{a.falconName}:</span> Need {(a.requiredGrams - a.actualGrams).toFixed(1)}g more (fed {a.actualGrams.toFixed(1)}g / {a.requiredGrams}g)
            </div>
          ))}
        </div>
      )}

      {/* Falcon spreadsheets expand */}
      <button className="btn-outlined btn-sm" style={{ marginTop: 12 }} onClick={() => setExpanded(!expanded)}>
        {expanded ? 'Hide' : 'Show'} Falcon Spreadsheets
      </button>

      {expanded && (
        <div className="mt-4">
          {falcons.map((f: any) => {
            const sessions = ctrl.sessionsForFalcon(handlerId, f.id);
            return (
              <div key={f.id} className="card mb-4" style={{ cursor: 'pointer' }}
                onClick={() => navigate(`/admin-spreadsheet/${handlerId}/${f.id}`)}>
                <div className="flex-row" style={{ justifyContent: 'space-between' }}>
                  <span style={{ fontWeight: 700, fontSize: 13 }}>{f.name}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{sessions.length} rows ▶</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <button className="btn-tonal btn-sm mt-4" onClick={() => navigate(`/admin-user/${handlerId}`)}>
        View Detail ▶
      </button>
    </div>
  );
}

function MetricBox({ label, value, onClick, style }: { label: string; value: string; onClick?: () => void; style?: React.CSSProperties }) {
  return (
    <div className="metric-box" style={{ ...style, cursor: onClick ? 'pointer' : 'default' }} onClick={onClick}>
      <div>
        <div className="metric-label">{label}</div>
        <div className="metric-value">{value}</div>
      </div>
    </div>
  );
}
