'use client';
import { useState, useEffect, useRef } from 'react';
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

interface DocVersion {
  version_number: number;
  created_at: string;
  summary: string | null;
  file_type: string | null;
}

export default function Dashboard() {
  const router = useRouter();
  const versionInputRef = useRef<HTMLInputElement>(null);

  const [documents, setDocuments] = useState<Document[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [convSearch, setConvSearch] = useState('');
  const [convSearchResults, setConvSearchResults] = useState<Conversation[] | null>(null);
  const [convSearching, setConvSearching] = useState(false);
  const [searchMode, setSearchMode] = useState<'keyword' | 'semantic'>('keyword');
  const [semanticResults, setSemanticResults] = useState<Document[] | null>(null);
  const [semanticSearching, setSemanticSearching] = useState(false);
  const [activeTab, setActiveTab] = useState<'documents' | 'conversations'>('documents');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [multiChatMode, setMultiChatMode] = useState(false);
  const [selectedDocs, setSelectedDocs] = useState<string[]>([]);
  const [editingTagsId, setEditingTagsId] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState('');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [versioningDocId, setVersioningDocId] = useState<string | null>(null);
  const [versions, setVersions] = useState<Record<string, DocVersion[]>>({});
  const [showVersionsId, setShowVersionsId] = useState<string | null>(null);
  const [summarizingId, setSummarizingId] = useState<string | null>(null);
  const [expandedSummaryId, setExpandedSummaryId] = useState<string | null>(null);

  useEffect(() => {
    wakeUpBackend();
    fetchAll();
  }, []);

  // Debounced semantic search for documents
  useEffect(() => {
    if (searchMode !== 'semantic' || !search.trim()) {
      setSemanticResults(null);
      return;
    }
    const timer = setTimeout(() => runSemanticSearch(search), 500);
    return () => clearTimeout(timer);
  }, [search, searchMode]);

  // Debounced conversation search (title + message content)
  useEffect(() => {
    if (!convSearch.trim()) {
      setConvSearchResults(null);
      return;
    }
    const timer = setTimeout(async () => {
      setConvSearching(true);
      try {
        const res = await api.get('/conversations/search', { params: { q: convSearch } });
        setConvSearchResults(res.data);
      } catch {
        setConvSearchResults([]);
      } finally {
        setConvSearching(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [convSearch]);

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

  async function runSemanticSearch(q: string) {
    setSemanticSearching(true);
    try {
      const res = await api.get('/documents/semantic-search', { params: { q } });
      setSemanticResults(res.data);
    } catch {
      setSemanticResults([]);
    } finally {
      setSemanticSearching(false);
    }
  }

  const filteredDocs = (() => {
    if (searchMode === 'semantic' && semanticResults !== null) {
      if (!activeTag) return semanticResults;
      return semanticResults.filter(d => d.tags?.includes(activeTag));
    }
    return documents.filter(d => {
      const matchesSearch = d.title.toLowerCase().includes(search.toLowerCase());
      const matchesTag = !activeTag || d.tags?.includes(activeTag);
      return matchesSearch && matchesTag;
    });
  })();

  const filteredConvs = convSearch.trim() && convSearchResults !== null
    ? convSearchResults
    : conversations.filter(c =>
        c.title.toLowerCase().includes(convSearch.toLowerCase())
      );

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

  async function handleVersionUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !versioningDocId) return;
    e.target.value = '';
    const docId = versioningDocId;
    setVersioningDocId(null);
    setError('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post(`/documents/${docId}/version`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setDocuments(prev => prev.map(d => d.id === docId ? res.data : d));
      setProcessing(docId);
      await api.post(`/documents/${docId}/process`);
      const docsRes = await api.get('/documents');
      setDocuments([...docsRes.data]);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Version upload failed.');
    } finally {
      setProcessing(null);
    }
  }

  async function fetchVersions(docId: string) {
    try {
      const res = await api.get(`/documents/${docId}/versions`);
      setVersions(prev => ({ ...prev, [docId]: res.data.versions }));
      setShowVersionsId(docId);
    } catch {
      setError('Failed to load version history.');
    }
  }

  async function handleRestoreVersion(docId: string, versionNumber: number) {
    try {
      await api.post(`/documents/${docId}/versions/${versionNumber}/restore`);
      setShowVersionsId(null);
      await fetchAll();
    } catch {
      setError('Restore failed.');
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

  async function handleSummarize(docId: string) {
    setSummarizingId(docId);
    setError('');
    try {
      const res = await api.post(`/documents/${docId}/summarize`);
      setDocuments(prev => prev.map(d => d.id === docId ? { ...d, summary: res.data.summary } : d));
      setExpandedSummaryId(docId);
    } catch {
      setError('Summarization failed.');
    } finally {
      setSummarizingId(null);
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
    return conv.title;
  }

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
    tabs: {
      display: 'flex', gap: '4px', marginBottom: '16px',
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
    btnIcon: (active = false) => ({
      background: active ? 'var(--accent-dim)' : 'transparent',
      border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
      borderRadius: '6px', padding: '5px 8px',
      color: active ? 'var(--accent-bright)' : 'var(--text-muted)',
      fontSize: '12px', cursor: 'pointer',
      transition: 'all 0.2s', whiteSpace: 'nowrap' as const,
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
    searchInput: {
      width: '100%', background: 'var(--bg-surface)',
      border: '1px solid var(--border)', borderRadius: '10px',
      padding: '12px 16px', color: 'var(--text-primary)',
      fontSize: '14px', outline: 'none', boxSizing: 'border-box' as const,
      transition: 'border-color 0.2s',
    },
  };

  return (
    <div style={S.page}>
      {/* Hidden input for version uploads */}
      <input
        ref={versionInputRef}
        type="file"
        accept=".pdf,.txt"
        style={{ display: 'none' }}
        onChange={handleVersionUpload}
      />

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

        {/* Tabs */}
        <div style={S.tabs}>
          <button style={S.tab(activeTab === 'documents')} onClick={() => setActiveTab('documents')}>
            Documents ({documents.length})
          </button>
          <button style={S.tab(activeTab === 'conversations')} onClick={() => setActiveTab('conversations')}>
            Conversations ({conversations.length})
          </button>
        </div>

        {/* ── DOCUMENTS TAB ── */}
        {activeTab === 'documents' && (
          <>
            {/* Document search + mode toggle */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', alignItems: 'center' }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder={searchMode === 'semantic' ? 'Search by meaning...' : 'Search documents...'}
                  style={S.searchInput}
                  onFocus={e => e.target.style.borderColor = 'var(--accent)'}
                  onBlur={e => e.target.style.borderColor = 'var(--border)'}
                />
                {semanticSearching && (
                  <span style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', fontSize: '11px', color: 'var(--text-muted)' }}>
                    searching…
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden', flexShrink: 0 }}>
                {(['keyword', 'semantic'] as const).map(mode => (
                  <button key={mode}
                    onClick={() => { setSearchMode(mode); setSemanticResults(null); setSearch(''); }}
                    style={{
                      padding: '10px 14px', border: 'none',
                      background: searchMode === mode ? 'var(--accent-dim)' : 'transparent',
                      color: searchMode === mode ? 'var(--accent-bright)' : 'var(--text-muted)',
                      fontSize: '12px', fontWeight: searchMode === mode ? 600 : 400,
                      cursor: 'pointer', fontFamily: 'DM Mono, monospace',
                      letterSpacing: '0.03em', transition: 'all 0.2s',
                    }}
                  >
                    {mode === 'keyword' ? '🔤' : '🧠'} {mode}
                  </button>
                ))}
              </div>
            </div>
            {searchMode === 'semantic' && !search && (
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px' }}>
                Finds documents by meaning — try "machine learning results" or "financial performance"
              </p>
            )}

            {/* Multi-doc toolbar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', marginTop: '8px' }}>
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
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Select 2+ processed documents</span>
              )}
            </div>

            {/* Active tag filter */}
            {activeTag && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Filtered by:</span>
                <span style={{ background: 'var(--accent-dim)', border: '1px solid var(--accent)', borderRadius: '20px', padding: '3px 10px', fontSize: '11px', color: 'var(--accent-bright)' }}>
                  #{activeTag}
                </span>
                <button onClick={() => setActiveTag(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '12px', cursor: 'pointer' }}>
                  ✕ Clear
                </button>
              </div>
            )}

            {/* Documents list */}
            {loading ? (
              <div style={S.emptyState}>
                <div style={{ fontSize: '14px', marginBottom: '8px' }}>Loading workspace...</div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>First load may take 30 seconds</div>
              </div>
            ) : filteredDocs.length === 0 ? (
              <div style={S.emptyState}>
                <div style={{ fontSize: '32px', marginBottom: '16px' }}>◈</div>
                <div style={{ fontSize: '15px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                  {searchMode === 'semantic' && search ? 'No semantic matches found.' : 'No documents yet'}
                </div>
                <div style={{ fontSize: '13px' }}>
                  {searchMode === 'semantic' && search ? 'Try different keywords or switch to keyword search.' : 'Upload a PDF or TXT file to get started'}
                </div>
              </div>
            ) : (
              <div className="animate-fade-in">
                {filteredDocs.map((doc) => {
                  const isSelected = selectedDocs.includes(doc.id);
                  const showingVersions = showVersionsId === doc.id;
                  const showingSummary = expandedSummaryId === doc.id;
                  const docVersions = versions[doc.id];
                  return (
                    <div key={doc.id}
                      style={{ ...S.card, borderColor: isSelected ? 'var(--accent)' : 'var(--border)', background: isSelected ? 'var(--accent-dim)' : 'var(--bg-surface)' }}
                      onMouseEnter={e => { if (!isSelected) { (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border-bright)'; (e.currentTarget as HTMLDivElement).style.background = 'var(--bg-elevated)'; } }}
                      onMouseLeave={e => { if (!isSelected) { (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLDivElement).style.background = 'var(--bg-surface)'; } }}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', flex: 1, minWidth: 0 }}>
                          {multiChatMode && (
                            <input type="checkbox" checked={isSelected} disabled={!doc.is_processed}
                              onChange={() => doc.is_processed && toggleDocSelection(doc.id)}
                              style={{ marginTop: '10px', accentColor: 'var(--accent)', width: '16px', height: '16px', flexShrink: 0, cursor: doc.is_processed ? 'pointer' : 'not-allowed' }}
                            />
                          )}
                          <div style={S.fileIcon(doc.file_type || 'txt')}>{doc.file_type || 'txt'}</div>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            {editingId === doc.id ? (
                              <input autoFocus value={editingTitle} onChange={e => setEditingTitle(e.target.value)}
                                onBlur={() => handleRename(doc.id)}
                                onKeyDown={e => { if (e.key === 'Enter') handleRename(doc.id); if (e.key === 'Escape') setEditingId(null); }}
                                style={{ background: 'var(--bg-elevated)', border: '1px solid var(--accent)', borderRadius: '6px', padding: '4px 8px', color: 'var(--text-primary)', fontSize: '14px', outline: 'none', width: '240px' }}
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
                            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                              {formatDate(doc.created_at)}
                              {doc.is_processed && <span style={{ color: 'var(--success)', marginLeft: '8px' }}>● AI ready</span>}
                              {processing === doc.id && <span style={{ color: '#FBBF24', marginLeft: '8px' }}>⟳ processing...</span>}
                              {doc.summary && !showingSummary && (
                                <span
                                  onClick={() => setExpandedSummaryId(doc.id)}
                                  style={{ color: 'var(--text-muted)', marginLeft: '8px', cursor: 'pointer', fontStyle: 'italic', textDecoration: 'underline', textDecorationStyle: 'dotted' }}
                                >
                                  summary
                                </span>
                              )}
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
                              {doc.tags?.map(tag => (
                                <span key={tag}
                                  style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: activeTag === tag ? 'var(--accent-dim)' : 'var(--bg-elevated)', border: `1px solid ${activeTag === tag ? 'var(--accent)' : 'var(--border)'}`, borderRadius: '20px', padding: '3px 8px', fontSize: '11px', color: activeTag === tag ? 'var(--accent-bright)' : 'var(--text-muted)', cursor: 'pointer', transition: 'all 0.2s' }}
                                  onClick={() => setActiveTag(activeTag === tag ? null : tag)}
                                >
                                  #{tag}
                                  <span onClick={e => { e.stopPropagation(); handleRemoveTag(doc.id, tag); }} style={{ fontSize: '10px', opacity: 0.6, lineHeight: 1 }}>✕</span>
                                </span>
                              ))}
                              {editingTagsId === doc.id ? (
                                <input autoFocus value={tagInput} onChange={e => setTagInput(e.target.value)}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') { const newTags = [...(doc.tags || []), ...tagInput.split(',').map(t => t.trim()).filter(Boolean)]; handleSaveTags(doc.id, newTags); }
                                    if (e.key === 'Escape') { setEditingTagsId(null); setTagInput(''); }
                                  }}
                                  placeholder="tag1, tag2..."
                                  style={{ background: 'var(--bg-elevated)', border: '1px solid var(--accent)', borderRadius: '20px', padding: '3px 10px', fontSize: '11px', color: 'var(--text-primary)', outline: 'none', width: '120px' }}
                                />
                              ) : (
                                <span onClick={() => setEditingTagsId(doc.id)}
                                  style={{ background: 'transparent', border: '1px dashed var(--border)', borderRadius: '20px', padding: '3px 10px', fontSize: '11px', color: 'var(--text-muted)', cursor: 'pointer', transition: 'all 0.2s' }}
                                  onMouseEnter={e => (e.currentTarget as HTMLSpanElement).style.borderColor = 'var(--accent)'}
                                  onMouseLeave={e => (e.currentTarget as HTMLSpanElement).style.borderColor = 'var(--border)'}
                                >+ tag</span>
                              )}
                            </div>
                          </div>
                        </div>
                        {!multiChatMode && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0, marginLeft: '16px', marginTop: '2px' }}>
                            {!doc.is_processed && (
                              <button onClick={() => handleProcess(doc.id)} disabled={processing === doc.id} style={S.btnProcess}>
                                {processing === doc.id ? '⟳ Processing...' : '⚡ Process'}
                              </button>
                            )}
                            <button onClick={() => handleChat(doc.id)} disabled={!doc.is_processed} style={S.btnChat(doc.is_processed)}>Chat →</button>
                            <button
                              onClick={() => {
                                if (showingSummary) { setExpandedSummaryId(null); return; }
                                if (doc.summary) { setExpandedSummaryId(doc.id); } else { handleSummarize(doc.id); }
                              }}
                              disabled={summarizingId === doc.id || !doc.is_processed}
                              title={doc.summary ? 'View / regenerate summary' : 'Generate summary'}
                              style={S.btnIcon(showingSummary)}
                            >
                              {summarizingId === doc.id ? '⟳' : '∑'}
                            </button>
                            <button onClick={() => { setVersioningDocId(doc.id); versionInputRef.current?.click(); }} title="Upload new version" style={S.btnIcon()}>↑v</button>
                            <button onClick={() => showingVersions ? setShowVersionsId(null) : fetchVersions(doc.id)} title="Version history" style={S.btnIcon(showingVersions)}>🕐</button>
                            <button onClick={() => handleDelete(doc.id)} style={S.btnDelete}
                              onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = 'var(--danger)'}
                              onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)'}
                              title="Delete document"
                            >×</button>
                          </div>
                        )}
                      </div>

                      {/* Summary panel */}
                      {showingSummary && (
                        <div style={{ marginTop: '14px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '8px', padding: '14px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                            <span style={{ fontFamily: 'DM Mono, monospace', fontSize: '11px', color: 'var(--text-muted)', letterSpacing: '0.05em' }}>SUMMARY</span>
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <button
                                onClick={() => handleSummarize(doc.id)}
                                disabled={summarizingId === doc.id}
                                style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '6px', padding: '3px 10px', fontSize: '11px', color: 'var(--text-secondary)', cursor: 'pointer' }}
                              >
                                {summarizingId === doc.id ? '⟳ Regenerating...' : '↺ Regenerate'}
                              </button>
                              <button onClick={() => setExpandedSummaryId(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '12px', cursor: 'pointer' }}>✕</button>
                            </div>
                          </div>
                          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.7', margin: 0 }}>
                            {doc.summary || 'No summary yet. Click Regenerate to create one.'}
                          </p>
                        </div>
                      )}

                      {/* Version history panel */}
                      {showingVersions && (
                        <div style={{ marginTop: '14px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px 14px' }}>
                          <div style={{ fontFamily: 'DM Mono, monospace', fontSize: '11px', color: 'var(--text-muted)', letterSpacing: '0.05em', marginBottom: '10px' }}>VERSION HISTORY</div>
                          {!docVersions ? (
                            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Loading...</span>
                          ) : docVersions.length === 0 ? (
                            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>No previous versions. Upload a new version to start tracking.</span>
                          ) : docVersions.map(v => (
                            <div key={v.version_number} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
                              <div>
                                <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 500 }}>v{v.version_number}</span>
                                <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: '10px' }}>{v.file_type?.toUpperCase()} · {formatDate(v.created_at)}</span>
                                {v.summary && <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '3px' }}>{v.summary.slice(0, 80)}{v.summary.length > 80 ? '...' : ''}</div>}
                              </div>
                              <button onClick={() => handleRestoreVersion(doc.id, v.version_number)}
                                style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '6px', padding: '4px 10px', fontSize: '11px', color: 'var(--text-secondary)', cursor: 'pointer', flexShrink: 0, marginLeft: '12px' }}
                              >Restore</button>
                            </div>
                          ))}
                          <button onClick={() => setShowVersionsId(null)} style={{ marginTop: '10px', background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '11px', cursor: 'pointer' }}>Close</button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ── CONVERSATIONS TAB ── */}
        {activeTab === 'conversations' && (
          <>
            {/* Conversation search */}
            <div style={{ position: 'relative', marginBottom: '16px' }}>
              <input
                type="text"
                value={convSearch}
                onChange={e => setConvSearch(e.target.value)}
                placeholder="Search conversations and messages..."
                style={S.searchInput}
                onFocus={e => e.target.style.borderColor = 'var(--accent)'}
                onBlur={e => e.target.style.borderColor = 'var(--border)'}
              />
              {convSearching && (
                <span style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', fontSize: '11px', color: 'var(--text-muted)' }}>
                  searching…
                </span>
              )}
            </div>

            {loading ? (
              <div style={S.emptyState}>
                <div style={{ fontSize: '14px', marginBottom: '8px' }}>Loading workspace...</div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>First load may take 30 seconds</div>
              </div>
            ) : filteredConvs.length === 0 ? (
              <div style={S.emptyState}>
                <div style={{ fontSize: '32px', marginBottom: '16px' }}>💬</div>
                <div style={{ fontSize: '15px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                  {convSearch ? 'No conversations match your search.' : 'No conversations yet'}
                </div>
                <div style={{ fontSize: '13px' }}>
                  {convSearch ? 'Try different keywords.' : 'Process a document and click Chat to start'}
                </div>
              </div>
            ) : (
              <div className="animate-fade-in">
                {filteredConvs.map((conv) => {
                  const isMulti = conv.document_ids?.length > 1;
                  return (
                    <div key={conv.id} style={S.card}
                      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border-bright)'; (e.currentTarget as HTMLDivElement).style.background = 'var(--bg-elevated)'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLDivElement).style.background = 'var(--bg-surface)'; }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flex: 1, minWidth: 0 }}>
                          <div style={{ width: '40px', height: '40px', borderRadius: '8px', flexShrink: 0, background: isMulti ? '#34D39915' : 'var(--accent-dim)', border: `1px solid ${isMulti ? '#34D39930' : 'var(--accent-glow)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>
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
                          <button onClick={() => router.push(`/chat/${conv.id}`)} style={S.btnChat(true)}>Open →</button>
                          <button onClick={() => handleDeleteConversation(conv.id)} style={S.btnDelete}
                            onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = 'var(--danger)'}
                            onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)'}
                          >×</button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}