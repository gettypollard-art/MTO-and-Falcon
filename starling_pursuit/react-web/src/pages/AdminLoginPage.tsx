import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useController } from '../store/useController';

export default function AdminLoginPage() {
  const ctrl = useController();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (username === 'a' && password === '1') {
      ctrl.useDefaultAdmin();
      navigate('/admin');
    } else {
      setError('Invalid admin login.');
    }
  }

  return (
    <div className="page" style={{ background: 'var(--welcome-bg)' }}>
      <div className="app-bar">
        <button onClick={() => navigate('/')}>←</button>
        <h1>Admin Login</h1>
      </div>
      <div className="page-content" style={{ maxWidth: 420, paddingTop: 40, animation: 'fadeIn .4s ease-out' }}>
        <div className="card" style={{ padding: 24, boxShadow: 'var(--shadow-lg)' }}>
          <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 4, color: 'var(--primary)' }}>Administrator</h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 24 }}>Enter your admin credentials to continue.</p>
          <form onSubmit={handleSubmit} className="flex-col" style={{ gap: 16 }}>
            <div className="flex-col gap-4">
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Username</label>
              <input placeholder="Enter username" autoCapitalize="none" value={username}
                onChange={e => { setUsername(e.target.value); setError(''); }} style={{ padding: 12 }} />
            </div>
            <div className="flex-col gap-4">
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Password</label>
              <input type="password" placeholder="Enter password" value={password}
                onChange={e => { setPassword(e.target.value); setError(''); }} style={{ padding: 12 }} />
            </div>
            {error && <p className="text-error" style={{ fontSize: 13 }}>{error}</p>}
            <div className="flex-row" style={{ justifyContent: 'flex-end', gap: 12, marginTop: 4 }}>
              <button type="button" className="btn-ghost" onClick={() => navigate('/')}>Cancel</button>
              <button className="btn-filled" type="submit" style={{ padding: '12px 28px' }}>Login</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
