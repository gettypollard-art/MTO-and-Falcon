import { useNavigate } from 'react-router-dom';
import { useController } from '../store/useController';

const LINKS = [
  { path: '/daily-schedule', icon: '📅', label: 'Daily Schedule' },
  { path: '/starling-work-pattern', icon: '📋', label: 'General Starling and Work Pattern' },
  { path: '/weekly-schedule', icon: '📆', label: 'Weekly Work Schedule' },
  { path: '/work-protocol', icon: '📜', label: 'Work Protocol' },
  { path: '/site-info', icon: '🏢', label: 'Site Information' },
  { path: '/contact-info', icon: '📞', label: 'Contact Information' },
  { path: '/equipment', icon: '🔧', label: 'Equipment List' },
  { path: '/handler-metrics', icon: '📊', label: 'Falcon Handler Metrics' },
  { path: '/patrol-summary', icon: '🚲', label: 'Patrol Without Falcon Time' },
];

export default function OtherInfoPage() {
  const ctrl = useController();
  const navigate = useNavigate();
  const isAdmin = ctrl.user?.role === 'manager';

  return (
    <div className="page">
      <div className="app-bar">
        <button onClick={() => navigate('/home')}>←</button>
        <h1>Other Information</h1>
      </div>
      <div className="page-content" style={{ animation: 'fadeIn .4s ease-out' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
          {LINKS.map(l => (
            <div key={l.path} className="card card-clickable" style={{ textAlign: 'center', padding: '20px 12px' }}
              onClick={() => navigate(l.path)}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>{l.icon}</div>
              <p style={{ fontSize: 13, fontWeight: 600 }}>{l.label}</p>
            </div>
          ))}
          {isAdmin && (
            <div className="card card-clickable" style={{ textAlign: 'center', padding: '20px 12px' }}
              onClick={() => navigate('/admin-falcon-logs')}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>📊</div>
              <p style={{ fontSize: 13, fontWeight: 600 }}>Admin Falcon Logs</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
