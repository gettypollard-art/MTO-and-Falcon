import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useController } from '../store/useController';

export default function LoginPage() {
  const ctrl = useController();
  const navigate = useNavigate();
  const [handlerId, setHandlerId] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  const handlers = ctrl.handlerUsers;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!handlerId) { setError('Select a Falcon Specialist.'); return; }
    const ok = ctrl.login(handlerId, pin);
    if (ok) navigate('/home');
    else setError('Invalid PIN. Please try again.');
  }

  return (
    <div className="page" style={{ background: 'var(--welcome-bg)' }}>
      <div className="app-bar">
        <button onClick={() => navigate('/')}>←</button>
        <h1>Sign In</h1>
      </div>
      <div className="page-content" style={{ maxWidth: 420, paddingTop: 40, animation: 'fadeIn .4s ease-out' }}>
        <div className="card" style={{ padding: 24, boxShadow: 'var(--shadow-lg)' }}>
          <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 4, color: 'var(--primary)' }}>Falcon Specialist Login</h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 24 }}>Select your ID and enter your PIN to continue.</p>
          <form onSubmit={handleSubmit} className="flex-col" style={{ gap: 16 }}>
            <div className="flex-col gap-4">
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Falcon Specialist</label>
              <select value={handlerId} onChange={e => { setHandlerId(e.target.value); setError(''); }} style={{ padding: 12 }}>
                <option value="">Select specialist...</option>
                {handlers.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
              </select>
            </div>
            <div className="flex-col gap-4">
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>PIN</label>
              <input type="password" inputMode="numeric" maxLength={4} placeholder="••••" value={pin}
                onChange={e => { setPin(e.target.value); setError(''); }} style={{ padding: 12, letterSpacing: '0.3em', fontSize: 18, textAlign: 'center' }} />
            </div>
            {error && <p className="text-error" style={{ fontSize: 13 }}>{error}</p>}
            <button className="btn-filled btn-full" type="submit" style={{ padding: 14, fontSize: 15, marginTop: 4 }}>Sign In</button>
          </form>
        </div>
      </div>
    </div>
  );
}
