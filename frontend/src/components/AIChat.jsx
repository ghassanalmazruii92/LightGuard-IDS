import React, { useState, useRef, useEffect } from 'react';
import { Bot, X, Send, Loader2, ChevronDown, Shield, Sparkles, RotateCcw } from 'lucide-react';
import api from '../lib/api';
import HoverHint from './HoverHint';

// ── Simple markdown renderer ──────────────────────────────────────────────
function MarkdownText({ text }) {
  if (!text) return null;

  const lines = text.split('\n');
  const elements = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Code block
    if (line.startsWith('```')) {
      const codeLines = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      elements.push(
        <pre key={i} className="bg-background border border-border rounded-lg p-3 text-[11px] font-mono overflow-x-auto my-2 text-low">
          {codeLines.join('\n')}
        </pre>
      );
      i++;
      continue;
    }

    // H3
    if (line.startsWith('### ')) {
      elements.push(<h3 key={i} className="font-bold text-accent text-sm mt-3 mb-1">{line.slice(4)}</h3>);
    }
    // H2
    else if (line.startsWith('## ')) {
      elements.push(<h2 key={i} className="font-bold text-accent text-sm mt-3 mb-1">{line.slice(3)}</h2>);
    }
    // Bullet
    else if (line.startsWith('- ') || line.startsWith('* ')) {
      elements.push(
        <div key={i} className="flex items-start space-x-2 my-0.5">
          <span className="text-accent mt-1 shrink-0">•</span>
          <span>{renderInline(line.slice(2))}</span>
        </div>
      );
    }
    // Numbered list
    else if (/^\d+\.\s/.test(line)) {
      const num = line.match(/^(\d+)\./)[1];
      elements.push(
        <div key={i} className="flex items-start space-x-2 my-0.5">
          <span className="text-accent font-bold shrink-0 min-w-[18px]">{num}.</span>
          <span>{renderInline(line.replace(/^\d+\.\s/, ''))}</span>
        </div>
      );
    }
    // Horizontal rule
    else if (line === '---' || line === '***') {
      elements.push(<hr key={i} className="border-border my-2" />);
    }
    // Empty line = paragraph break
    else if (line.trim() === '') {
      elements.push(<div key={i} className="h-1" />);
    }
    // Normal paragraph
    else {
      elements.push(<p key={i} className="my-0.5 leading-relaxed">{renderInline(line)}</p>);
    }
    i++;
  }

  return <div className="text-[12px] text-text/90 space-y-0.5">{elements}</div>;
}

function renderInline(text) {
  // Bold
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className="font-bold text-text">{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={i} className="bg-background border border-border px-1 rounded text-[10px] font-mono text-accent">{part.slice(1, -1)}</code>;
    }
    return part;
  });
}


