import { useState, useRef, useEffect, useCallback } from 'react';
import { api } from '../api';
import type { ChatMessage } from '../types';

export function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Load chat history
  useEffect(() => {
    api.chat.history()
      .then(({ messages: history }) => {
        setMessages(
          history.map((m, i) => ({
            id: `hist-${i}`,
            role: m.role,
            content: m.content,
            timestamp: '',
          }))
        );
      })
      .catch(() => {})
      .finally(() => setLoadingHistory(false));
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-focus input
  useEffect(() => {
    if (!sending) inputRef.current?.focus();
  }, [sending]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || sending) return;

    const userMsg: ChatMessage = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setSending(true);

    try {
      const { response } = await api.chat.send(text);
      const assistantMsg: ChatMessage = {
        id: `temp-${Date.now()}-reply`,
        role: 'assistant',
        content: response,
        timestamp: new Date().toISOString(),
      };
      setMessages(prev => [...prev, assistantMsg]);
    } catch {
      const errorMsg: ChatMessage = {
        id: `temp-${Date.now()}-error`,
        role: 'assistant',
        content: 'Sorry, something went wrong. Please try again.',
        timestamp: new Date().toISOString(),
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setSending(false);
    }
  }, [input, sending]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-2xl mx-auto space-y-4">
          {loadingHistory ? (
            <div className="text-center text-muted py-12">Loading messages...</div>
          ) : messages.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-2xl mb-2">👋</p>
              <p className="text-muted">
                Start chatting to plan your meals, manage your preferences, or get recipe ideas.
              </p>
            </div>
          ) : (
            messages.map(msg => (
              <div
                key={msg.id}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap ${
                    msg.role === 'user'
                      ? 'bg-accent-soft text-text rounded-br-sm'
                      : 'bg-card text-text rounded-bl-sm'
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))
          )}

          {sending && (
            <div className="flex justify-start">
              <div className="bg-card rounded-2xl rounded-bl-sm px-4 py-3 text-sm text-muted">
                <span className="inline-flex gap-1">
                  <span className="animate-bounce" style={{ animationDelay: '0ms' }}>.</span>
                  <span className="animate-bounce" style={{ animationDelay: '150ms' }}>.</span>
                  <span className="animate-bounce" style={{ animationDelay: '300ms' }}>.</span>
                </span>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input */}
      <div className="border-t border-border bg-bg-soft px-4 py-3">
        <div className="max-w-2xl mx-auto flex gap-3 items-end">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            disabled={sending}
            rows={1}
            className="flex-1 bg-card border border-border rounded-xl px-4 py-3 text-sm text-text placeholder-muted resize-none focus:outline-none focus:border-accent/50 disabled:opacity-50 min-h-[44px] max-h-[120px]"
            style={{ fieldSizing: 'content' } as React.CSSProperties}
          />
          <button
            onClick={send}
            disabled={!input.trim() || sending}
            className="bg-accent text-bg font-medium rounded-xl px-5 py-3 text-sm hover:opacity-90 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer shrink-0"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
