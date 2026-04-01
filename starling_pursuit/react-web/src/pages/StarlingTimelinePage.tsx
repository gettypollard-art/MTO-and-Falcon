import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useController } from '../store/useController';

export default function StarlingTimelinePage() {
  const ctrl = useController();
  const navigate = useNavigate();
  const [dayRange, setDayRange] = useState(5);

  const sessions = ctrl.currentUserSessions;

  // Build hourly buckets from 4 AM to 8 PM for last N days
  const buckets = useMemo(() => {
    const now = new Date();
    const cutoff = new Date(now.getTime() - dayRange * 24 * 60 * 60 * 1000);
    const hours: { hour: number; taps: number; birds: number }[] = [];

    for (let h = 4; h <= 20; h++) {
      let taps = 0;
      let birds = 0;
      for (const s of sessions) {
        for (const e of s.events) {
          if (e.type !== 'starling') continue;
          const d = new Date(e.at);
          if (d < cutoff) continue;
          if (d.getHours() === h) {
            taps++;
            birds += e.starlingCount ?? 0;
          }
        }
      }
      hours.push({ hour: h, taps, birds });
    }
    return hours;
  }, [sessions, dayRange]);

  const maxTaps = Math.max(1, ...buckets.map(b => b.taps));

  function hourLabel(h: number): string {
    if (h === 0 || h === 12) return h === 0 ? '12 a' : '12 p';
    return h < 12 ? `${h} a` : `${h - 12} p`;
  }

  return (
    <div className="page">
      <div className="app-bar">
        <button onClick={() => navigate(-1)}>←</button>
        <h1>Starling Activity Timeline</h1>
      </div>
      <div className="page-content" style={{ animation: 'fadeIn .4s ease-out' }}>
        {/* Range selector */}
        <div className="flex-row gap-6 mb-16" style={{ justifyContent: 'center' }}>
          {[5, 10, 15].map(n => (
            <button key={n} className={`choice-chip ${dayRange === n ? 'active' : ''}`} onClick={() => setDayRange(n)}>
              Last {n} Days
            </button>
          ))}
        </div>

        {/* Hourly bars */}
        <div className="flex-col gap-4">
          {buckets.map(b => (
            <div key={b.hour} className="flex-row" style={{ gap: 8 }}>
              <span style={{ fontWeight: 600, fontSize: 11, width: 32, textAlign: 'right' }}>{hourLabel(b.hour)}</span>
              <div className="progress-bar flex-1">
                <div className="fill" style={{ width: `${(b.taps / maxTaps) * 100}%`, background: 'var(--primary)' }} />
              </div>
              <span style={{ fontSize: 11, fontWeight: 600, width: 80, textAlign: 'right' }}>
                {b.taps > 0 ? `${b.taps} · ${b.birds}` : ''}
              </span>
            </div>
          ))}
        </div>

        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 16, textAlign: 'center' }}>
          Format: Taps · Total Birds
        </p>
      </div>
    </div>
  );
}
