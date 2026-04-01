import { useNavigate } from 'react-router-dom';
import { useController } from '../store/useController';

export default function WelcomePage() {
  const ctrl = useController();
  const navigate = useNavigate();

  return (
    <div className="page" style={{ background: 'var(--welcome-bg)', justifyContent: 'center', alignItems: 'center' }}>
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        padding: '40px 24px', maxWidth: 400, width: '100%',
        animation: 'fadeIn .5s ease-out',
      }}>
        {/* Hero image card */}
        <div style={{
          width: 240, height: 280, borderRadius: 'var(--radius-xl)', overflow: 'hidden',
          marginBottom: 28, background: 'var(--surface)',
          boxShadow: '0 20px 40px rgba(26,58,92,.15), 0 8px 16px rgba(26,58,92,.08)',
          border: '1px solid rgba(255,255,255,.8)',
        }}>
          <img src="/assets/images/peregrine_falcon.jpg" alt="Peregrine Falcon"
            style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>

        {/* Title */}
        <h1 style={{
          fontSize: 48, fontWeight: 900, color: 'var(--primary)',
          letterSpacing: '-0.03em', lineHeight: 1,
        }}>B-1RD</h1>
        <p style={{
          fontSize: 15, fontWeight: 500, color: 'var(--text-secondary)',
          marginTop: 8, marginBottom: 36, letterSpacing: '0.02em',
        }}>Falcon Crop Protection &middot; Falcon Log</p>

        {/* Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%', maxWidth: 300 }}>
          <button className="btn-filled btn-full" style={{ padding: '14px 20px', fontSize: 15, borderRadius: 'var(--radius-md)' }}
            onClick={() => { ctrl.useDefaultUser(); navigate('/home'); }}>
            Falcon Specialists
          </button>
          <button className="btn-outlined btn-full" style={{ padding: '14px 20px', fontSize: 15, borderRadius: 'var(--radius-md)' }}
            onClick={() => navigate('/admin-login')}>
            Admin
          </button>
        </div>
      </div>
    </div>
  );
}
