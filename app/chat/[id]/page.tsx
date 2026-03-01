'use client';
import { useState, useEffect, useRef } from 'react';
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
}

export default function Chat() {
  const router = useRouter();
  const params = useParams();
  const convId = params.id as string;

  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchConversation();
    fetchMessages();
  }, [convId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function fetchConversation() {
    try {
      const response = await api.get(`/conversations/${convId}`);
      setConversation(response.data);
    } catch (err) {
      setError('Conversation not found');
    }
  }

  async function fetchMessages() {
    try {
      const response = await api.get(`/conversations/${convId}/messages`);
      setMessages(response.data);
    } catch (err) {
      setError('Failed to load messages');
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

  // Add user message immediately
  setMessages(prev => [...prev, {
    id: tempId,
    role: 'user',
    content: question,
    created_at: new Date().toISOString(),
  }]);

  try {
    // response.data IS the assistant message
    const response = await api.post(`/conversations/${convId}/chat`, {
      content: question,
    });

    // Remove temp user message, add real user + assistant messages
    setMessages(prev => [
      ...prev.filter(m => m.id !== tempId),
      {
        id: response.data.id + '-user',
        role: 'user' as const,
        content: question,
        created_at: new Date().toISOString(),
      },
      response.data
    ]);

  } catch (err) {
    setError('AI response failed. The server may be busy — please try again in a moment.');
    setMessages(prev => prev.filter(m => m.id !== tempId));
  } finally {
    setSending(false);
  }
}

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      {/* Header */}
      <div className="border-b border-gray-800 bg-gray-900 shrink-0">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center gap-4">
          <button
            onClick={() => router.push('/dashboard')}
            className="text-gray-400 hover:text-white transition-colors"
          >
            ← Back
          </button>
          <h1 className="text-white font-medium truncate">
            {conversation?.title || 'Loading...'}
          </h1>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 py-6 space-y-6">
          {loading ? (
            <div className="text-gray-400 text-center py-20">Loading...</div>
          ) : messages.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-gray-500 text-lg">No messages yet</p>
              <p className="text-gray-600 mt-2 text-sm">
                Ask a question about your document
              </p>
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                    msg.role === 'user'
                      ? 'bg-blue-600 text-white rounded-br-sm'
                      : 'bg-gray-800 text-gray-100 rounded-bl-sm'
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))
          )}

          {sending && (
            <div className="flex justify-start">
              <div className="bg-gray-800 rounded-2xl rounded-bl-sm px-4 py-3">
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input */}
      <div className="border-t border-gray-800 bg-gray-900 shrink-0">
        <div className="max-w-3xl mx-auto px-6 py-4">
          {error && (
            <div className="text-red-400 text-sm mb-3">{error}</div>
          )}
          <div className="flex gap-3">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask a question about your document..."
              rows={1}
              className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors resize-none"
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={sending || !input.trim()}
              className="bg-blue-600 hover:bg-blue-500 disabled:bg-gray-800 disabled:text-gray-600 text-white px-5 rounded-xl transition-colors font-medium"
            >
              Send
            </button>
          </div>
          <p className="text-gray-600 text-xs mt-2">
            Press Enter to send, Shift+Enter for new line
          </p>
        </div>
      </div>
    </div>
  );
}