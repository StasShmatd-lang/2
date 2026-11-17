"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AuthorAvatar } from "@/components/AuthorAvatar";
import { BrandFooter } from "@/components/BrandFooter";
import { Snow } from "@/components/Snow";
import { StatsBars } from "@/components/StatsBars";
import { usePollState } from "@/hooks/usePollState";
import { readJson } from "@/lib/apiClient";
import type { Author, QuoteStats } from "@/lib/types";

type GuestState = {
  companyName?: string;
  phase?: string;
  currentQuoteIndex?: number;
  quoteCount?: number;
  roundEndsAt?: number | null;
  serverNow?: number;
  authors?: Author[];
  currentQuote?: {
    id: string;
    text: string;
    optionAuthorIds: string[];
    authorId?: string;
    correctAuthor?: Author;
  } | null;
  myVoteAuthorId?: string;
  myScore?: number;
  stats?: QuoteStats | null;
  leaderboard?: { id: string; name: string; score: number }[];
};

export function JoinInner({ eventId }: { eventId: string }) {
  const search = useSearchParams();
  const accessToken = search.get("k") || "";

  const [name, setName] = useState("");
  const [guestId, setGuestId] = useState(() =>
    typeof window !== "undefined" ? sessionStorage.getItem(`guestId:${eventId}`) || "" : "",
  );
  const [guestToken, setGuestToken] = useState(() =>
    typeof window !== "undefined" ? sessionStorage.getItem(`guestToken:${eventId}`) || "" : "",
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const { state, setState, error } = usePollState(
    guestId && guestToken ? { eventId, role: "guest", token: guestToken, guestId } : null,
    Boolean(guestId && guestToken),
  );
  const s = (state || {}) as GuestState;

  const remaining = useMemo(() => {
    if (!s.roundEndsAt || !s.serverNow) return null;
    const drift = Date.now() - s.serverNow;
    return Math.max(0, Math.ceil((s.roundEndsAt - (Date.now() - drift)) / 1000));
  }, [s.roundEndsAt, s.serverNow, state]);

  async function join() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/guest/join", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ eventId, accessToken, name }),
      });
      const data = await readJson<{ guestId?: string; guestToken?: string; error?: string }>(res);
      if (!res.ok) throw new Error(data.error || "Не удалось войти");
      sessionStorage.setItem(`guestId:${eventId}`, data.guestId!);
      sessionStorage.setItem(`guestToken:${eventId}`, data.guestToken!);
      setGuestId(data.guestId!);
      setGuestToken(data.guestToken!);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  async function pick(authorId: string) {
    if (!guestToken || !guestId || s.phase !== "question") return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/guest/vote", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${guestToken}`,
        },
        body: JSON.stringify({ eventId, guestId, authorId }),
      });
      const data = await readJson<GuestState & { error?: string }>(res);
      if (!res.ok) throw new Error(data.error || "Ошибка");
      setState(data as unknown as Record<string, unknown>);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  if (!accessToken && !guestToken) {
    return (
      <div className="shell relative-z">
        <p className="panel mt-24 text-center">Нужна ссылка с кодом от ведущего.</p>
        <BrandFooter />
      </div>
    );
  }

  if (!guestToken) {
    return (
      <>
        <Snow />
        <div className="shell relative-z flex flex-col">
          <div className="flex flex-1 flex-col justify-center gap-6">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/logo.png" alt="Schmidt" className="brand-mark anim-rise mx-auto" />
            <div className="anim-rise-delay text-center">
              <h1 className="display text-3xl">Кто это сказал</h1>
              <p className="mt-2" style={{ color: "var(--mute)" }}>
                Войди за 10 секунд и угадывай авторов.
              </p>
            </div>
            <div className="anim-rise-delay-2 space-y-3">
              <label className="label" htmlFor="name">
                Твоё имя
              </label>
              <input
                id="name"
                className="field"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Как тебя представить"
                maxLength={40}
              />
              <button type="button" className="btn-ice w-full" disabled={busy || name.trim().length < 1} onClick={join}>
                {busy ? "Входим…" : "Играть"}
              </button>
              {(err || error) && (
                <p className="text-center text-sm" style={{ color: "var(--coral)" }}>
                  {err || error}
                </p>
              )}
            </div>
          </div>
          <BrandFooter />
        </div>
      </>
    );
  }

  const phase = s.phase || "lobby";
  const options = (s.currentQuote?.optionAuthorIds || [])
    .map((id) => s.authors?.find((a) => a.id === id))
    .filter(Boolean) as Author[];

  return (
    <>
      <Snow />
      <div className="shell relative-z">
        <header className="mb-6 flex items-center justify-between gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo.png" alt="Schmidt" className="h-8 w-auto" />
          <div className="text-right text-sm">
            <div style={{ color: "var(--mute)" }}>{s.companyName || "Зал"}</div>
            <div style={{ color: "var(--lime)" }}>Счёт: {s.myScore ?? 0}</div>
          </div>
        </header>

        {phase === "lobby" && (
          <div className="panel anim-rise text-center">
            <p className="chip mx-auto mb-4">Лобби</p>
            <h2 className="display text-3xl">Ждём первую цитату</h2>
            <p className="mt-3" style={{ color: "var(--mute)" }}>
              Смотри на экран зала — скоро начнём.
            </p>
          </div>
        )}

        {(phase === "question" || phase === "reveal") && s.currentQuote && (
          <div className="space-y-5">
            <div className="anim-rise flex items-center justify-between">
              <span className="chip">
                {(s.currentQuoteIndex ?? 0) + 1}/{s.quoteCount}
              </span>
              {phase === "question" && remaining != null && (
                <span className="timer-ring text-3xl">{remaining}</span>
              )}
            </div>
            <blockquote className="quote-display anim-rise-delay text-2xl leading-tight sm:text-3xl">
              &laquo;{s.currentQuote.text}&raquo;
            </blockquote>

            {phase === "question" && (
              <div className="anim-rise-delay-2 space-y-3">
                {options.map((a) => {
                  const selected = s.myVoteAuthorId === a.id;
                  return (
                    <button
                      key={a.id}
                      type="button"
                      className={`option-card ${selected ? "selected" : ""}`}
                      disabled={busy}
                      onClick={() => pick(a.id)}
                    >
                      <AuthorAvatar name={a.name} photo={a.photoDataUrl} size={48} />
                      <span className="display text-lg">{a.name}</span>
                    </button>
                  );
                })}
                {s.myVoteAuthorId && (
                  <p className="text-center text-sm" style={{ color: "var(--ice)" }}>
                    Ответ принят — можно сменить до конца таймера
                  </p>
                )}
              </div>
            )}

            {phase === "reveal" && s.currentQuote.correctAuthor && (
              <div className="anim-reveal panel flex items-center gap-4">
                <AuthorAvatar
                  name={s.currentQuote.correctAuthor.name}
                  photo={s.currentQuote.correctAuthor.photoDataUrl}
                  size={72}
                />
                <div>
                  <p className="text-xs uppercase tracking-[0.16em]" style={{ color: "var(--lime)" }}>
                    {s.myVoteAuthorId === s.currentQuote.authorId ? "Верно!" : "Это был(а)"}
                  </p>
                  <p className="display text-2xl">{s.currentQuote.correctAuthor.name}</p>
                </div>
              </div>
            )}

            {phase === "reveal" && s.stats && s.authors && (
              <div className="panel">
                <StatsBars stats={s.stats} authors={s.authors} />
              </div>
            )}
          </div>
        )}

        {phase === "finished" && (
          <div className="panel anim-rise">
            <h2 className="display mb-2 text-3xl">Финиш</h2>
            <p className="mb-5" style={{ color: "var(--mute)" }}>
              Твой счёт: <span style={{ color: "var(--lime)" }}>{s.myScore ?? 0}</span>
            </p>
            <ol className="space-y-2">
              {(s.leaderboard || []).map((g, i) => (
                <li
                  key={g.id}
                  className="flex justify-between rounded-2xl border px-4 py-3"
                  style={{ borderColor: "var(--line)" }}
                >
                  <span>
                    {i + 1}. {g.name}
                  </span>
                  <span className="tabular-nums" style={{ color: "var(--lime)" }}>
                    {g.score}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        )}

        {(err || error) && (
          <p className="mt-4 text-center text-sm" style={{ color: "var(--coral)" }}>
            {err || error}
          </p>
        )}
        <BrandFooter />
      </div>
    </>
  );
}
