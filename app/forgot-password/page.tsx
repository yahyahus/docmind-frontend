'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import api from '../../lib/api';

export default function ForgotPassword() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit() {
    if (!email.trim()) return;
    setLoading(true);
    setError('');
    try {
      await api.post('/auth/forgot-password', { email });
      setSent(true);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  const inputStyle = {
    width: '100%', background: 'var(--bg-elevated)',
    border: '1px solid var(--border)', borderRadius: '8px',
    padding: '12px 14px', color: 'var(--text-primary)',
    fontSize: '14px', outline: 'none', transition: 'border-color 0.2s',
    boxSizing: 'border-box' as const,
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', padding: '24px',
    }}>
      <div style={{
        width: '100%', maxWidth: '400px',
        background: 'var(--bg-surface)', border: '1px solid var(--border)',
        borderRadius: '16px', padding: '40px 36px',
      }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{
            width: '40px', height: '40px', borderRadius: '10px',
            background: 'linear-gradient(135deg, #6366F1, #818CF8)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '20px', margin: '0 auto 16px',
          }}>◈</div>
          <h1 className="font-mono" style={{ fontSize: '20px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '8px' }}>
            Forgot password
          </h1>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
            {sent ? 'Check your email for a reset link' : "Enter your email and we'll send a reset link"}
          </p>
        </div>

        {!sent ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {error && (
              <div style={{
                background: '#F8717115', border: '1px solid #F8717130',
                borderRadius: '8px', padding: '12px 14px',
                color: 'var(--danger)', fontSize: '13px',
              }}>{error}</div>
            )}
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              placeholder="you@example.com"
              style={inputStyle}
              onFocus={e => e.target.style.borderColor = 'var(--accent)'}
              onBlur={e => e.target.style.borderColor = 'var(--border)'}
            />
            <button
              onClick={handleSubmit}
              disabled={loading || !email.trim()}
              style={{
                background: loading || !email.trim() ? 'var(--bg-elevated)' : 'linear-gradient(135deg, #6366F1, #818CF8)',
                border: `1px solid ${loading || !email.trim() ? 'var(--border)' : 'transparent'}`,
                borderRadius: '8px', padding: '13px',
                color: loading || !email.trim() ? 'var(--text-muted)' : 'white',
                fontSize: '14px', fontWeight: 600,
                cursor: loading || !email.trim() ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s',
              }}
            >
              {loading ? 'Sending...' : 'Send reset link →'}
            </button>
          </div>
        ) : (
          <div style={{
            background: '#34D39915', border: '1px solid #34D39930',
            borderRadius: '10px', padding: '20px', textAlign: 'center',
          }}>
            <div style={{ fontSize: '28px', marginBottom: '8px' }}>📬</div>
            <div style={{ fontSize: '14px', color: 'var(--success)', fontWeight: 500 }}>
              Reset link sent to {email}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px' }}>
              Check your inbox — link expires in 1 hour
            </div>
          </div>
        )}

        <div style={{ textAlign: 'center', marginTop: '24px' }}>
          <button onClick={() => router.push('/login')} style={{
            background: 'none', border: 'none',
            color: 'var(--text-secondary)', fontSize: '13px', cursor: 'pointer',
          }}>
            ← Back to login
          </button>
        </div>
      </div>
    </div>
  );
}