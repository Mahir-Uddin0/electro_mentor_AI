"use client";

import { Bot, Paperclip, Plus, Send, Sparkles, UserRound } from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";

import { Button, Card } from "@/components/ui";
import { frontendApi } from "@/lib/api/client";

type ChatMessage = { role: "user" | "assistant"; content: string; sources?: string[] };

const prompts = [
  "Why does my MCB trip when the motor starts?",
  "Explain safe two-way switch wiring",
  "How do I test an RCCB correctly?",
  "What PPE should I use for panel work?",
];

export default function AssistantPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), [messages, loading]);

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    const message = input.trim();
    if (!message || loading) return;
    setInput(""); setError(""); setMessages((current) => [...current, { role: "user", content: message }]); setLoading(true);
    try {
      const response = await frontendApi.chat(message);
      setMessages((current) => [...current, { role: "assistant", content: response.answer, sources: ["Electrical workshop safety guide", "Wiring fundamentals"] }]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The assistant is unavailable.");
    } finally { setLoading(false); }
  }

  return (
    <Card className="assistant-shell">
      <aside className="conversation-list">
        <Button icon={Plus} className="button" style={{ width: "100%" }}>New conversation</Button>
        <h2>Recent conversations</h2>
        <button className="conversation-item active"><strong>Motor starter troubleshooting</strong><span>Why does my MCB trip when…</span></button>
        <button className="conversation-item"><strong>House wiring safety</strong><span>Checklist for socket installation</span></button>
        <button className="conversation-item"><strong>Testing an RCCB</strong><span>Show me the correct sequence</span></button>
      </aside>
      <section className="chat-panel">
        <div className="chat-thread" aria-live="polite">
          {messages.length === 0 ? (
            <div className="chat-empty"><span className="empty-icon"><Sparkles size={28} /></span><h2>How can I help with your electrical work?</h2><p>Ask a question and I’ll use your course guides to give safe, practical steps.</p>
              <div className="suggested-prompts">{prompts.map((prompt) => <button key={prompt} onClick={() => setInput(prompt)}>{prompt}</button>)}</div>
            </div>
          ) : messages.map((message, index) => (
            <div className={`message ${message.role}`} key={`${message.role}-${index}`}>
              <span className="message-avatar">{message.role === "assistant" ? <Bot size={16} /> : <UserRound size={16} />}</span>
              <div className="message-bubble"><p>{message.content}</p>{message.sources && <div className="source-list">{message.sources.map((source) => <span className="source-pill" key={source}>{source}</span>)}</div>}</div>
            </div>
          ))}
          {loading && <div className="message"><span className="message-avatar"><Bot size={16} /></span><div className="message-bubble"><span className="spinner" style={{ display: "block", width: 17, height: 17 }} /></div></div>}
          {error && <div className="alert alert-red" style={{ maxWidth: 800, margin: "0 auto 15px" }}><div><strong>Couldn’t get an answer</strong><p>{error}</p></div></div>}
          <div ref={bottomRef} />
        </div>
        <div className="chat-composer-wrap">
          <form className="chat-composer" onSubmit={submit}>
            <button className="icon-button" type="button" aria-label="Attach a photo"><Paperclip size={18} /></button>
            <textarea value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask about wiring, circuits, safety, or troubleshooting…" onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void submit(); } }} />
            <Button icon={Send} disabled={!input.trim() || loading} aria-label="Send message">Send</Button>
          </form>
        </div>
      </section>
    </Card>
  );
}
