import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { windDirectionLabel } from '../utils/helpers';

export default function LocalWeatherSessionPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { sessionId } = (location.state || {}) as { sessionId?: string };
  const [tags, setTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 })
        );
        const { latitude, longitude } = pos.coords;
        const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,wind_speed_10m,wind_direction_10m,rain,cloud_cover&timezone=auto&temperature_unit=fahrenheit&wind_speed_unit=mph`);
        const wx = await res.json();
        const c = wx.current;
        const t: string[] = [];
        t.push(`${c.temperature_2m.toFixed(0)}°F`);
        t.push(`Wind ${c.wind_speed_10m.toFixed(0)} mph ${windDirectionLabel(c.wind_direction_10m)}`);
        if (c.cloud_cover > 50) t.push('Cloudy');
        if (c.rain > 0) t.push('Rainy');
        if (c.temperature_2m > 90) t.push('HIGH HEAT');
        setTags(t);
      } catch {
        setTags(['Weather unavailable']);
      }
      setLoading(false);
    })();
  }, []);

  return (
    <div className="page">
      <div className="app-bar">
        <button onClick={() => navigate(-1)}>←</button>
        <h1>Local Weather</h1>
      </div>
      <div className="page-content" style={{ animation: 'fadeIn .4s ease-out', textAlign: 'center', paddingTop: 32 }}>
        {loading ? (
          <p style={{ color: 'var(--text-muted)' }}>Loading weather…</p>
        ) : (
          <>
            <div className="card" style={{ padding: 24, marginBottom: 20 }}>
              <div className="flex-row flex-wrap gap-8" style={{ justifyContent: 'center' }}>
                {tags.map((t, i) => (
                  <span key={i} className="choice-chip active" style={{ fontSize: 14, padding: '6px 16px' }}>{t}</span>
                ))}
              </div>
            </div>
            <button className="btn-filled btn-full" style={{ padding: 16, fontSize: 15 }} onClick={() => navigate(`/live-session/${sessionId}`, { state: { weatherTags: tags } })}>
              Continue to Session →
            </button>
          </>
        )}
      </div>
    </div>
  );
}
