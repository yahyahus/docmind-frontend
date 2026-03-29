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

interface History {
  days: string[];
  messages_per_day: number[];
  docs_per_day: number[];
  pdf_count: number;
  txt_count: number;
}

interface User {
  id: string;
  email: string;
  created_at: string;
}

// ─── SVG Line Chart ───────────────────────────────────────────────────────────
function LineChart({ data, color, label }: { data: number[]; color: string; label: string }) {
  const W = 600; const H = 80; const PAD = 4;
  const max = Math.max(...data, 1);
  const points = data.map((v, i) => {
    const x = PAD + (i / (data.length - 1)) * (W - PAD * 2);
    const y = H - PAD - (v / max) * (H - PAD * 2);
    return `${x},${y}`;
  }).join(' ');

  const areaPoints = [
    `${PAD},${H - PAD}`,
    ...data.map((v, i) => {
      const x = PAD + (i / (data.length - 1)) * (W - PAD * 2);
      const y = H - PAD - (v / max) * (H - PAD * 2);
      return `${x},${y}`;
    }),
    `${W - PAD},${H - PAD}`,
  ].join(' ');

  // X axis labels: show first, middle, last day (short format)
  const labelIndices = [0, 14, 29];

  return (
    <div>
      <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'DM Mono, monospace', letterSpacing: '0.05em', marginBottom: '8px', textTransform: 'uppercase' }}>
        {label}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: '80px', overflow: 'visible' }}>
        {/* Horizontal grid lines */}
        {[0.25, 0.5, 0.75, 1].map(f => {
          const y = H - PAD - f * (H - PAD * 2);
          return (
            <line key={f} x1={PAD} y1={y} x2={W - PAD} y2={y}
              stroke="var(--border)" strokeWidth="0.5" strokeDasharray="3,3" />
          );
        })}
        {/* Area fill */}
        <polygon points={areaPoints} fill={color} fillOpacity="0.08" />
        {/* Line */}
        <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
        {/* Dots on non-zero values */}
        {data.map((v, i) => {
          if (v === 0) return null;
          const x = PAD + (i / (data.length - 1)) * (W - PAD * 2);
          const y = H - PAD - (v / max) * (H - PAD * 2);
          return <circle key={i} cx={x} cy={y} r="2.5" fill={color} />;
        })}
      </svg>
      {/* X axis day labels */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
        {labelIndices.map(i => (
          <span key={i} style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'DM Mono, monospace' }}>
            {/* show as "Mar 1" */}
            {new Date(i === 0 ? '' : i === 29 ? '' : '').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── SVG Bar Chart ────────────────────────────────────────────────────────────
function BarChart({ data, color, label }: { data: number[]; color: string; label: string }) {
  const W = 600; const H = 80; const PAD = 4;
  const max = Math.max(...data, 1);
  const barW = (W - PAD * 2) / data.length - 1;

  return (
    <div>
      <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'DM Mono, monospace', letterSpacing: '0.05em', marginBottom: '8px', textTransform: 'uppercase' }}>
        {label}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: '80px' }}>
        {/* Horizontal grid lines */}
        {[0.5, 1].map(f => {
          const y = H - PAD - f * (H - PAD * 2);
          return <line key={f} x1={PAD} y1={y} x2={W - PAD} y2={y} stroke="var(--border)" strokeWidth="0.5" strokeDasharray="3,3" />;
        })}
        {data.map((v, i) => {
          const x = PAD + i * ((W - PAD * 2) / data.length);
          const barH = (v / max) * (H - PAD * 2);
          const y = H - PAD - barH;
          return (
            <rect key={i} x={x + 0.5} y={v === 0 ? H - PAD : y}
              width={Math.max(barW, 1)} height={v === 0 ? 1 : barH}
              fill={color} fillOpacity={v === 0 ? 0.15 : 0.7}
              rx="1"
            />
          );
        })}
      </svg>
    </div>
  );
}

