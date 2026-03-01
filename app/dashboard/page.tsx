'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Cookies from 'js-cookie';
import api from '../../lib/api';
import { wakeUpBackend } from '../../lib/wakeup';

interface Document {
  id: string;
  title: string;
  file_type: string;
  is_processed: boolean;
  created_at: string;
  summary?: string;
}

interface Conversation {
    id: string;
    document_id: string;
    title: string;
    updated_at: string;
}

export default function Dashboard() {
    const router = useRouter();
    const [documents, setDocuments] = useState<Document[]>([]);
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [processing, setProcessing] = useState<string | null>(null);
    const [error, setError] = useState('');
    const [search, setSearch] = useState('');
    const [activeTab, setActiveTab] = useState<'documents' | 'conversations'>('documents');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editingTitle, setEditingTitle] = useState('');

    useEffect(() => {
        wakeUpBackend();
        fetchAll();
    }, []);

    async function fetchAll() {
        try {
            const [docsRes, convsRes] = await Promise.all([
                api.get('/documents'),
                api.get('/conversations'),
            ]);
            setDocuments([...docsRes.data]);
            setConversations([...convsRes.data]);
        } catch {
            setError('Failed to load. Please refresh.');
        } finally {
            setLoading(false);
        }
    }

    async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploading(true);
        setError('');
        try {
            const formData = new FormData();
            formData.append('file', file);
            await api.post('/documents/upload', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            await fetchAll();
        } catch {
            setError('Upload failed. PDF and TXT only, max 5MB.');
        } finally {
            setUploading(false);
            e.target.value = '';
        }
    }

    async function handleProcess(docId: string) {
        setProcessing(docId);
        setError('');
        try {
            await api.post(`/documents/${docId}/process`);
            await new Promise(r => setTimeout(r, 600));
            const res = await api.get('/documents');
            setDocuments([...res.data]);
        } catch {
            setError('Processing failed.');
        } finally {
            setProcessing(null);
        }
    }

    async function handleChat(docId: string) {
        try {
            const existing = conversations.find(c => c.document_id === docId);
            if (existing) {
                router.push(`/chat/${existing.id}`);
            } else {
                const doc = documents.find(d => d.id === docId);
                const res = await api.post('/conversations', {
                    title: doc?.title || 'New conversation',
                    document_id: docId,
                });
                router.push(`/chat/${res.data.id}`);
            }
        } catch {
            setError('Failed to open chat.');
        }
    }

    async function handleDelete(docId: string) {
        if (!confirm('Delete this document? This cannot be undone.')) return;
        try {
            await api.delete(`/documents/${docId}`);
            setDocuments(prev => prev.filter(d => d.id !== docId));
            setConversations(prev => prev.filter(c => c.document_id !== docId));
        } catch {
            setError('Delete failed.');
        }
    }

    async function handleDeleteConversation(convId: string) {
        if (!confirm('Delete this conversation?')) return;
        try {
            await api.delete(`/conversations/${convId}`);
            setConversations(prev => prev.filter(c => c.id !== convId));
        } catch {
            setError('Delete failed.');
        }
    }

    async function handleRename(docId: string) {
        if (!editingTitle.trim()) { setEditingId(null); return; }
        try {
            await api.patch(`/documents/${docId}`, { title: editingTitle });
            setDocuments(prev => prev.map(d => d.id === docId ? { ...d, title: editingTitle } : d));
        } catch {
            setError('Rename failed.');
        } finally {
            setEditingId(null);
        }
    }

    function handleLogout() {
        Cookies.remove('token');
        router.push('/login');
    }

    function formatDate(dateStr: string) {
        return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }

    const filteredDocs = documents.filter(d =>
        d.title.toLowerCase().includes(search.toLowerCase())
    );

    const filteredConvs = conversations.filter(c => {
        const doc = documents.find(d => d.id === c.document_id);
        return doc?.title.toLowerCase().includes(search.toLowerCase()) || c.title.toLowerCase().includes(search.toLowerCase());
    });

    const S = {
        page: { minHeight: '100vh', display: 'flex', flexDirection: 'column' as const },
        header: {
            borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)',
            padding: '0 32px', height: '56px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            position: 'sticky' as const, top: 0, zIndex: 10,
        },
        logo: { display: 'flex', alignItems: 'center', gap: '10px' },
        logoIcon: {
            width: '28px', height: '28px', borderRadius: '7px',
            background: 'linear-gradient(135deg, #6366F1, #818CF8)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px',
        },
        main: { flex: 1, maxWidth: '900px', margin: '0 auto', width: '100%', padding: '40px 32px' },
        topRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '32px' },
        uploadBtn: {
            display: 'inline-flex', alignItems: 'center', gap: '8px',
            background: 'linear-gradient(135deg, #6366F1, #818CF8)',
            border: 'none', borderRadius: '8px', padding: '10px 18px',
            color: 'white', fontSize: '13px', fontWeight: 600,
            cursor: 'pointer', transition: 'opacity 0.2s',
        },
        searchBar: {
            width: '100%', background: 'var(--bg-surface)',
            border: '1px solid var(--border)', borderRadius: '10px',
            padding: '12px 16px', color: 'var(--text-primary)',
            fontSize: '14px', outline: 'none', marginBottom: '24px',
            transition: 'border-color 0.2s',
        },
        tabs: { display: 'flex', gap: '4px', marginBottom: '24px', background: 'var(--bg-surface)', borderRadius: '10px', padding: '4px', width: 'fit-content' },
        tab: (active: boolean) => ({
            padding: '8px 16px', borderRadius: '7px', fontSize: '13px', fontWeight: 500,
            cursor: 'pointer', border: 'none', transition: 'all 0.2s',
            background: active ? 'var(--bg-elevated)' : 'transparent',
            color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
        }),
        card: {
            background: 'var(--bg-surface)', border: '1px solid var(--border)',
            borderRadius: '12px', padding: '18px 20px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            transition: 'border-color 0.2s, background 0.2s',
            marginBottom: '8px',
        },
        fileIcon: (type: string) => ({
            width: '40px', height: '40px', borderRadius: '8px',
            background: type === 'pdf' ? '#F8717115' : '#6366F115',
            border: `1px solid ${type === 'pdf' ? '#F8717130' : '#6366F130'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '11px', fontWeight: 600, fontFamily: 'DM Mono, monospace',
            color: type === 'pdf' ? 'var(--danger)' : 'var(--accent-bright)',
            letterSpacing: '0.05em', textTransform: 'uppercase' as const,
        }),
        btnProcess: {
            background: '#FBBF2415', border: '1px solid #FBBF2430',
            borderRadius: '7px', padding: '7px 14px',
            color: 'var(--warning)', fontSize: '12px', fontWeight: 500,
            cursor: 'pointer', transition: 'all 0.2s', whiteSpace: 'nowrap' as const,
        },
        btnChat: (enabled: boolean) => ({
            background: enabled ? 'linear-gradient(135deg, #6366F1, #818CF8)' : 'var(--bg-elevated)',
            border: enabled ? 'none' : '1px solid var(--border)',
            borderRadius: '7px', padding: '7px 16px',
            color: enabled ? 'white' : 'var(--text-muted)',
            fontSize: '12px', fontWeight: 600,
            cursor: enabled ? 'pointer' : 'not-allowed', transition: 'all 0.2s',
        }),
        btnDelete: {
            background: 'transparent', border: 'none',
            color: 'var(--text-muted)', fontSize: '16px',
            cursor: 'pointer', padding: '4px 8px', borderRadius: '6px',
            transition: 'color 0.2s',
        },
        emptyState: {
            textAlign: 'center' as const, padding: '80px 20px',
            color: 'var(--text-muted)',
        },
    };

    return (
        <div style={S.page}>
            {/* Header */}
            <header style={S.header}>
                <div style={S.logo}>
                    <div style={S.logoIcon}>◈</div>
                    <span className="font-mono" style={{ fontSize: '16px', fontWeight: 500, letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>
                        DocMind
                    </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
                        {documents.length} document{documents.length !== 1 ? 's' : ''}
                    </span>
                    <button onClick={handleLogout} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: '13px', cursor: 'pointer' }}>
                        Sign out
                    </button>
                </div>
            </header>

            <main style={S.main}>
                {/* Top row */}
                <div style={S.topRow}>
                    <div>
                        <h1 className="font-mono" style={{ fontSize: '24px', fontWeight: 500, color: 'var(--text-primary)', letterSpacing: '-0.03em', marginBottom: '4px' }}>
                            Workspace
                        </h1>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                            Upload documents and chat with them using AI
                        </p>
                    </div>
                    <label style={{ ...S.uploadBtn, opacity: uploading ? 0.5 : 1 }}>
                        {uploading ? '↑ Uploading...' : '+ Upload'}
                        <input type="file" accept=".pdf,.txt" onChange={handleUpload} disabled={uploading} style={{ display: 'none' }} />
                    </label>
                </div>

                {/* Error */}
                {error && (
                    <div style={{
                        background: '#F8717110', border: '1px solid #F8717130',
                        borderRadius: '8px', padding: '12px 16px', marginBottom: '20px',
                        color: 'var(--danger)', fontSize: '13px',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    }}>
                        <span>{error}</span>
                        <button onClick={() => { setError(''); setLoading(true); fetchAll(); }}
                            style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: '12px', textDecoration: 'underline' }}>
                            Retry
                        </button>
                    </div>
                )}

                {/* Search */}
                <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search documents..."
                    style={S.searchBar}
                    onFocus={e => e.target.style.borderColor = 'var(--accent)'}
                    onBlur={e => e.target.style.borderColor = 'var(--border)'}
                />

                {/* Tabs */}
                <div style={S.tabs}>
                    <button style={S.tab(activeTab === 'documents')} onClick={() => setActiveTab('documents')}>
                        Documents ({documents.length})
                    </button>
                    <button style={S.tab(activeTab === 'conversations')} onClick={() => setActiveTab('conversations')}>
                        Conversations ({conversations.length})
                    </button>
                </div>

                {/* Content */}
                {loading ? (
                    <div style={S.emptyState}>
                        <div style={{ fontSize: '14px', marginBottom: '8px' }}>Loading workspace...</div>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>First load may take 30 seconds</div>
                    </div>
                ) : activeTab === 'documents' ? (
                    filteredDocs.length === 0 ? (
                        <div style={S.emptyState}>
                            <div style={{ fontSize: '32px', marginBottom: '16px' }}>◈</div>
                            <div style={{ fontSize: '15px', color: 'var(--text-secondary)', marginBottom: '8px' }}>No documents yet</div>
                            <div style={{ fontSize: '13px' }}>Upload a PDF or TXT file to get started</div>
                        </div>
                    ) : (
                        <div className="animate-fade-in">
                            {filteredDocs.map((doc) => (
                                <div key={doc.id} style={S.card}
                                    onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border-bright)'; (e.currentTarget as HTMLDivElement).style.background = 'var(--bg-elevated)'; }}
                                    onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLDivElement).style.background = 'var(--bg-surface)'; }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flex: 1, minWidth: 0 }}>
                                        <div style={S.fileIcon(doc.file_type || 'txt')}>
                                            {doc.file_type || 'txt'}
                                        </div>
                                        <div style={{ minWidth: 0 }}>
                                            {editingId === doc.id ? (
                                                <input
                                                    autoFocus
                                                    value={editingTitle}
                                                    onChange={e => setEditingTitle(e.target.value)}
                                                    onBlur={() => handleRename(doc.id)}
                                                    onKeyDown={e => { if (e.key === 'Enter') handleRename(doc.id); if (e.key === 'Escape') setEditingId(null); }}
                                                    style={{
                                                        background: 'var(--bg-elevated)', border: '1px solid var(--accent)',
                                                        borderRadius: '6px', padding: '4px 8px', color: 'var(--text-primary)',
                                                        fontSize: '14px', outline: 'none', width: '240px',
                                                    }}
                                                />
                                            ) : (
                                                <div
                                                    style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)', cursor: 'text', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                                                    onDoubleClick={() => { setEditingId(doc.id); setEditingTitle(doc.title); }}
                                                    title="Double-click to rename"
                                                >
                                                    {doc.title}
                                                </div>
                                            )}
                                            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '3px' }}>
                                                {formatDate(doc.created_at)}
                                                {doc.is_processed && <span style={{ color: 'var(--success)', marginLeft: '8px' }}>● AI ready</span>}
                                            </div>
                                            {doc.summary && (
                                                <div style={{
                                                    fontSize: '12px', color: 'var(--text-secondary)',
                                                    marginTop: '6px', lineHeight: '1.5',
                                                    maxWidth: '480px', overflow: 'hidden',
                                                    display: '-webkit-box', WebkitLineClamp: 2,
                                                    WebkitBoxOrient: 'vertical' as any,
                                                }}>
                                                    {doc.summary}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                                        {!doc.is_processed ? (
                                            <button onClick={() => handleProcess(doc.id)} disabled={processing === doc.id} style={S.btnProcess}>
                                                {processing === doc.id ? '⟳ Processing...' : '⚡ Process'}
                                            </button>
                                        ) : null}
                                        <button onClick={() => handleChat(doc.id)} disabled={!doc.is_processed} style={S.btnChat(doc.is_processed)}>
                                            Chat →
                                        </button>
                                        <button onClick={() => handleDelete(doc.id)} style={S.btnDelete}
                                            onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = 'var(--danger)'}
                                            onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)'}
                                            title="Delete document"
                                        >
                                            ×
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )
                ) : (
                    filteredConvs.length === 0 ? (
                        <div style={S.emptyState}>
                            <div style={{ fontSize: '32px', marginBottom: '16px' }}>💬</div>
                            <div style={{ fontSize: '15px', color: 'var(--text-secondary)', marginBottom: '8px' }}>No conversations yet</div>
                            <div style={{ fontSize: '13px' }}>Process a document and click Chat to start</div>
                        </div>
                    ) : (
                        <div className="animate-fade-in">
                            {filteredConvs.map((conv) => {
                                const doc = documents.find(d => d.id === conv.document_id);
                                return (
                                    <div key={conv.id} style={S.card}
                                        onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border-bright)'; (e.currentTarget as HTMLDivElement).style.background = 'var(--bg-elevated)'; }}
                                        onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLDivElement).style.background = 'var(--bg-surface)'; }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flex: 1, minWidth: 0 }}>
                                            <div style={{
                                                width: '40px', height: '40px', borderRadius: '8px',
                                                background: 'var(--accent-dim)', border: '1px solid var(--accent-glow)',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px',
                                            }}>💬</div>
                                            <div style={{ minWidth: 0 }}>
                                                <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {doc?.title || conv.title}
                                                </div>
                                                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '3px' }}>
                                                    Last active {formatDate(conv.updated_at)}
                                                </div>
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                                            <button onClick={() => router.push(`/chat/${conv.id}`)} style={S.btnChat(true)}>
                                                Open →
                                            </button>
                                            <button onClick={() => handleDeleteConversation(conv.id)} style={S.btnDelete}
                                                onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = 'var(--danger)'}
                                                onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)'}
                                            >×</button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )
                )}
            </main>
        </div>
    );
}
