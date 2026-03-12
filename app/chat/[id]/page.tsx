'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
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
  file_type: string;
  content: string;
  is_processed: boolean;
}

// ─── PDF Viewer ───────────────────────────────────────────────────────────────
function PdfViewer({ docId }: { docId: string }) {
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([]);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1.8);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const pdfRef = useRef<any>(null);
  const renderTaskRef = useRef<any>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadPdf() {
      setLoading(true);
      setError('');
      try {
        const pdfjsLib = await import('pdfjs-dist');
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

        const token = window.document.cookie
          .split('; ')
          .find(r => r.startsWith('token='))
          ?.split('=')[1] || '';

        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/documents/${docId}/file`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        if (!response.ok) throw new Error('Failed to fetch PDF');

        const arrayBuffer = await response.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

        if (cancelled) return;

        pdfRef.current = pdf;
        setNumPages(pdf.numPages);
        setLoading(false);
      } catch (e) {
        if (!cancelled) {
          setError('Failed to load PDF.');
          setLoading(false);
        }
      }
    }

    loadPdf();
    return () => { cancelled = true; };
  }, [docId]);

  useEffect(() => {
    if (!pdfRef.current || loading || !currentPage) return;

    async function renderPage() {
      try {
        if (renderTaskRef.current) {
          renderTaskRef.current.cancel();
        }

        const page = await pdfRef.current.getPage(currentPage);
        const canvas = canvasRefs.current[0];
        if (!canvas) return;

        const container = canvas.parentElement;
        const containerWidth = container ? container.clientWidth - 32 : 800;
        const baseViewport = page.getViewport({ scale: 1 });
        const autoScale = containerWidth / baseViewport.width;
        const viewport = page.getViewport({ scale: autoScale * scale });
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        const ctx = canvas.getContext('2d')!;
        renderTaskRef.current = page.render({ canvasContext: ctx, viewport });
        await renderTaskRef.current.promise;
      } catch (e: any) {
        if (e?.name !== 'RenderingCancelledException') {
          console.error('Render error', e);
        }
      }
    }

    renderPage();
  }, [currentPage, scale, loading]);

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', fontSize: '13px' }}>
      Loading PDF...
    </div>
  );

  if (error) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--danger)', fontSize: '13px' }}>
      {error}
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* PDF toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 14px', borderBottom: '1px solid var(--border)',
        background: 'var(--bg-elevated)', flexShrink: 0, gap: '8px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage <= 1}
            style={pdfBtnStyle(currentPage > 1)}
          >←</button>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'DM Mono, monospace' }}>
            {currentPage} / {numPages}
          </span>
          <button
            onClick={() => setCurrentPage(p => Math.min(numPages, p + 1))}
            disabled={currentPage >= numPages}
            style={pdfBtnStyle(currentPage < numPages)}
          >→</button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button onClick={() => setScale(s => Math.max(0.5, s - 0.2))} style={pdfBtnStyle(true)}>−</button>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'DM Mono, monospace', minWidth: '36px', textAlign: 'center' }}>
            {Math.round(scale * 100)}%
          </span>
          <button onClick={() => setScale(s => Math.min(3, s + 0.2))} style={pdfBtnStyle(true)}>+</button>
        </div>
      </div>

      {/* Canvas */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto', padding: '16px', display: 'flex', justifyContent: 'center', background: '#1a1a2e' }}>
        <canvas
          ref={el => { canvasRefs.current[0] = el; }}
          style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.4)', width: '100%', height: 'auto' }}
        />
      </div>
    </div>
  );
}

function pdfBtnStyle(active: boolean) {
  return {
    background: 'var(--bg-surface)', border: '1px solid var(--border)',
    borderRadius: '5px', padding: '3px 8px',
    color: active ? 'var(--text-secondary)' : 'var(--text-muted)',
    fontSize: '13px', cursor: active ? 'pointer' : 'not-allowed',
    opacity: active ? 1 : 0.4, transition: 'all 0.15s',
  };
}

// ─── TXT Viewer ───────────────────────────────────────────────────────────────
function TxtViewer({ content }: { content: string }) {
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '24px', background: 'var(--bg-base)' }}>
      <pre style={{
        fontFamily: 'DM Mono, monospace', fontSize: '12px',
        color: 'var(--text-secondary)', lineHeight: '1.8',
        whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0,
      }}>
        {content}
      </pre>
    </div>
  );
}

// ─── Resizable Split ──────────────────────────────────────────────────────────
function ResizableSplit({ left, right }: { left: React.ReactNode; right: React.ReactNode }) {
  const [splitPct, setSplitPct] = useState(45);
  const dragging = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!dragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const pct = ((e.clientX - rect.left) / rect.width) * 100;
      setSplitPct(Math.min(75, Math.max(25, pct)));
    }
    function onMouseUp() {
      dragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  if (isMobile) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ height: '45vh', borderBottom: '1px solid var(--border)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {left}
        </div>
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {right}
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>
      {/* Left panel */}
      <div style={{ width: `${splitPct}%`, display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRight: '1px solid var(--border)' }}>
        {left}
      </div>

      {/* Drag handle */}
      <div
        onMouseDown={onMouseDown}
        style={{
          width: '6px', flexShrink: 0, cursor: 'col-resize',
          background: 'var(--border)', position: 'relative',
          transition: 'background 0.15s',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
        onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = 'var(--accent)'}
        onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = 'var(--border)'}
      >
        <div style={{
          width: '2px', height: '40px', borderRadius: '2px',
          background: 'var(--border-bright)',
        }} />
      </div>

      {/* Right panel */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {right}
      </div>
    </div>
  );
}


// ─── Main Chat Page ───────────────────────────────────────────────────────────
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
  const [activeDocIndex, setActiveDocIndex] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { fetchAll(); }, [convId]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, sending]);

  useEffect(() => {
    function handleClickOutside() { if (exportOpen) setExportOpen(false); }
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

    setMessages(prev => [...prev,
      { id: tempId, role: 'user', content: question, created_at: new Date().toISOString() },
      { id: assistantId, role: 'assistant', content: '', created_at: new Date().toISOString() },
    ]);

    try {
      const token = window.document.cookie
        .split('; ').find(r => r.startsWith('token='))?.split('=')[1] || '';

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/conversations/${convId}/chat/stream`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
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
              // Refetch conversation to get updated auto-title
              const convRes = await api.get(`/conversations/${convId}`);
              setConversation(convRes.data);
            }
            if (data.error) throw new Error(data.error);
          } catch { /* skip malformed */ }
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
        const a = window.document.createElement('a'); a.href = url; a.download = `${safeName}.md`; a.click();
        URL.revokeObjectURL(url);
      } else if (format === 'txt') {
        const plain = markdown.replace(/\*\*(.*?)\*\*/g, '$1').replace(/#{1,6} /g, '').replace(/\*/g, '');
        const blob = new Blob([plain], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = window.document.createElement('a'); a.href = url; a.download = `${safeName}.txt`; a.click();
        URL.revokeObjectURL(url);
      } else if (format === 'pdf') {
        const { jsPDF } = await import('jspdf');
        const doc = new jsPDF({ unit: 'pt', format: 'a4' });
        const pageWidth = doc.internal.pageSize.getWidth();
        const margin = 48; const maxWidth = pageWidth - margin * 2;
        let y = 60;
        doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.text(title, margin, y); y += 28;
        doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(150);
        doc.text(`Exported from DocMind — ${new Date().toLocaleDateString()}`, margin, y); y += 28;
        messages.forEach(msg => {
          if (y > 760) { doc.addPage(); y = 48; }
          doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
          doc.setTextColor(msg.role === 'user' ? 99 : 55, msg.role === 'user' ? 102 : 65, msg.role === 'user' ? 241 : 71);
          doc.text(msg.role === 'user' ? 'You' : 'DocMind', margin, y); y += 16;
          doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(30, 30, 30);
          const lines = doc.splitTextToSize(msg.content, maxWidth);
          lines.forEach((line: string) => { if (y > 760) { doc.addPage(); y = 48; } doc.text(line, margin, y); y += 16; });
          y += 12;
        });
        doc.save(`${safeName}.pdf`);
      }
    } catch { setError('Export failed.'); }
  }

  async function handleShare() {
    try {
      const res = await api.post(`/conversations/${convId}/share`);
      setShareUrl(res.data.url); setShareOpen(true);
    } catch { setError('Failed to create share link.'); }
  }

  async function handleRevokeShare() {
    try {
      await api.delete(`/conversations/${convId}/share`);
      setShareUrl(null); setShareOpen(false);
    } catch { setError('Failed to revoke share link.'); }
  }

  async function handleCopyLink() {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 2000);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }

  function handleInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px';
  }

  const isMulti = docs.length > 1;
  const activeDoc = docs[activeDocIndex];
  const headerTitle = conversation?.title || (isMulti ? `${docs.length} documents` : docs[0]?.title || 'Loading...');

  const S = {
    page: { height: '100vh', display: 'flex', flexDirection: 'column' as const, overflow: 'hidden' },
    header: {
      borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)',
      padding: '0 24px', height: '56px', display: 'flex', alignItems: 'center',
      justifyContent: 'space-between', flexShrink: 0, zIndex: 10,
    },
    docTabBar: {
      borderBottom: '1px solid var(--border)', background: 'var(--bg-elevated)',
      padding: '0 14px', display: 'flex', alignItems: 'center', gap: '4px',
      flexShrink: 0, height: '38px', overflowX: 'auto' as const,
    },
    docTab: (active: boolean) => ({
      padding: '4px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: 500,
      cursor: 'pointer', border: 'none', whiteSpace: 'nowrap' as const,
      background: active ? 'var(--accent-dim)' : 'transparent',
      color: active ? 'var(--accent-bright)' : 'var(--text-muted)',
      transition: 'all 0.15s',
    }),
    messages: { flex: 1, overflowY: 'auto' as const, padding: '24px 20px' },
    bubble: (role: string) => ({
      maxWidth: '85%', padding: '10px 14px',
      borderRadius: role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
      background: role === 'user' ? 'linear-gradient(135deg, #6366F1, #818CF8)' : 'var(--bg-elevated)',
      border: role === 'user' ? 'none' : '1px solid var(--border)',
      color: 'var(--text-primary)', fontSize: '13px', lineHeight: '1.6',
      whiteSpace: 'pre-wrap' as const,
    }),
    inputArea: {
      borderTop: '1px solid var(--border)', background: 'var(--bg-surface)',
      padding: '12px 16px', flexShrink: 0,
    },
    textarea: {
      flex: 1, background: 'var(--bg-elevated)', border: '1px solid var(--border)',
      borderRadius: '10px', padding: '10px 14px', color: 'var(--text-primary)',
      fontSize: '13px', outline: 'none', resize: 'none' as const,
      lineHeight: '1.5', minHeight: '44px', maxHeight: '160px',
      transition: 'border-color 0.2s', fontFamily: 'DM Sans, sans-serif',
    },
    sendBtn: (active: boolean) => ({
      background: active ? 'linear-gradient(135deg, #6366F1, #818CF8)' : 'var(--bg-elevated)',
      border: active ? 'none' : '1px solid var(--border)',
      borderRadius: '9px', padding: '10px 18px', color: active ? 'white' : 'var(--text-muted)',
      fontSize: '13px', fontWeight: 600, cursor: active ? 'pointer' : 'not-allowed',
      transition: 'all 0.2s', flexShrink: 0, height: '44px',
    }),
    headerBtn: {
      background: 'var(--bg-elevated)', border: '1px solid var(--border)',
      borderRadius: '7px', padding: '6px 12px',
      color: 'var(--text-secondary)', fontSize: '12px',
      cursor: 'pointer', transition: 'all 0.2s',
    },
  };

  // ── Document viewer panel ──────────────────────────────────────────────────
  const docViewerPanel = (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Doc tab bar (multi-doc) */}
      {isMulti && (
        <div style={S.docTabBar}>
          {docs.map((d, i) => (
            <button key={d.id} style={S.docTab(i === activeDocIndex)} onClick={() => setActiveDocIndex(i)}>
              {d.file_type?.toUpperCase()} · {d.title.slice(0, 24)}{d.title.length > 24 ? '…' : ''}
            </button>
          ))}
        </div>
      )}

      {/* Doc label */}
      <div style={{
        padding: '8px 14px', borderBottom: '1px solid var(--border)',
        background: 'var(--bg-surface)', flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: '8px',
      }}>
        <span style={{
          fontFamily: 'DM Mono, monospace', fontSize: '10px',
          color: activeDoc?.file_type === 'pdf' ? 'var(--danger)' : 'var(--accent-bright)',
          background: activeDoc?.file_type === 'pdf' ? '#F8717115' : '#6366F115',
          border: `1px solid ${activeDoc?.file_type === 'pdf' ? '#F8717130' : '#6366F130'}`,
          borderRadius: '4px', padding: '2px 6px', textTransform: 'uppercase' as const,
          letterSpacing: '0.05em',
        }}>
          {activeDoc?.file_type || 'txt'}
        </span>
        <span style={{ fontSize: '12px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {activeDoc?.title}
        </span>
      </div>

      {/* Viewer */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', fontSize: '13px' }}>
            Loading...
          </div>
        ) : !activeDoc ? null : activeDoc.file_type === 'pdf' ? (
          <PdfViewer docId={activeDoc.id} />
        ) : (
          <TxtViewer content={activeDoc.content} />
        )}
      </div>
    </div>
  );

  // ── Chat panel ─────────────────────────────────────────────────────────────
  const chatPanel = (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Messages */}
      <div style={S.messages}>
        {loading ? (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '60px 0', fontSize: '13px' }}>
            Loading conversation...
          </div>
        ) : messages.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 16px' }}>
            <div style={{ fontSize: '36px', marginBottom: '12px' }}>{isMulti ? '🗂️' : '◈'}</div>
            <div className="font-mono" style={{ fontSize: '15px', color: 'var(--text-primary)', marginBottom: '6px' }}>
              Ready to explore
            </div>
            <div style={{ fontSize: '13px', color: 'var(--text-muted)', maxWidth: '320px', margin: '0 auto 24px', lineHeight: '1.6' }}>
              {isMulti
                ? `Ask questions across ${docs.length} documents`
                : <>Ask anything about <strong style={{ color: 'var(--text-secondary)' }}>{docs[0]?.title}</strong></>
              }
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'stretch' }}>
              {(isMulti
                ? ['What do these documents have in common?', 'Summarize each document', 'Compare the main topics']
                : ['Summarize this document', 'What are the main topics?', 'What are the key conclusions?']
              ).map(q => (
                <button key={q} onClick={() => setInput(q)} style={{
                  background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                  borderRadius: '8px', padding: '8px 14px',
                  color: 'var(--text-secondary)', fontSize: '12px',
                  cursor: 'pointer', transition: 'all 0.2s', textAlign: 'left' as const,
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
            {messages.map(msg => (
              <div key={msg.id} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start', marginBottom: '12px' }}>
                <div style={S.bubble(msg.role)}>
                  {msg.content || (msg.role === 'assistant' && sending ? (
                    <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                      {[0, 1, 2].map(i => (
                        <span key={i} className="dot-bounce" style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'var(--text-muted)', display: 'block' }} />
                      ))}
                    </div>
                  ) : null)}
                </div>
              </div>
            ))}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={S.inputArea}>
        {error && (
          <div style={{ color: 'var(--danger)', fontSize: '12px', marginBottom: '8px' }}>{error}</div>
        )}
        <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder={isMulti ? 'Ask across all documents...' : 'Ask about this document...'}
            rows={1}
            style={S.textarea}
            onFocus={e => e.target.style.borderColor = 'var(--accent)'}
            onBlur={e => e.target.style.borderColor = 'var(--border)'}
          />
          <button type="button" onClick={handleSend} disabled={sending || !input.trim()} style={S.sendBtn(!sending && !!input.trim())}>
            {sending ? '...' : 'Send'}
          </button>
        </div>
        <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '6px' }}>
          Enter to send · Shift+Enter for new line
        </div>
      </div>
    </div>
  );

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
            <div className="font-mono" style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {headerTitle}
            </div>
            {isMulti && (
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '1px' }}>
                {docs.map(d => d.title).join(' · ').slice(0, 60)}
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {isMulti && (
            <span style={{ background: '#34D39915', border: '1px solid #34D39930', borderRadius: '6px', padding: '4px 10px', color: 'var(--success)', fontSize: '11px', fontWeight: 500 }}>
              {docs.length} docs
            </span>
          )}
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            {messages.length} msg{messages.length !== 1 ? 's' : ''}
          </div>
          <button onClick={handleShare} style={S.headerBtn}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--accent)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--accent-bright)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)'; }}
          >↗ Share</button>

          <div style={{ position: 'relative' }}>
            <button onClick={e => { e.stopPropagation(); setExportOpen(!exportOpen); }} style={S.headerBtn}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--accent)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--accent-bright)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)'; }}
            >↓ Export</button>
            {exportOpen && (
              <div style={{ position: 'absolute', right: 0, top: '36px', zIndex: 20, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '6px', minWidth: '140px', boxShadow: '0 8px 24px rgba(0,0,0,0.3)' }}>
                {([
                  { fmt: 'md', label: '📄 Markdown', sub: '.md file' },
                  { fmt: 'txt', label: '📝 Plain text', sub: '.txt file' },
                  { fmt: 'pdf', label: '🖨️ PDF', sub: 'print to PDF' },
                ] as const).map(({ fmt, label, sub }) => (
                  <button key={fmt} onClick={() => { handleExport(fmt); setExportOpen(false); }}
                    style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', borderRadius: '7px', padding: '8px 12px', cursor: 'pointer', transition: 'background 0.15s' }}
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

      {/* Split view */}
      <ResizableSplit left={docViewerPanel} right={chatPanel} />

      {/* Share modal */}
      {shareOpen && shareUrl && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '24px' }}
          onClick={() => setShareOpen(false)}
        >
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '16px', padding: '32px', width: '100%', maxWidth: '480px' }}
            onClick={e => e.stopPropagation()}
          >
            <h2 className="font-mono" style={{ fontSize: '16px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '8px' }}>
              Share conversation
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '20px' }}>
              Anyone with this link can view this conversation in read-only mode.
            </p>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              <div style={{ flex: 1, background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px 14px', fontSize: '12px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'DM Mono, monospace' }}>
                {shareUrl}
              </div>
              <button onClick={handleCopyLink} style={{ background: shareCopied ? '#34D39915' : 'linear-gradient(135deg, #6366F1, #818CF8)', border: shareCopied ? '1px solid #34D39930' : 'none', borderRadius: '8px', padding: '10px 16px', color: shareCopied ? 'var(--success)' : 'white', fontSize: '12px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s', whiteSpace: 'nowrap' }}>
                {shareCopied ? '✓ Copied' : 'Copy'}
              </button>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button onClick={handleRevokeShare} style={{ background: 'none', border: 'none', color: 'var(--danger)', fontSize: '12px', cursor: 'pointer' }}>Revoke link</button>
              <button onClick={() => setShareOpen(false)} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '7px', padding: '8px 16px', color: 'var(--text-secondary)', fontSize: '12px', cursor: 'pointer' }}>Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}