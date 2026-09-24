import { useEffect, useRef, useState } from 'react';
import api from '../api';

const STARTER_PROMPTS = [
  "What's our average rating this month?",
  'Which technician has the lowest rating?',
  'Show me any 1-star reviews from this week',
];

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, open]);

  async function sendMessage(text) {
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    setError('');
    const history = messages.map((m) => ({ role: m.role, content: m.content }));
    setMessages((prev) => [...prev, { role: 'user', content: trimmed }]);
    setInput('');
    setSending(true);

    try {
      const res = await api.post('/chat', { message: trimmed, history });
      setMessages((prev) => [...prev, { role: 'assistant', content: res.data.reply }]);
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong asking that.');
    } finally {
      setSending(false);
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    sendMessage(input);
  }

  return (
    <div className="chat-widget">
      {open && (
        <div className="chat-panel">
          <div className="chat-panel-header">
            <span>Ask about your reviews</span>
            <button type="button" className="chat-close" onClick={() => setOpen(false)} aria-label="Close chat">
              ×
            </button>
          </div>

          <div className="chat-messages" ref={scrollRef}>
            {messages.length === 0 && (
              <div className="chat-empty">
                <p className="muted">Ask a question about your review data — I'll look it up for you.</p>
                <div className="chat-starters">
                  {STARTER_PROMPTS.map((prompt) => (
                    <button type="button" key={prompt} className="chat-starter" onClick={() => sendMessage(prompt)}>
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`chat-bubble chat-bubble-${m.role}`}>
                {m.content}
              </div>
            ))}
            {sending && <div className="chat-bubble chat-bubble-assistant chat-bubble-loading">Thinking...</div>}
          </div>

          {error && <div className="error-banner chat-error">{error}</div>}

          <form className="chat-input-row" onSubmit={handleSubmit}>
            <input
              type="text"
              placeholder="Ask a question..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={sending}
            />
            <button type="submit" disabled={sending || !input.trim()}>
              Send
            </button>
          </form>
        </div>
      )}

      <button type="button" className="chat-toggle" onClick={() => setOpen((o) => !o)}>
        {open ? 'Close' : 'Ask AI'}
      </button>
    </div>
  );
}
