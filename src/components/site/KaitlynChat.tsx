"use client";

import { useEffect, useRef, useState } from "react";
import { formatAnswer } from "@/lib/chat-format";
import { RichText } from "./RichText";

type Msg = { role: "user" | "assistant"; content: string };

export function KaitlynChat({ greeting, disclaimer, whatsappHref }: { greeting: string; disclaimer: string; whatsappHref: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([{ role: "assistant", content: greeting }]);
  const bodyRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight });
  }, [msgs, busy, open]);
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const close = () => {
    setOpen(false);
    launcherRef.current?.focus();
  };

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    const history = msgs.slice(-8);
    setMsgs((m) => [...m, { role: "user", content: text }]);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: text, history }) });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; answer?: string; error?: { message?: string } } | null;
      const reply = res.ok && data?.answer ? data.answer : (data?.error?.message ?? "Sorry, I could not complete that. Please try again, or contact our team.");
      setMsgs((m) => [...m, { role: "assistant", content: reply }]);
    } catch {
      setMsgs((m) => [...m, { role: "assistant", content: "I'm having trouble connecting. Please try again in a moment." }]);
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  return (
    <div className="fixed bottom-4 right-4 z-40 flex flex-col items-end gap-3 sm:bottom-6 sm:right-6">
      {open ? (
        <section
          role="dialog"
          aria-label="Chat with Kaitlyn"
          onKeyDown={(e) => e.key === "Escape" && close()}
          className="flex h-[min(34rem,calc(100vh-6rem))] w-[min(24rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-3xl border border-navy/15 bg-cream shadow-2xl"
        >
          <header className="flex items-center justify-between bg-navy px-4 py-3 text-cream">
            <div>
              <p className="font-semibold leading-tight">Kaitlyn</p>
              <p className="text-xs text-cream/75">AI assistant for The Modern Pedagogues</p>
            </div>
            <button type="button" onClick={close} aria-label="Close chat" className="rounded p-1 text-xl leading-none hover:text-gold">×</button>
          </header>
          <div ref={bodyRef} className="flex-1 space-y-3 overflow-y-auto p-4" role="log" aria-live="polite" aria-label="Conversation">
            {msgs.map((m, i) => (
              <div
                key={i}
                className={
                  m.role === "user"
                    ? "ml-auto max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-navy px-3 py-2 text-sm text-cream"
                    : "mr-auto max-w-[92%] rounded-2xl rounded-bl-sm border border-navy/10 bg-white px-3 py-2 text-sm leading-6 [&_a]:underline [&_a]:decoration-gold [&_li]:mt-1 [&_p+p]:mt-2 [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-5 [&_h2]:font-semibold"
                }
              >
                {m.role === "assistant" ? <RichText text={formatAnswer(m.content)} links="local" /> : m.content}
              </div>
            ))}
            {busy ? <p className="mr-auto text-sm text-navy/60" role="status">Kaitlyn is typing…</p> : null}
          </div>
          <form onSubmit={send} className="flex gap-2 border-t border-navy/10 bg-white p-3">
            <label htmlFor="kaitlyn-input" className="sr-only">Your question</label>
            <input
              id="kaitlyn-input"
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              maxLength={1000}
              autoComplete="off"
              placeholder="Ask about tutors, fees, lessons…"
              className="min-w-0 flex-1 rounded-lg border border-navy/25 px-3 py-2 text-sm focus:border-royal focus:outline-none focus:ring-2 focus:ring-royal/30"
            />
            <button disabled={busy || !input.trim()} className="rounded-full bg-navy px-4 py-2 text-sm font-semibold text-cream disabled:opacity-50">Send</button>
          </form>
          <p className="border-t border-navy/10 bg-cream-deep px-4 py-2 text-xs text-navy/70">
            {disclaimer}{" "}
            <a href={whatsappHref} className="font-semibold underline">Talk to our team</a>
          </p>
        </section>
      ) : null}
      <button
        ref={launcherRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="rounded-full bg-gold px-5 py-3 font-semibold text-navy shadow-lg hover:brightness-95"
      >
        {open ? "Close Kaitlyn" : "Ask Kaitlyn"}
      </button>
    </div>
  );
}
