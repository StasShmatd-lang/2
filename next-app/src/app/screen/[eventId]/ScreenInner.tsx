"use client";

import { useEffect, useMemo, useState } from "react";
import { AuthorAvatar } from "@/components/AuthorAvatar";
import { BrandFooter } from "@/components/BrandFooter";
import { HallQr } from "@/components/HallQr";
import { Snow } from "@/components/Snow";
import { StatsBars } from "@/components/StatsBars";
import { useLinkBase } from "@/hooks/useLinkBase";
import { usePollState } from "@/hooks/usePollState";
import type { Author, QuoteStats } from "@/lib/types";

type ScreenState = {
  companyName?: string;
  phase?: string;
  currentQuoteIndex?: number;
  quoteCount?: number;
  roundEndsAt?: number | null;
  serverNow?: number;
  guestCount?: number;
  guestAccessToken?: string;
  authors?: Author[];
  currentQuote?: {
    id: string;
    text: string;
    optionAuthorIds: string[];
    authorId?: string;
    correctAuthor?: Author;
  } | null;
  stats?: QuoteStats | null;
  leaderboard?: { id: string; name: string; score: number }[] | null;
};

function readScreenToken(eventId: string) {
  if (typeof window === "undefined") return "";
  const hash = window.location.hash || "";
  const m = /(?:^[#&]|\bs=)([A-Za-z0-9]+)/.exec(hash);
  // Prefer #s=token
  const fromHash = new URLSearchParams(hash.replace(/^#/, "")).get("s");
  const token = fromHash || m?.[1] || sessionStorage.getItem(`screenToken:${eventId}`) || "";
  if (token) sessionStorage.setItem(`screenToken:${eventId}`, token);
  return token;
}

export function ScreenInner({ eventId }: { eventId: string }) {
  const base = useLinkBase();
  const [token, setToken] = useState("");

  useEffect(() => {
    setToken(readScreenToken(eventId));
  }, [eventId]);

  const { state, error } = usePollState(
    token ? { eventId, role: "screen", token } : null,
    Boolean(token),
  );
  const s = (state || {}) as ScreenState;

  const joinUrl = useMemo(() => {
    if (!base || !s.guestAccessToken) return "";
    return `${base}/join/${eventId}?k=${s.guestAccessToken}`;
  }, [base, eventId, s.guestAccessToken]);

  const remaining = useMemo(() => {
    if (!s.roundEndsAt || !s.serverNow) return null;
    const drift = Date.now() - s.serverNow;
    return Math.max(0, Math.ceil((s.roundEndsAt - (Date.now() - drift)) / 1000));
  }, [s.roundEndsAt, s.serverNow, state]);

  if (!token) {
    return (
      <div className="shell-hall relative-z flex items-center justify-center">
        <p className="panel text-center text-xl">Откройте ссылку экрана от ведущего (с #s=…).</p>
      </div>
    );
  }

  const phase = s.phase || "lobby";

  return (
    <>
      <Snow />
      <div className="shell-hall relative-z flex min-h-screen flex-col">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-6">
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/logo.png" alt="Schmidt" className="brand-mark mb-4" />
            <h1 className="display text-4xl md:text-6xl">Кто это сказал</h1>
            <p className="mt-2 text-lg" style={{ color: "var(--mute)" }}>
              {s.companyName || "Новогодний зал"} · гостей {s.guestCount ?? 0}
            </p>
          </div>
          {joinUrl && phase !== "finished" ? <HallQr url={joinUrl} /> : null}
        </header>

        <main className="flex flex-1 flex-col justify-center">
          {(phase === "setup" || phase === "lobby") && (
            <div className="anim-rise text-center">
              <p className="chip mx-auto mb-6">Подключайтесь</p>
              <p className="quote-display mx-auto max-w-4xl text-4xl md:text-6xl">
                Сканируй QR и угадай, кто это сказал
              </p>
            </div>
          )}

          {(phase === "question" || phase === "reveal") && s.currentQuote && (
            <div className="mx-auto w-full max-w-5xl">
              <div className="mb-6 flex items-center justify-between gap-4">
                <span className="chip text-sm">
                  Цитата {(s.currentQuoteIndex ?? 0) + 1} / {s.quoteCount}
                </span>
                {phase === "question" && remaining != null && (
                  <span className="timer-ring anim-pulse-glow rounded-full px-6 py-2">{remaining}</span>
                )}
              </div>
              <blockquote className="quote-display anim-rise text-4xl leading-[1.05] md:text-6xl lg:text-7xl">
                &laquo;{s.currentQuote.text}&raquo;
              </blockquote>

              {phase === "question" && (
                <div className="anim-rise-delay mt-10 grid grid-cols-2 gap-4 md:grid-cols-4">
                  {(s.currentQuote.optionAuthorIds || []).map((id) => {
                    const a = s.authors?.find((x) => x.id === id);
                    if (!a) return null;
                    return (
                      <div
                        key={id}
                        className="flex flex-col items-center gap-3 rounded-3xl border p-4 text-center"
                        style={{ borderColor: "var(--line)", background: "rgba(0,0,0,0.2)" }}
                      >
                        <AuthorAvatar name={a.name} photo={a.photoDataUrl} size={72} />
                        <span className="display text-xl">{a.name}</span>
                      </div>
                    );
                  })}
                </div>
              )}

              {phase === "reveal" && s.currentQuote.correctAuthor && (
                <div
                  className="anim-reveal mt-10 flex flex-wrap items-center gap-6 rounded-[2rem] border p-6 md:p-8"
                  style={{ borderColor: "rgba(200,245,66,0.5)", background: "rgba(200,245,66,0.08)" }}
                >
                  <AuthorAvatar
                    name={s.currentQuote.correctAuthor.name}
                    photo={s.currentQuote.correctAuthor.photoDataUrl}
                    size={120}
                  />
                  <div>
                    <p className="text-sm uppercase tracking-[0.2em]" style={{ color: "var(--lime)" }}>
                      Это сказал(а)
                    </p>
                    <p className="display mt-2 text-4xl md:text-6xl">{s.currentQuote.correctAuthor.name}</p>
                  </div>
                </div>
              )}

              {phase === "reveal" && s.stats && s.authors && (
                <div className="panel mt-8 max-w-3xl">
                  <StatsBars stats={s.stats} authors={s.authors} huge />
                </div>
              )}
            </div>
          )}

          {phase === "finished" && (
            <div className="anim-rise mx-auto w-full max-w-3xl">
              <h2 className="display mb-8 text-center text-5xl md:text-6xl">Топ зала</h2>
              <ol className="space-y-3">
                {(s.leaderboard || []).map((g, i) => (
                  <li
                    key={g.id}
                    className="flex items-center justify-between rounded-3xl border px-6 py-4 text-2xl"
                    style={{ borderColor: "var(--line)", background: "rgba(0,0,0,0.22)" }}
                  >
                    <span>
                      <span className="mr-4 display" style={{ color: i === 0 ? "var(--lime)" : "var(--ice)" }}>
                        {i + 1}
                      </span>
                      {g.name}
                    </span>
                    <span className="tabular-nums font-semibold" style={{ color: "var(--lime)" }}>
                      {g.score}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </main>

        {error && (
          <p className="text-center text-sm" style={{ color: "var(--coral)" }}>
            {error}
          </p>
        )}
        <BrandFooter compact />
      </div>
    </>
  );
}
