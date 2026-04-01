import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useController } from '../store/useController';
import { fmtDuration } from '../utils/helpers';
import type { WingbeatQuality, PursuitOutcome, FalconDistanceFromHandler, RewardSize } from '../types/models';

export default function LiveSessionPage() {
  const ctrl = useController();
  const navigate = useNavigate();
  const { sessionId } = useParams<{ sessionId: string }>();
  const session = ctrl.sessionById(sessionId!);
  const falcon = ctrl.falconById(session.falconId);
  const settings = ctrl.settings;

  const [page, setPage] = useState(0);
  const [, setTick] = useState(0);

  useEffect(() => {
    const iv = setInterval(() => setTick(t => t + 1), 15000);
    return () => clearInterval(iv);
  }, []);

  const isFlying = ctrl.isFlying(session);
  const flights = ctrl.completedFlights(session);
  const flyingMin = ctrl.flyingMinutes(session);
  const sittingMin = ctrl.sittingMinutes(session);
  const sessionMin = ctrl.sessionMinutes(session);
  const foodUsed = ctrl.foodUsedG(session);
  const foodRemaining = ctrl.foodRemainingG(session);
  const totalStarlings = ctrl.totalStarlingCount(session);

  const [wingbeat, setWingbeat] = useState<WingbeatQuality | ''>('');
  const [pursuitIntensity, setPursuitIntensity] = useState(0);
  const [distance, setDistance] = useState<FalconDistanceFromHandler | ''>('');
  const [outcome, setOutcome] = useState<PursuitOutcome | ''>('');
  const [pursuitHighlight, setPursuitHighlight] = useState(false);

  const postReturn = ctrl.postReturnChecklist(session);

  const flightMessages: Record<string, string> = {
    pursuit: 'Drive ATV 15 mph... toot whistle once...',
    soaring: 'Allow Falcon to get to 100 feet...',
    perch: '',
  };
  const [lastFlightType, setLastFlightType] = useState('');

  function startFlight(type: string) {
    ctrl.addFlyingStart(sessionId!, type);
    setLastFlightType(type);
  }

  function endFlight() {
    ctrl.addFlyingEnd(sessionId!);
    setPursuitHighlight(true);
    setTimeout(() => setPursuitHighlight(false), 3000);
  }

  function logPursuit() {
    if (!wingbeat || !distance || !outcome) return;
    ctrl.addPursuit(sessionId!, wingbeat, pursuitIntensity, outcome, distance);
    setWingbeat('');
    setPursuitIntensity(0);
    setDistance('');
    setOutcome('');
  }

  function giveReward(_method: 'glove' | 'lure', size: RewardSize) {
    ctrl.addReward(sessionId!, size);
  }

  function handlePickupPiece(_method: 'glove' | 'lure') {
    ctrl.addReward(sessionId!, 'pickUpPiece');
    navigate(`/pickup-piece/${sessionId}`);
  }

  const addStarling = useCallback((count: number, category: string) => {
    ctrl.addStarlingSighting(sessionId!, count, category);
  }, [ctrl, sessionId]);

  function endSession() {
    navigate(`/done-flying/${sessionId}`);
  }

  const foodPct = Math.min(100, (foodUsed / Math.max(1, session.plannedFoodG)) * 100);
  const lowFood = foodRemaining < session.plannedFoodG * 0.25;

  if (page === 0) return (
    <div className="page">
      <div className="app-bar">
        <button onClick={() => navigate('/home')}>←</button>
        <h1>{falcon.name} — Live</h1>
        <div className="actions">
          <button onClick={() => setPage(1)} title="Map">🗺</button>
        </div>
      </div>
      <div className="page-content" style={{ animation: 'fadeIn .3s ease-out' }}>
        {/* Metrics */}
        <div className="flex-row flex-wrap gap-6 mb-12">
          <MetricChip label="Session" value={fmtDuration(sessionMin)} />
          <MetricChip label="Flying" value={fmtDuration(flyingMin)} />
          <MetricChip label="Sitting" value={fmtDuration(sittingMin)} />
          <MetricChip label="Quail Left" value={`${foodRemaining.toFixed(1)}g`} warn={lowFood} />
          <MetricChip label="Flights" value={String(flights)} />
          <MetricChip label="Starlings" value={String(totalStarlings)} />
        </div>

        {/* Food progress */}
        <div style={{ marginBottom: 16 }}>
          <div className="flex-row" style={{ justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>Food used</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: lowFood ? 'var(--danger)' : 'var(--text-secondary)' }}>{foodUsed.toFixed(1)}g / {session.plannedFoodG}g</span>
          </div>
          <div className="progress-bar">
            <div className="fill" style={{ width: `${foodPct}%`, background: lowFood ? 'var(--danger)' : 'var(--accent)' }} />
          </div>
        </div>

        {/* Flight controls */}
        {!isFlying ? (
          <div className="card" style={{ padding: 16, marginBottom: 16 }}>
            <p style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>Start a Flight</p>
            <div className="flex-col gap-8">
              <button className="btn-filled btn-full btn-icon" style={{ padding: 14 }} onClick={() => startFlight('pursuit')}>🦅 Pursuit Flight</button>
              <button className="btn-tonal btn-full btn-icon" onClick={() => startFlight('soaring')}>🦅 Soaring Flight</button>
              <button className="btn-tonal btn-full btn-icon" onClick={() => startFlight('perch')}>🦅 Flies to Perch</button>
            </div>
          </div>
        ) : (
          <div style={{ marginBottom: 16 }}>
            {lastFlightType && flightMessages[lastFlightType] && (
              <p style={{ fontSize: 13, fontStyle: 'italic', color: 'var(--text-muted)', marginBottom: 8 }}>{flightMessages[lastFlightType]}</p>
            )}
            <button className="btn-danger btn-full btn-icon" style={{ padding: 16, fontSize: 15, boxShadow: '0 4px 16px rgba(220,38,38,.25)' }} onClick={endFlight}>
              🦅 Falcon Returns
            </button>
          </div>
        )}

        {/* Pursuit log */}
        <div className="card" style={{
          padding: 16, marginBottom: 16,
          border: pursuitHighlight ? '2px solid var(--accent)' : '1px solid var(--gray-100)',
          background: pursuitHighlight ? 'var(--info-bg)' : 'var(--surface)',
          transition: 'all .3s var(--ease)',
        }}>
          <p style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>Pursuit Log</p>

          <div className="mb-8">
            <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Wingbeat</p>
            <div className="flex-row gap-6">
              {(['strong', 'normal', 'weak'] as WingbeatQuality[]).map(w => (
                <button key={w} className={`pursuit-btn ${wingbeat === w ? 'active' : ''}`} onClick={() => setWingbeat(w)}>{w.charAt(0).toUpperCase() + w.slice(1)}</button>
              ))}
            </div>
          </div>
          <div className="mb-8">
            <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Response</p>
            <div className="flex-row gap-6">
              <button className={`pursuit-btn ${pursuitIntensity === 1 ? 'active' : ''}`} onClick={() => setPursuitIntensity(1)}>Instant</button>
              <button className={`pursuit-btn ${pursuitIntensity === 2 ? 'active' : ''}`} onClick={() => setPursuitIntensity(2)}>Delayed</button>
            </div>
          </div>
          <div className="mb-8">
            <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Distance</p>
            <div className="flex-row gap-6">
              <button className={`pursuit-btn ${distance === 'inView' ? 'active' : ''}`} onClick={() => setDistance('inView')}>Visible</button>
              <button className={`pursuit-btn ${distance === 'outOfSight' ? 'active' : ''}`} onClick={() => setDistance('outOfSight')}>Out of Sight</button>
            </div>
          </div>
          <div className="mb-8">
            <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Outcome</p>
            <div className="flex-row gap-6">
              {(['kill', 'chase', 'ignore'] as PursuitOutcome[]).map(o => (
                <button key={o} className={`pursuit-btn ${outcome === o ? 'active' : ''}`} onClick={() => setOutcome(o)}>{o === 'kill' ? 'Catch' : o.charAt(0).toUpperCase() + o.slice(1)}</button>
              ))}
            </div>
          </div>
          <button className="btn-filled btn-sm btn-full mt-4" disabled={!wingbeat || !distance || !outcome} onClick={logPursuit}>
            Log Pursuit
          </button>
        </div>

        {/* Post-return checklist */}
        {postReturn.awaitingCompletion && (
          <div className="card" style={{ background: 'var(--warning-bg)', border: '1px solid var(--warning-border)', marginBottom: 16 }}>
            <p style={{ fontWeight: 700, fontSize: 14, color: 'var(--warning)', marginBottom: 4 }}>Post-Return Checklist</p>
            <div className="flex-row gap-12">
              <span style={{ fontSize: 13 }}>Reward: {postReturn.rewardLogged ? '✅' : '⏳'}</span>
              <span style={{ fontSize: 13 }}>Pursuit: {postReturn.pursuitLogged ? '✅' : '⏳'}</span>
            </div>
          </div>
        )}

        {/* Reward buttons */}
        <div className="card" style={{ padding: 16, marginBottom: 16 }}>
          <p style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>Give Reward</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
            <p style={{ fontSize: 11, fontWeight: 600, textAlign: 'center', color: 'var(--text-secondary)' }}>Small ({settings.rewardSmallG}g)</p>
            <p style={{ fontSize: 11, fontWeight: 600, textAlign: 'center', color: 'var(--text-secondary)' }}>Large ({settings.rewardLargeG}g)</p>
            <p style={{ fontSize: 11, fontWeight: 600, textAlign: 'center', color: 'var(--text-secondary)' }}>Pickup</p>

            <button className="reward-btn primary" onClick={() => giveReward('glove', 'small')}>Glove</button>
            <button className="reward-btn primary" onClick={() => giveReward('glove', 'large')}>Glove</button>
            <button className="reward-btn danger" onClick={() => handlePickupPiece('glove')}>Glove</button>

            <button className="reward-btn muted" onClick={() => giveReward('lure', 'small')}>Lure</button>
            <button className="reward-btn muted" onClick={() => giveReward('lure', 'large')}>Lure</button>
            <button className="reward-btn danger" onClick={() => handlePickupPiece('lure')}>Lure</button>
          </div>
        </div>

        {/* Starling activity */}
        <div className="card" style={{ padding: 16, marginBottom: 16 }}>
          <p style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>Starling Activity</p>
          <div className="mb-8">
            <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Off Property</p>
            <div className="flex-row flex-wrap gap-6">
              {[10, 25, 50, 100, 200].map(n => (
                <button key={n} className="btn-tonal btn-sm" onClick={() => addStarling(n, 'off_property')}>{n}</button>
              ))}
            </div>
          </div>
          <div>
            <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>In Property</p>
            <div className="flex-row flex-wrap gap-6">
              {[10, 25, 50, 100, 200].map(n => (
                <button key={n} className="btn-tonal btn-sm" onClick={() => addStarling(n, 'in_property')}>{n}</button>
              ))}
            </div>
          </div>
        </div>

        {/* End session */}
        <button className="btn-danger btn-full" style={{ padding: 16, fontSize: 15, marginTop: 8 }} onClick={endSession}>
          End Flying Session
        </button>
      </div>
    </div>
  );

  // Page 1: Map
  return (
    <div className="page">
      <div className="app-bar">
        <button onClick={() => setPage(0)}>←</button>
        <h1>Field Map</h1>
      </div>
      <div className="page-content" style={{ animation: 'fadeIn .3s ease-out' }}>
        <div className="card" style={{ textAlign: 'center', padding: '40px 24px' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🗺</div>
          <p style={{ fontWeight: 700, fontSize: 18, marginBottom: 4 }}>Field Boundary Map</p>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>
            {ctrl.fieldById(session.fieldId).name}
          </p>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Perimeter: {ctrl.fieldById(session.fieldId).perimeterMeters}m &middot; Starlings: {totalStarlings}
          </p>
          <p style={{ fontSize: 12, fontStyle: 'italic', color: 'var(--text-muted)', marginTop: 16 }}>
            Interactive map requires Leaflet integration. Starling sighting markers will appear here on the field polygon overlay.
          </p>
        </div>
        <button className="btn-outlined btn-full mt-16" onClick={() => setPage(0)}>← Back to Controls</button>
      </div>
    </div>
  );
}

function MetricChip({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="metric-box" style={warn ? { borderColor: 'var(--danger)', background: 'var(--danger-bg)' } : undefined}>
      <div>
        <div className="metric-label">{label}</div>
        <div className="metric-value" style={warn ? { color: 'var(--danger)' } : undefined}>{value}</div>
      </div>
    </div>
  );
}
