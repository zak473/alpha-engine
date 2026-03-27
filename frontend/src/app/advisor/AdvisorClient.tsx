"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Bot,
  Coins,
  Compass,
  MessageSquareText,
  RotateCcw,
  Send,
  Sparkles,
  StopCircle,
  User,
  Zap,
} from "lucide-react";
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
    <div className={cn("flex gap-3", isUser ? "justify-end" : "justify-start")}>
      {!isUser ? (
        <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.1] text-emerald-300">
          <Bot size={16} />
        </div>
      ) : null}

      <div
        className={cn(
          "max-w-[min(760px,100%)] rounded-[24px] border px-4 py-3 text-[13px] leading-7 shadow-[0_18px_40px_rgba(0,0,0,0.18)]",
          isUser
            ? "rounded-tr-md border-white/10 bg-white/[0.06] text-white/90"
            : "rounded-tl-md border-emerald-400/16 bg-[linear-gradient(180deg,rgba(0,255,132,0.09),rgba(255,255,255,0.025))] text-white/85"
        )}
      >
        <p className="whitespace-pre-wrap">{msg.content}</p>
        {isStreaming ? <span className="ml-1 inline-block h-4 w-1 rounded-full bg-[#00FF84] align-middle animate-pulse" /> : null}
      </div>

      {isUser ? (
        <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.06] text-white/60">
          <User size={15} />
        </div>
      ) : null}
    </div>
  );
}

function SuggestionTile({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group rounded-[22px] border border-white/10 bg-white/[0.04] p-4 text-left transition-all hover:border-emerald-400/20 hover:bg-emerald-400/[0.06]"
    >
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-white/35">
        <Sparkles size={11} className="text-[#00FF84]" /> Prompt
      </div>
      <div className="mt-3 text-[13px] leading-6 text-white/78 group-hover:text-white">{label}</div>
    </button>
  );
}

