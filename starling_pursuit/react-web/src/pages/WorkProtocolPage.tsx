import { useNavigate } from 'react-router-dom';

const SECTIONS = [
  { title: 'PICTURES AND SHARING', critical: true, items: [
    'Do not take pictures or video of falcons, equipment, or work at client sites.',
    'Do not send pictures or video to anyone outside of B-1RD.',
    'Do not post on social media about work, clients, or locations.',
    'All information about clients, sites, and operations is confidential.',
  ]},
  { title: 'LEAVING CONTRACT DURING WORKING HOURS', items: [
    'Do not leave the job site without notifying B-1RD management.',
    'If you need to leave for any reason, communicate with your manager.',
  ]},
  { title: 'CUSTOMERS', items: [
    'Be professional and respectful when interacting with farm personnel.',
    'Direct any customer questions or concerns to B-1RD management.',
    'Use the Customer Input screen to log any interactions.',
  ]},
  { title: 'FALCONS', items: [
    'Follow all daily care routines - water, feeding, and cleaning.',
    'Report any health concerns immediately.',
    'Never leave a falcon unattended during a session.',
    'Always have telemetry operational before flying.',
  ]},
  { title: 'TELEMETRY BATTERIES', items: [
    'Charge all telemetry batteries nightly.',
    'Always test telemetry before each flying session.',
    'Report any malfunctioning telemetry immediately.',
  ]},
  { title: 'FALCON FEED', items: [
    'Thaw quail the night before scheduled flying sessions.',
    'Weigh all food before flying sessions.',
    'Keep food in sealed containers with ice packs.',
    'Track all food given using the app.',
  ]},
  { title: 'ATV', items: [
    'Check tire pressure and fuel before each session.',
    'Refuel when tank is below 3/4.',
    'Report any mechanical issues immediately.',
    'Drive at safe speeds - max 15 mph during sessions.',
  ]},
  { title: 'RV', items: [
    'Keep living quarters clean and organized.',
    'Manage water, propane, and waste responsibly.',
    'Report any maintenance needs promptly.',
  ]},
  { title: 'EQUIPMENT, FAILURE, OR LOSS', items: [
    'Inventory all equipment regularly using the Equipment List.',
    'Report any lost, damaged, or malfunctioning equipment immediately.',
    'Do not attempt to repair specialized equipment without authorization.',
  ]},
  { title: 'DIFFERENT TOOLS FOR BIRD CONTROL', items: [
    'Falcon is the primary deterrent. Use pursuit flights as the main method.',
    'ATV patrol serves as a secondary deterrent during rest periods.',
    'Combine approaches based on starling activity levels.',
  ]},
];

export default function WorkProtocolPage() {
  const navigate = useNavigate();

  return (
    <div className="page">
      <div className="app-bar">
        <button onClick={() => navigate(-1)}>←</button>
        <h1>Work Protocol</h1>
      </div>
      <div className="page-content" style={{ animation: 'fadeIn .4s ease-out' }}>
        {SECTIONS.map((s, i) => (
          <div key={i} className="card" style={{
            padding: 16, marginBottom: 12,
            ...(s.critical ? { background: 'var(--danger-bg)', border: '1px solid var(--danger-border)' } : {})
          }}>
            <p style={{ fontWeight: 800, fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8, color: s.critical ? 'var(--danger)' : 'var(--primary)' }}>{s.title}</p>
            <ul style={{ paddingLeft: 18, fontSize: 13, lineHeight: 1.8, color: 'var(--text-secondary)' }}>
              {s.items.map((item, j) => <li key={j}>{item}</li>)}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
