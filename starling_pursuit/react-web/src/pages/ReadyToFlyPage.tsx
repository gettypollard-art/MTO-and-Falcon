import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useController } from '../store/useController';

export default function ReadyToFlyPage() {
  const ctrl = useController();
  const navigate = useNavigate();
  const settings = ctrl.settings;

  const [checks, setChecks] = useState([false, false, false, false]);
  const [pocketLink, setPocketLink] = useState<boolean | null>(null);
  const [tx1, setTx1] = useState<boolean | null>(null);
  const [tx2, setTx2] = useState<boolean | null>(null);
  const [quailGrams, setQuailGrams] = useState('');
  const [smallTidbitG, setSmallTidbitG] = useState(String(settings.rewardSmallG));
  const [smallTidbitQty, setSmallTidbitQty] = useState('');
  const [largeTidbitG, setLargeTidbitG] = useState(String(settings.rewardLargeG));
  const [largeTidbitQty, setLargeTidbitQty] = useState('');

  const totalQuail = parseFloat(quailGrams) || 0;
  const smallTotal = (parseFloat(smallTidbitG) || 0) * (parseInt(smallTidbitQty) || 0);
  const largeTotal = (parseFloat(largeTidbitG) || 0) * (parseInt(largeTidbitQty) || 0);
  const pickupPieceG = Math.max(0, totalQuail - smallTotal - largeTotal);

  const toggle = (i: number) => setChecks(prev => { const n = [...prev]; n[i] = !n[i]; return n; });

  const allChecked = checks.every(Boolean) && pocketLink !== null && tx1 !== null && tx2 !== null && totalQuail > 0;

  function YesNo({ value, onChange }: { value: boolean | null; onChange: (v: boolean) => void }) {
    return (
      <div className="flex-row gap-6">
        <button className={`choice-chip ${value === true ? 'active' : ''}`} onClick={() => onChange(true)}>Yes</button>
        <button className={`choice-chip ${value === false ? 'active' : ''}`} onClick={() => onChange(false)}>No</button>
      </div>
    );
  }

  const falcons = ctrl.falcons;
  const completedCount = checks.filter(Boolean).length + (pocketLink !== null ? 1 : 0) + (tx1 !== null ? 1 : 0) + (tx2 !== null ? 1 : 0) + (totalQuail > 0 ? 1 : 0);
  const totalItems = 8;
  const progressPct = Math.round((completedCount / totalItems) * 100);

  return (
    <div className="page">
      <div className="app-bar">
        <button onClick={() => navigate('/home')}>←</button>
        <h1>Ready to Fly Checklist</h1>
      </div>
      <div className="page-content" style={{ animation: 'fadeIn .4s ease-out' }}>
        {/* Progress indicator */}
        <div style={{ marginBottom: 20 }}>
          <div className="flex-row" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>Progress</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: progressPct === 100 ? 'var(--success)' : 'var(--text-secondary)' }}>{progressPct}%</span>
          </div>
          <div className="progress-bar">
            <div className="fill" style={{ width: `${progressPct}%`, background: progressPct === 100 ? 'var(--success)' : 'var(--accent)' }} />
          </div>
        </div>

        {/* Item 1: ATV */}
        <div className="card" style={{ marginBottom: 10 }}>
          <div className="checkbox-row" onClick={() => toggle(0)} style={{ cursor: 'pointer' }}>
            <input type="checkbox" checked={checks[0]} readOnly />
            <div>
              <p style={{ fontWeight: 700, fontSize: 14 }}>ATV</p>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Tire pressure. Gas tank is more than half full.</p>
            </div>
          </div>
        </div>

        {/* Item 2: Spray bottle */}
        <div className="card" style={{ marginBottom: 10 }}>
          <div className="checkbox-row" onClick={() => toggle(1)} style={{ cursor: 'pointer' }}>
            <input type="checkbox" checked={checks[1]} readOnly />
            <div>
              <p style={{ fontWeight: 700, fontSize: 14 }}>Falcon spray bottle</p>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Fresh and full.</p>
            </div>
          </div>
        </div>

        {/* Item 3: Telemetry */}
        <div className="card" style={{ marginBottom: 10 }}>
          <div className="checkbox-row" onClick={() => toggle(2)} style={{ cursor: 'pointer' }}>
            <input type="checkbox" checked={checks[2]} readOnly />
            <div>
              <p style={{ fontWeight: 700, fontSize: 14 }}>Test Telemetry</p>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Test Falcon telemetry outside with clear southern exposure to satellites.</p>
            </div>
          </div>
          <div style={{ paddingLeft: 32, marginTop: 8 }}>
            <div className="flex-row" style={{ justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
              <span style={{ fontSize: 13 }}>PocketLink connected to AeroVision app</span>
              <YesNo value={pocketLink} onChange={setPocketLink} />
            </div>
            <div className="flex-row" style={{ justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
              <span style={{ fontSize: 13 }}>Transmitter 1 connected to satellite?</span>
              <YesNo value={tx1} onChange={setTx1} />
            </div>
            <div className="flex-row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <span style={{ fontSize: 13 }}>Transmitter 2 connected to satellite?</span>
              <YesNo value={tx2} onChange={setTx2} />
            </div>
          </div>
        </div>

        {/* Item 4: Falcon food */}
        <div className="card" style={{ marginBottom: 10 }}>
          <div className="checkbox-row" onClick={() => toggle(3)} style={{ cursor: 'pointer' }}>
            <input type="checkbox" checked={checks[3]} readOnly />
            <div>
              <p style={{ fontWeight: 700, fontSize: 14 }}>Falcon food</p>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Weigh and cut up quail, place in Falcon bag with coolant.</p>
            </div>
          </div>
          <div style={{ paddingLeft: 32, marginTop: 8 }}>
            <div className="flex-row mb-12" style={{ gap: 12 }}>
              <label style={{ fontSize: 13, fontWeight: 600, minWidth: 130 }}>Total quail grams:</label>
              <input type="number" inputMode="numeric" maxLength={3} value={quailGrams} onChange={e => setQuailGrams(e.target.value)} style={{ width: 90 }} />
            </div>
            <p className="section-subtitle" style={{ marginBottom: 10, fontWeight: 600, color: 'var(--text)', fontSize: 13 }}>Breakdown:</p>
            <div className="flex-row mb-8" style={{ gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, minWidth: 90 }}>Small tidbit:</span>
              <input type="number" value={smallTidbitG} onChange={e => setSmallTidbitG(e.target.value)} style={{ width: 60 }} placeholder="g" />
              <span style={{ fontSize: 13 }}>g &times;</span>
              <input type="number" value={smallTidbitQty} onChange={e => setSmallTidbitQty(e.target.value)} style={{ width: 50 }} placeholder="qty" />
            </div>
            <div className="flex-row mb-8" style={{ gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, minWidth: 90 }}>Large tidbit:</span>
              <input type="number" value={largeTidbitG} onChange={e => setLargeTidbitG(e.target.value)} style={{ width: 60 }} placeholder="g" />
              <span style={{ fontSize: 13 }}>g &times;</span>
              <input type="number" value={largeTidbitQty} onChange={e => setLargeTidbitQty(e.target.value)} style={{ width: 50 }} placeholder="qty" />
            </div>
            <div className="flex-row" style={{ gap: 8 }}>
              <span style={{ fontSize: 13, minWidth: 90 }}>Pickup piece:</span>
              <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--primary)' }}>{pickupPieceG.toFixed(1)} g</span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>(auto-calculated)</span>
            </div>
          </div>
        </div>

        {/* Feed history */}
        <div className="card" style={{ background: 'var(--warning-bg)', border: '1px solid var(--warning-border)', marginBottom: 20 }}>
          <p style={{ fontWeight: 700, fontSize: 14, marginBottom: 8, color: 'var(--warning)' }}>Feed History (Last 24-48h)</p>
          {falcons.map(f => {
            const hrs = ctrl.hoursSinceFalconLastFed(f.id);
            return (
              <div key={f.id} style={{ fontSize: 13, marginBottom: 4, display: 'flex', gap: 8 }}>
                <span style={{ fontWeight: 700, minWidth: 80 }}>{f.name}:</span>
                <span style={{ color: 'var(--text-secondary)' }}>{hrs !== null ? `Last fed ${hrs.toFixed(1)} hours ago` : 'No recent feeding data'}</span>
              </div>
            );
          })}
        </div>

        <button className="btn-filled btn-full" disabled={!allChecked} style={{ padding: 14, fontSize: 15 }}
          onClick={() => navigate('/start-session', { state: { quailGrams: totalQuail, smallTidbitG: parseFloat(smallTidbitG) || 0, largeTidbitG: parseFloat(largeTidbitG) || 0, pickupPieceG, telemetryWorking: pocketLink === true && tx1 === true && tx2 === true } })}>
          Continue to Approach Falcon
        </button>
      </div>
    </div>
  );
}
