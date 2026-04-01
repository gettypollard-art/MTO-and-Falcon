import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useController } from '../store/useController';
import { monthLabel, dayOfWeekShort, fmtHours } from '../utils/helpers';
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek, addMonths, eachDayOfInterval, format } from 'date-fns';

export default function FlightHoursPage() {
  const ctrl = useController();
  const navigate = useNavigate();
  const [view, setView] = useState<'weekly' | 'monthly'>('weekly');
  const [monthOffset, setMonthOffset] = useState(0);

  const sessions = ctrl.currentUserSessions;

  // Compute per-day flying hours map
  const dailyHours = useMemo(() => {
    const map: Record<string, number> = {};
    for (const s of sessions) {
      const day = format(new Date(s.startAt), 'yyyy-MM-dd');
      map[day] = (map[day] || 0) + ctrl.flyingMinutes(s) / 60;
    }
    return map;
  }, [sessions, ctrl]);

  const totalHours = Object.values(dailyHours).reduce((a, b) => a + b, 0);
  const daysFlown = Object.keys(dailyHours).length;

  const currentMonth = addMonths(new Date(), monthOffset);
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);

  // Monthly hours for the current month
  const monthHours = useMemo(() => {
    let t = 0;
    for (const [day, h] of Object.entries(dailyHours)) {
      const d = new Date(day);
      if (d >= monthStart && d <= monthEnd) t += h;
    }
    return t;
  }, [dailyHours, monthStart, monthEnd]);

  // Weekly view: 7 rows for the current week of the month
  const weekStart = startOfWeek(currentMonth, { weekStartsOn: 0 });
  const weekEnd = endOfWeek(currentMonth, { weekStartsOn: 0 });
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });

  // Monthly calendar
  const calStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  const calDays = eachDayOfInterval({ start: calStart, end: calEnd });

  function hoursForDay(d: Date): number {
    return dailyHours[format(d, 'yyyy-MM-dd')] || 0;
  }

  function heatColor(hours: number): string {
    if (hours <= 0) return '#f0f0f0';
    if (hours < 1) return '#C8E6C9';
    if (hours < 2) return '#81C784';
    if (hours < 3) return '#4CAF50';
    return '#2E7D32';
  }

  return (
    <div className="page">
      <div className="app-bar">
        <button onClick={() => navigate(-1)}>←</button>
        <h1>Flight Hours Summary</h1>
      </div>
      <div className="page-content" style={{ animation: 'fadeIn .4s ease-out' }}>
        {/* Summary chips */}
        <div className="flex-row flex-wrap gap-6 mb-12">
          <SummaryChip label="All-time" value={fmtHours(totalHours * 60)} />
          <SummaryChip label="Days flown" value={String(daysFlown)} />
          <SummaryChip label="This month" value={fmtHours(monthHours * 60)} />
        </div>

        {/* View toggle */}
        <div className="flex-row gap-4 mb-12" style={{ justifyContent: 'center' }}>
          <button className={`choice-chip ${view === 'weekly' ? 'active' : ''}`} onClick={() => setView('weekly')}>Weekly</button>
          <button className={`choice-chip ${view === 'monthly' ? 'active' : ''}`} onClick={() => setView('monthly')}>Monthly</button>
        </div>

        {/* Month navigation */}
        <div className="flex-row mb-8" style={{ justifyContent: 'center', gap: 16 }}>
          <button className="btn-outlined btn-sm" onClick={() => setMonthOffset(o => o - 1)}>◀</button>
          <span style={{ fontWeight: 700, fontSize: 15 }}>{monthLabel(currentMonth)}</span>
          <button className="btn-outlined btn-sm" onClick={() => setMonthOffset(o => o + 1)}>▶</button>
        </div>

        {view === 'weekly' && (
          <div className="flex-col gap-4">
            {weekDays.map((d, i) => {
              const h = hoursForDay(d);
              const maxH = 4;
              return (
                <div key={i} className="flex-row" style={{ gap: 8 }}>
                  <span style={{ fontWeight: 600, fontSize: 12, width: 36 }}>{dayOfWeekShort(d.getDay())}</span>
                  <div className="progress-bar flex-1">
                    <div className="fill" style={{ width: `${Math.min(100, (h / maxH) * 100)}%`, background: 'var(--success)' }} />
                  </div>
                  <span style={{ fontWeight: 700, fontSize: 12, width: 40, textAlign: 'right' }}>{h > 0 ? h.toFixed(1) + 'h' : ''}</span>
                </div>
              );
            })}
          </div>
        )}

        {view === 'monthly' && (
          <div>
            {/* Day headers */}
            <div className="calendar-grid mb-4">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                <div key={d} style={{ textAlign: 'center', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)' }}>{d}</div>
              ))}
            </div>
            <div className="calendar-grid">
              {calDays.map((d, i) => {
                const h = hoursForDay(d);
                const isCurrentMonth = d.getMonth() === currentMonth.getMonth();
                return (
                  <div key={i} className="calendar-cell" style={{
                    background: isCurrentMonth ? heatColor(h) : 'transparent',
                    opacity: isCurrentMonth ? 1 : 0.3,
                    color: h >= 3 ? '#fff' : 'inherit',
                  }}>
                    <span>{d.getDate()}</span>
                    {h > 0 && <span className="hours">{h.toFixed(1)}h</span>}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryChip({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: 'var(--success-bg)', border: '1px solid var(--success-border)', borderRadius: 999, padding: '6px 14px' }}>
      <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>{label}: </span>
      <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--success)' }}>{value}</span>
    </div>
  );
}
