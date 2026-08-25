"use client";

import {
  Bot,
  Check,
  MessageSquare,
  PanelLeft,
  Paperclip,
  Pencil,
  Plus,
  Send,
  Sparkles,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  type FormEvent,
  type MouseEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { Button, Card } from "@/components/ui";
import {
  ApiError,
  frontendApi,
  type ConversationMessage,
  type ConversationSource,
  type ConversationSummary,
} from "@/lib/api/client";

const prompts = [
  "Why does my MCB trip when the motor starts?",
  "Explain safe two-way switch wiring",
  "How do I test an RCCB correctly?",
  "What PPE should I use for panel work?",
];

function messageTitle(message: string) {
  const words = message.trim().split(/\s+/).slice(0, 7).join(" ");
  return words.length < message.trim().length ? `${words}…` : words;
}

function sourceLabel(source: ConversationSource) {
  return source.title ?? source.source ?? "Retrieved source";
}

function conversationHref(conversationId?: string | null) {
  return conversationId
    ? `/assistant?conversation=${encodeURIComponent(conversationId)}`
    : "/assistant";
}

function upsertConversation(
  conversations: ConversationSummary[],
  nextConversation: ConversationSummary,
) {
  const existing = conversations.find(
    (conversation) => conversation.id === nextConversation.id,
  );
  const mergedConversation = { ...existing, ...nextConversation };
  return [
    mergedConversation,
    ...conversations.filter((conversation) => conversation.id !== nextConversation.id),
  ].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

export default function AssistantPage() {
  const router = useRouter();
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [input, setInput] = useState("");
  const [listLoading, setListLoading] = useState(true);
  const [threadLoading, setThreadLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const activeConversationRef = useRef<string | null>(null);
  const openRequestRef = useRef(0);
  const sendRequestRef = useRef(0);
  const bottomRef = useRef<HTMLDivElement>(null);

  const openConversation = useCallback(
    async (conversationId: string, updateUrl = true) => {
      const requestId = ++openRequestRef.current;
      sendRequestRef.current += 1;
      activeConversationRef.current = conversationId;
      setActiveConversationId(conversationId);
      setMessages([]);
      setSending(false);
      setThreadLoading(true);
      setError("");
      setHistoryOpen(false);
      if (updateUrl) router.push(conversationHref(conversationId), { scroll: false });

      try {
        const conversation = await frontendApi.getConversation(conversationId);
        if (
          requestId !== openRequestRef.current ||
          activeConversationRef.current !== conversationId
        ) return;
        setMessages(conversation.messages);
        const lastMessage = conversation.messages.at(-1);
        setConversations((current) => upsertConversation(current, {
          ...conversation,
          last_message: lastMessage?.content ?? null,
          message_count: conversation.messages.length,
        }));
      } catch (caught) {
        if (requestId !== openRequestRef.current) return;
        setError(caught instanceof Error ? caught.message : "Could not open this conversation.");
      } finally {
        if (requestId === openRequestRef.current) setThreadLoading(false);
      }
    },
    [router],
  );

  const startNewConversation = useCallback(
    (updateUrl = true) => {
      openRequestRef.current += 1;
      sendRequestRef.current += 1;
      activeConversationRef.current = null;
      setActiveConversationId(null);
      setMessages([]);
      setInput("");
      setError("");
      setThreadLoading(false);
      setSending(false);
      setHistoryOpen(false);
      setRenamingId(null);
      if (updateUrl) router.push(conversationHref(), { scroll: false });
    },
    [router],
  );

  useEffect(() => {
    let active = true;
    void frontendApi
      .listConversations()
      .then(({ conversations: loadedConversations }) => {
        if (!active) return;
        setConversations(loadedConversations);
        const requestedConversation = new URLSearchParams(window.location.search).get("conversation");
        if (requestedConversation) void openConversation(requestedConversation, false);
      })
      .catch((caught) => {
        if (active) setError(caught instanceof Error ? caught.message : "Could not load conversations.");
      })
      .finally(() => {
        if (active) setListLoading(false);
      });
    return () => {
      active = false;
      openRequestRef.current += 1;
      sendRequestRef.current += 1;
    };
  }, [openConversation]);

  useEffect(() => {
    function handleHistoryNavigation() {
      const conversationId = new URLSearchParams(window.location.search).get("conversation");
      if (conversationId) void openConversation(conversationId, false);
      else startNewConversation(false);
    }
    window.addEventListener("popstate", handleHistoryNavigation);
    return () => window.removeEventListener("popstate", handleHistoryNavigation);
  }, [openConversation, startNewConversation]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending, threadLoading]);

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    const content = input.trim();
    if (!content || sending || threadLoading) return;

    const requestId = ++sendRequestRef.current;
    setInput("");
    setError("");
    setSending(true);
    let conversationId = activeConversationRef.current;
    let previousMessages = messages;

    try {
      if (!conversationId) {
        const created = await frontendApi.createConversation(messageTitle(content));
        if (requestId !== sendRequestRef.current) return;
        conversationId = created.id;
        activeConversationRef.current = created.id;
        setActiveConversationId(created.id);
        setConversations((current) => upsertConversation(current, created));
        router.push(conversationHref(created.id), { scroll: false });
        previousMessages = [];
      }

      const targetConversationId = conversationId;
      const optimisticMessage: ConversationMessage = {
        id: `pending-${requestId}`,
        conversation_id: targetConversationId,
        role: "user",
        content,
        created_at: new Date().toISOString(),
      };
      setMessages([...previousMessages, optimisticMessage]);

      const response = await frontendApi.sendConversationMessage(targetConversationId, content);
      if (
        requestId !== sendRequestRef.current ||
        activeConversationRef.current !== targetConversationId
      ) return;

      const assistantMessage = response.assistant_message.sources?.length
        ? response.assistant_message
        : { ...response.assistant_message, sources: response.sources };
      setMessages([...previousMessages, response.user_message, assistantMessage]);
      setConversations((current) => {
        const existing = current.find((conversation) => conversation.id === targetConversationId);
        const updated: ConversationSummary = {
          id: targetConversationId,
          title: existing?.title ?? messageTitle(content),
          created_at: existing?.created_at ?? response.user_message.created_at,
          updated_at: assistantMessage.created_at,
          last_message: assistantMessage.content,
          message_count: (existing?.message_count ?? previousMessages.length) + 2,
        };
        return upsertConversation(current, updated);
      });
    } catch (caught) {
      if (requestId !== sendRequestRef.current) return;
      if (caught instanceof ApiError && caught.status === 502 && conversationId) {
        try {
          const persistedConversation = await frontendApi.getConversation(conversationId);
          if (requestId === sendRequestRef.current) {
            setMessages(persistedConversation.messages);
            const lastMessage = persistedConversation.messages.at(-1);
            setConversations((current) => upsertConversation(current, {
              ...persistedConversation,
              last_message: lastMessage?.content ?? null,
              message_count: persistedConversation.messages.length,
            }));
          }
        } catch {
          setMessages(previousMessages);
        }
      } else {
        setMessages(previousMessages);
        setInput(content);
      }
      setError(caught instanceof Error ? caught.message : "The assistant is unavailable.");
    } finally {
      if (requestId === sendRequestRef.current) setSending(false);
    }
  }

  function beginRename(event: MouseEvent, conversation: ConversationSummary) {
    event.stopPropagation();
    setRenamingId(conversation.id);
    setRenameValue(conversation.title);
  }

  async function saveRename(conversationId: string) {
    const title = renameValue.trim();
    if (!title) return;
    setError("");
    try {
      const updated = await frontendApi.renameConversation(conversationId, title);
      setConversations((current) => upsertConversation(current, updated));
      setRenamingId(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not rename the conversation.");
    }
  }

  async function deleteConversation(event: MouseEvent, conversationId: string) {
    event.stopPropagation();
    if (!window.confirm("Delete this conversation and all of its messages?")) return;
    setError("");
    try {
      await frontendApi.deleteConversation(conversationId);
      setConversations((current) => current.filter((conversation) => conversation.id !== conversationId));
      if (activeConversationRef.current === conversationId) startNewConversation();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not delete the conversation.");
    }
  }

  const activeConversation = conversations.find(
    (conversation) => conversation.id === activeConversationId,
  );

  return (
    <Card className="assistant-shell">
      {historyOpen && (
        <button
          className="conversation-drawer-scrim"
          onClick={() => setHistoryOpen(false)}
          aria-label="Close conversation history"
        />
      )}
      <aside className={`conversation-list ${historyOpen ? "open" : ""}`} aria-label="Conversation history">
        <div className="conversation-sidebar-head">
          <strong>Chats</strong>
          <button className="icon-button conversation-mobile-close" onClick={() => setHistoryOpen(false)} aria-label="Close history">
            <X size={17} />
          </button>
        </div>
        <Button icon={Plus} className="conversation-new" onClick={() => startNewConversation()}>
          New conversation
        </Button>
        <h2>Recent conversations</h2>
        <div className="conversation-items">
          {listLoading ? (
            <div className="conversation-status"><span className="spinner" /> Loading chats…</div>
          ) : conversations.length === 0 ? (
            <div className="conversation-status"><MessageSquare size={18} /><span>Your conversations will appear here.</span></div>
          ) : (
            conversations.map((conversation) => (
              <div
                className={`conversation-item ${activeConversationId === conversation.id ? "active" : ""}`}
                key={conversation.id}
              >
                {renamingId === conversation.id ? (
                  <form
                    className="conversation-rename"
                    onSubmit={(event) => { event.preventDefault(); void saveRename(conversation.id); }}
                  >
                    <input
                      autoFocus
                      maxLength={120}
                      value={renameValue}
                      onChange={(event) => setRenameValue(event.target.value)}
                      onKeyDown={(event) => { if (event.key === "Escape") setRenamingId(null); }}
                      aria-label="Conversation title"
                    />
                    <button type="submit" aria-label="Save title"><Check size={14} /></button>
                    <button type="button" onClick={() => setRenamingId(null)} aria-label="Cancel rename"><X size={14} /></button>
                  </form>
                ) : (
                  <>
                    <button className="conversation-open" onClick={() => void openConversation(conversation.id)}>
                      <strong>{conversation.title}</strong>
                      <span>{conversation.last_message === undefined ? "Open conversation" : conversation.last_message || "No messages yet"}</span>
                    </button>
                    <div className="conversation-actions">
                      <button onClick={(event) => beginRename(event, conversation)} aria-label={`Rename ${conversation.title}`}><Pencil size={13} /></button>
                      <button onClick={(event) => void deleteConversation(event, conversation.id)} aria-label={`Delete ${conversation.title}`}><Trash2 size={13} /></button>
                    </div>
                  </>
                )}
              </div>
            ))
          )}
        </div>
      </aside>

      <section className="chat-panel">
        <header className="chat-toolbar">
          <button className="icon-button conversation-mobile-button" onClick={() => setHistoryOpen(true)} aria-label="Open conversation history">
            <PanelLeft size={18} />
          </button>
          <div><strong>{activeConversation?.title ?? "New conversation"}</strong><span>{activeConversation ? `${activeConversation.message_count ?? messages.length} messages` : "Ask a new question"}</span></div>
          <button className="icon-button" onClick={() => startNewConversation()} aria-label="Start a new conversation"><Plus size={18} /></button>
        </header>

        <div className="chat-thread" aria-live="polite" aria-busy={threadLoading || sending}>
          {threadLoading ? (
            <div className="chat-loading"><span className="spinner" /><span>Opening conversation…</span></div>
          ) : messages.length === 0 ? (
            <div className="chat-empty">
              <span className="empty-icon"><Sparkles size={28} /></span>
              <h2>How can I help with your electrical work?</h2>
              <p>Ask a question and I’ll use your course guides to give safe, practical steps.</p>
              <div className="suggested-prompts">
                {prompts.map((prompt) => <button key={prompt} onClick={() => setInput(prompt)}>{prompt}</button>)}
              </div>
            </div>
          ) : messages.map((message) => (
            <div className={`message ${message.role}`} key={message.id}>
              <span className="message-avatar">{message.role === "assistant" ? <Bot size={16} /> : <UserRound size={16} />}</span>
              <div className="message-bubble">
                <p>{message.content}</p>
                {!!message.sources?.length && (
                  <div className="source-list">
                    {message.sources.map((source, index) => (
                      <span className="source-pill" key={`${sourceLabel(source)}-${index}`}>{sourceLabel(source)}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          {sending && (
            <div className="message">
              <span className="message-avatar"><Bot size={16} /></span>
              <div className="message-bubble assistant-thinking"><span className="spinner" /> Searching your guides…</div>
            </div>
          )}
          {error && (
            <div className="alert alert-red chat-error">
              <div><strong>Couldn’t complete the request</strong><p>{error}</p></div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="chat-composer-wrap">
          <form className="chat-composer" onSubmit={submit}>
            <button className="icon-button" type="button" aria-label="Attach a photo"><Paperclip size={18} /></button>
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Ask about wiring, circuits, safety, or troubleshooting…"
              disabled={threadLoading}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void submit();
                }
              }}
            />
            <Button icon={Send} disabled={!input.trim() || sending || threadLoading} aria-label="Send message">Send</Button>
          </form>
          <p className="chat-disclaimer">AI answers can be wrong. Isolate electrical supplies and follow qualified supervision.</p>
        </div>
      </section>
    </Card>
  );
}
