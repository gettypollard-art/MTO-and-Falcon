import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useController } from '../store/useController';
import { fmtDuration } from '../utils/helpers';
import type { DesiredWeightTrend } from '../types/models';

export default function DoneFlyingPage() {
  const ctrl = useController();
  const navigate = useNavigate();
  const { sessionId } = useParams<{ sessionId: string }>();
  const session = ctrl.sessionById(sessionId!);
  const falcon = ctrl.falconById(session.falconId);

  const [maxAlt, setMaxAlt] = useState('');
  const [maxSpeed, setMaxSpeed] = useState('');
  const [desiredWeight, setDesiredWeight] = useState<DesiredWeightTrend | ''>('');
  const [keptOut, setKeptOut] = useState<boolean | null>(null);
  const [seenInside, setSeenInside] = useState<boolean | null>(null);
  const [narrative, setNarrative] = useState('');

  const flights = ctrl.completedFlights(session);
  const flyingMin = ctrl.flyingMinutes(session);
  const sittingMin = ctrl.sittingMinutes(session);
  const foodUsed = ctrl.foodUsedG(session);
  const starlings = ctrl.totalStarlingCount(session);

  function handleSave() {
    ctrl.endSession(sessionId!, {
      maxAltitudeFt: parseFloat(maxAlt) || 0,
      maxSpeedMph: parseFloat(maxSpeed) || 0,
      desiredWeight: (desiredWeight as DesiredWeightTrend) || 'same',
      keptStarlingsOut: keptOut ?? false,
      starlingsSeenInsideBoundary: seenInside ?? false,
      voiceTranscript: narrative,
    });
    navigate(`/session-summary/${sessionId}`);
  }

  function YesNo({ value, onChange }: { value: boolean | null; onChange: (v: boolean) => void }) {
    return (
      <div className="flex-row gap-6">
        <button className={`choice-chip ${value === true ? 'active' : ''}`} onClick={() => onChange(true)}>Yes</button>
        <button className={`choice-chip ${value === false ? 'active' : ''}`} onClick={() => onChange(false)}>No</button>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="app-bar">
        <button onClick={() => navigate(`/live-session/${sessionId}`)}>←</button>
        <h1>Done Flying — {falcon.name}</h1>
      </div>
      <div className="page-content" style={{ animation: 'fadeIn .4s ease-out' }}>
        {/* Session metrics summary */}
        <div className="card" style={{ background: 'var(--success-bg)', border: '1px solid var(--success-border)', marginBottom: 16 }}>
          <p style={{ fontWeight: 700, fontSize: 14, color: 'var(--success)', marginBottom: 6 }}>Session Metrics</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px', fontSize: 13 }}>
            <span>Flights: <strong>{flights}</strong></span>
            <span>Flying: <strong>{fmtDuration(flyingMin)}</strong></span>
            <span>Sitting: <strong>{fmtDuration(sittingMin)}</strong></span>
            <span>Food: <strong>{foodUsed.toFixed(1)}g</strong></span>
            <span>Starlings: <strong>{starlings}</strong></span>
          </div>
        </div>

        <div className="section-title">Remaining Tasks</div>
        <div className="card" style={{ marginBottom: 16 }}>
          <ol style={{ fontSize: 14, paddingLeft: 20, lineHeight: 2, color: 'var(--text)' }}>
            <li>Put falcon down on perch next to water dish</li>
            <li>Unhood falcon</li>
            <li>Remove transmitters, charge batteries</li>
            <li>Clean and prep equipment for next session</li>
            <li>Remove glove, spray down bird and crop area</li>
            <li>Refresh water dish</li>
            <li>Record post-flight data below</li>
          </ol>
        </div>

        {/* Post-flight inputs */}
        <div className="section-title">Post-Flight Data</div>
        <div className="card" style={{ padding: 20, marginBottom: 16 }}>
          <div className="flex-row mb-12" style={{ gap: 12, flexWrap: 'wrap' }}>
            <div className="flex-col gap-4" style={{ flex: 1, minWidth: 120 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Max Altitude (ft)</label>
              <input type="number" value={maxAlt} onChange={e => setMaxAlt(e.target.value)} placeholder="e.g. 500" />
            </div>
            <div className="flex-col gap-4" style={{ flex: 1, minWidth: 120 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Max Speed (mph)</label>
              <input type="number" value={maxSpeed} onChange={e => setMaxSpeed(e.target.value)} placeholder="e.g. 60" />
            </div>
          </div>

          <div className="mb-12">
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: 8 }}>Desired weight tomorrow</label>
            <div className="flex-row gap-8">
              {(['higher', 'same', 'lower'] as DesiredWeightTrend[]).map(d => (
                <button key={d} className={`choice-chip ${desiredWeight === d ? 'active' : ''}`} onClick={() => setDesiredWeight(d)}>
                  {d.charAt(0).toUpperCase() + d.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div className="divider" />

          <div className="flex-row mb-12" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <span style={{ fontSize: 13 }}>Kept starlings out for full session?</span>
            <YesNo value={keptOut} onChange={setKeptOut} />
          </div>
          <div className="flex-row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <span style={{ fontSize: 13 }}>Starlings seen inside boundary?</span>
            <YesNo value={seenInside} onChange={setSeenInside} />
          </div>
        </div>

        {/* Voice narrative */}
        <div className="card" style={{ padding: 20, marginBottom: 20 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: 8 }}>Flight Narrative</label>
          <textarea rows={4} value={narrative} onChange={e => setNarrative(e.target.value)}
            placeholder="Describe this session — weather, falcon behavior, notable events..." style={{ width: '100%' }} />
        </div>

        <button className="btn-filled btn-full" style={{ padding: 16, fontSize: 15 }} onClick={handleSave}>
          Save Session
        </button>
      </div>
    </div>
  );
}
