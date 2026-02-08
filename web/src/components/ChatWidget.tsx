import { useState, useRef, useEffect, useCallback } from 'react';
import { api } from '../api';
import type { ChatMessage } from '../types';

interface ChatWidgetProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ChatWidget({ isOpen, onClose }: ChatWidgetProps) {
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

  // Auto-scroll to bottom when messages change or chat opens
  useEffect(() => {
    if (isOpen) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  // Auto-focus input when opened
  useEffect(() => {
    if (isOpen && !sending) {
      inputRef.current?.focus();
    }
  }, [isOpen, sending]);

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

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-40 transition-opacity"
        onClick={onClose}
      />

      {/* Chat window */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col w-[calc(100vw-2rem)] max-w-[400px] h-[calc(100vh-8rem)] max-h-[600px] bg-bg-soft border border-border rounded-2xl shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="font-serif text-lg font-bold">
            Cookin<span className="text-accent">'</span> Chat
          </h2>
          <button
            onClick={onClose}
            className="text-muted hover:text-text transition-colors cursor-pointer"
            aria-label="Close chat"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          <div className="space-y-3">
            {loadingHistory ? (
              <div className="text-center text-muted text-sm py-8">Loading messages...</div>
            ) : messages.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-2xl mb-2">👋</p>
                <p className="text-muted text-sm">
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
                    className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap ${
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
                <div className="bg-card rounded-2xl rounded-bl-sm px-3 py-2 text-sm text-muted">
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
        <div className="border-t border-border px-4 py-3">
          <div className="flex gap-2 items-end">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message..."
              disabled={sending}
              rows={1}
              className="flex-1 bg-card border border-border rounded-xl px-3 py-2 text-sm text-text placeholder-muted resize-none focus:outline-none focus:border-accent/50 disabled:opacity-50 min-h-[40px] max-h-[100px]"
              style={{ fieldSizing: 'content' } as React.CSSProperties}
            />
            <button
              onClick={send}
              disabled={!input.trim() || sending}
              className="bg-accent text-bg font-medium rounded-xl px-4 py-2 text-sm hover:opacity-90 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer shrink-0"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

interface ChatWidgetFABProps {
  onClick: () => void;
}

export function ChatWidgetFAB({ onClick }: ChatWidgetFABProps) {
  return (
    <button
      onClick={onClick}
      className="fixed bottom-6 right-6 z-30 w-14 h-14 bg-accent text-bg rounded-full shadow-lg hover:opacity-90 transition-all cursor-pointer flex items-center justify-center"
      aria-label="Open chat"
    >
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>
    </button>
  );
}
