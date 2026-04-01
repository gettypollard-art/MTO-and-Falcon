import { useNavigate } from 'react-router-dom';

const ROWS = [
  ['Hood Off: Flying Start Time', 'Sunrise', ''],
  ['FS Break', '2 hours after sunrise', '30 minutes'],
  ['Hood On: Flying End Time', '4 hours after sunrise', ''],
  ['Extra break window if bird pressure is low', '11 AM - 2 PM', ''],
  ['Mid day Break', '', 'Eat, nap, walk 20 minutes, stretch'],
  ['ATV patrol', '2 PM - 3 PM', ''],
  ['#2 Falcon: Start preparing second falcon', '3 PM', ''],
  ['Hood Off: Flying Start Time', '3:30 PM', ''],
  ['FS Break', '5 PM - 5:30 PM', ''],
  ['Hood On: Flying End Time', 'End by 7 PM', ''],
  ['Late patrol (if needed)', '', 'Patrol without falcon to make sure starlings are not coming in late evening'],
];

export default function DailySchedulePage() {
  const navigate = useNavigate();

  return (
    <div className="page">
      <div className="app-bar">
        <button onClick={() => navigate(-1)}>←</button>
        <h1>Daily Schedule</h1>
      </div>
      <div className="page-content" style={{ animation: 'fadeIn .4s ease-out' }}>
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr><th>Task</th><th>Time</th><th>Notes</th></tr>
              </thead>
              <tbody>
                {ROWS.map((r, i) => (
                  <tr key={i}><td style={{ fontWeight: 600, fontSize: 13 }}>{r[0]}</td><td style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{r[1]}</td><td style={{ fontSize: 13, color: 'var(--text-muted)' }}>{r[2]}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
