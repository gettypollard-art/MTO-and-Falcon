import { useNavigate } from 'react-router-dom';

export default function ContactInfoPage() {
  const navigate = useNavigate();

  return (
    <div className="page">
      <div className="app-bar">
        <button onClick={() => navigate(-1)}>←</button>
        <h1>Contact Information</h1>
      </div>
      <div className="page-content" style={{ animation: 'fadeIn .4s ease-out' }}>
        <div className="card" style={{ padding: 20 }}>
          <Row label="B1RD Owner" value="Getty Pollard" />
          <Row label="Phone Number" value="541-263-1545" />
          <Row label="Address" value="69602 Warnock Road, Lostine, Oregon 97857" />
          <Row label="Email Address" value="Getty@B-1RD.com" />
          <Row label="Website" value="www.B-1RD.com" last />
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div style={{ padding: '10px 0', borderBottom: last ? 'none' : '1px solid var(--border)' }}>
      <p style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2 }}>{label}</p>
      <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{value}</p>
    </div>
  );
}
