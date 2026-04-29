"use client";

import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { StrategyBuilderCard } from "./StrategyBuilderCard";
import { ChatPreferencesPanel } from "./ChatPreferencesPanel";
import { ChatHistoryPanel } from "./ChatHistoryPanel";

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

// Conversation state lives on the client; for signed-in users a parallel
// copy is persisted server-side (see /api/chat/sessions). `serverSessionId`
// is the server-issued ChatSession.id once it exists — null on a brand-new
// conversation, populated from the first POST response.
interface Conversation {
  id: string;
  serverSessionId: string | null;
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
  const [showPrefs, setShowPrefs] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  // Vertical drag offset above the default `bottom-6` resting position.
  // Lives in component state only — no persistence — so a refresh resets
  // the chat back to the default bottom-right corner.
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Drag the chat window up out of the way when it covers something on the
  // page (e.g. the bottom-most journal entry's edit button). Only the
  // header is the grab handle, and clicks on header buttons short-circuit
  // before drag starts. Vertical only — horizontal stays pinned to the
  // right edge.
  function startHeaderDrag(e: React.MouseEvent | React.TouchEvent) {
    if ((e.target as HTMLElement).closest("button")) return;
    e.preventDefault();
    const startY = "touches" in e ? e.touches[0].clientY : e.clientY;
    const startOffset = dragOffset;
    setIsDragging(true);

    const onMove = (ev: MouseEvent | TouchEvent) => {
      const y = "touches" in ev ? (ev.touches[0]?.clientY ?? startY) : ev.clientY;
      // dragging up = positive offset = chat moves toward the top
      const delta = startY - y;
      // Keep the chat fully on-screen. 580px window height + 24px default
      // bottom margin + small buffer at viewport top.
      const maxUp = Math.max(0, window.innerHeight - 580 - 24 - 8);
      const next = Math.max(0, Math.min(maxUp, startOffset + delta));
      setDragOffset(next);
      if ("touches" in ev) ev.preventDefault();
    };
    const onEnd = () => {
      setIsDragging(false);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onEnd);
      window.removeEventListener("touchmove", onMove as EventListener);
      window.removeEventListener("touchend", onEnd);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onEnd);
    // passive: false so we can call preventDefault to stop the page from
    // scrolling along with the drag on touch devices.
    window.addEventListener("touchmove", onMove as EventListener, { passive: false });
    window.addEventListener("touchend", onEnd);
  }

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
          serverSessionId: null,
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

  // Reset to a fresh conversation. Useful after wrapping up a topic so the
  // assistant doesn't carry context (and tokens) into the next ask.
  async function newConversation() {
    setShowHistory(false);
    setShowPrefs(false);
    setPendingImage(null);
    setImageError(null);
    await startConversation();
  }

  // Load a saved conversation from history. Replaces current state with
  // the persisted transcript and pins the serverSessionId so subsequent
  // turns append to that same row.
  async function loadSession(sessionId: string) {
    try {
      const res = await fetch(`/api/chat/sessions/${sessionId}`, { cache: "no-store" });
      const data = await res.json();
      if (!data.success || !data.session) return;
      setConversation({
        id: `conv_${data.session.id}`,
        serverSessionId: data.session.id,
        messages: data.session.messages,
        currentAgent: data.session.currentAgent,
        escalated: data.session.escalated,
        resolved: false,
      });
      setShowHistory(false);
      setShowPrefs(false);
    } catch {
      // No-op — user stays on current conversation.
    }
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
          sessionId: conversation.serverSessionId,
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
          serverSessionId: data.sessionId ?? prev.serverSessionId,
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
        <div
          className="fixed right-6 w-[380px] h-[580px] bg-background border border-border rounded-2xl shadow-2xl shadow-black/30 flex flex-col z-50 overflow-hidden"
          style={{ bottom: `${24 + dragOffset}px` }}
        >
          {/* Header — also the drag handle. Click + drag anywhere on the
              bar (except the button cluster) to slide the chat up so it
              stops blocking page content beneath it. */}
          <div
            onMouseDown={startHeaderDrag}
            onTouchStart={startHeaderDrag}
            className={cn(
              "bg-surface border-b border-border/50 px-4 py-3 flex items-center justify-between flex-shrink-0 select-none",
              isDragging ? "cursor-grabbing" : "cursor-grab",
            )}
          >
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
              <button
                onClick={newConversation}
                className="text-muted hover:text-muted-light transition-smooth"
                title="Start a new conversation"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
                </svg>
              </button>
              <button
                onClick={() => { setShowHistory((h) => !h); setShowPrefs(false); }}
                className={cn("transition-smooth", showHistory ? "text-accent-light" : "text-muted hover:text-muted-light")}
                title="Past conversations"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </button>
              <button
                onClick={() => { setShowPrefs((s) => !s); setShowHistory(false); }}
                className={cn("transition-smooth", showPrefs ? "text-accent-light" : "text-muted hover:text-muted-light")}
                title="Personalize the assistant"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
              <button onClick={() => setShowRating(true)} className="text-muted hover:text-muted-light transition-smooth" title="Rate this conversation">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" /></svg>
              </button>
              <button onClick={() => setIsOpen(false)} className="text-muted hover:text-muted-light transition-smooth">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          </div>

          {/* Slide-down panels — only one at a time */}
          {showHistory && (
            <ChatHistoryPanel
              activeSessionId={conversation?.serverSessionId ?? null}
              onLoad={loadSession}
              onClose={() => setShowHistory(false)}
            />
          )}
          {showPrefs && <ChatPreferencesPanel onClose={() => setShowPrefs(false)} />}

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
