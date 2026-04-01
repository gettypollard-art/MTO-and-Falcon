import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useController } from '../store/useController';
import { fmtDate, fmtTime } from '../utils/helpers';

export default function AdminFalconLogsPage() {
  const ctrl = useController();
  const navigate = useNavigate();
  const handlers = ctrl.handlerUsers;

  return (
    <div className="page">
      <div className="app-bar">
        <button onClick={() => navigate(-1)}>←</button>
        <h1>Admin Falcon Logs</h1>
      </div>
      <div className="page-content" style={{ animation: 'fadeIn .4s ease-out' }}>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
          Individual Falcon Log (Spreadsheet View)
        </p>

        {handlers.map(h => (
          <HandlerSection key={h.id} handlerId={h.id} ctrl={ctrl} navigate={navigate} />
        ))}
      </div>
    </div>
  );
}

function HandlerSection({ handlerId, ctrl, navigate }: any) {
  const handler = ctrl.handlerById(handlerId);
  const falcons = ctrl.falconsForHandler(handlerId);
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="card mb-8">
      <div className="flex-row" style={{ justifyContent: 'space-between', cursor: 'pointer' }} onClick={() => setExpanded(!expanded)}>
        <span style={{ fontWeight: 800, fontSize: 15 }}>{handler.name}</span>
        <span style={{ fontSize: 14 }}>{expanded ? '▼' : '▶'}</span>
      </div>

      {expanded && (
        <div className="mt-8">
          {falcons.length === 0 && <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>No falcon data.</p>}
          {falcons.map((f: any) => {
            const sessions = ctrl.sessionsForFalcon(handlerId, f.id);
            return (
              <div key={f.id} style={{ marginBottom: 12 }}>
                <p style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>{f.name}</p>
                <div className="table-wrapper">
                  <table style={{ fontSize: 10, whiteSpace: 'nowrap' }}>
                    <thead>
                      <tr>
                        <th>Date</th><th>Start</th><th>End</th><th>Flights</th>
                        <th>Session</th><th>Flying</th><th>mph</th>
                        <th>Ate</th><th>Plan</th><th>Wt</th>
                        <th>Star</th><th>Cat</th><th>Chs</th><th>Ign</th>
                        <th>Alt</th><th style={{ minWidth: 160 }}>Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sessions.map((s: any) => (
                        <tr key={s.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/session-summary/${s.id}`)}>
                          <td>{fmtDate(s.startAt)}</td>
                          <td>{fmtTime(s.startAt)}</td>
                          <td>{s.endAt ? fmtTime(s.endAt) : '-'}</td>
                          <td>{ctrl.completedFlights(s)}</td>
                          <td>{(ctrl.sessionMinutes(s) / 60).toFixed(1)}</td>
                          <td>{(ctrl.flyingMinutes(s) / 60).toFixed(1)}</td>
                          <td>{s.maxSpeedMph ?? '-'}</td>
                          <td>{ctrl.foodUsedG(s).toFixed(0)}</td>
                          <td>{s.plannedFoodG}</td>
                          <td>{s.falconWeightG}</td>
                          <td>{ctrl.totalStarlingCount(s)}</td>
                          <td>{ctrl.pursuitOutcomeCount(s, 'kill')}</td>
                          <td>{ctrl.pursuitOutcomeCount(s, 'chase')}</td>
                          <td>{ctrl.pursuitOutcomeCount(s, 'ignore')}</td>
                          <td>{s.maxAltitudeFt ?? '-'}</td>
                          <td style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.voiceTranscript || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
