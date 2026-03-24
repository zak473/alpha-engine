"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Bot, User, Sparkles, RotateCcw, Coins } from "lucide-react";
import { cn } from "@/lib/utils";

function getAuthHeader(): string | null {
  if (typeof window === "undefined") return null;
  const token = localStorage.getItem("alpha_engine_token");
  return token ? `Bearer ${token}` : null;
}

interface Message {
  role: "user" | "assistant";
  content: string;
}

const SUGGESTIONS = [
  "Who should I back in tonight's Premier League matches?",
  "Explain what ELO ratings mean for betting",
  "What does a 3% edge on a bet actually mean?",
  "Best bankroll strategy for a £500 starting balance?",
  "Give me a 2-team accumulator for tonight",
];

function MessageBubble({ msg, isStreaming }: { msg: Message; isStreaming?: boolean }) {
  const isUser = msg.role === "user";
  return (
    <div className={cn("flex gap-3 max-w-3xl", isUser ? "ml-auto flex-row-reverse" : "mr-auto")}>
      {/* Avatar */}
      <div className={cn(
        "shrink-0 w-8 h-8 rounded-full flex items-center justify-center mt-0.5",
        isUser ? "bg-white/[0.1]" : "bg-gradient-to-br from-violet-500/30 to-blue-500/30 border border-white/[0.1]"
      )}>
        {isUser
          ? <User size={14} className="text-white/60" />
          : <Bot size={14} className="text-violet-300" />
        }
      </div>

      {/* Bubble */}
      <div className={cn(
        "rounded-2xl px-4 py-3 text-[13px] leading-relaxed max-w-[calc(100%-3rem)]",
        isUser
          ? "bg-white/[0.08] text-white/90 rounded-tr-sm"
          : "bg-gradient-to-br from-violet-500/[0.12] to-blue-500/[0.08] border border-white/[0.06] text-white/85 rounded-tl-sm"
      )}>
        <p className="whitespace-pre-wrap">{msg.content}</p>
        {isStreaming && (
          <span className="inline-block w-1 h-3.5 bg-violet-400 ml-0.5 animate-pulse rounded-sm" />
        )}
      </div>
    </div>
  );
}

