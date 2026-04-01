import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

interface EquipItem { name: string; idealQty: number; actualQty: string; working: boolean; notWorking: boolean }

function makeItems(list: [string, number][]): EquipItem[] {
  return list.map(([name, idealQty]) => ({ name, idealQty, actualQty: '', working: false, notWorking: false }));
}

const SECTIONS: { title: string; items: [string, number][] }[] = [
  { title: 'Falcon', items: [
    ['Spray bottle', 2], ['Water dishes', 2], ['Dawn dish soap', 1], ['Hood', 2], ['Jesses (pair)', 2],
    ['Leash', 2], ['Swivel', 2], ['Glove', 2], ['Lure', 2], ['Whistle', 2], ['Creance', 1],
    ['Scale (digital)', 1], ['Bath pan', 1], ['Giant hood / carrier', 2], ['Falcon perch', 2],
    ['Falcon bag with ice', 2], ['Quail (frozen)', 20], ['Scissors', 1], ['Tweezers', 1],
    ['Leather punch', 1], ['Needle and thread', 1], ['Spare grommets', 4], ['Bell', 2],
  ]},
  { title: 'Falcon Specialist', items: [
    ['Phone', 1], ['Work shirts (B-1RD)', 3], ['Work pants', 3], ['Rain jacket', 1], ['Winter jacket', 1],
    ['Sun hat', 1], ['Sunglasses', 1], ['Sunscreen', 1], ['Bug spray', 1], ['First aid kit', 1],
    ['Work boots', 1], ['Binoculars', 1], ['Headlamp', 1], ['Water bottle', 2], ['Backpack', 1],
  ]},
  { title: 'ATV', items: [
    ['ATV', 1], ['Ramps', 2], ['Tie-down straps', 4], ['Tire repair kit', 1], ['Tire pump', 1],
    ['Jumper cables', 1], ['Tool kit', 1], ['Gas can (5 gal)', 1], ['Bungee cords', 4], ['ATV key (spare)', 1],
    ['Perch mount bracket', 1], ['Windshield', 1], ['Rear cargo box', 1], ['Tow strap', 1], ['Fuses (assorted)', 1],
  ]},
  { title: 'RV', items: [
    ['Sewer hose', 1], ['Water hose (drinking)', 1], ['Water pressure regulator', 1], ['Propane tanks', 2],
    ['Leveling blocks', 4], ['Wheel chocks', 2], ['Extension cord (30 amp)', 1], ['Surge protector', 1],
  ]},
  { title: 'Living Items Inside Trailer', items: [
    ['Pots', 2], ['Pans', 2], ['Utensils (set)', 1], ['Plates', 4], ['Bowls', 4], ['Cups', 4],
    ['Propane (camp stove)', 2], ['Can opener', 1], ['Cutting board', 1], ['Knife set', 1],
    ['Towels (bath)', 3], ['Towels (kitchen)', 3], ['Sheets', 2], ['Pillow', 2], ['Blanket', 2],
    ['Toilet paper', 6], ['Paper towels', 4], ['Trash bags', 1], ['Dish soap', 1], ['Laundry soap', 1],
    ['Sponge', 2], ['Broom', 1], ['Dustpan', 1], ['Flashlight', 1], ['Batteries (AA)', 8],
    ['Batteries (AAA)', 4], ['Matches / lighter', 2], ['Fire extinguisher', 1], ['Smoke detector', 1], ['CO detector', 1],
  ]},
];

const TELEMETRY_ITEMS: [string, number][] = [
  ['Magnets', 4], ['PocketLink', 1], ['PocketLink charging cable', 1], ['PocketLink battery pack', 1],
  ['GPS Transmitter 1', 1], ['GPS Transmitter 2', 1], ['GPS charging cradle', 2], ['GPS charging cable', 2],
  ['RHF (grey) Transmitter 1', 1], ['RHF (grey) Transmitter 2', 1], ['RHF charger', 2],
  ['RHF antenna', 1], ['RHF receiver', 1], ['Yagi antenna', 1], ['Antenna cable', 1],
  ['Mounting tape (transmitters)', 1], ['Heat shrink', 4], ['Zip ties (small)', 10],
  ['Electrical tape', 1], ['Tail mount kit', 2], ['Backup battery pack (USB)', 1],
];

