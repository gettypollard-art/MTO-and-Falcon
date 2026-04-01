import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useController } from '../store/useController';
import { fmtDateTime } from '../utils/helpers';

export default function CustomerInputPage() {
  const ctrl = useController();
  const navigate = useNavigate();
  const [isRecording, setIsRecording] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState('');
  const recognitionRef = useRef<any>(null);

  const inputs = ctrl.currentUserCustomerInputs;

  function startRecording() {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) { alert('Speech recognition not supported.'); return; }
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = (event: any) => {
      let transcript = '';
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      setLiveTranscript(transcript);
    };
    recognition.onerror = () => setIsRecording(false);
    recognition.onend = () => setIsRecording(false);
    recognition.start();
    recognitionRef.current = recognition;
    setIsRecording(true);
    setLiveTranscript('');
  }

  function stopRecording() {
    recognitionRef.current?.stop();
    setIsRecording(false);
    if (liveTranscript.trim()) {
      ctrl.addCustomerInputTranscript(liveTranscript);
    }
  }

  return (
    <div className="page">
      <div className="app-bar">
        <button onClick={() => navigate('/home')}>←</button>
        <h1>Customer Input</h1>
      </div>
      <div className="page-content">
        <div className="card" style={{ padding: 20, marginBottom: 16 }}>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
            Use Start/Stop Recording to capture a conversation summary. It will be timestamped automatically.
          </p>
          <div className="flex-row gap-8">
            {!isRecording ? (
              <button className="btn-filled btn-icon btn-full" onClick={startRecording}>🎤 Start Recording</button>
            ) : (
              <button className="btn-danger btn-icon btn-full" onClick={stopRecording}>⏹ Stop Recording</button>
            )}
          </div>
        </div>

        {isRecording && liveTranscript && (
          <div className="card" style={{ background: 'var(--warning-bg)', border: '1px solid var(--warning-border)', marginBottom: 12 }}>
            <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, color: 'var(--warning)' }}>Recording in progress…</p>
            <p style={{ fontSize: 14 }}>{liveTranscript}</p>
          </div>
        )}
        {!isRecording && liveTranscript && (
          <div className="card" style={{ marginBottom: 12 }}>
            <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, color: 'var(--text-secondary)' }}>Latest transcript</p>
            <p style={{ fontSize: 14 }}>{liveTranscript}</p>
          </div>
        )}

        {inputs.length > 0 && (
          <div>
            <div className="section-title">Recorded Customer Inputs</div>
            {inputs.map(entry => (
              <div key={entry.id} className="card" style={{ marginBottom: 8, borderLeft: '3px solid var(--success)' }}>
                <div className="flex-row" style={{ gap: 10 }}>
                  <span style={{ color: 'var(--success)', fontSize: 18 }}>✅</span>
                  <div className="flex-1">
                    <p style={{ fontSize: 14, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>{entry.transcript}</p>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{fmtDateTime(entry.createdAt)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
