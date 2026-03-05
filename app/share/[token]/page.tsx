'use client';
import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';

interface SharedMessage {
  role: string;
  content: string;
  created_at: string;
}

interface SharedConversation {
  title: string;
  created_at: string;
  messages: SharedMessage[];
}

export default function SharePage() {
  const params = useParams();
  const token = params.token as string;
  const [data, setData] = useState<SharedConversation | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/share/${token}`
        );
        if (!res.ok) { setNotFound(true); return; }
        const json = await res.json();
        setData(json);
      } catch {
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [token]);

  const S = {
    bubble: (role: string) => ({
      maxWidth: '72%', padding: '12px 16px',
      borderRadius: role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
      background: role === 'user' ? 'linear-gradient(135deg, #6366F1, #818CF8)' : 'var(--bg-elevated)',
      border: role === 'user' ? 'none' : '1px solid var(--border)',
      color: 'var(--text-primary)', fontSize: '14px', lineHeight: '1.6',
      whiteSpace: 'pre-wrap' as const,
    }),
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <header style={{
        borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)',
        padding: '0 24px', height: '56px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '28px', height: '28px', borderRadius: '7px',
            background: 'linear-gradient(135deg, #6366F1, #818CF8)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px',
          }}>◈</div>
          <span className="font-mono" style={{ fontSize: '16px', fontWeight: 500, color: 'var(--text-primary)' }}>
            DocMind
          </span>
        </div>
        <span style={{
          background: 'var(--bg-elevated)', border: '1px solid var(--border)',
          borderRadius: '6px', padding: '4px 10px',
          fontSize: '11px', color: 'var(--text-muted)',
        }}>
          Read-only
        </span>
      </header>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '32px 24px' }}>
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
          {loading ? (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '80px 0' }}>
              Loading...
            </div>
          ) : notFound ? (
            <div style={{ textAlign: 'center', padding: '80px 20px' }}>
              <div style={{ fontSize: '32px', marginBottom: '16px' }}>🔗</div>
              <div style={{ fontSize: '16px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                Link not found or revoked
              </div>
              <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                The owner may have revoked this share link.
              </div>
            </div>
          ) : data ? (
            <>
              <div style={{ marginBottom: '32px' }}>
                <h1 className="font-mono" style={{ fontSize: '20px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '6px' }}>
                  {data.title}
                </h1>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  {data.messages.length} messages · Shared via DocMind
                </div>
              </div>

              {data.messages.map((msg, i) => (
                <div key={i} style={{
                  display: 'flex',
                  justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                  marginBottom: '16px',
                }}>
                  <div style={S.bubble(msg.role)}>{msg.content}</div>
                </div>
              ))}
            </>
          ) : null}
        </div>
      </div>

      {/* Footer */}
      <div style={{
        borderTop: '1px solid var(--border)', padding: '12px 24px',
        display: 'flex', justifyContent: 'center',
        background: 'var(--bg-surface)',
      }}>
        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
          Powered by{' '}
          <a href="/" style={{ color: 'var(--accent-bright)', textDecoration: 'none' }}>DocMind</a>
        </span>
      </div>
    </div>
  );
}