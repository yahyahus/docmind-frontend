'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import api from '../../../lib/api';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

interface Conversation {
  id: string;
  title: string;
  document_id: string;
}

interface Document {
  id: string;
  title: string;
  is_processed: boolean;
}

export default function Chat() {
  const router = useRouter();
  const params = useParams();
  const convId = params.id as string;

  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [document, setDocument] = useState<Document | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { fetchAll(); }, [convId]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, sending]);

  async function fetchAll() {
    try {
      const [convRes, msgsRes] = await Promise.all([
        api.get(`/conversations/${convId}`),
        api.get(`/conversations/${convId}/messages`),
      ]);
      setConversation(convRes.data);
      setMessages(msgsRes.data);

      if (convRes.data.document_id) {
        const docRes = await api.get(`/documents/${convRes.data.document_id}`);
        setDocument(docRes.data);
      }
    } catch {
      setError('Failed to load conversation.');
    } finally {
      setLoading(false);
    }
  }

  async function handleSend() {
    if (!input.trim() || sending) return;
    const question = input.trim();
    setInput('');
    setSending(true);
    setError('');

    const tempId = 'temp-' + Date.now();
    setMessages(prev => [...prev, {
      id: tempId, role: 'user', content: question,
      created_at: new Date().toISOString(),
    }]);

    try {
      const response = await api.post(`/conversations/${convId}/chat`, { content: question });
      setMessages(prev => [
        ...prev.filter(m => m.id !== tempId),
        { id: tempId + '-real', role: 'user', content: question, created_at: new Date().toISOString() },
        response.data,
      ]);
    } catch {
      setError('AI response failed. Please try again.');
      setMessages(prev => prev.filter(m => m.id !== tempId));
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  // Auto-resize textarea
  function handleInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px';
  }

  const S = {
    page: { height: '100vh', display: 'flex', flexDirection: 'column' as const, overflow: 'hidden' },
    header: {
      borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)',
      padding: '0 24px', height: '56px', display: 'flex', alignItems: 'center',
      justifyContent: 'space-between', flexShrink: 0,
    },
    messages: { flex: 1, overflowY: 'auto' as const, padding: '32px 24px' },
    msgWrap: (role: string) => ({
      display: 'flex', justifyContent: role === 'user' ? 'flex-end' : 'flex-start',
      marginBottom: '16px',
    }),
    bubble: (role: string) => ({
      maxWidth: '72%', padding: '12px 16px',
      borderRadius: role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
      background: role === 'user' ? 'linear-gradient(135deg, #6366F1, #818CF8)' : 'var(--bg-elevated)',
      border: role === 'user' ? 'none' : '1px solid var(--border)',
      color: 'var(--text-primary)', fontSize: '14px', lineHeight: '1.6',
      whiteSpace: 'pre-wrap' as const,
    }),
    inputArea: {
      borderTop: '1px solid var(--border)', background: 'var(--bg-surface)',
      padding: '16px 24px', flexShrink: 0,
    },
    inputWrap: {
      maxWidth: '800px', margin: '0 auto',
      display: 'flex', gap: '12px', alignItems: 'flex-end',
    },
    textarea: {
      flex: 1, background: 'var(--bg-elevated)', border: '1px solid var(--border)',
      borderRadius: '12px', padding: '12px 16px', color: 'var(--text-primary)',
      fontSize: '14px', outline: 'none', resize: 'none' as const,
      lineHeight: '1.5', minHeight: '48px', maxHeight: '160px',
      transition: 'border-color 0.2s', fontFamily: 'DM Sans, sans-serif',
    },
    sendBtn: (active: boolean) => ({
      background: active ? 'linear-gradient(135deg, #6366F1, #818CF8)' : 'var(--bg-elevated)',
      border: active ? 'none' : '1px solid var(--border)',
      borderRadius: '10px', padding: '12px 20px', color: active ? 'white' : 'var(--text-muted)',
      fontSize: '13px', fontWeight: 600, cursor: active ? 'pointer' : 'not-allowed',
      transition: 'all 0.2s', flexShrink: 0, height: '48px',
    }),
  };

  return (
    <div style={S.page}>
      {/* Header */}
      <header style={S.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button onClick={() => router.push('/dashboard')} style={{
            background: 'none', border: 'none', color: 'var(--text-secondary)',
            cursor: 'pointer', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px',
          }}>
            ← Back
          </button>
          <div style={{ width: '1px', height: '16px', background: 'var(--border)' }} />
          <div>
            <div className="font-mono" style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>
              {document?.title || conversation?.title || 'Loading...'}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '1px' }}>
              AI Document Chat
            </div>
          </div>
        </div>
        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
          {messages.length} message{messages.length !== 1 ? 's' : ''}
        </div>
      </header>

      {/* Messages */}
      <div style={S.messages}>
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
          {loading ? (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '60px 0', fontSize: '14px' }}>
              Loading conversation...
            </div>
          ) : messages.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '80px 20px' }}>
              <div style={{ fontSize: '40px', marginBottom: '16px' }}>◈</div>
              <div className="font-mono" style={{ fontSize: '18px', color: 'var(--text-primary)', marginBottom: '8px' }}>
                Ready to explore
              </div>
              <div style={{ fontSize: '14px', color: 'var(--text-muted)', maxWidth: '360px', margin: '0 auto', lineHeight: '1.6' }}>
                Ask any question about <strong style={{ color: 'var(--text-secondary)' }}>{document?.title}</strong> and I&apos;ll find the answer from the document.
              </div>
              <div style={{ marginTop: '32px', display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap' as const }}>
                {['Summarize this document', 'What are the main topics?', 'What are the key conclusions?'].map(q => (
                  <button key={q} onClick={() => setInput(q)} style={{
                    background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                    borderRadius: '20px', padding: '8px 16px',
                    color: 'var(--text-secondary)', fontSize: '13px', cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--accent)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--accent-bright)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)'; }}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="animate-fade-in">
              {messages.map((msg) => (
                <div key={msg.id} style={S.msgWrap(msg.role)}>
                  <div style={S.bubble(msg.role)}>{msg.content}</div>
                </div>
              ))}
            </div>
          )}

          {sending && (
            <div style={S.msgWrap('assistant')}>
              <div style={{ ...S.bubble('assistant'), padding: '16px' }}>
                <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                  <span className="dot-bounce" style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--text-muted)', display: 'block' }} />
                  <span className="dot-bounce" style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--text-muted)', display: 'block' }} />
                  <span className="dot-bounce" style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--text-muted)', display: 'block' }} />
                </div>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input */}
      <div style={S.inputArea}>
        {error && (
          <div style={{ maxWidth: '800px', margin: '0 auto 12px', color: 'var(--danger)', fontSize: '13px' }}>
            {error}
          </div>
        )}
        <div style={S.inputWrap}>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question about your document..."
            rows={1}
            style={S.textarea}
            onFocus={e => e.target.style.borderColor = 'var(--accent)'}
            onBlur={e => e.target.style.borderColor = 'var(--border)'}
          />
          <button type="button" onClick={handleSend} disabled={sending || !input.trim()} style={S.sendBtn(!sending && !!input.trim())}>
            {sending ? '...' : 'Send'}
          </button>
        </div>
        <div style={{ maxWidth: '800px', margin: '8px auto 0', fontSize: '11px', color: 'var(--text-muted)' }}>
          Enter to send · Shift+Enter for new line
        </div>
      </div>
    </div>
  );
}
