'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Cookies from 'js-cookie';
import api from '../../lib/api';

interface Stats {
  documents: number;
  processed_documents: number;
  conversations: number;
  messages: number;
  chunks_indexed: number;
  member_since: string;
}

interface User {
  id: string;
  email: string;
  created_at: string;
}

export default function Profile() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState('');
  const [pwLoading, setPwLoading] = useState(false);

  useEffect(() => { fetchAll(); }, []);

  async function fetchAll() {
    try {
      const [userRes, statsRes] = await Promise.all([
        api.get('/auth/me'),
        api.get('/auth/stats'),
      ]);
      setUser(userRes.data);
      setStats(statsRes.data);
    } catch {
      router.push('/login');
    } finally {
      setLoading(false);
    }
  }

  async function handleChangePassword() {
    setPwError('');
    setPwSuccess('');
    if (newPassword !== confirmPassword) {
      setPwError('New passwords do not match');
      return;
    }
    if (newPassword.length < 8) {
      setPwError('New password must be at least 8 characters');
      return;
    }
    setPwLoading(true);
    try {
      await api.post('/auth/change-password', {
        current_password: currentPassword,
        new_password: newPassword,
      });
      setPwSuccess('Password changed successfully');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setPwError(err.response?.data?.detail || 'Failed to change password');
    } finally {
      setPwLoading(false);
    }
  }

  function handleLogout() {
    Cookies.remove('token');
    router.push('/login');
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'long', day: 'numeric', year: 'numeric'
    });
  }

  const statCards = stats ? [
    { label: 'Documents', value: stats.documents, sub: `${stats.processed_documents} AI ready` },
    { label: 'Conversations', value: stats.conversations, sub: 'chat sessions' },
    { label: 'Messages', value: stats.messages, sub: 'exchanged' },
    { label: 'Chunks Indexed', value: stats.chunks_indexed, sub: 'vector embeddings' },
  ] : [];

  const inputStyle = {
    width: '100%', background: 'var(--bg-elevated)',
    border: '1px solid var(--border)', borderRadius: '8px',
    padding: '12px 14px', color: 'var(--text-primary)',
    fontSize: '14px', outline: 'none', transition: 'border-color 0.2s',
  };

  return (
    <div style={{ minHeight: '100vh' }}>
      {/* Header */}
      <header style={{
        borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)',
        padding: '0 32px', height: '56px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', position: 'sticky' as const, top: 0, zIndex: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button onClick={() => router.push('/dashboard')} style={{
            background: 'none', border: 'none', color: 'var(--text-secondary)',
            cursor: 'pointer', fontSize: '13px',
          }}>
            ← Back
          </button>
          <div style={{ width: '1px', height: '16px', background: 'var(--border)' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '28px', height: '28px', borderRadius: '7px',
              background: 'linear-gradient(135deg, #6366F1, #818CF8)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px',
            }}>◈</div>
            <span className="font-mono" style={{ fontSize: '16px', fontWeight: 500, letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>
              DocMind
            </span>
          </div>
        </div>
        <button onClick={handleLogout} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: '13px', cursor: 'pointer' }}>
          Sign out
        </button>
      </header>

      <main style={{ maxWidth: '720px', margin: '0 auto', padding: '40px 32px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '80px 0' }}>Loading...</div>
        ) : (
          <div className="animate-fade-up">
            {/* Page title */}
            <div style={{ marginBottom: '40px' }}>
              <h1 className="font-mono" style={{ fontSize: '24px', fontWeight: 500, color: 'var(--text-primary)', letterSpacing: '-0.03em', marginBottom: '4px' }}>
                Profile
              </h1>
              <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                {user?.email} · Member since {user ? formatDate(user.created_at) : ''}
              </p>
            </div>

            {/* Stats grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', marginBottom: '40px' }}>
              {statCards.map((card) => (
                <div key={card.label} style={{
                  background: 'var(--bg-surface)', border: '1px solid var(--border)',
                  borderRadius: '12px', padding: '20px 24px',
                }}>
                  <div className="font-mono" style={{ fontSize: '28px', fontWeight: 500, color: 'var(--text-primary)', letterSpacing: '-0.03em' }}>
                    {card.value}
                  </div>
                  <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)', marginTop: '4px' }}>
                    {card.label}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    {card.sub}
                  </div>
                </div>
              ))}
            </div>

            {/* Change password */}
            <div style={{
              background: 'var(--bg-surface)', border: '1px solid var(--border)',
              borderRadius: '16px', padding: '28px 32px',
            }}>
              <h2 className="font-mono" style={{ fontSize: '16px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '20px', letterSpacing: '-0.02em' }}>
                Change Password
              </h2>

              {pwError && (
                <div style={{
                  background: '#F8717115', border: '1px solid #F8717130',
                  borderRadius: '8px', padding: '12px 16px', marginBottom: '16px',
                  color: 'var(--danger)', fontSize: '13px',
                }}>
                  {pwError}
                </div>
              )}

              {pwSuccess && (
                <div style={{
                  background: '#34D39915', border: '1px solid #34D39930',
                  borderRadius: '8px', padding: '12px 16px', marginBottom: '16px',
                  color: 'var(--success)', fontSize: '13px',
                }}>
                  {pwSuccess}
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '8px', letterSpacing: '0.05em', textTransform: 'uppercase' as const }}>
                    Current Password
                  </label>
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={e => setCurrentPassword(e.target.value)}
                    placeholder="••••••••"
                    style={inputStyle}
                    onFocus={e => e.target.style.borderColor = 'var(--accent)'}
                    onBlur={e => e.target.style.borderColor = 'var(--border)'}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '8px', letterSpacing: '0.05em', textTransform: 'uppercase' as const }}>
                    New Password
                  </label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    placeholder="Minimum 8 characters"
                    style={inputStyle}
                    onFocus={e => e.target.style.borderColor = 'var(--accent)'}
                    onBlur={e => e.target.style.borderColor = 'var(--border)'}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '8px', letterSpacing: '0.05em', textTransform: 'uppercase' as const }}>
                    Confirm New Password
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    onKeyDown={e => e.key === 'Enter' && handleChangePassword()}
                    style={inputStyle}
                    onFocus={e => e.target.style.borderColor = 'var(--accent)'}
                    onBlur={e => e.target.style.borderColor = 'var(--border)'}
                  />
                </div>
                <button
                  type="button"
                  onClick={handleChangePassword}
                  disabled={pwLoading || !currentPassword || !newPassword || !confirmPassword}
                  style={{
                    marginTop: '4px',
                    background: (pwLoading || !currentPassword || !newPassword || !confirmPassword)
                      ? 'var(--bg-elevated)' : 'linear-gradient(135deg, #6366F1, #818CF8)',
                    border: '1px solid ' + ((pwLoading || !currentPassword || !newPassword || !confirmPassword)
                      ? 'var(--border)' : 'transparent'),
                    borderRadius: '8px', padding: '13px',
                    color: (pwLoading || !currentPassword || !newPassword || !confirmPassword)
                      ? 'var(--text-muted)' : 'white',
                    fontSize: '14px', fontWeight: 600,
                    cursor: (pwLoading || !currentPassword || !newPassword || !confirmPassword)
                      ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s', width: '100%',
                  }}
                >
                  {pwLoading ? 'Updating...' : 'Update Password →'}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}