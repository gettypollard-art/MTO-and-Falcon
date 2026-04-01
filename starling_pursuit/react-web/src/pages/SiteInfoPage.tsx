import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function SiteInfoPage() {
  const navigate = useNavigate();
  const [address, setAddress] = useState('');
  const [entranceCodes, setEntranceCodes] = useState('');
  const [gasCodes, setGasCodes] = useState('');
  const [managerName, setManagerName] = useState('');
  const [managerPhone, setManagerPhone] = useState('');

  return (
    <div className="page">
      <div className="app-bar">
        <button onClick={() => navigate(-1)}>←</button>
        <h1>Site Information</h1>
      </div>
      <div className="page-content" style={{ animation: 'fadeIn .4s ease-out' }}>
        <div className="card" style={{ padding: 20 }}>
          <div className="flex-col gap-16">
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)' }}>Address</label>
              <textarea rows={2} value={address} onChange={e => setAddress(e.target.value)} style={{ width: '100%' }} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)' }}>Entrance Codes</label>
              <textarea rows={2} value={entranceCodes} onChange={e => setEntranceCodes(e.target.value)} style={{ width: '100%' }} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)' }}>Gas Codes</label>
              <textarea rows={2} value={gasCodes} onChange={e => setGasCodes(e.target.value)} style={{ width: '100%' }} />
            </div>
            <div className="divider" />
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)' }}>Farm Manager Name</label>
              <input value={managerName} onChange={e => setManagerName(e.target.value)} style={{ width: '100%' }} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)' }}>Farm Manager Phone</label>
              <input type="tel" value={managerPhone} onChange={e => setManagerPhone(e.target.value)} style={{ width: '100%' }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
