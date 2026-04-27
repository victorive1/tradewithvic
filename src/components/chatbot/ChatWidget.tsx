"use client";

import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  agent?: string;
  agentName?: string;
  timestamp: string;
  attachments?: { type: string; url: string }[];
}

// Conversation state is now owned by the client (the API is stateless).
// `id` is local-only — useful for analytics / future server-side persistence.
interface Conversation {
  id: string;
  messages: ChatMessage[];
  currentAgent: string;
  escalated: boolean;
  resolved: boolean;
  rating?: number;
}

const agentColors: Record<string, string> = {
  base: "bg-accent",
  sam: "bg-bull",
  peter: "bg-warn",
};

const agentAvatars: Record<string, string> = {
  base: "TV",
  sam: "S",
  peter: "P",
};

function MessageBubble({ msg }: { msg: ChatMessage }) {
  if (msg.role === "system") {
    return (
      <div className="flex justify-center my-3">
        <div className="bg-accent/10 border border-accent/20 text-accent-light text-xs px-4 py-2 rounded-full">
          {msg.content}
        </div>
      </div>
    );
  }

  const isUser = msg.role === "user";

  return (
    <div className={cn("flex gap-2.5 mb-4", isUser ? "flex-row-reverse" : "flex-row")}>
      {!isUser && (
        <div className={cn("w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0", agentColors[msg.agent || "base"])}>
          {agentAvatars[msg.agent || "base"]}
        </div>
      )}
      <div className={cn("max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed",
        isUser
          ? "bg-accent text-white rounded-br-md"
          : "bg-surface-2 border border-border/50 text-foreground rounded-bl-md"
      )}>
        {!isUser && msg.agentName && (
          <div className="text-[10px] text-muted mb-1 font-medium">{msg.agentName}</div>
        )}
        <div className="whitespace-pre-wrap">{msg.content}</div>
        <div className={cn("text-[10px] mt-1.5", isUser ? "text-white/60" : "text-muted")}>
          {new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </div>
      </div>
    </div>
  );
}

function RatingPrompt({ onRate }: { onRate: (rating: number) => void }) {
  const [hovered, setHovered] = useState(0);

  return (
    <div className="bg-surface-2 border border-border/50 rounded-xl p-4 text-center mx-4 mb-4">
      <p className="text-sm text-foreground mb-2">How was your support experience?</p>
      <div className="flex justify-center gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <button key={star} onMouseEnter={() => setHovered(star)} onMouseLeave={() => setHovered(0)} onClick={() => onRate(star)}
            className="text-2xl transition-all hover:scale-110">
            {star <= hovered ? "⭐" : "☆"}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showRating, setShowRating] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversation?.messages]);

  async function startConversation() {
    try {
      const res = await fetch("/api/chat");
      const data = await res.json();
      if (data.success && data.initialMessage) {
        setConversation({
          id: `conv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          messages: [data.initialMessage],
          currentAgent: data.currentAgent ?? "base",
          escalated: false,
          resolved: false,
        });
      }
    } catch (e) {
      console.error("Failed to start chat:", e);
    }
  }

  function handleOpen() {
    setIsOpen(true);
    if (!conversation) startConversation();
  }

  async function sendMessage() {
    if (!input.trim() || !conversation || loading) return;

    const userMessage = input.trim();
    setInput("");
    setLoading(true);

    // Optimistic: add user message immediately for instant feedback.
    const tempUserMsg: ChatMessage = {
      id: `temp_${Date.now()}`,
      role: "user",
      content: userMessage,
      timestamp: new Date().toISOString(),
    };
    const messagesWithUser = [...conversation.messages, tempUserMsg];
    setConversation({ ...conversation, messages: messagesWithUser });

    try {
      // Server is stateless — send the prior conversation snapshot so
      // any Lambda instance can compute the next turn correctly.
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: conversation.messages,
          currentAgent: conversation.currentAgent,
          escalated: conversation.escalated,
          message: userMessage,
        }),
      });
      const data = await res.json();

      if (data.success && Array.isArray(data.newMessages)) {
        const escalatedNow = !!data.escalated;
        setConversation((prev) => prev ? {
          ...prev,
          messages: [...messagesWithUser, ...data.newMessages],
          currentAgent: data.currentAgent ?? prev.currentAgent,
          escalated: escalatedNow,
        } : prev);
        if (escalatedNow) setShowRating(true);
      } else {
        // Surface an in-chat error so silent failures stop being silent.
        setConversation((prev) => prev ? {
          ...prev,
          messages: [...messagesWithUser, {
            id: `err_${Date.now()}`,
            role: "system",
            content: "Sorry — I couldn't reach the assistant just now. Please try again in a moment.",
            timestamp: new Date().toISOString(),
          }],
        } : prev);
      }
    } catch (e) {
      console.error("Failed to send:", e);
      setConversation((prev) => prev ? {
        ...prev,
        messages: [...messagesWithUser, {
          id: `err_${Date.now()}`,
          role: "system",
          content: "Network error. Check your connection and try again.",
          timestamp: new Date().toISOString(),
        }],
      } : prev);
    }
    setLoading(false);
  }

  async function handleRate(rating: number) {
    if (!conversation) return;
    await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId: conversation.id, action: "rate", rating }),
    });
    setShowRating(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  return (
    <>
      {/* Launcher button */}
      {!isOpen && (
        <button onClick={handleOpen}
          className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-accent hover:bg-accent-light text-white shadow-lg shadow-accent/25 flex items-center justify-center transition-all hover:scale-105 z-50">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        </button>
      )}

      {/* Chat window */}
      {isOpen && (
        <div className="fixed bottom-6 right-6 w-[380px] h-[580px] bg-background border border-border rounded-2xl shadow-2xl shadow-black/30 flex flex-col z-50 overflow-hidden">
          {/* Header */}
          <div className="bg-surface border-b border-border/50 px-4 py-3 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className={cn("w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold",
                agentColors[conversation?.currentAgent || "base"])}>
                {agentAvatars[conversation?.currentAgent || "base"]}
              </div>
              <div>
                <div className="text-sm font-semibold text-foreground">
                  {conversation?.currentAgent === "sam" ? "Sam" : conversation?.currentAgent === "peter" ? "Peter" : "TradeWithVic"}
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-bull pulse-live" />
                  <span className="text-[10px] text-muted">
                    {conversation?.currentAgent === "sam" ? "Product Specialist" : conversation?.currentAgent === "peter" ? "Account Specialist" : "Support Assistant"}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setShowRating(true)} className="text-muted hover:text-muted-light transition-smooth" title="Rate this conversation">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" /></svg>
              </button>
              <button onClick={() => setIsOpen(false)} className="text-muted hover:text-muted-light transition-smooth">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4">
            {conversation?.messages.map((msg) => (
              <MessageBubble key={msg.id} msg={msg} />
            ))}
            {loading && (
              <div className="flex gap-2.5 mb-4">
                <div className={cn("w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0", agentColors[conversation?.currentAgent || "base"])}>
                  {agentAvatars[conversation?.currentAgent || "base"]}
                </div>
                <div className="bg-surface-2 border border-border/50 rounded-2xl rounded-bl-md px-4 py-3">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 rounded-full bg-muted animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-2 h-2 rounded-full bg-muted animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-2 h-2 rounded-full bg-muted animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Rating prompt */}
          {showRating && <RatingPrompt onRate={handleRate} />}

          {/* Composer */}
          <div className="border-t border-border/50 bg-surface px-3 py-3 flex-shrink-0">
            <div className="flex items-end gap-2">
              <div className="flex-1 relative">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Type your question..."
                  rows={1}
                  className="w-full px-4 py-2.5 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground placeholder-muted resize-none max-h-24"
                />
              </div>
              <button onClick={sendMessage} disabled={!input.trim() || loading}
                className="w-10 h-10 rounded-xl bg-accent hover:bg-accent-light disabled:opacity-40 text-white flex items-center justify-center transition-smooth flex-shrink-0">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19V5m0 0l-7 7m7-7l7 7" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
