import { useNavigate } from 'react-router-dom';

export default function StarlingWorkPatternPage() {
  const navigate = useNavigate();

  return (
    <div className="page">
      <div className="app-bar">
        <button onClick={() => navigate(-1)}>←</button>
        <h1>General Starling &amp; Work Pattern</h1>
      </div>
      <div className="page-content" style={{ animation: 'fadeIn .4s ease-out' }}>
        <Section title="Week 1–3" subtitle="High Effort Conditioning" body="Start with high effort conditioning. The goal is to fly as much as possible. Fly each falcon for 3-4 hours per day, starting at sunrise. Focus on building fitness, response times, and territory coverage. Expect starlings to test the falcon's presence early and often." />
        <div className="divider" />
        <Section title="Week 4–6" subtitle="Maintenance & Refinement" body="After 3 weeks of longer hours, switch to taking longer breaks. Falcon fitness should be established. Focus shifts to maintaining deterrence pressure and refining flight quality. Patrol without falcon during midday break to monitor activity." />
        <div className="divider" />
        <Section title="Week 7–12" subtitle="Sustained Presence" body="Bird pressure usually drops. Continue patrols around perimeter. Keep consistent presence to prevent starlings from re-establishing roost patterns. Adjust schedule based on activity levels – if bird pressure is low, shorter flying windows may be sufficient." />
      </div>
    </div>
  );
}

function Section({ title, subtitle, body }: { title: string; subtitle: string; body: string }) {
  return (
    <div className="card" style={{ padding: 20, marginBottom: 16 }}>
      <p style={{ fontWeight: 800, fontSize: 16, color: 'var(--primary)', marginBottom: 2 }}>{title}</p>
      <p style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>{subtitle}</p>
      <p style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--text-secondary)' }}>{body}</p>
    </div>
  );
}
