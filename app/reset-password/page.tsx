'use client';
import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import api from '../../lib/api';

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) setError('Invalid reset link. Please request a new one.');
  }, [token]);

  async function handleReset() {
    setError('');
    if (password !== confirm) { setError('Passwords do not match'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters'); return; }
    setLoading(true);
    try {
      await api.post('/auth/reset-password', { token, new_password: password });
      setSuccess(true);
      setTimeout(() => router.push('/login'), 2500);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Reset failed. Link may have expired.');
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
            Reset password
          </h1>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
            {success ? 'Password updated — redirecting to login' : 'Choose a new password for your account'}
          </p>
        </div>

        {success ? (
          <div style={{
            background: '#34D39915', border: '1px solid #34D39930',
            borderRadius: '10px', padding: '20px', textAlign: 'center',
          }}>
            <div style={{ fontSize: '28px', marginBottom: '8px' }}>✓</div>
            <div style={{ fontSize: '14px', color: 'var(--success)', fontWeight: 500 }}>
              Password changed successfully
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {error && (
              <div style={{
                background: '#F8717115', border: '1px solid #F8717130',
                borderRadius: '8px', padding: '12px 14px',
                color: 'var(--danger)', fontSize: '13px',
              }}>{error}</div>
            )}
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="New password (min 8 characters)"
              style={inputStyle}
              onFocus={e => e.target.style.borderColor = 'var(--accent)'}
              onBlur={e => e.target.style.borderColor = 'var(--border)'}
            />
            <input
              type="password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleReset()}
              placeholder="Confirm new password"
              style={inputStyle}
              onFocus={e => e.target.style.borderColor = 'var(--accent)'}
              onBlur={e => e.target.style.borderColor = 'var(--border)'}
            />
            <button
              onClick={handleReset}
              disabled={loading || !password || !confirm || !token}
              style={{
                background: loading || !password || !confirm ? 'var(--bg-elevated)' : 'linear-gradient(135deg, #6366F1, #818CF8)',
                border: `1px solid ${loading || !password || !confirm ? 'var(--border)' : 'transparent'}`,
                borderRadius: '8px', padding: '13px',
                color: loading || !password || !confirm ? 'var(--text-muted)' : 'white',
                fontSize: '14px', fontWeight: 600,
                cursor: loading || !password || !confirm ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s',
              }}
            >
              {loading ? 'Updating...' : 'Reset password →'}
            </button>
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

export default function ResetPassword() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}