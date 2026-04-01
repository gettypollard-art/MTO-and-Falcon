import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useController } from '../store/useController';
import { fmtDate } from '../utils/helpers';

export default function AdminUserDetailPage() {
  const ctrl = useController();
  const navigate = useNavigate();
  const { handlerId } = useParams<{ handlerId: string }>();
  const handler = ctrl.handlerById(handlerId!);
  const sessions = ctrl.sessionsForHandler(handlerId!);
  const falcons = ctrl.falconsForHandler(handlerId!);
  const questions = ctrl.adminQuestionsForHandler(handlerId!);

  const [questionText, setQuestionText] = useState('');

  const pendingQuestions = questions.filter(q => !q.answeredAt);

  function askQuestion() {
    if (!questionText.trim()) return;
    ctrl.askUserQuestion(handlerId!, questionText);
    setQuestionText('');
  }

  return (
    <div className="page">
      <div className="app-bar">
        <button onClick={() => navigate('/admin')}>←</button>
        <h1>{handler.name}</h1>
      </div>
      <div className="page-content" style={{ animation: 'fadeIn .4s ease-out' }}>
        {/* Header card */}
        <div className="card" style={{ padding: 20, marginBottom: 16, background: 'var(--info-bg)', border: '1px solid var(--info-border)' }}>
          <div className="flex-row flex-wrap gap-16">
            <div><p style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Sessions</p><p style={{ fontWeight: 800, fontSize: 22 }}>{sessions.length}</p></div>
            <div><p style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Falcons</p><p style={{ fontWeight: 800, fontSize: 22 }}>{falcons.length}</p></div>
            <div><p style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Pending</p><p style={{ fontWeight: 800, fontSize: 22 }}>{pendingQuestions.length}</p></div>
          </div>
        </div>

        {/* Ask question */}
        <div className="card" style={{ padding: 16, marginBottom: 16 }}>
          <p style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>Ask Question</p>
          <div className="flex-row gap-8">
            <input className="flex-1" placeholder="Type a question for this handler..." value={questionText} onChange={e => setQuestionText(e.target.value)} />
            <button className="btn-filled btn-sm" onClick={askQuestion}>Send</button>
          </div>
        </div>

        {/* Falcon spreadsheets */}
        <div className="section-title">Falcon Spreadsheets</div>
        {falcons.map(f => {
          const count = ctrl.sessionsForFalcon(handlerId!, f.id).length;
          return (
            <div key={f.id} className="card card-clickable" style={{ marginBottom: 8 }}
              onClick={() => navigate(`/admin-spreadsheet/${handlerId}/${f.id}`)}>
              <div className="flex-row" style={{ justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 700 }}>{f.name}</span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{count} rows ▶</span>
              </div>
            </div>
          );
        })}

        {/* Admin questions */}
        {questions.length > 0 && (
          <div className="mt-16">
            <div className="section-title">Questions</div>
            {questions.map(q => (
              <div key={q.id} className="card" style={{ marginBottom: 8, borderLeft: `3px solid ${q.answeredAt ? 'var(--success)' : 'var(--warning)'}` }}>
                <div className="flex-row" style={{ gap: 10 }}>
                  <span style={{ fontSize: 18 }}>{q.answeredAt ? '✅' : '⚠️'}</span>
                  <div className="flex-1">
                    <p style={{ fontSize: 14, fontWeight: 600 }}>{q.questionText}</p>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{fmtDate(q.askedAt)}</p>
                    {q.answeredAt ? (
                      <p style={{ fontSize: 13, color: 'var(--success)', marginTop: 4 }}>{q.answerText}</p>
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
