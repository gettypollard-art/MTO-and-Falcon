import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useController } from '../store/useController';
import { monthLabel, dayOfWeekShort, fmtHours } from '../utils/helpers';
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek, addMonths, eachDayOfInterval, format } from 'date-fns';

export default function PatrolSummaryPage() {
  const ctrl = useController();
  const navigate = useNavigate();
  const [view, setView] = useState<'weekly' | 'monthly'>('weekly');
  const [monthOffset, setMonthOffset] = useState(0);

  const patrols = ctrl.currentUserPatrolEntries;

  const dailyHours = useMemo(() => {
    const map: Record<string, number> = {};
    for (const p of patrols) {
      const day = format(new Date(p.startAt), 'yyyy-MM-dd');
      const end = p.endAt ? new Date(p.endAt) : new Date();
      const mins = (end.getTime() - new Date(p.startAt).getTime()) / 60000;
      map[day] = (map[day] || 0) + mins / 60;
    }
    return map;
  }, [patrols]);

  const totalHours = Object.values(dailyHours).reduce((a, b) => a + b, 0);
  const daysPatrolled = Object.keys(dailyHours).length;

  const currentMonth = addMonths(new Date(), monthOffset);
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);

  const monthHours = useMemo(() => {
    let t = 0;
    for (const [day, h] of Object.entries(dailyHours)) {
      const d = new Date(day);
      if (d >= monthStart && d <= monthEnd) t += h;
    }
    return t;
  }, [dailyHours, monthStart, monthEnd]);

  const weekStart = startOfWeek(currentMonth, { weekStartsOn: 0 });
  const weekEnd = endOfWeek(currentMonth, { weekStartsOn: 0 });
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });

  const calStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  const calDays = eachDayOfInterval({ start: calStart, end: calEnd });

  function hoursForDay(d: Date): number {
    return dailyHours[format(d, 'yyyy-MM-dd')] || 0;
  }

  function heatColor(hours: number): string {
    if (hours <= 0) return '#f0f0f0';
    if (hours < 0.5) return '#BBDEFB';
    if (hours < 1) return '#64B5F6';
    if (hours < 2) return '#1E88E5';
    return '#0D47A1';
  }

  return (
    <div className="page">
      <div className="app-bar">
        <button onClick={() => navigate(-1)}>←</button>
        <h1>Patrol Without Falcon Summary</h1>
      </div>
      <div className="page-content" style={{ animation: 'fadeIn .4s ease-out' }}>
        <div className="flex-row flex-wrap gap-6 mb-12">
          <SummaryChip label="All-time" value={fmtHours(totalHours * 60)} />
          <SummaryChip label="Days" value={String(daysPatrolled)} />
          <SummaryChip label="This month" value={fmtHours(monthHours * 60)} />
        </div>

        <div className="flex-row gap-4 mb-12" style={{ justifyContent: 'center' }}>
          <button className={`choice-chip ${view === 'weekly' ? 'active' : ''}`} onClick={() => setView('weekly')}>Weekly</button>
          <button className={`choice-chip ${view === 'monthly' ? 'active' : ''}`} onClick={() => setView('monthly')}>Monthly</button>
        </div>

        <div className="flex-row mb-8" style={{ justifyContent: 'center', gap: 16 }}>
          <button className="btn-outlined btn-sm" onClick={() => setMonthOffset(o => o - 1)}>◀</button>
          <span style={{ fontWeight: 700, fontSize: 15 }}>{monthLabel(currentMonth)}</span>
          <button className="btn-outlined btn-sm" onClick={() => setMonthOffset(o => o + 1)}>▶</button>
        </div>

        {view === 'weekly' && (
          <div className="flex-col gap-4">
            {weekDays.map((d, i) => {
              const h = hoursForDay(d);
              return (
                <div key={i} className="flex-row" style={{ gap: 8 }}>
                  <span style={{ fontWeight: 600, fontSize: 12, width: 36 }}>{dayOfWeekShort(d.getDay())}</span>
                  <div className="progress-bar flex-1">
                    <div className="fill" style={{ width: `${Math.min(100, (h / 4) * 100)}%`, background: 'var(--primary)' }} />
                  </div>
                  <span style={{ fontWeight: 700, fontSize: 12, width: 40, textAlign: 'right' }}>{h > 0 ? h.toFixed(1) + 'h' : ''}</span>
                </div>
              );
            })}
          </div>
        )}

        {view === 'monthly' && (
          <div>
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
                    color: h >= 2 ? '#fff' : 'inherit',
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
    <div style={{ background: 'var(--info-bg)', border: '1px solid var(--info-border)', borderRadius: 999, padding: '6px 14px' }}>
      <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>{label}: </span>
      <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--primary)' }}>{value}</span>
    </div>
  );
}