// ── Main AIChat Component ─────────────────────────────────────────────────
const AIChat = () => {
  const [isOpen, setIsOpen]     = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [context, setContext]   = useState(null);  // { device_ip, vuln_script, attack_type }
  const messagesEndRef           = useRef(null);
  const inputRef                 = useRef(null);

  // Allow other components to open chat with context
  useEffect(() => {
    const handler = (e) => {
      const { message, context: ctx } = e.detail || {};
      setContext(ctx || null);
      setIsOpen(true);
      if (message) {
        setTimeout(() => sendMessage(message, ctx), 200);
      }
    };
    window.addEventListener('lightguard:ask-ai', handler);
    return () => window.removeEventListener('lightguard:ask-ai', handler);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const buildHistory = () =>
    messages
      .filter(m => m.role !== 'system')
      .map(m => ({ role: m.role, text: m.text }));

  const sendMessage = async (text, ctx) => {
    const userText = (text || input).trim();
    if (!userText || loading) return;

    const activeContext = ctx || context;
    setInput('');
    setMessages(prev => [...prev, { id: Date.now(), role: 'user', text: userText }]);
    setLoading(true);

    try {
      console.log("[AIChat] Sending request to Gemini...");
      const res = await api.post('/api/ai/chat', {
        message: userText,
        context: activeContext,
        history: buildHistory(),
      });

      console.log("[AIChat] Received reply:", res.data.reply.slice(0, 50) + "...");
      setMessages(prev => [
        ...prev,
        { id: Date.now() + 1, role: 'model', text: res.data.reply },
      ]);
    } catch (err) {
      console.error("[AIChat] Error:", err);
      const errMsg = err.response?.data?.detail || 'Could not reach Gemini AI. Check GEMINI_API_KEY and your network connection.';
      setMessages(prev => [
        ...prev,
        { id: Date.now() + 1, role: 'error', text: errMsg },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const reset = () => {
    setMessages([]);
    setContext(null);
    setInput('');
  };

  // ── Quick prompts ────────────────────────────────────────────────────
  const quickPrompts = [
    "What is the highest-risk vulnerability in the Tadhamon network right now?",
    "How do I harden MQTT brokers against takeover?",
    "Explain BlueKeep and how to mitigate it",
    "What is the difference between ARP spoofing and DNS spoofing?",
  ];

  return (
    <>
      {/* ── Floating trigger button ────────────────────────────────────── */}
      <HoverHint
        as="button"
        type="button"
        hint="Open the LightGuard AI assistant (Gemini) for security Q&A."
        className={`fixed bottom-6 right-6 z-50 w-14 h-14 rounded-2xl shadow-2xl flex items-center justify-center transition-all duration-300 ${
          isOpen
            ? 'bg-background border border-border scale-90'
            : 'bg-accent hover:bg-accent/90 active:scale-95 shadow-accent/30'
        }`}
        onClick={() => setIsOpen(o => !o)}
      >
        {isOpen
          ? <ChevronDown className="w-6 h-6 text-text/70" />
          : <Bot className="w-7 h-7 text-white" />
        }
        {!isOpen && messages.length === 0 && (
          <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-low rounded-full border-2 border-background animate-pulse" />
        )}
      </HoverHint>

      {/* ── Chat drawer ────────────────────────────────────────────────── */}
      <div
        className={`fixed bottom-24 right-6 z-50 w-[360px] max-h-[600px] bg-card border border-border rounded-3xl shadow-2xl flex flex-col overflow-hidden transition-all duration-300 origin-bottom-right ${
          isOpen ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none'
        }`}
      >
        {/* Header */}
        <div className="p-4 border-b border-border flex items-center justify-between bg-background/60 backdrop-blur-sm">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 bg-accent/15 rounded-xl flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-accent" />
            </div>
            <div>
              <div className="font-bold text-sm flex items-center space-x-1">
                <span>LightGuard AI</span>
                <span className="text-[9px] px-1.5 py-0.5 bg-low/15 text-low rounded-full font-bold uppercase">Gemini</span>
              </div>
              <div className="text-[10px] text-text/40">Cybersecurity assistant · Tadhamon Smart City</div>
            </div>
          </div>
          <div className="flex items-center space-x-1">
            <HoverHint
              as="button"
              type="button"
              hint="Clear chat history and context for a fresh thread."
              className="p-1.5 text-text/40 hover:text-text hover:bg-background border border-transparent hover:border-border rounded-lg transition-all"
              onClick={reset}
            >
              <RotateCcw className="w-4 h-4" />
            </HoverHint>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1.5 text-text/40 hover:text-text hover:bg-background border border-transparent hover:border-border rounded-lg transition-all"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Context badge */}
        {context?.device_ip && (
          <div className="mx-4 mt-3 px-3 py-1.5 bg-accent/10 border border-accent/20 rounded-lg flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Shield className="w-3 h-3 text-accent" />
              <span className="text-[10px] font-bold text-accent">
                Context: {context.device_ip}
                {context.vuln_script && ` › ${context.vuln_script}`}
              </span>
            </div>
            <button
              onClick={() => setContext(null)}
              className="text-accent/60 hover:text-accent"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
          {/* Welcome state */}
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center space-y-4 py-6">
              <div className="w-16 h-16 bg-accent/10 rounded-3xl flex items-center justify-center">
                <Bot className="w-8 h-8 text-accent" />
              </div>
              <div>
                <p className="font-bold text-text/80 text-sm mb-1">Hi! How can I help?</p>
                <p className="text-text/40 text-[11px]">Ask about vulnerabilities, attacks, or how to protect city infrastructure.</p>
              </div>
              <div className="grid grid-cols-1 gap-2 w-full">
                {quickPrompts.map((prompt, i) => (
                  <button
                    key={i}
                    onClick={() => sendMessage(prompt)}
                    className="text-left text-[11px] px-3 py-2 bg-background border border-border rounded-xl hover:border-accent/50 hover:bg-accent/5 transition-all text-text/70 hover:text-text"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Message bubbles */}
          {messages.map(msg => (
            <div
              key={msg.id}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {msg.role !== 'user' && (
                <div className="w-6 h-6 bg-accent/15 rounded-lg flex items-center justify-center mr-2 mt-0.5 shrink-0">
                  {msg.role === 'error'
                    ? <X className="w-3 h-3 text-high" />
                    : <Sparkles className="w-3 h-3 text-accent" />
                  }
                </div>
              )}
              <div
                className={`max-w-[85%] px-3 py-2.5 rounded-2xl ${
                  msg.role === 'user'
                    ? 'bg-accent text-white rounded-tr-sm text-[12px]'
                    : msg.role === 'error'
                    ? 'bg-high/10 border border-high/20 text-high text-[11px] rounded-tl-sm'
                    : 'bg-background border border-border rounded-tl-sm'
                }`}
              >
                {msg.role === 'model'
                  ? <MarkdownText text={msg.text} />
                  : <span>{msg.text}</span>
                }
              </div>
            </div>
          ))}

          {/* Loading indicator */}
          {loading && (
            <div className="flex justify-start">
              <div className="w-6 h-6 bg-accent/15 rounded-lg flex items-center justify-center mr-2 mt-0.5 shrink-0">
                <Sparkles className="w-3 h-3 text-accent animate-pulse" />
              </div>
              <div className="bg-background border border-border rounded-2xl rounded-tl-sm px-4 py-3 flex items-center space-x-1.5">
                <span className="w-1.5 h-1.5 bg-accent rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 bg-accent rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 bg-accent rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <div className="p-3 border-t border-border bg-background/50">
          <div className="flex items-end space-x-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Ask about a vulnerability, attack pattern, or defensive control..."
              rows={1}
              className="flex-1 bg-background border border-border rounded-xl px-3 py-2.5 text-[12px] text-text resize-none focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 placeholder:text-text/30 leading-relaxed max-h-32"
              style={{ overflowY: 'auto' }}
              onInput={e => {
                e.target.style.height = 'auto';
                e.target.style.height = `${Math.min(e.target.scrollHeight, 128)}px`;
              }}
              disabled={loading}
            />
            <button
              onClick={() => sendMessage()}
              disabled={!input.trim() || loading}
              className="w-9 h-9 bg-accent text-white rounded-xl flex items-center justify-center hover:bg-accent/90 active:scale-95 transition-all disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
            >
              {loading
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Send className="w-4 h-4" />
              }
            </button>
          </div>
          <p className="text-[9px] text-text/20 text-center mt-1.5">
            Powered by Google Gemini · LightGuard IDS
          </p>
        </div>
      </div>
    </>
  );
};

export default AIChat;

// ── Helper: open AI chat with context from anywhere ───────────────────────
export function askAIAbout({ device_ip, vuln_script, attack_type, message }) {
  window.dispatchEvent(new CustomEvent('lightguard:ask-ai', {
    detail: {
      context: { device_ip, vuln_script, attack_type },
      message,
    },
  }));
}
