'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { wakeUpBackend } from '../../lib/wakeup';
import Cookies from 'js-cookie';
import api from '../../lib/api';

interface Document {
    id: string;
    title: string;
    file_type: string;
    is_processed: boolean;
    created_at: string;
}

export default function Dashboard() {
    const router = useRouter();
    const [documents, setDocuments] = useState<Document[]>([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [processing, setProcessing] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [error, setError] = useState('');

    useEffect(() => {
        wakeUpBackend();
        fetchDocuments();
    }, []);

    async function fetchDocuments() {
        try {
            const response = await api.get('/documents');
            setDocuments([...response.data]);
        } catch (err: any) {
            if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
                setError('Backend is waking up — please refresh in 30 seconds.');
            } else {
                setError('Failed to load documents. Please refresh the page.');
            }
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
            await fetchDocuments();
        } catch (err) {
            setError('Upload failed. Only PDF and TXT files under 5MB are allowed.');
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
            await new Promise(resolve => setTimeout(resolve, 1000));
            const response = await api.get('/documents');
            console.log('Fetched documents:', response.data);
            const target = response.data.find((d: Document) => d.id === docId);
            console.log('Target document is_processed:', target?.is_processed);
            setDocuments(response.data);
        } catch (err) {
            setError('Processing failed.');
        } finally {
            setProcessing(null);
        }
    }

    async function handleChat(docId: string) {
        try {
            // Check if a conversation already exists for this document
            const existing = await api.get('/conversations');
            const existingConv = existing.data.find(
                (c: { id: string; document_id: string }) => c.document_id === docId
            );

            if (existingConv) {
                router.push(`/chat/${existingConv.id}`);
            } else {
                const response = await api.post('/conversations', {
                    title: 'New conversation',
                    document_id: docId,
                });
                router.push(`/chat/${response.data.id}`);
            }
        } catch (err) {
            setError('Failed to start conversation.');
        }
    }

    async function handleDelete(docId: string) {
        if (!confirm('Delete this document? This cannot be undone.')) return;
        try {
            await api.delete(`/documents/${docId}`);
            setDocuments(prev => prev.filter(d => d.id !== docId));
        } catch (err) {
            setError('Failed to delete document.');
        }
    }

    function handleLogout() {
        Cookies.remove('token');
        router.push('/login');
    }

    function formatDate(dateStr: string) {
        return new Date(dateStr).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        });
    }

    return (
        <div className="min-h-screen bg-gray-950">
            {/* Header */}
            <div className="border-b border-gray-800 bg-gray-900">
                <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
                    <h1 className="text-xl font-bold text-white">DocMind</h1>
                    <button
                        onClick={handleLogout}
                        className="text-gray-400 hover:text-white text-sm transition-colors"
                    >
                        Sign out
                    </button>
                </div>
            </div>

            <div className="max-w-5xl mx-auto px-6 py-10">
                {/* Page title + upload button */}
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h2 className="text-2xl font-bold text-white">Your Documents</h2>
                        <p className="text-gray-400 mt-1">Upload a document then chat with it using AI</p>
                    </div>
                    <label className={`cursor-pointer bg-blue-600 hover:bg-blue-500 text-white font-medium px-5 py-2.5 rounded-lg transition-colors ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}>
                        {uploading ? 'Uploading...' : '+ Upload'}
                        <input
                            type="file"
                            accept=".pdf,.txt"
                            onChange={handleUpload}
                            disabled={uploading}
                            className="hidden"
                        />
                    </label>
                </div>

                <div className="mb-6">
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search documents..."
                        className="w-full bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
                    />
                </div>

                {error && (
                    <div className="bg-red-900/30 border border-red-700 text-red-400 rounded-lg p-3 mb-6 text-sm flex items-center justify-between">
                        <span>{error}</span>
                        <button
                            onClick={() => { setError(''); setLoading(true); fetchDocuments(); }}
                            className="text-red-300 hover:text-white underline ml-4 whitespace-nowrap"
                        >
                            Retry
                        </button>
                    </div>
                )}

                {/* Documents list */}
                {loading ? (
                    <div className="text-center py-20">
                        <div className="text-gray-400 mb-3">Loading your documents...</div>
                        <div className="text-gray-600 text-sm">First load may take up to 30 seconds</div>
                    </div>
                ) : documents.length === 0 ? (
                    <div className="text-center py-20">
                        <p className="text-gray-500 text-lg">No documents yet</p>
                        <p className="text-gray-600 mt-2 text-sm">Upload a PDF or TXT file to get started</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {documents
                            .filter(doc => doc.title.toLowerCase().includes(search.toLowerCase()))
                            .map((doc) => (
                                <div
                                    key={doc.id}
                                    className="bg-gray-900 border border-gray-800 rounded-xl p-5 flex items-center justify-between"
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="bg-gray-800 rounded-lg p-2.5">
                                            <span className="text-gray-400 text-xs font-mono uppercase">
                                                {doc.file_type || 'txt'}
                                            </span>
                                        </div>
                                        <div>
                                            <p className="text-white font-medium">{doc.title}</p>
                                            <p className="text-gray-500 text-sm mt-0.5">{formatDate(doc.created_at)}</p>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-3">
                                        {!doc.is_processed ? (
                                            <button
                                                onClick={() => handleProcess(doc.id)}
                                                disabled={processing === doc.id}
                                                className="bg-yellow-600/20 hover:bg-yellow-600/30 text-yellow-400 border border-yellow-700/50 text-sm px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
                                            >
                                                {processing === doc.id ? 'Processing...' : 'Process for AI'}
                                            </button>
                                        ) : (
                                            <span className="text-green-400 text-sm">✓ Ready</span>
                                        )}
                                        <button
                                            onClick={() => handleChat(doc.id)}
                                            disabled={!doc.is_processed}
                                            className="bg-blue-600 hover:bg-blue-500 disabled:bg-gray-800 disabled:text-gray-600 text-white text-sm px-4 py-2 rounded-lg transition-colors"
                                        >
                                            Chat
                                        </button>
                                        <button
                                            onClick={() => handleDelete(doc.id)}
                                            className="text-gray-600 hover:text-red-400 text-sm px-3 py-2 rounded-lg transition-colors"
                                        >
                                            Delete
                                        </button>
                                    </div>
                                </div>
                            ))}
                    </div>
                )}
            </div>
        </div>
    );
}