export function AdvisorClient() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tokens, setTokens] = useState<number | null>(null);
  const [outOfTokens, setOutOfTokens] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const auth = getAuthHeader();
    if (!auth) return;
    fetch("/api/v1/advisor/tokens", { headers: { Authorization: auth } })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.tokens !== undefined) setTokens(data.tokens);
      })
      .catch(() => {});
  }, []);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || streaming) return;

      setError(null);
      const userMsg: Message = { role: "user", content: trimmed };
      const next = [...messages, userMsg];
      setMessages([...next, { role: "assistant", content: "" }]);
      setInput("");
      setStreaming(true);

      const ctrl = new AbortController();
      abortRef.current = ctrl;

      try {
        const auth = getAuthHeader();
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (auth) headers.Authorization = auth;

        const res = await fetch("/api/chat", {
          method: "POST",
          headers,
          body: JSON.stringify({ messages: next }),
          signal: ctrl.signal,
        });

        if (res.status === 402) {
          setOutOfTokens(true);
          setMessages(next);
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
          assistant += decoder.decode(value, { stream: true });
          setMessages((prev) => {
            const copy = [...prev];
            copy[copy.length - 1] = { role: "assistant", content: assistant };
            return copy;
          });
        }

        setTokens((prev) => (prev !== null ? Math.max(0, prev - 1) : prev));
      } catch (err: unknown) {
        if ((err as Error)?.name === "AbortError") return;
        setError("Something went wrong. Please try again.");
        setMessages((prev) => prev.slice(0, -1));
      } finally {
        setStreaming(false);
        abortRef.current = null;
        inputRef.current?.focus();
      }
    },
    [messages, streaming]
  );

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

  function stopStreaming() {
    abortRef.current?.abort();
    setStreaming(false);
  }

  const isEmpty = messages.length === 0;
  const tokenTone =
    tokens === null
      ? "border-white/10 bg-white/[0.04] text-white/60"
      : tokens === 0
      ? "border-red-400/25 bg-red-400/[0.08] text-red-300"
      : tokens <= 3
      ? "border-amber-400/25 bg-amber-400/[0.08] text-amber-200"
      : "border-emerald-400/22 bg-emerald-400/[0.09] text-emerald-300";

  return (
    <div className="grid min-h-[70vh] gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
      <aside className="overflow-hidden rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.025))] p-5 shadow-[0_24px_70px_rgba(0,0,0,0.22)]">
        <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/[0.08] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.22em] text-emerald-300">
          <Compass size={11} /> Research copilot
        </div>

        <h2 className="mt-4 text-[28px] font-black tracking-[-0.06em] text-white">Advisor terminal</h2>
        <p className="mt-3 text-[13px] leading-6 text-white/55">
          Ask for matchup breakdowns, bankroll plans, or quick betting explanations. The advisor keeps the conversation in one clean command room.
        </p>

        <div className="mt-5 grid gap-3">
          <div className={cn("rounded-[22px] border px-4 py-4", tokenTone)}>
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em]">
              <Coins size={11} /> Token balance
            </div>
            <div className="mt-2 text-[28px] font-black tracking-[-0.05em]">{tokens ?? "—"}</div>
            <div className="mt-1 text-[11px] text-white/45">One streamed answer uses one token.</div>
          </div>

          <div className="rounded-[22px] border border-white/10 bg-white/[0.04] p-4">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-white/38">
              <Zap size={11} className="text-[#00FF84]" /> Best for
            </div>
            <ul className="mt-3 space-y-2 text-[12px] leading-6 text-white/60">
              <li>• Quick match reads and confidence framing</li>
              <li>• Explaining edge, CLV, and bankroll concepts</li>
              <li>• Building shortlists before you tail a pick</li>
            </ul>
          </div>
        </div>

        <div className="mt-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/35">Prompt library</div>
            {!isEmpty ? (
              <button
                onClick={reset}
                className="inline-flex items-center gap-1 text-[11px] text-white/40 transition-colors hover:text-white/70"
              >
                <RotateCcw size={11} /> Reset
              </button>
            ) : null}
          </div>

          <div className="grid gap-3">
            {SUGGESTIONS.map((suggestion) => (
              <SuggestionTile key={suggestion} label={suggestion} onClick={() => send(suggestion)} />
            ))}
          </div>
        </div>
      </aside>

      <section className="flex min-h-[70vh] flex-col overflow-hidden rounded-[30px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(0,255,132,0.12),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.025))] shadow-[0_24px_70px_rgba(0,0,0,0.22)]">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/8 px-5 py-4 lg:px-6">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.22em] text-white/36">
              <MessageSquareText size={11} className="text-[#00FF84]" /> Live analysis thread
            </div>
            <div className="mt-2 text-[22px] font-black tracking-[-0.05em] text-white">Chat with the sports advisor</div>
            <div className="mt-1 text-[12px] text-white/48">Ask naturally. It streams back in the same premium terminal style.</div>
          </div>

          <div className="flex items-center gap-2">
            {streaming ? (
              <button
                onClick={stopStreaming}
                className="inline-flex items-center gap-2 rounded-full border border-red-400/25 bg-red-400/[0.08] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-red-300"
              >
                <StopCircle size={13} /> Stop
              </button>
            ) : null}
            {!isEmpty ? (
              <button
                onClick={reset}
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-white/60 transition-colors hover:text-white"
              >
                <RotateCcw size={13} /> New thread
              </button>
            ) : null}
          </div>
        </div>

        {outOfTokens ? (
          <div className="mx-5 mt-5 rounded-[24px] border border-amber-400/20 bg-amber-400/[0.08] p-5 text-center lg:mx-6">
            <div className="text-[18px] font-black tracking-[-0.04em] text-amber-200">You’ve used all your tokens</div>
            <p className="mt-2 text-[13px] leading-6 text-white/58">
              Upgrade to Pro for 150 tokens per month, or wait for your next cycle before opening another advisor thread.
            </p>
            <a
              href="/pricing"
              className="mt-4 inline-flex items-center gap-2 rounded-full bg-amber-300 px-4 py-2 text-[12px] font-black uppercase tracking-[0.14em] text-[#161200]"
            >
              Upgrade to Pro
            </a>
          </div>
        ) : null}

        <div className="flex min-h-0 flex-1 flex-col">
          {isEmpty && !outOfTokens ? (
            <div className="flex flex-1 flex-col items-center justify-center px-5 py-12 text-center lg:px-8">
              <div className="flex h-16 w-16 items-center justify-center rounded-[22px] border border-emerald-400/20 bg-emerald-400/[0.09] text-emerald-300">
                <Sparkles size={26} />
              </div>
              <h3 className="mt-5 text-[30px] font-black tracking-[-0.06em] text-white">Start with a matchup, edge, or betting question.</h3>
              <p className="mt-3 max-w-2xl text-[14px] leading-7 text-white/54">
                The advisor is strongest when you ask clearly: matchup context, market angle, bankroll setup, or a concept you want explained in plain English.
              </p>
              <div className="mt-8 grid w-full max-w-3xl gap-3 md:grid-cols-2 xl:grid-cols-3">
                {SUGGESTIONS.map((suggestion) => (
                  <SuggestionTile key={`${suggestion}-main`} label={suggestion} onClick={() => send(suggestion)} />
                ))}
              </div>
            </div>
          ) : (
            <div className="flex-1 space-y-5 overflow-y-auto px-5 py-6 lg:px-6">
              {messages.map((msg, i) => (
                <MessageBubble
                  key={i}
                  msg={msg}
                  isStreaming={streaming && i === messages.length - 1 && msg.role === "assistant"}
                />
              ))}
              {error ? <p className="text-center text-[12px] text-red-300">{error}</p> : null}
              <div ref={bottomRef} />
            </div>
          )}

          <div className="border-t border-white/8 px-5 py-4 lg:px-6">
            <div className="rounded-[26px] border border-white/10 bg-white/[0.05] p-3 focus-within:border-emerald-400/22 focus-within:bg-white/[0.06]">
              <div className="flex items-end gap-3">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder="Ask about a match, line movement, edge, or bankroll setup…"
                  rows={1}
                  disabled={streaming || outOfTokens}
                  className="min-h-[24px] flex-1 resize-none bg-transparent px-2 py-2 text-[14px] text-white/88 outline-none placeholder:text-white/24 disabled:opacity-50"
                />
                <button
                  onClick={() => send(input)}
                  disabled={!input.trim() || streaming || outOfTokens}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#00FF84] text-[#07110d] transition-opacity hover:opacity-90 disabled:opacity-30"
                >
                  <Send size={16} />
                </button>
              </div>
            </div>
            <p className="mt-2 text-center text-[10px] uppercase tracking-[0.16em] text-white/24">
              Never In Doubt AI · Entertainment only · Please gamble responsibly
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
