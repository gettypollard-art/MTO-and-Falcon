import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useController } from '../store/useController';
import { fmtDate } from '../utils/helpers';

export default function AskQuestionPage() {
  const ctrl = useController();
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const recognitionRef = useRef<any>(null);

  const questions = ctrl.currentUserQuestions;

  function handleSend() {
    if (!text.trim()) return;
    ctrl.submitQuestion(text);
    setText('');
  }

  function toggleRecording() {
    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
      return;
    }
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) { alert('Speech recognition not supported in this browser.'); return; }
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = (event: any) => {
      let transcript = '';
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      setText(transcript);
    };
    recognition.onerror = () => setIsRecording(false);
    recognition.onend = () => setIsRecording(false);
    recognition.start();
    recognitionRef.current = recognition;
    setIsRecording(true);
  }

  return (
    <div className="page">
      <div className="app-bar">
        <button onClick={() => navigate('/home')}>←</button>
        <h1>Ask a Question</h1>
      </div>
      <div className="page-content">
        <div className="card" style={{ padding: 20, marginBottom: 16 }}>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
            Type your question and send it as text. A check mark appears once it has been answered.
          </p>
          <textarea rows={3} value={text} onChange={e => setText(e.target.value)}
            placeholder="Enter your question..." style={{ width: '100%', marginBottom: 10 }} />
          <div className="flex-row gap-8">
            <button className={isRecording ? 'btn-danger btn-icon flex-1' : 'btn-outlined btn-icon flex-1'} onClick={toggleRecording}>
              {isRecording ? '⏹ Stop Recording' : '🎤 Voice Input'}
            </button>
            <button className="btn-filled flex-1" onClick={handleSend} disabled={!text.trim()}>Send Question</button>
          </div>
        </div>

        {questions.length > 0 && (
          <div>
            <div className="section-title">Question History</div>
            {questions.map(q => (
              <div key={q.id} className="card" style={{ marginBottom: 8, borderLeft: `3px solid ${q.answeredAt ? 'var(--success)' : 'var(--gray-300)'}` }}>
                <div className="flex-row" style={{ gap: 10 }}>
                  <span style={{ fontSize: 18, marginTop: 2 }}>{q.answeredAt ? '✅' : '⏳'}</span>
                  <div className="flex-1">
                    <p style={{ fontSize: 14, fontWeight: 600 }}>{q.questionText}</p>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{fmtDate(q.askedAt)}</p>
                    {q.answeredAt ? (
                      <p style={{ fontSize: 13, color: 'var(--success)', marginTop: 4, fontWeight: 500 }}>{q.answerText}</p>
                    ) : (
                      <p style={{ fontSize: 12, fontStyle: 'italic', color: 'var(--text-muted)', marginTop: 4 }}>Awaiting answer…</p>
                    )}
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
