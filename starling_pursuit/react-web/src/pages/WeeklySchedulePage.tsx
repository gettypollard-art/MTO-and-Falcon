import { useNavigate } from 'react-router-dom';

const ROWS = [
  ['MON', 'Work day', 'Fly - evening exercise'],
  ['TUE', 'Work day', 'Fly - evening exercise'],
  ['WED', 'Work day', 'Fly - evening exercise'],
  ['THU', 'Work day', 'Fly - evening exercise'],
  ['FRI', 'Work day', 'Fly - evening exercise'],
  ['SAT', 'Work day', 'Fly - laundry, grocery shop'],
  ['SUN', 'Day off if starling pressure is low', 'Sleep in, naps, clean/reorganize; feed falcons AM and PM on fist'],
];

export default function WeeklySchedulePage() {
  const navigate = useNavigate();

  return (
    <div className="page">
      <div className="app-bar">
        <button onClick={() => navigate(-1)}>←</button>
        <h1>Weekly Work Schedule</h1>
      </div>
      <div className="page-content" style={{ animation: 'fadeIn .4s ease-out' }}>
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr><th>Day</th><th>Work</th><th>Plan</th></tr>
              </thead>
              <tbody>
                {ROWS.map((r, i) => (
                  <tr key={i} style={r[0] === 'SUN' ? { background: 'var(--info-bg)' } : undefined}><td style={{ fontWeight: 700, fontSize: 13 }}>{r[0]}</td><td style={{ fontSize: 13 }}>{r[1]}</td><td style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{r[2]}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