export function AdvisorClient() {
  const [messages,    setMessages]    = useState<Message[]>([]);
  const [input,       setInput]       = useState("");
  const [streaming,   setStreaming]   = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [tokens,      setTokens]      = useState<number | null>(null);
  const [outOfTokens, setOutOfTokens] = useState(false);
  const bottomRef  = useRef<HTMLDivElement>(null);
  const inputRef   = useRef<HTMLTextAreaElement>(null);
  const abortRef   = useRef<AbortController | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Fetch token balance on mount
  useEffect(() => {
    const auth = getAuthHeader();
    if (!auth) return;
    fetch("/api/v1/advisor/tokens", { headers: { Authorization: auth } })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data?.tokens !== undefined) setTokens(data.tokens); })
      .catch(() => {});
  }, []);

  const send = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || streaming) return;

    setError(null);
    const userMsg: Message = { role: "user", content: trimmed };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");

    // Add empty assistant placeholder
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);
    setStreaming(true);

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const auth = getAuthHeader();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (auth) headers["Authorization"] = auth;

      const res = await fetch("/api/chat", {
        method: "POST",
        headers,
        body: JSON.stringify({ messages: next }),
        signal: ctrl.signal,
      });

      if (res.status === 402) {
        setOutOfTokens(true);
        setMessages((prev) => prev.slice(0, -1));
        setStreaming(false);
        return;
      }

      if (!res.ok) throw new Error(`API error ${res.status}`);
      if (!res.body) throw new Error("Response body is empty");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let assistant = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        assistant += chunk;
        setMessages((prev) => {
          const copy = [...prev];
          copy[copy.length - 1] = { role: "assistant", content: assistant };
          return copy;
        });
      }

      // Deduct from local token count
      setTokens((prev) => (prev !== null ? Math.max(0, prev - 1) : prev));
    } catch (err: unknown) {
      if ((err as Error)?.name === "AbortError") return;
      setError("Something went wrong. Please try again.");
      setMessages((prev) => prev.slice(0, -1)); // remove empty assistant msg
    } finally {
      setStreaming(false);
      abortRef.current = null;
      inputRef.current?.focus();
    }
  }, [messages, streaming]);

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  }

  function reset() {
    abortRef.current?.abort();
    setMessages([]);
    setInput("");
    setError(null);
    setStreaming(false);
    setOutOfTokens(false);
  }

  const isEmpty = messages.length === 0;

  return (
    <div className="flex flex-col h-full min-h-0">

      {/* ── Token badge ──────────────────────────────────────────────────── */}
      {tokens !== null && (
        <div className="shrink-0 flex justify-end px-4 pt-3">
          <div className={cn(
            "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border",
            tokens === 0
              ? "bg-red-500/10 border-red-500/20 text-red-400"
              : tokens <= 3
              ? "bg-amber-500/10 border-amber-500/20 text-amber-400"
              : "bg-violet-500/10 border-violet-500/20 text-violet-300"
          )}>
            <Coins size={11} />
            {tokens} token{tokens !== 1 ? "s" : ""} remaining
          </div>
        </div>
      )}

      {/* ── Out-of-tokens paywall ─────────────────────────────────────────── */}
      {outOfTokens && (
        <div className="mx-4 mt-3 rounded-2xl border border-amber-500/20 bg-amber-500/[0.06] p-5 text-center">
          <p className="text-[13px] font-semibold text-amber-300 mb-1">You&apos;ve used all your tokens</p>
          <p className="text-[12px] text-white/40 mb-3">Upgrade to Pro for 150 tokens per month, or wait for your next cycle.</p>
          <a
            href="/pricing"
            className="inline-block px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-[12px] font-semibold transition-colors"
          >
            Upgrade to Pro
          </a>
        </div>
      )}

      {/* ── Empty state ──────────────────────────────────────────────────── */}
      {isEmpty && !outOfTokens && (
        <div className="flex-1 flex flex-col items-center justify-center gap-8 px-4 py-12">
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500/30 to-blue-500/30 border border-white/[0.1] flex items-center justify-center">
              <Sparkles size={22} className="text-violet-300" />
            </div>
            <h2 className="text-[18px] font-semibold text-white">Sports AI Advisor</h2>
            <p className="text-[13px] text-white/40 max-w-sm">
              Ask me anything about sport, matches, betting strategy, or odds. I'm here to give you the edge.
            </p>
          </div>

          {/* Suggestion chips */}
          <div className="flex flex-wrap gap-2 justify-center max-w-xl">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                className="px-3 py-2 rounded-xl border border-white/[0.07] bg-white/[0.03] text-[12px] text-white/50 hover:text-white/80 hover:bg-white/[0.06] hover:border-white/[0.12] transition-all text-left"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Message thread ───────────────────────────────────────────────── */}
      {!isEmpty && (
        <div className="flex-1 overflow-y-auto px-4 py-6 space-y-5 min-h-0">
          {messages.map((msg, i) => (
            <MessageBubble
              key={i}
              msg={msg}
              isStreaming={streaming && i === messages.length - 1 && msg.role === "assistant"}
            />
          ))}
          {error && (
            <p className="text-center text-[12px] text-red-400/70">{error}</p>
          )}
          <div ref={bottomRef} />
        </div>
      )}

      {/* ── Input bar ────────────────────────────────────────────────────── */}
      <div className="shrink-0 px-4 pb-4 pt-2 border-t border-white/[0.06]">
        <div className="max-w-3xl mx-auto">
          {/* Reset button when conversation exists */}
          {!isEmpty && (
            <div className="flex justify-end mb-2">
              <button
                onClick={reset}
                className="flex items-center gap-1.5 text-[11px] text-white/30 hover:text-white/60 transition-colors"
              >
                <RotateCcw size={10} />
                New conversation
              </button>
            </div>
          )}

          <div className="relative flex items-end gap-2 rounded-2xl border border-white/[0.1] bg-white/[0.04] px-4 py-3 focus-within:border-violet-500/40 focus-within:bg-white/[0.06] transition-all">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Ask about a match, player, or betting strategy…"
              rows={1}
              disabled={streaming || outOfTokens}
              className="flex-1 bg-transparent text-[13px] text-white/85 placeholder-white/25 resize-none outline-none min-h-[20px] max-h-32 overflow-y-auto disabled:opacity-50"
              style={{ fieldSizing: "content" } as React.CSSProperties}
            />
            <button
              onClick={() => send(input)}
              disabled={!input.trim() || streaming || outOfTokens}
              className="shrink-0 w-8 h-8 rounded-xl bg-violet-500 hover:bg-violet-400 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-all"
            >
              <Send size={13} className="text-white" />
            </button>
          </div>

          <p className="text-center text-[10px] text-white/20 mt-2">
            Never In Doubt AI · For entertainment purposes · Please gamble responsibly
          </p>
        </div>
      </div>
    </div>
  );
}
