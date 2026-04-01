import { useNavigate, useParams } from 'react-router-dom';
import { useController } from '../store/useController';

const STEPS = [
  'Thread jesses through grommets',
  'Attach the clip to the jesses',
  'Attach leash to jesses',
  'Unclip jesses, clip into leash',
  'Clean up leash on glove',
  'Feed all remaining tidbits in bag',
  'Spray falcon\'s beak down with water',
  'Allow the falcon to rest a minute',
  'Clean the beak with your fingers',
  'Hood falcon',
];

export default function PickupPiecePage() {
  const ctrl = useController();
  const navigate = useNavigate();
  const { sessionId } = useParams<{ sessionId: string }>();
  const session = ctrl.sessionById(sessionId!);
  const remaining = ctrl.foodRemainingG(session);

  function feedRemaining() {
    if (remaining > 0) {
      ctrl.addReward(sessionId!, 'small', remaining);
    }
  }

  return (
    <div className="page">
      <div className="app-bar">
        <button onClick={() => navigate(`/live-session/${sessionId}`)}>←</button>
        <h1>Pickup Piece</h1>
      </div>
      <div className="page-content" style={{ animation: 'fadeIn .4s ease-out' }}>
        <div className="card" style={{ padding: 20, marginBottom: 20 }}>
          <p style={{ fontWeight: 700, fontSize: 16, marginBottom: 12, color: 'var(--primary)' }}>As falcon is feeding on the pickup piece:</p>
          <ol style={{ paddingLeft: 20, fontSize: 14, lineHeight: 2.2 }}>
            {STEPS.map((s, i) => (
              <li key={i} style={{ fontWeight: i === 5 ? 700 : 400, color: i === 5 ? 'var(--primary)' : 'var(--text)' }}>{s}</li>
            ))}
          </ol>
          <p style={{ fontSize: 14, marginTop: 12, paddingLeft: 20, color: 'var(--text-secondary)' }}>
            &bull; Time to head back to the trailer.
          </p>
        </div>

        <div className="flex-col gap-8">
          <button className="btn-filled btn-icon btn-full" style={{ padding: 14 }} onClick={feedRemaining}>
            🥩 Feed remaining tidbits ({remaining.toFixed(1)}g)
          </button>
          <button className="btn-danger btn-full" style={{ padding: 14 }} onClick={() => navigate(`/done-flying/${sessionId}`)}>
            End Flying Session
          </button>
        </div>
      </div>
    </div>
  );
}
