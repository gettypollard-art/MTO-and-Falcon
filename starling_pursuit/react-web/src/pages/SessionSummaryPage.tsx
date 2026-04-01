import { useNavigate, useParams } from 'react-router-dom';
import { useController } from '../store/useController';
import { fmtDateTime, fmtDuration, fmtTime, behaviorLabel, desiredWeightLabel, outcomeLabel, wingbeatLabel, rewardSizeLabel, boundaryLabel } from '../utils/helpers';

export default function SessionSummaryPage() {
  const ctrl = useController();
  const navigate = useNavigate();
  const { sessionId } = useParams<{ sessionId: string }>();
  const session = ctrl.sessionById(sessionId!);
  const falcon = ctrl.falconById(session.falconId);
  const field = ctrl.fieldById(session.fieldId);
  const handler = ctrl.handlerById(session.handlerId);

  const flights = ctrl.completedFlights(session);
  const flyingMin = ctrl.flyingMinutes(session);
  const sittingMin = ctrl.sittingMinutes(session);
  const foodUsed = ctrl.foodUsedG(session);
  const foodRemaining = ctrl.foodRemainingG(session);
  const starlings = ctrl.totalStarlingCount(session);

  const catches = ctrl.pursuitOutcomeCount(session, 'kill');
  const chases = ctrl.pursuitOutcomeCount(session, 'chase');
  const ignores = ctrl.pursuitOutcomeCount(session, 'ignore');

  const insideCount = session.events.filter(e => e.type === 'starling' && e.boundaryClass === 'inside').length;
  const perimeterCount = session.events.filter(e => e.type === 'starling' && e.boundaryClass === 'perimeter').length;
  const outsideCount = session.events.filter(e => e.type === 'starling' && e.boundaryClass === 'outside').length;

  return (
    <div className="page">
      <div className="app-bar">
        <button onClick={() => navigate('/home')}>←</button>
        <h1>Session Summary</h1>
      </div>
      <div className="page-content" style={{ animation: 'fadeIn .4s ease-out' }}>
        {/* Header card */}
        <div className="card" style={{ background: 'var(--primary)', color: '#fff', border: 'none', padding: 20, marginBottom: 16, boxShadow: '0 8px 24px rgba(26,58,92,.2)' }}>
          <p style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em' }}>{falcon.name}</p>
          <p style={{ fontSize: 13, opacity: .8, marginTop: 2 }}>{field.name} &middot; {handler.name}</p>
          {session.localWeather.length > 0 && (
            <div className="flex-row flex-wrap gap-4 mt-8">
              {session.localWeather.map((w, i) => <span key={i} style={{ fontSize: 11, background: 'rgba(255,255,255,.15)', padding: '3px 10px', borderRadius: 'var(--radius-full)', fontWeight: 600 }}>{w}</span>)}
            </div>
          )}
          <div style={{ marginTop: 10, fontSize: 13, opacity: .85, lineHeight: 1.6 }}>
            <p>Start: {fmtDateTime(session.startAt)}</p>
            {session.endAt && <p>End: {fmtDateTime(session.endAt)}</p>}
            <p>Behavior: {behaviorLabel(session.preFlightBehavior)} &middot; Weight: {session.falconWeightG}g</p>
          </div>
        </div>

        {/* Metrics */}
        <div className="flex-row flex-wrap gap-6 mb-16">
          <div className="metric-box"><div><div className="metric-label">Food Used</div><div className="metric-value">{foodUsed.toFixed(1)}g</div></div></div>
          <div className="metric-box"><div><div className="metric-label">Food Left</div><div className="metric-value">{foodRemaining.toFixed(1)}g</div></div></div>
          <div className="metric-box"><div><div className="metric-label">Flights</div><div className="metric-value">{flights}</div></div></div>
          <div className="metric-box"><div><div className="metric-label">Flying</div><div className="metric-value">{fmtDuration(flyingMin)}</div></div></div>
          <div className="metric-box"><div><div className="metric-label">Sitting</div><div className="metric-value">{fmtDuration(sittingMin)}</div></div></div>
          <div className="metric-box"><div><div className="metric-label">Starlings</div><div className="metric-value">{starlings}</div></div></div>
        </div>

        {/* Pursuit outcomes */}
        <div className="card" style={{ padding: 20, marginBottom: 16 }}>
          <p className="section-title" style={{ marginBottom: 12 }}>Pursuit Outcomes</p>
          <div className="flex-row gap-16">
            <div style={{ textAlign: 'center' }}><span style={{ fontWeight: 900, fontSize: 28, color: 'var(--success)' }}>{catches}</span><br/><span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Catch</span></div>
            <div style={{ textAlign: 'center' }}><span style={{ fontWeight: 900, fontSize: 28, color: 'var(--accent)' }}>{chases}</span><br/><span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Chase</span></div>
            <div style={{ textAlign: 'center' }}><span style={{ fontWeight: 900, fontSize: 28, color: 'var(--gray-400)' }}>{ignores}</span><br/><span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Ignore</span></div>
          </div>
        </div>

        {/* Starling boundary */}
        <div className="card" style={{ padding: 20, marginBottom: 16 }}>
          <p className="section-title" style={{ marginBottom: 12 }}>Starling Boundary Classifications</p>
          <div className="flex-row gap-16">
            <div style={{ textAlign: 'center' }}><span style={{ fontWeight: 800, fontSize: 22 }}>{insideCount}</span><br/><span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Inside</span></div>
            <div style={{ textAlign: 'center' }}><span style={{ fontWeight: 800, fontSize: 22 }}>{perimeterCount}</span><br/><span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Perimeter</span></div>
            <div style={{ textAlign: 'center' }}><span style={{ fontWeight: 800, fontSize: 22 }}>{outsideCount}</span><br/><span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Outside</span></div>
          </div>
        </div>

        {/* Post-flight inputs */}
        {session.endAt && (
          <div className="card" style={{ padding: 20, marginBottom: 16 }}>
            <p className="section-title" style={{ marginBottom: 8 }}>Post-Flight Data</p>
            <div style={{ fontSize: 14, lineHeight: 1.9, color: 'var(--text)' }}>
              {session.maxAltitudeFt !== undefined && <p>Max altitude: <strong>{session.maxAltitudeFt} ft</strong></p>}
              {session.maxSpeedMph !== undefined && <p>Max speed: <strong>{session.maxSpeedMph} mph</strong></p>}
              {session.desiredWeight && <p>Desired weight: <strong>{desiredWeightLabel(session.desiredWeight)}</strong></p>}
              <p>Kept starlings out: <strong>{session.keptStarlingsOut ? 'Yes' : 'No'}</strong></p>
              <p>Starlings seen inside: <strong>{session.starlingsSeenInsideBoundary ? 'Yes' : 'No'}</strong></p>
              {session.voiceTranscript && <p style={{ marginTop: 8, fontStyle: 'italic', color: 'var(--text-secondary)', borderLeft: '3px solid var(--gray-300)', paddingLeft: 12 }}>"{session.voiceTranscript}"</p>}
            </div>
          </div>
        )}

        {/* Event timeline */}
        <div className="card" style={{ padding: 20 }}>
          <p className="section-title" style={{ marginBottom: 12 }}>Event Timeline</p>
          {session.events.length === 0 && <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No events recorded.</p>}
          {session.events.map(e => (
            <div key={e.id} style={{ fontSize: 13, padding: '8px 0', borderBottom: '1px solid var(--gray-100)', display: 'flex', gap: 8 }}>
              <span style={{ fontWeight: 700, color: 'var(--accent)', minWidth: 60, fontVariantNumeric: 'tabular-nums' }}>{fmtTime(e.at)}</span>
              <span>
                <span style={{ fontWeight: 600 }}>{e.type}</span>
                {e.type === 'reward' && <span style={{ color: 'var(--text-secondary)' }}> — {rewardSizeLabel(e.rewardSize!)} ({e.rewardG}g)</span>}
                {e.type === 'pursuit' && <span style={{ color: 'var(--text-secondary)' }}> — {wingbeatLabel(e.wingbeat!)} &middot; {outcomeLabel(e.outcome!)}</span>}
                {e.type === 'starling' && <span style={{ color: 'var(--text-secondary)' }}> — {e.starlingCount} starlings ({e.note || boundaryLabel(e.boundaryClass!)})</span>}
                {e.type === 'flyingStart' && e.note && <span style={{ color: 'var(--text-secondary)' }}> — {e.note}</span>}
                {e.type === 'alert' && e.note && <span style={{ color: 'var(--text-secondary)' }}> — {e.note}</span>}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
