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
  tags: string[];
}

interface Conversation {
  id: string;
  document_id: string;
  document_ids: string[];
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
  const [multiChatMode, setMultiChatMode] = useState(false);
  const [selectedDocs, setSelectedDocs] = useState<string[]>([]);
  const [editingTagsId, setEditingTagsId] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState('');
  const [activeTag, setActiveTag] = useState<string | null>(null);

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
      const existing = conversations.find(c =>
        c.document_ids?.length === 1 && c.document_ids[0] === docId ||
        (!c.document_ids?.length && c.document_id === docId)
      );
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

  async function handleMultiChat() {
    if (selectedDocs.length < 2) return;
    try {
      const titles = selectedDocs
        .map(id => documents.find(d => d.id === id)?.title || 'doc')
        .join(', ');
      const res = await api.post('/conversations', {
        title: `Multi: ${titles.slice(0, 50)}`,
        document_ids: selectedDocs,
      });
      router.push(`/chat/${res.data.id}`);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to create multi-document chat.');
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

  async function handleSaveTags(docId: string, tags: string[]) {
    try {
      await api.patch(`/documents/${docId}/tags`, { tags });
      setDocuments(prev => prev.map(d => d.id === docId ? { ...d, tags } : d));
    } catch {
      setError('Failed to save tags.');
    } finally {
      setEditingTagsId(null);
      setTagInput('');
    }
  }

  async function handleRemoveTag(docId: string, tagToRemove: string) {
    const doc = documents.find(d => d.id === docId);
    if (!doc) return;
    const newTags = doc.tags.filter(t => t !== tagToRemove);
    await handleSaveTags(docId, newTags);
    if (activeTag === tagToRemove) setActiveTag(null);
  }

  function handleLogout() {
    Cookies.remove('token');
    router.push('/login');
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function toggleDocSelection(docId: string) {
    setSelectedDocs(prev =>
      prev.includes(docId) ? prev.filter(id => id !== docId) : [...prev, docId]
    );
  }

  function getConvTitle(conv: Conversation) {
    if (conv.document_ids?.length > 1) {
      const titles = conv.document_ids
        .map(id => documents.find(d => d.id === id)?.title)
        .filter(Boolean)
        .join(' · ');
      return titles || conv.title;
    }
    const doc = documents.find(d => d.id === (conv.document_ids?.[0] || conv.document_id));
    return doc?.title || conv.title;
  }

  const filteredDocs = documents.filter(d => {
    const matchesSearch = d.title.toLowerCase().includes(search.toLowerCase());
    const matchesTag = !activeTag || d.tags?.includes(activeTag);
    return matchesSearch && matchesTag;
  });

  const filteredConvs = conversations.filter(c => {
    const doc = documents.find(d => d.id === c.document_id);
    return doc?.title.toLowerCase().includes(search.toLowerCase()) ||
      c.title.toLowerCase().includes(search.toLowerCase());
  });

  const S = {
    page: { minHeight: '100vh', display: 'flex', flexDirection: 'column' as const },
    header: {
      borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)',
      padding: '0 32px', height: '56px', display: 'flex', alignItems: 'center',
      justifyContent: 'space-between', position: 'sticky' as const, top: 0, zIndex: 10,
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
    tabs: {
      display: 'flex', gap: '4px', marginBottom: '24px',
      background: 'var(--bg-surface)', borderRadius: '10px',
      padding: '4px', width: 'fit-content',
    },
    tab: (active: boolean) => ({
      padding: '8px 16px', borderRadius: '7px', fontSize: '13px', fontWeight: 500,
      cursor: 'pointer', border: 'none', transition: 'all 0.2s',
      background: active ? 'var(--bg-elevated)' : 'transparent',
      color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
    }),
    card: {
      background: 'var(--bg-surface)', border: '1px solid var(--border)',
      borderRadius: '12px', padding: '18px 20px',
      display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
      transition: 'border-color 0.2s, background 0.2s',
      marginBottom: '8px',
    },
    fileIcon: (type: string) => ({
      width: '40px', height: '40px', borderRadius: '8px', flexShrink: 0,
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
          <button onClick={() => router.push('/profile')} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: '13px', cursor: 'pointer' }}>
            Profile
          </button>
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

        {/* Multi-doc toolbar */}
        {activeTab === 'documents' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
            <button
              onClick={() => { setMultiChatMode(!multiChatMode); setSelectedDocs([]); }}
              style={{
                background: multiChatMode ? 'var(--accent-dim)' : 'var(--bg-elevated)',
                border: `1px solid ${multiChatMode ? 'var(--accent)' : 'var(--border)'}`,
                borderRadius: '7px', padding: '7px 14px',
                color: multiChatMode ? 'var(--accent-bright)' : 'var(--text-secondary)',
                fontSize: '12px', fontWeight: 500, cursor: 'pointer', transition: 'all 0.2s',
              }}
            >
              {multiChatMode ? '✕ Cancel' : '⊕ Multi-doc chat'}
            </button>
            {multiChatMode && selectedDocs.length >= 2 && (
              <button onClick={handleMultiChat} style={{
                background: 'linear-gradient(135deg, #6366F1, #818CF8)',
                border: 'none', borderRadius: '7px', padding: '7px 16px',
                color: 'white', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
              }}>
                Chat with {selectedDocs.length} docs →
              </button>
            )}
            {multiChatMode && selectedDocs.length < 2 && (
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Select 2+ processed documents
              </span>
            )}
          </div>
        )}

        {/* Active tag filter indicator */}
        {activeTag && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Filtered by:</span>
            <span style={{
              background: 'var(--accent-dim)', border: '1px solid var(--accent)',
              borderRadius: '20px', padding: '3px 10px',
              fontSize: '11px', color: 'var(--accent-bright)',
            }}>#{activeTag}</span>
            <button onClick={() => setActiveTag(null)} style={{
              background: 'none', border: 'none', color: 'var(--text-muted)',
              fontSize: '12px', cursor: 'pointer',
            }}>✕ Clear</button>
          </div>
        )}

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
              {filteredDocs.map((doc) => {
                const isSelected = selectedDocs.includes(doc.id);
                return (
                  <div key={doc.id}
                    style={{
                      ...S.card,
                      borderColor: isSelected ? 'var(--accent)' : 'var(--border)',
                      background: isSelected ? 'var(--accent-dim)' : 'var(--bg-surface)',
                    }}
                    onMouseEnter={e => {
                      if (!isSelected) {
                        (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border-bright)';
                        (e.currentTarget as HTMLDivElement).style.background = 'var(--bg-elevated)';
                      }
                    }}
                    onMouseLeave={e => {
                      if (!isSelected) {
                        (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border)';
                        (e.currentTarget as HTMLDivElement).style.background = 'var(--bg-surface)';
                      }
                    }}
                  >
                    {/* Left: checkbox (multi mode) + icon + info */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', flex: 1, minWidth: 0 }}>
                      {multiChatMode && (
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={!doc.is_processed}
                          onChange={() => doc.is_processed && toggleDocSelection(doc.id)}
                          style={{
                            marginTop: '10px', accentColor: 'var(--accent)',
                            width: '16px', height: '16px', flexShrink: 0,
                            cursor: doc.is_processed ? 'pointer' : 'not-allowed',
                          }}
                        />
                      )}
                      <div style={S.fileIcon(doc.file_type || 'txt')}>
                        {doc.file_type || 'txt'}
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        {/* Title */}
                        {editingId === doc.id ? (
                          <input
                            autoFocus
                            value={editingTitle}
                            onChange={e => setEditingTitle(e.target.value)}
                            onBlur={() => handleRename(doc.id)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') handleRename(doc.id);
                              if (e.key === 'Escape') setEditingId(null);
                            }}
                            style={{
                              background: 'var(--bg-elevated)', border: '1px solid var(--accent)',
                              borderRadius: '6px', padding: '4px 8px', color: 'var(--text-primary)',
                              fontSize: '14px', outline: 'none', width: '240px',
                            }}
                          />
                        ) : (
                          <div
                            style={{
                              fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)',
                              cursor: 'text', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            }}
                            onDoubleClick={() => { setEditingId(doc.id); setEditingTitle(doc.title); }}
                            title="Double-click to rename"
                          >
                            {doc.title}
                          </div>
                        )}

                        {/* Date + status */}
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                          {formatDate(doc.created_at)}
                          {doc.is_processed && (
                            <span style={{ color: 'var(--success)', marginLeft: '8px' }}>● AI ready</span>
                          )}
                        </div>

                        {/* Summary */}
                        {doc.summary && (
                          <div style={{
                            fontSize: '12px', color: 'var(--text-secondary)',
                            marginTop: '8px', lineHeight: '1.6',
                            overflow: 'hidden', display: '-webkit-box',
                            WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any,
                          }}>
                            {doc.summary}
                          </div>
                        )}

                        {/* Tags */}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
                          {doc.tags?.map(tag => (
                            <span key={tag}
                              style={{
                                display: 'inline-flex', alignItems: 'center', gap: '4px',
                                background: activeTag === tag ? 'var(--accent-dim)' : 'var(--bg-elevated)',
                                border: `1px solid ${activeTag === tag ? 'var(--accent)' : 'var(--border)'}`,
                                borderRadius: '20px', padding: '3px 8px',
                                fontSize: '11px', color: activeTag === tag ? 'var(--accent-bright)' : 'var(--text-muted)',
                                cursor: 'pointer', transition: 'all 0.2s',
                              }}
                              onClick={() => setActiveTag(activeTag === tag ? null : tag)}
                            >
                              #{tag}
                              <span
                                onClick={e => { e.stopPropagation(); handleRemoveTag(doc.id, tag); }}
                                style={{ fontSize: '10px', opacity: 0.6, lineHeight: 1 }}
                              >✕</span>
                            </span>
                          ))}

                          {/* Tag input / add button */}
                          {editingTagsId === doc.id ? (
                            <input
                              autoFocus
                              value={tagInput}
                              onChange={e => setTagInput(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') {
                                  const newTags = [
                                    ...(doc.tags || []),
                                    ...tagInput.split(',').map(t => t.trim()).filter(Boolean),
                                  ];
                                  handleSaveTags(doc.id, newTags);
                                }
                                if (e.key === 'Escape') { setEditingTagsId(null); setTagInput(''); }
                              }}
                              placeholder="tag1, tag2..."
                              style={{
                                background: 'var(--bg-elevated)', border: '1px solid var(--accent)',
                                borderRadius: '20px', padding: '3px 10px',
                                fontSize: '11px', color: 'var(--text-primary)',
                                outline: 'none', width: '120px',
                              }}
                            />
                          ) : (
                            <span
                              onClick={() => setEditingTagsId(doc.id)}
                              style={{
                                background: 'transparent', border: '1px dashed var(--border)',
                                borderRadius: '20px', padding: '3px 10px',
                                fontSize: '11px', color: 'var(--text-muted)',
                                cursor: 'pointer', transition: 'all 0.2s',
                              }}
                              onMouseEnter={e => (e.currentTarget as HTMLSpanElement).style.borderColor = 'var(--accent)'}
                              onMouseLeave={e => (e.currentTarget as HTMLSpanElement).style.borderColor = 'var(--border)'}
                            >
                              + tag
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right: action buttons */}
                    {!multiChatMode && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0, marginLeft: '16px', marginTop: '2px' }}>
                        {!doc.is_processed && (
                          <button onClick={() => handleProcess(doc.id)} disabled={processing === doc.id} style={S.btnProcess}>
                            {processing === doc.id ? '⟳ Processing...' : '⚡ Process'}
                          </button>
                        )}
                        <button onClick={() => handleChat(doc.id)} disabled={!doc.is_processed} style={S.btnChat(doc.is_processed)}>
                          Chat →
                        </button>
                        <button
                          onClick={() => handleDelete(doc.id)}
                          style={S.btnDelete}
                          onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = 'var(--danger)'}
                          onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)'}
                          title="Delete document"
                        >×</button>
                      </div>
                    )}
                  </div>
                );
              })}
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
                const isMulti = conv.document_ids?.length > 1;
                return (
                  <div key={conv.id} style={S.card}
                    onMouseEnter={e => {
                      (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border-bright)';
                      (e.currentTarget as HTMLDivElement).style.background = 'var(--bg-elevated)';
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border)';
                      (e.currentTarget as HTMLDivElement).style.background = 'var(--bg-surface)';
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flex: 1, minWidth: 0 }}>
                      <div style={{
                        width: '40px', height: '40px', borderRadius: '8px', flexShrink: 0,
                        background: isMulti ? '#34D39915' : 'var(--accent-dim)',
                        border: `1px solid ${isMulti ? '#34D39930' : 'var(--accent-glow)'}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px',
                      }}>
                        {isMulti ? '🗂️' : '💬'}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {getConvTitle(conv)}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '3px' }}>
                          {isMulti && <span style={{ color: 'var(--success)', marginRight: '8px' }}>● {conv.document_ids.length} docs</span>}
                          Last active {formatDate(conv.updated_at)}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0, marginLeft: '16px' }}>
                      <button onClick={() => router.push(`/chat/${conv.id}`)} style={S.btnChat(true)}>
                        Open →
                      </button>
                      <button
                        onClick={() => handleDeleteConversation(conv.id)}
                        style={S.btnDelete}
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