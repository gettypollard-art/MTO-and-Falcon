import { useNavigate } from 'react-router-dom';
import { useController } from '../store/useController';
import { fmtDuration } from '../utils/helpers';

export default function HandlerMetricsPage() {
  const ctrl = useController();
  const navigate = useNavigate();

  const sessions = ctrl.currentUserSessions;
  const totalFlyingMin = sessions.reduce((sum, s) => sum + ctrl.flyingMinutes(s), 0);
  const totalPatrolMin = ctrl.totalPatrolMinutes();

  return (
    <div className="page">
      <div className="app-bar">
        <button onClick={() => navigate(-1)}>←</button>
        <h1>Falcon Handler Metrics</h1>
      </div>
      <div className="page-content" style={{ animation: 'fadeIn .4s ease-out' }}>
        <div className="section-title" style={{ fontSize: 18 }}>Handler Metrics</div>

        <div className="card" style={{ padding: 20, marginBottom: 12, background: 'var(--success-bg)', border: '1px solid var(--success-border)' }}>
          <p style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-secondary)' }}>Total Flight Hours</p>
          <p style={{ fontSize: 32, fontWeight: 900, color: 'var(--success)', fontVariantNumeric: 'tabular-nums' }}>{(totalFlyingMin / 60).toFixed(1)}h</p>
          <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>{sessions.length} sessions · {fmtDuration(totalFlyingMin)} flying</p>
        </div>

        <div className="card" style={{ padding: 20, marginBottom: 16, background: 'var(--info-bg)', border: '1px solid var(--info-border)' }}>
          <p style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-secondary)' }}>Patrol Without Falcon Hours</p>
          <p style={{ fontSize: 32, fontWeight: 900, color: 'var(--primary)', fontVariantNumeric: 'tabular-nums' }}>{(totalPatrolMin / 60).toFixed(1)}h</p>
          <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>{ctrl.currentUserPatrolEntries.length} patrols · {fmtDuration(totalPatrolMin)}</p>
        </div>

        <button className="btn-outlined btn-icon btn-full" style={{ padding: 14 }} onClick={() => navigate('/flight-hours')}>
          📊 Open Flight Hours Detail
        </button>
      </div>
    </div>
  );
}
