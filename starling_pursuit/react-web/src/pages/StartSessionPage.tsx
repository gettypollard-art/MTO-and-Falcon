import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useController } from '../store/useController';
import type { FalconBehavior } from '../types/models';

const STEPS = [
  'Select Falcon',
  "Falcon's behavior",
  'Hood falcon',
  'Weigh falcon',
  'Attach transmitters',
  'Remove Jesses/leash',
  'Head out door',
];

export default function StartSessionPage() {
  const ctrl = useController();
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state || {}) as { quailGrams?: number; smallTidbitG?: number; largeTidbitG?: number; pickupPieceG?: number; telemetryWorking?: boolean };

  const [step, setStep] = useState(0);
  const [falconId, setFalconId] = useState('');
  const [behavior, setBehavior] = useState<FalconBehavior | ''>('');
  const [weight, setWeight] = useState('');
  const [fieldId, setFieldId] = useState(ctrl.fields[0]?.id || '');

  const falcons = ctrl.falcons;

  function handleLaunch() {
    if (!falconId || !behavior || !weight || !fieldId) return;
    const session = ctrl.startSession({
      falconId,
      fieldId,
      behavior: behavior as FalconBehavior,
      falconWeightG: parseFloat(weight),
      plannedFoodG: state.quailGrams || 0,
      telemetryWorking: state.telemetryWorking ?? true,
      smallTidbitG: state.smallTidbitG,
      largeTidbitG: state.largeTidbitG,
      pickupPieceG: state.pickupPieceG,
    });
    navigate(`/local-weather-session`, { state: { sessionId: session.id } });
  }

  const progressPct = Math.round(((step + 1) / STEPS.length) * 100);

  return (
    <div className="page">
      <div className="app-bar">
        <button onClick={() => navigate('/ready-to-fly')}>←</button>
        <h1>Approach Falcon</h1>
      </div>
      <div className="page-content" style={{ animation: 'fadeIn .4s ease-out' }}>
        {/* Progress bar */}
        <div style={{ marginBottom: 20 }}>
          <div className="flex-row" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>Step {step + 1} of {STEPS.length}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)' }}>{progressPct}%</span>
          </div>
          <div className="progress-bar">
            <div className="fill" style={{ width: `${progressPct}%`, background: 'var(--accent)' }} />
          </div>
        </div>

        <div className="card" style={{ padding: 20, marginBottom: 16 }}>
          <p style={{ fontWeight: 800, fontSize: 18, marginBottom: 16, color: 'var(--primary)' }}>
            {step + 1}. {STEPS[step]}
          </p>

          {/* Step 0: Select falcon */}
          {step === 0 && (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 10 }}>
                {falcons.map(f => {
                  const hrs = ctrl.hoursSinceFalconLastFed(f.id);
                  const selected = falconId === f.id;
                  return (
                    <div key={f.id}
                      onClick={() => setFalconId(f.id)}
                      className="card-clickable"
                      style={{
                        borderRadius: 'var(--radius-md)', padding: 14,
                        border: `2px solid ${selected ? 'var(--primary)' : 'var(--gray-200)'}`,
                        background: selected ? 'var(--primary-light)' : 'var(--surface)',
                        cursor: 'pointer', textAlign: 'center',
                        boxShadow: selected ? '0 4px 12px rgba(26,58,92,.15)' : 'var(--shadow-xs)',
                        transition: 'all .2s var(--ease)',
                      }}>
                      <div style={{ fontSize: 32, marginBottom: 6 }}>🦅</div>
                      <p style={{ fontWeight: 700, fontSize: 14 }}>{f.name}</p>
                      <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{f.tag}</p>
                      {hrs !== null && <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>Fed {hrs.toFixed(1)}h ago</p>}
                    </div>
                  );
                })}
              </div>
              <div className="mt-16">
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: 6 }}>Field</label>
                <select value={fieldId} onChange={e => setFieldId(e.target.value)} style={{ width: '100%' }}>
                  {ctrl.fields.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </div>
            </div>
          )}

          {/* Step 1: Behavior */}
          {step === 1 && (
            <div className="flex-col gap-8">
              {(['perch', 'baitAway', 'baitToward'] as FalconBehavior[]).map(b => (
                <button key={b}
                  className={behavior === b ? 'btn-filled btn-full' : 'btn-outlined btn-full'}
                  style={{ padding: 14 }}
                  onClick={() => setBehavior(b)}>
                  {b === 'perch' ? 'Sitting on Perch' : b === 'baitAway' ? 'Baiting Away from Handler' : 'Bait Towards Handler'}
                </button>
              ))}
            </div>
          )}

          {/* Step 2-5: Simple confirm steps */}
          {step >= 2 && step <= 5 && step !== 3 && (
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 }}>Complete this step, then press Next.</p>
          )}

          {/* Step 3: Weigh falcon */}
          {step === 3 && (
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: 8 }}>Falcon weight (grams)</label>
              <input type="number" inputMode="decimal" placeholder="e.g. 850" value={weight} onChange={e => setWeight(e.target.value)} style={{ width: 140, padding: 12, fontSize: 16 }} />
            </div>
          )}

          {/* Step 6: Head out */}
          {step === 6 && (
            <div>
              <p style={{ fontSize: 15, color: 'var(--text-secondary)', marginBottom: 20, lineHeight: 1.6 }}>Time to head to the field!</p>
              <button className="btn-filled btn-full btn-icon" style={{ padding: 16, fontSize: 16 }}
                disabled={!falconId || !behavior || !weight}
                onClick={handleLaunch}>
                🦅 Start Flying Session
              </button>
            </div>
          )}
        </div>

        {/* Navigation */}
        {step < 6 && (
          <div className="flex-row" style={{ justifyContent: 'space-between' }}>
            <button className="btn-ghost" disabled={step === 0} onClick={() => setStep(s => s - 1)}>← Back</button>
            <button className="btn-filled"
              disabled={(step === 0 && !falconId) || (step === 1 && !behavior) || (step === 3 && !weight)}
              onClick={() => setStep(s => s + 1)}>
              Next →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
