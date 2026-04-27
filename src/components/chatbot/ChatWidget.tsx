"use client";

import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { StrategyBuilderCard } from "./StrategyBuilderCard";

interface StrategyBlueprint {
  name: string;
  symbols: string[];
  marketConditions: string;
  timeframes: { bias: string; entry: string };
  entryRules: string[];
  stopLossRules: string;
  takeProfitRules: string;
  riskRules: string;
  invalidationRules: string;
  newsFilter: string;
  sessionFilter: string;
  backtestingPlan: string;
  pseudocode: string;
  alertLogic: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  agent?: string;
  agentName?: string;
  timestamp: string;
  attachments?: { type: "image" | "audio"; url: string; transcription?: string }[];
  structured?: { type: "strategy"; data: StrategyBlueprint };
}

// Hard caps for image upload before sending to the server. Sonnet 4.6's
// optimal image size is ~1568px on the long edge; anything bigger than 5MB
// gets rejected by the API. We resize client-side to keep round-trips fast.
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_IMAGE_LONG_EDGE = 1568;

async function fileToResizedDataUrl(file: File): Promise<string> {
  // Hard fail for non-image — the upload button restricts to images, but be defensive.
  if (!file.type.startsWith("image/")) throw new Error("Not an image");
  // If small enough, skip the resize entirely.
  if (file.size <= MAX_IMAGE_BYTES) {
    const small = await new Promise<HTMLImageElement>((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
      img.src = url;
    });
    if (small.naturalWidth <= MAX_IMAGE_LONG_EDGE && small.naturalHeight <= MAX_IMAGE_LONG_EDGE) {
      // Already within both limits; ship as-is via FileReader.
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
    }
  }
  // Resize via canvas. Always re-encode to JPEG at q=0.85 so the payload
  // shrinks predictably even when the original is a giant PNG.
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = (e) => reject(e);
      i.src = url;
    });
    const long = Math.max(img.naturalWidth, img.naturalHeight);
    const scale = long > MAX_IMAGE_LONG_EDGE ? MAX_IMAGE_LONG_EDGE / long : 1;
    const w = Math.round(img.naturalWidth * scale);
    const h = Math.round(img.naturalHeight * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not available");
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL("image/jpeg", 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
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
        {msg.attachments?.filter((a) => a.type === "image").map((a, i) => (
          // Use plain <img> rather than next/image — these are data: URLs the
          // user just selected, not assets next/image can optimize.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={i}
            src={a.url}
            alt="uploaded chart"
            className="rounded-lg mb-2 max-h-64 object-contain border border-white/10"
          />
        ))}
        {msg.content && <div className="whitespace-pre-wrap">{msg.content}</div>}
        {msg.structured?.type === "strategy" && (
          <StrategyBuilderCard blueprint={msg.structured.data} />
        )}
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
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
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

  async function handleImagePick(file: File | null) {
    setImageError(null);
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setImageError("Image must be smaller than 10MB.");
      return;
    }
    try {
      const dataUrl = await fileToResizedDataUrl(file);
      setPendingImage(dataUrl);
    } catch {
      setImageError("Could not read that image. Try a PNG or JPG.");
    }
  }

  async function sendMessage() {
    // Allow sending with just an image (no text) or just text — but not both empty.
    if ((!input.trim() && !pendingImage) || !conversation || loading) return;

    const userMessage = input.trim();
    const attachments = pendingImage
      ? [{ type: "image" as const, url: pendingImage }]
      : undefined;

    setInput("");
    setPendingImage(null);
    setImageError(null);
    setLoading(true);

    // Optimistic: add user message immediately for instant feedback.
    const tempUserMsg: ChatMessage = {
      id: `temp_${Date.now()}`,
      role: "user",
      content: userMessage,
      timestamp: new Date().toISOString(),
      attachments,
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
          message: userMessage || "Please review this trade screenshot.",
          attachments,
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
            {pendingImage && (
              // Tiny preview chip above the input — single image at a time
              // for now; multi-image is overkill for chart review.
              <div className="mb-2 flex items-center gap-2 bg-surface-2 border border-border/50 rounded-lg p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={pendingImage} alt="preview" className="w-12 h-12 object-cover rounded" />
                <span className="text-[11px] text-muted-light flex-1">Chart attached — describe what to review or just send.</span>
                <button
                  onClick={() => setPendingImage(null)}
                  className="text-muted hover:text-bear-light text-xs px-2 py-1 rounded hover:bg-surface-3"
                  title="Remove image"
                >
                  Remove
                </button>
              </div>
            )}
            {imageError && (
              <div className="mb-2 text-[11px] text-bear-light bg-bear/5 border border-bear/30 rounded-lg px-2 py-1.5">{imageError}</div>
            )}
            <div className="flex items-end gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null;
                  void handleImagePick(file);
                  // Allow re-selecting the same file later by clearing the value.
                  if (e.target) e.target.value = "";
                }}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={loading || !!pendingImage}
                className="w-10 h-10 rounded-xl bg-surface-2 border border-border hover:border-accent disabled:opacity-40 text-muted-light hover:text-accent-light flex items-center justify-center transition-smooth flex-shrink-0"
                title="Attach a chart screenshot for trade review"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                </svg>
              </button>
              <div className="flex-1 relative">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={pendingImage ? "Add context (optional) — what should I look at?" : "Type your question..."}
                  rows={1}
                  className="w-full px-4 py-2.5 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm text-foreground placeholder-muted resize-none max-h-24"
                />
              </div>
              <button onClick={sendMessage} disabled={(!input.trim() && !pendingImage) || loading}
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