export default function Profile() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [history, setHistory] = useState<History | null>(null);
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
      const [userRes, statsRes, historyRes] = await Promise.all([
        api.get('/auth/me'),
        api.get('/auth/stats'),
        api.get('/auth/stats/history'),
      ]);
      setUser(userRes.data);
      setStats(statsRes.data);
      setHistory(historyRes.data);
    } catch {
      router.push('/login');
    } finally {
      setLoading(false);
    }
  }

  async function handleChangePassword() {
    setPwError(''); setPwSuccess('');
    if (newPassword !== confirmPassword) { setPwError('New passwords do not match'); return; }
    if (newPassword.length < 8) { setPwError('New password must be at least 8 characters'); return; }
    setPwLoading(true);
    try {
      await api.post('/auth/change-password', { current_password: currentPassword, new_password: newPassword });
      setPwSuccess('Password changed successfully');
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
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
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  }

  // Format day label for chart x-axis
  function fmtDay(dateStr: string) {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
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

  const totalMsgs = history ? history.messages_per_day.reduce((a, b) => a + b, 0) : 0;
  const totalDocs = history ? history.docs_per_day.reduce((a, b) => a + b, 0) : 0;
  const activeDays = history ? history.messages_per_day.filter(v => v > 0).length : 0;

  return (
    <div style={{ minHeight: '100vh' }}>
      {/* Header */}
      <header style={{
        borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)',
        padding: '0 32px', height: '56px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', position: 'sticky' as const, top: 0, zIndex: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button onClick={() => router.push('/dashboard')} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '13px' }}>
            ← Back
          </button>
          <div style={{ width: '1px', height: '16px', background: 'var(--border)' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '28px', height: '28px', borderRadius: '7px', background: 'linear-gradient(135deg, #6366F1, #818CF8)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px' }}>◈</div>
            <span className="font-mono" style={{ fontSize: '16px', fontWeight: 500, letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>DocMind</span>
          </div>
        </div>
        <button onClick={handleLogout} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: '13px', cursor: 'pointer' }}>Sign out</button>
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
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', marginBottom: '32px' }}>
              {statCards.map((card) => (
                <div key={card.label} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px 24px' }}>
                  <div className="font-mono" style={{ fontSize: '28px', fontWeight: 500, color: 'var(--text-primary)', letterSpacing: '-0.03em' }}>
                    {card.value}
                  </div>
                  <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)', marginTop: '4px' }}>{card.label}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>{card.sub}</div>
                </div>
              ))}
            </div>

            {/* Usage charts */}
            {history && (
              <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '16px', padding: '28px 32px', marginBottom: '32px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
                  <h2 className="font-mono" style={{ fontSize: '16px', fontWeight: 500, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                    Usage — last 30 days
                  </h2>
                  <div style={{ display: 'flex', gap: '16px' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      <span className="font-mono" style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{activeDays}</span> active days
                    </span>
                  </div>
                </div>

                {/* Messages chart */}
                <div style={{ marginBottom: '28px' }}>
                  {/* Chart header row */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '12px' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'DM Mono, monospace', letterSpacing: '0.05em', textTransform: 'uppercase' as const }}>
                      Messages sent
                    </div>
                    <span className="font-mono" style={{ fontSize: '13px', color: '#818CF8', fontWeight: 600 }}>{totalMsgs} total</span>
                  </div>
                  {/* SVG line chart */}
                  {(() => {
                    const data = history.messages_per_day;
                    const W = 600; const H = 80; const PAD = 4;
                    const max = Math.max(...data, 1);
                    const pts = data.map((v, i) => {
                      const x = PAD + (i / (data.length - 1)) * (W - PAD * 2);
                      const y = H - PAD - (v / max) * (H - PAD * 2);
                      return { x, y, v };
                    });
                    const polyline = pts.map(p => `${p.x},${p.y}`).join(' ');
                    const area = [`${PAD},${H - PAD}`, ...pts.map(p => `${p.x},${p.y}`), `${W - PAD},${H - PAD}`].join(' ');
                    return (
                      <div>
                        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: '80px', overflow: 'visible' }}>
                          {[0.25, 0.5, 0.75, 1].map(f => (
                            <line key={f} x1={PAD} y1={H - PAD - f * (H - PAD * 2)} x2={W - PAD} y2={H - PAD - f * (H - PAD * 2)}
                              stroke="var(--border)" strokeWidth="0.5" strokeDasharray="3,3" />
                          ))}
                          <polygon points={area} fill="#6366F1" fillOpacity="0.08" />
                          <polyline points={polyline} fill="none" stroke="#818CF8" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
                          {pts.map((p, i) => p.v > 0 ? <circle key={i} cx={p.x} cy={p.y} r="2.5" fill="#818CF8" /> : null)}
                        </svg>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
                          {[0, 14, 29].map(i => (
                            <span key={i} style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'DM Mono, monospace' }}>
                              {fmtDay(history.days[i])}
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* Docs uploaded chart */}
                <div style={{ marginBottom: '24px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '12px' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'DM Mono, monospace', letterSpacing: '0.05em', textTransform: 'uppercase' as const }}>
                      Documents uploaded
                    </div>
                    <span className="font-mono" style={{ fontSize: '13px', color: '#34D399', fontWeight: 600 }}>{totalDocs} total</span>
                  </div>
                  {(() => {
                    const data = history.docs_per_day;
                    const W = 600; const H = 60; const PAD = 4;
                    const max = Math.max(...data, 1);
                    const barW = (W - PAD * 2) / data.length - 1;
                    return (
                      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: '60px' }}>
                        {[0.5, 1].map(f => (
                          <line key={f} x1={PAD} y1={H - PAD - f * (H - PAD * 2)} x2={W - PAD} y2={H - PAD - f * (H - PAD * 2)}
                            stroke="var(--border)" strokeWidth="0.5" strokeDasharray="3,3" />
                        ))}
                        {data.map((v, i) => {
                          const x = PAD + i * ((W - PAD * 2) / data.length);
                          const barH = v === 0 ? 1 : (v / max) * (H - PAD * 2);
                          const y = v === 0 ? H - PAD : H - PAD - barH;
                          return <rect key={i} x={x + 0.5} y={y} width={Math.max(barW, 1)} height={barH} fill="#34D399" fillOpacity={v === 0 ? 0.12 : 0.65} rx="1" />;
                        })}
                      </svg>
                    );
                  })()}
                </div>

                {/* File type breakdown */}
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: '20px', display: 'flex', gap: '24px' }}>
                  <div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'DM Mono, monospace', letterSpacing: '0.05em', textTransform: 'uppercase' as const, marginBottom: '6px' }}>
                      PDF files
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontFamily: 'DM Mono, monospace', fontSize: '22px', fontWeight: 500, color: 'var(--danger)' }}>
                        {history.pdf_count}
                      </span>
                      <span style={{ fontSize: '10px', background: '#F8717115', border: '1px solid #F8717130', borderRadius: '4px', padding: '2px 6px', color: 'var(--danger)', fontFamily: 'DM Mono, monospace', letterSpacing: '0.05em' }}>
                        PDF
                      </span>
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'DM Mono, monospace', letterSpacing: '0.05em', textTransform: 'uppercase' as const, marginBottom: '6px' }}>
                      TXT files
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontFamily: 'DM Mono, monospace', fontSize: '22px', fontWeight: 500, color: 'var(--accent-bright)' }}>
                        {history.txt_count}
                      </span>
                      <span style={{ fontSize: '10px', background: '#6366F115', border: '1px solid #6366F130', borderRadius: '4px', padding: '2px 6px', color: 'var(--accent-bright)', fontFamily: 'DM Mono, monospace', letterSpacing: '0.05em' }}>
                        TXT
                      </span>
                    </div>
                  </div>
                  {stats && (
                    <div style={{ marginLeft: 'auto' }}>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'DM Mono, monospace', letterSpacing: '0.05em', textTransform: 'uppercase' as const, marginBottom: '6px' }}>
                        AI ready
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontFamily: 'DM Mono, monospace', fontSize: '22px', fontWeight: 500, color: 'var(--success)' }}>
                          {stats.processed_documents}
                        </span>
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                          / {stats.documents}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Change password */}
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '16px', padding: '28px 32px' }}>
              <h2 className="font-mono" style={{ fontSize: '16px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '20px', letterSpacing: '-0.02em' }}>
                Change Password
              </h2>

              {pwError && (
                <div style={{ background: '#F8717115', border: '1px solid #F8717130', borderRadius: '8px', padding: '12px 16px', marginBottom: '16px', color: 'var(--danger)', fontSize: '13px' }}>
                  {pwError}
                </div>
              )}
              {pwSuccess && (
                <div style={{ background: '#34D39915', border: '1px solid #34D39930', borderRadius: '8px', padding: '12px 16px', marginBottom: '16px', color: 'var(--success)', fontSize: '13px' }}>
                  {pwSuccess}
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {[
                  { label: 'Current Password', value: currentPassword, set: setCurrentPassword, placeholder: '••••••••' },
                  { label: 'New Password', value: newPassword, set: setNewPassword, placeholder: 'Minimum 8 characters' },
                  { label: 'Confirm New Password', value: confirmPassword, set: setConfirmPassword, placeholder: '••••••••' },
                ].map(({ label, value, set, placeholder }) => (
                  <div key={label}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '8px', letterSpacing: '0.05em', textTransform: 'uppercase' as const }}>
                      {label}
                    </label>
                    <input
                      type="password"
                      value={value}
                      onChange={e => set(e.target.value)}
                      placeholder={placeholder}
                      onKeyDown={e => e.key === 'Enter' && label === 'Confirm New Password' && handleChangePassword()}
                      style={inputStyle}
                      onFocus={e => e.target.style.borderColor = 'var(--accent)'}
                      onBlur={e => e.target.style.borderColor = 'var(--border)'}
                    />
                  </div>
                ))}
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