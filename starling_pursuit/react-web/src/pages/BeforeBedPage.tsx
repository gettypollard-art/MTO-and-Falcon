import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const ITEMS = [
  'Set two alarms for one hour before sunrise.',
  'Charge all telemetry batteries.',
  'Plug in iPhone and PocketLink.',
  'Thaw quail for tomorrow\'s flying sessions.',
  'Clean out quail feeding tray and bag.',
  'Make sure falcons have clean water and clean litter. Change water on even days.',
  'Fill up ATV with gas if tank is below 3/4.',
  'Go to bed by 8:15 p.m.',
];

export default function BeforeBedPage() {
  const navigate = useNavigate();
  const [checks, setChecks] = useState(ITEMS.map(() => false));

  const toggle = (i: number) => setChecks(prev => { const n = [...prev]; n[i] = !n[i]; return n; });
  const allChecked = checks.every(Boolean);

  // Sunrise info (approximate)
  const now = new Date();
  const sunriseHour = 6; // approximate
  const sunriseDate = new Date(now);
  sunriseDate.setDate(sunriseDate.getDate() + 1);
  sunriseDate.setHours(sunriseHour, 0, 0, 0);
  const alarm1 = new Date(sunriseDate.getTime() - 60 * 60 * 1000);
  const fmtAlarmTime = (d: Date) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

  return (
    <div className="page">
      <div className="app-bar">
        <button onClick={() => navigate('/home')}>←</button>
        <h1>Before Bed Checklist</h1>
      </div>
      <div className="page-content">
        <div className="card" style={{ background: 'var(--info-bg)', border: '1px solid var(--info-border)', marginBottom: 16 }}>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Complete each item before bed. Prompted nightly at 8:00 PM.
          </p>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
            Sunrise ~{sunriseHour}:00 AM &middot; Alarms: {fmtAlarmTime(alarm1)} and {fmtAlarmTime(new Date(alarm1.getTime() + 5 * 60000))}
          </p>
        </div>

        {/* Progress */}
        <div style={{ marginBottom: 16 }}>
          <div className="flex-row" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>Progress</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: allChecked ? 'var(--success)' : 'var(--text-secondary)' }}>{checks.filter(Boolean).length}/{ITEMS.length}</span>
          </div>
          <div className="progress-bar">
            <div className="fill" style={{ width: `${(checks.filter(Boolean).length / ITEMS.length) * 100}%`, background: allChecked ? 'var(--success)' : 'var(--accent)' }} />
          </div>
        </div>

        {ITEMS.map((item, i) => (
          <div key={i} className="card" onClick={() => toggle(i)} style={{ cursor: 'pointer', marginBottom: 8, borderLeft: checks[i] ? '3px solid var(--success)' : '3px solid var(--gray-200)', transition: 'all .2s' }}>
            <div className="checkbox-row">
              <input type="checkbox" checked={checks[i]} readOnly />
              <span style={{ fontSize: 14, color: checks[i] ? 'var(--text-muted)' : 'var(--text)', textDecoration: checks[i] ? 'line-through' : 'none', transition: 'all .2s' }}>{item}</span>
            </div>
          </div>
        ))}

        <button className="btn-filled btn-full mt-16" style={{ padding: 14, fontSize: 15 }} disabled={!allChecked}
          onClick={() => navigate('/home')}>
          Done
        </button>
      </div>
    </div>
  );
}
