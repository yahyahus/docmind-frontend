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
  document_ids: string[];
}

interface Doc {
  id: string;
  title: string;
  is_processed: boolean;
}

export default function Chat() {
  const router = useRouter();
  const params = useParams();
  const convId = params.id as string;

  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [exportOpen, setExportOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { fetchAll(); }, [convId]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, sending]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (exportOpen) setExportOpen(false);
    }
    window.document.addEventListener('click', handleClickOutside);
    return () => window.document.removeEventListener('click', handleClickOutside);
  }, [exportOpen]);

  async function fetchAll() {
    try {
      const [convRes, msgsRes] = await Promise.all([
        api.get(`/conversations/${convId}`),
        api.get(`/conversations/${convId}/messages`),
      ]);
      const conv = convRes.data;
      setConversation(conv);
      setMessages(msgsRes.data);

      // Load all linked documents
      const docIds: string[] = conv.document_ids?.length
        ? conv.document_ids
        : conv.document_id ? [conv.document_id] : [];

      if (docIds.length > 0) {
        const docResults = await Promise.all(docIds.map((id: string) => api.get(`/documents/${id}`)));
        setDocs(docResults.map(r => r.data));
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
    const assistantId = 'stream-' + Date.now();

    setMessages(prev => [...prev, {
      id: tempId, role: 'user', content: question,
      created_at: new Date().toISOString(),
    }]);

    setMessages(prev => [...prev, {
      id: assistantId, role: 'assistant', content: '',
      created_at: new Date().toISOString(),
    }]);

    try {
      const token = typeof window !== 'undefined'
        ? window.document.cookie.split('; ').find(row => row.startsWith('token='))?.split('=')[1]
        : '';

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/conversations/${convId}/chat/stream`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({ content: question }),
        }
      );

      if (!response.ok) throw new Error('Stream failed');

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.content) {
              setMessages(prev => prev.map(m =>
                m.id === assistantId ? { ...m, content: m.content + data.content } : m
              ));
            }
            if (data.done) {
              setMessages(prev => prev.map(m =>
                m.id === assistantId ? { ...m, id: data.id } : m
              ));
            }
            if (data.error) throw new Error(data.error);
          } catch { /* skip malformed lines */ }
        }
      }
    } catch {
      setError('AI response failed. Please try again.');
      setMessages(prev => prev.filter(m => m.id !== tempId && m.id !== assistantId));
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  }

  async function handleExport(format: 'md' | 'txt' | 'pdf') {
    try {
      const res = await api.get(`/conversations/${convId}/export`);
      const { title, markdown } = res.data;
      const safeName = title.replace(/[^a-z0-9]/gi, '-').toLowerCase();

      if (format === 'md') {
        const blob = new Blob([markdown], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = window.document.createElement('a');
        a.href = url;
        a.download = `${safeName}.md`;
        a.click();
        URL.revokeObjectURL(url);

      } else if (format === 'txt') {
        // Strip markdown formatting for plain text
        const plain = markdown
          .replace(/\*\*(.*?)\*\*/g, '$1')   // remove bold
          .replace(/#{1,6} /g, '')            // remove headings
          .replace(/\*/g, '');               // remove remaining *
        const blob = new Blob([plain], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = window.document.createElement('a');
        a.href = url;
        a.download = `${safeName}.txt`;
        a.click();
        URL.revokeObjectURL(url);

      } else if (format === 'pdf') {
        const { jsPDF } = await import('jspdf');
        const doc = new jsPDF({ unit: 'pt', format: 'a4' });
        const pageWidth = doc.internal.pageSize.getWidth();
        const margin = 48;
        const maxWidth = pageWidth - margin * 2;
        let y = 60;

        // Title
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(18);
        doc.text(title, margin, y);
        y += 28;

        // Meta
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.setTextColor(150);
        doc.text(`Exported from DocMind — ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`, margin, y);
        y += 28;

        // Messages
        messages.forEach((msg) => {
          if (y > 760) { doc.addPage(); y = 48; }

          // Role label
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(11);
          doc.setTextColor(msg.role === 'user' ? 99 : 55, msg.role === 'user' ? 102 : 65, msg.role === 'user' ? 241 : 71);
          doc.text(msg.role === 'user' ? 'You' : 'DocMind', margin, y);
          y += 16;

          // Message content
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(11);
          doc.setTextColor(30, 30, 30);
          const lines = doc.splitTextToSize(msg.content, maxWidth);
          lines.forEach((line: string) => {
            if (y > 760) { doc.addPage(); y = 48; }
            doc.text(line, margin, y);
            y += 16;
          });

          y += 12; // spacing between messages
        });

        doc.save(`${safeName}.pdf`);
      }
    } catch {
      setError('Export failed.');
    }
  }

  async function handleShare() {
    try {
      const res = await api.post(`/conversations/${convId}/share`);
      setShareUrl(res.data.url);
      setShareOpen(true);
    } catch {
      setError('Failed to create share link.');
    }
  }

  async function handleRevokeShare() {
    try {
      await api.delete(`/conversations/${convId}/share`);
      setShareUrl(null);
      setShareOpen(false);
    } catch {
      setError('Failed to revoke share link.');
    }
  }

  async function handleCopyLink() {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 2000);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px';
  }

  const isMulti = docs.length > 1;
  const headerTitle = isMulti
    ? `${docs.length} documents`
    : docs[0]?.title || conversation?.title || 'Loading...';
  const headerSub = isMulti
    ? docs.map(d => d.title).join(' · ')
    : 'AI Document Chat';

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
              {headerTitle}
            </div>
            <div style={{
              fontSize: '11px', color: 'var(--text-muted)', marginTop: '1px',
              maxWidth: '400px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {headerSub}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {isMulti && (
            <span style={{
              background: '#34D39915', border: '1px solid #34D39930',
              borderRadius: '6px', padding: '4px 10px',
              color: 'var(--success)', fontSize: '11px', fontWeight: 500,
            }}>
              {docs.length} docs
            </span>
          )}
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            {messages.length} message{messages.length !== 1 ? 's' : ''}
          </div>
          <div style={{ position: 'relative' }}>
            <button
              onClick={handleShare}
              style={{
                background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                borderRadius: '7px', padding: '6px 12px',
                color: 'var(--text-secondary)', fontSize: '12px',
                cursor: 'pointer', transition: 'all 0.2s',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--accent)';
                (e.currentTarget as HTMLButtonElement).style.color = 'var(--accent-bright)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)';
                (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)';
              }}
            >
              ↗ Share
            </button>
            <button
              onClick={() => setExportOpen(!exportOpen)}
              style={{
                background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                borderRadius: '7px', padding: '6px 12px',
                color: 'var(--text-secondary)', fontSize: '12px',
                cursor: 'pointer', transition: 'all 0.2s',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--accent)';
                (e.currentTarget as HTMLButtonElement).style.color = 'var(--accent-bright)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)';
                (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)';
              }}
            >
              ↓ Export
            </button>

            {exportOpen && (
              <div style={{
                position: 'absolute', right: 0, top: '36px', zIndex: 20,
                background: 'var(--bg-surface)', border: '1px solid var(--border)',
                borderRadius: '10px', padding: '6px', minWidth: '140px',
                boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
              }}>
                {([
                  { fmt: 'md', label: '📄 Markdown', sub: '.md file' },
                  { fmt: 'txt', label: '📝 Plain text', sub: '.txt file' },
                  { fmt: 'pdf', label: '🖨️ PDF', sub: 'print to PDF' },
                ] as const).map(({ fmt, label, sub }) => (
                  <button
                    key={fmt}
                    onClick={() => { handleExport(fmt); setExportOpen(false); }}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left',
                      background: 'none', border: 'none', borderRadius: '7px',
                      padding: '8px 12px', cursor: 'pointer',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-elevated)'}
                    onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = 'none'}
                  >
                    <div style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{label}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{sub}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
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
              <div style={{ fontSize: '40px', marginBottom: '16px' }}>{isMulti ? '🗂️' : '◈'}</div>
              <div className="font-mono" style={{ fontSize: '18px', color: 'var(--text-primary)', marginBottom: '8px' }}>
                Ready to explore
              </div>
              <div style={{ fontSize: '14px', color: 'var(--text-muted)', maxWidth: '400px', margin: '0 auto', lineHeight: '1.6' }}>
                {isMulti
                  ? `Ask questions across ${docs.map(d => d.title).join(', ')}`
                  : <>Ask anything about <strong style={{ color: 'var(--text-secondary)' }}>{docs[0]?.title}</strong></>
                }
              </div>
              <div style={{ marginTop: '32px', display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap' as const }}>
                {(isMulti
                  ? ['What do these documents have in common?', 'Summarize each document', 'Compare the main topics']
                  : ['Summarize this document', 'What are the main topics?', 'What are the key conclusions?']
                ).map(q => (
                  <button key={q} onClick={() => setInput(q)} style={{
                    background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                    borderRadius: '20px', padding: '8px 16px',
                    color: 'var(--text-secondary)', fontSize: '13px', cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                    onMouseEnter={e => {
                      (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--accent)';
                      (e.currentTarget as HTMLButtonElement).style.color = 'var(--accent-bright)';
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)';
                      (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)';
                    }}
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
                  <div style={S.bubble(msg.role)}>
                    {msg.content || (msg.role === 'assistant' && sending ? (
                      <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                        <span className="dot-bounce" style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--text-muted)', display: 'block' }} />
                        <span className="dot-bounce" style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--text-muted)', display: 'block' }} />
                        <span className="dot-bounce" style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--text-muted)', display: 'block' }} />
                      </div>
                    ) : null)}
                  </div>
                </div>
              ))}
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
            placeholder={isMulti ? 'Ask a question across all documents...' : 'Ask a question about your document...'}
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
      {shareOpen && shareUrl && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 50, padding: '24px',
        }}
          onClick={() => setShareOpen(false)}
        >
          <div style={{
            background: 'var(--bg-surface)', border: '1px solid var(--border)',
            borderRadius: '16px', padding: '32px', width: '100%', maxWidth: '480px',
          }}
            onClick={e => e.stopPropagation()}
          >
            <h2 className="font-mono" style={{ fontSize: '16px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '8px' }}>
              Share conversation
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '20px' }}>
              Anyone with this link can view this conversation in read-only mode.
            </p>

            {/* Link box */}
            <div style={{
              display: 'flex', gap: '8px', marginBottom: '16px',
            }}>
              <div style={{
                flex: 1, background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                borderRadius: '8px', padding: '10px 14px',
                fontSize: '12px', color: 'var(--text-muted)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                fontFamily: 'DM Mono, monospace',
              }}>
                {shareUrl}
              </div>
              <button
                onClick={handleCopyLink}
                style={{
                  background: shareCopied ? '#34D39915' : 'linear-gradient(135deg, #6366F1, #818CF8)',
                  border: shareCopied ? '1px solid #34D39930' : 'none',
                  borderRadius: '8px', padding: '10px 16px',
                  color: shareCopied ? 'var(--success)' : 'white',
                  fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                  transition: 'all 0.2s', whiteSpace: 'nowrap',
                }}
              >
                {shareCopied ? '✓ Copied' : 'Copy'}
              </button>
            </div>

            {/* Revoke + Close */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button
                onClick={handleRevokeShare}
                style={{
                  background: 'none', border: 'none',
                  color: 'var(--danger)', fontSize: '12px', cursor: 'pointer',
                }}
              >
                Revoke link
              </button>
              <button
                onClick={() => setShareOpen(false)}
                style={{
                  background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                  borderRadius: '7px', padding: '8px 16px',
                  color: 'var(--text-secondary)', fontSize: '12px', cursor: 'pointer',
                }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}