export default function EquipmentPage() {
  const navigate = useNavigate();
  const [sections, setSections] = useState(() => SECTIONS.map(s => ({ title: s.title, items: makeItems(s.items) })));
  const [telemetry, setTelemetry] = useState(() => makeItems(TELEMETRY_ITEMS));

  const allItems = [...sections.flatMap(s => s.items), ...telemetry];
  const totalChecked = allItems.filter(i => i.working || i.notWorking).length;

  function updateItem(sectionIdx: number, itemIdx: number, field: keyof EquipItem, value: any) {
    setSections(prev => {
      const next = [...prev];
      next[sectionIdx] = { ...next[sectionIdx], items: [...next[sectionIdx].items] };
      (next[sectionIdx].items[itemIdx] as any)[field] = value;
      return next;
    });
  }

  function updateTelemetry(itemIdx: number, field: keyof EquipItem, value: any) {
    setTelemetry(prev => {
      const next = [...prev];
      (next[itemIdx] as any)[field] = value;
      return next;
    });
  }

  return (
    <div className="page">
      <div className="app-bar">
        <button onClick={() => navigate(-1)}>←</button>
        <h1>Equipment List</h1>
      </div>
      <div className="page-content" style={{ animation: 'fadeIn .4s ease-out' }}>
        <div className="card" style={{ padding: '12px 16px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>Items Checked</span>
          <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--primary)' }}>{totalChecked} / {allItems.length}</span>
        </div>

        {sections.map((s, si) => (
          <div key={si} style={{ marginBottom: 20 }}>
            <div className="section-title">{s.title}</div>
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr><th>Item</th><th style={{ width: 50 }}>Ideal</th><th style={{ width: 60 }}>Actual</th><th style={{ width: 50 }}>✓</th><th style={{ width: 50 }}>✗</th></tr>
                  </thead>
                  <tbody>
                    {s.items.map((item, ii) => (
                      <tr key={ii}>
                        <td style={{ fontSize: 12 }}>{item.name}</td>
                        <td style={{ textAlign: 'center', color: 'var(--text-muted)' }}>{item.idealQty}</td>
                        <td><input type="number" style={{ width: 44, padding: 2, fontSize: 11 }} value={item.actualQty} onChange={e => updateItem(si, ii, 'actualQty', e.target.value)} /></td>
                        <td style={{ textAlign: 'center' }}><input type="checkbox" checked={item.working} onChange={e => updateItem(si, ii, 'working', e.target.checked)} /></td>
                        <td style={{ textAlign: 'center' }}><input type="checkbox" checked={item.notWorking} onChange={e => updateItem(si, ii, 'notWorking', e.target.checked)} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ))}

        {/* Falcon Telemetry Items */}
        <div style={{ marginBottom: 20 }}>
          <div className="section-title">Falcon Telemetry Items</div>
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr><th>Item</th><th style={{ width: 50 }}>Ideal</th><th style={{ width: 60 }}>Actual</th><th style={{ width: 50 }}>✓</th><th style={{ width: 50 }}>✗</th></tr>
                </thead>
                <tbody>
                  {telemetry.map((item, i) => (
                    <tr key={i}>
                      <td style={{ fontSize: 12 }}>{item.name}</td>
                      <td style={{ textAlign: 'center', color: 'var(--text-muted)' }}>{item.idealQty}</td>
                      <td><input type="number" style={{ width: 44, padding: 2, fontSize: 11 }} value={item.actualQty} onChange={e => updateTelemetry(i, 'actualQty', e.target.value)} /></td>
                      <td style={{ textAlign: 'center' }}><input type="checkbox" checked={item.working} onChange={e => updateTelemetry(i, 'working', e.target.checked)} /></td>
                      <td style={{ textAlign: 'center' }}><input type="checkbox" checked={item.notWorking} onChange={e => updateTelemetry(i, 'notWorking', e.target.checked)} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Transmitter entries */}
        <div style={{ marginBottom: 20 }}>
          <div className="section-title">Transmitter Details</div>
          {['GPS Tx 1', 'GPS Tx 2', 'RHF (grey) Tx 1', 'RHF (grey) Tx 2'].map((label, i) => (
            <div key={i} className="card" style={{ padding: 16, marginBottom: 8 }}>
              <p style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: 'var(--text)' }}>{label}</p>
              <div className="flex-row gap-8">
                <input placeholder="Serial #" style={{ flex: 1 }} />
                <input placeholder="Frequency" style={{ flex: 1 }} />
              </div>
            </div>
          ))}
        </div>

        {/* Device credentials */}
        <div style={{ marginBottom: 20 }}>
          <div className="section-title">Device Credentials</div>
          <div className="card" style={{ padding: 20 }}>
            <div className="flex-col gap-12">
              <input placeholder="PocketLink Serial Number" />
              <input placeholder="iPhone passcode" type="password" />
              <input placeholder="Apple ID" />
              <input placeholder="Apple ID password" type="password" />
              <input placeholder="Phone number" type="tel" />
              <input placeholder="B1RD email address" type="email" />
              <input placeholder="B1RD email password" type="password" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
