import { useNavigate, useParams } from 'react-router-dom';
import { useController } from '../store/useController';
import { fmtDate, fmtTime } from '../utils/helpers';

export default function AdminSpreadsheetPage() {
  const ctrl = useController();
  const navigate = useNavigate();
  const { handlerId, falconId } = useParams<{ handlerId: string; falconId: string }>();
  const handler = ctrl.handlerById(handlerId!);
  const falcon = ctrl.falconById(falconId!);
  const sessions = ctrl.sessionsForFalcon(handlerId!, falconId!);

  function exportCsv() {
    const headers = ['Date', 'Start', 'End', '# Flights', 'Session (h)', 'Flying (h)', 'Max mph', 'Feed Ate (g)', 'Feed Plan (g)', 'Weight (g)', 'Starlings', 'Catch', 'Chase', 'Ignore', 'Max Alt (ft)', 'Voice Notes'];
    const rows = sessions.map(s => {
      const sessionH = ctrl.sessionMinutes(s) / 60;
      const flyingH = ctrl.flyingMinutes(s) / 60;
      return [
        fmtDate(s.startAt),
        fmtTime(s.startAt),
        s.endAt ? fmtTime(s.endAt) : '-',
        ctrl.completedFlights(s),
        sessionH.toFixed(2),
        flyingH.toFixed(2),
        s.maxSpeedMph ?? '',
        ctrl.foodUsedG(s).toFixed(1),
        s.plannedFoodG,
        s.falconWeightG,
        ctrl.totalStarlingCount(s),
        ctrl.pursuitOutcomeCount(s, 'kill'),
        ctrl.pursuitOutcomeCount(s, 'chase'),
        ctrl.pursuitOutcomeCount(s, 'ignore'),
        s.maxAltitudeFt ?? '',
        (s.voiceTranscript || '').replace(/"/g, '""'),
      ];
    });

    const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${v}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${handler.name}_${falcon.name}_sessions.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="page">
      <div className="app-bar">
        <button onClick={() => navigate(-1)}>←</button>
        <h1>{handler.name} · {falcon.name}</h1>
        <div className="actions">
          <button onClick={exportCsv} title="Export CSV">⬇</button>
        </div>
      </div>
      <div className="page-content" style={{ animation: 'fadeIn .4s ease-out' }}>
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="table-wrapper">
          <table style={{ fontSize: 11, whiteSpace: 'nowrap' }}>
            <thead>
              <tr>
                <th>Date</th><th>Start</th><th>End</th><th># Flights</th>
                <th>Session (h)</th><th>Flying (h)</th><th>Max mph</th>
                <th>Feed Ate</th><th>Feed Plan</th><th>Weight</th>
                <th>Starlings</th><th>Catch</th><th>Chase</th><th>Ignore</th>
                <th>Max Alt</th><th style={{ minWidth: 240 }}>Voice Notes</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map(s => (
                <tr key={s.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/session-summary/${s.id}`)}>
                  <td>{fmtDate(s.startAt)}</td>
                  <td>{fmtTime(s.startAt)}</td>
                  <td>{s.endAt ? fmtTime(s.endAt) : '-'}</td>
                  <td>{ctrl.completedFlights(s)}</td>
                  <td>{(ctrl.sessionMinutes(s) / 60).toFixed(2)}</td>
                  <td>{(ctrl.flyingMinutes(s) / 60).toFixed(2)}</td>
                  <td>{s.maxSpeedMph ?? '-'}</td>
                  <td>{ctrl.foodUsedG(s).toFixed(1)}g</td>
                  <td>{s.plannedFoodG}g</td>
                  <td>{s.falconWeightG}g</td>
                  <td>{ctrl.totalStarlingCount(s)}</td>
                  <td>{ctrl.pursuitOutcomeCount(s, 'kill')}</td>
                  <td>{ctrl.pursuitOutcomeCount(s, 'chase')}</td>
                  <td>{ctrl.pursuitOutcomeCount(s, 'ignore')}</td>
                  <td>{s.maxAltitudeFt ?? '-'}</td>
                  <td style={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.voiceTranscript || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
        {sessions.length === 0 && <p style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)' }}>No sessions recorded.</p>}
      </div>
    </div>
  );
}
