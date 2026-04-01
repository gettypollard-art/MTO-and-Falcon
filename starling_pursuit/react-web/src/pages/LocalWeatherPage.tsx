import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { windDirectionLabel } from '../utils/helpers';

interface WeatherData {
  temperature: number;
  windSpeed: number;
  windDirection: number;
  rainChance: number;
  cloudy: boolean;
  rainy: boolean;
  fogPercent: number;
  aqi: number | null;
  daily?: { date: string; tempMax: number; tempMin: number; rainChance: number }[];
}

export default function LocalWeatherPage() {
  const navigate = useNavigate();
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchWeather();
  }, []);

  async function fetchWeather() {
    setLoading(true);
    setError('');
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 });
      });
      const { latitude, longitude } = pos.coords;

      const [wxRes, aqRes] = await Promise.all([
        fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,wind_speed_10m,wind_direction_10m,rain,cloud_cover,visibility&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&temperature_unit=fahrenheit&wind_speed_unit=mph&forecast_days=7`),
        fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${latitude}&longitude=${longitude}&current=us_aqi`),
      ]);

      const wx = await wxRes.json();
      const aq = await aqRes.json();
      const c = wx.current;
      const d = wx.daily;

      setWeather({
        temperature: c.temperature_2m,
        windSpeed: c.wind_speed_10m,
        windDirection: c.wind_direction_10m,
        rainChance: d?.precipitation_probability_max?.[0] ?? 0,
        cloudy: c.cloud_cover > 50,
        rainy: c.rain > 0,
        fogPercent: c.visibility < 5000 ? Math.round((1 - c.visibility / 5000) * 100) : 0,
        aqi: aq.current?.us_aqi ?? null,
        daily: d?.time?.map((_: string, i: number) => ({
          date: d.time[i],
          tempMax: d.temperature_2m_max[i],
          tempMin: d.temperature_2m_min[i],
          rainChance: d.precipitation_probability_max[i],
        })),
      });
    } catch {
      setError('Could not load weather. Check location permissions.');
    }
    setLoading(false);
  }

  return (
    <div className="page">
      <div className="app-bar">
        <button onClick={() => navigate(-1)}>←</button>
        <h1>Local Weather</h1>
      </div>
      <div className="page-content">
        {loading && <p style={{ textAlign: 'center', padding: 40, fontSize: 14 }}>Loading weather...</p>}
        {error && <p className="text-error" style={{ padding: 20, textAlign: 'center' }}>{error}</p>}
        {weather && (
          <>
            <div className="card" style={{ padding: 20, marginBottom: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <WxRow label="Temperature" value={`${weather.temperature.toFixed(0)}°F`} />
                <WxRow label="Wind" value={`${weather.windSpeed.toFixed(0)} mph ${windDirectionLabel(weather.windDirection)}`} />
                <WxRow label="Rain Chance" value={`${weather.rainChance}%`} />
                <WxRow label="Cloudy" value={weather.cloudy ? 'Yes' : 'No'} />
                <WxRow label="Rainy" value={weather.rainy ? 'Yes' : 'No'} />
                <WxRow label="Fog" value={`${weather.fogPercent}%`} />
                <WxRow label="AQI" value={weather.aqi !== null ? String(weather.aqi) : 'N/A'} />
              </div>

              {weather.temperature > 90 && (
                <div className="heat-warning mt-12 text-center" style={{ width: '100%' }}>
                  ⚠ HIGH HEAT WARNING ⚠
                </div>
              )}
            </div>

            {/* 7-day forecast */}
            {weather.daily && weather.daily.length > 0 && (
              <div>
                <div className="section-title">7-Day Forecast</div>
                {weather.daily.map((d, i) => (
                  <div key={i} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px' }}>
                    <span style={{ fontWeight: 600, fontSize: 13, minWidth: 90 }}>{new Date(d.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>{d.tempMin.toFixed(0)}° – {d.tempMax.toFixed(0)}°F</span>
                    <span style={{ fontSize: 12, color: d.rainChance > 30 ? 'var(--accent)' : 'var(--text-muted)', fontWeight: 600 }}>🌧 {d.rainChance}%</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function WxRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2 }}>{label}</p>
      <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>{value}</p>
    </div>
  );
}
