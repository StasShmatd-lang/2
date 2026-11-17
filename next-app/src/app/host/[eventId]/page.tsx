"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import { BrandFooter } from "@/components/BrandFooter";
import { AuthorAvatar } from "@/components/AuthorAvatar";
import { HallQr } from "@/components/HallQr";
import { Snow } from "@/components/Snow";
import { StatsBars } from "@/components/StatsBars";
import { useLinkBase } from "@/hooks/useLinkBase";
import { usePollState } from "@/hooks/usePollState";
import { readJson } from "@/lib/apiClient";
import { fileToDataUrl } from "@/lib/photo";
import { parseQuotePaste } from "@/lib/parseQuotes";
import type { Author, Quote, QuoteStats } from "@/lib/types";

type HostState = {
  companyName?: string;
  phase?: string;
  currentQuoteIndex?: number;
  quoteCount?: number;
  roundEndsAt?: number | null;
  roundSeconds?: number;
  guestCount?: number;
  guestAccessToken?: string;
  screenToken?: string;
  authors?: Author[];
  quotes?: Quote[];
  currentQuote?: { id: string; text: string; authorId?: string; optionAuthorIds: string[] } | null;
  stats?: QuoteStats | null;
  leaderboard?: { id: string; name: string; score: number }[];
  serverNow?: number;
};

const SAMPLE = `В этом году мы вырастем на 200% — Иван
С Новым годом, команда! Пусть KPI сами себя выполняют — Мария
Кто не успел к дедлайну — тот первый у ёлки — Алексей
Я просто зайду на 5 минут… — Ольга`;

export default function HostPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = use(params);
  const base = useLinkBase();
  const [token] = useState(() =>
    typeof window !== "undefined" ? sessionStorage.getItem(`hostToken:${eventId}`) || "" : "",
  );
  const { state, setState, error } = usePollState(
    token ? { eventId, role: "host", token } : null,
    Boolean(token),
  );
  const s = (state || {}) as HostState;

  const [companyName, setCompanyName] = useState("");
  const [paste, setPaste] = useState(SAMPLE);
  const [roundSeconds, setRoundSeconds] = useState(25);
  const [authors, setAuthors] = useState<Author[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!state || hydrated) return;
    setHydrated(true);
    setCompanyName(s.companyName || "");
    setRoundSeconds(s.roundSeconds || 25);
    if (s.authors?.length) setAuthors(s.authors);
    if (s.quotes?.length) setQuotes(s.quotes);
  }, [state, hydrated, s.companyName, s.roundSeconds, s.authors, s.quotes]);

  const joinUrl = useMemo(() => {
    const k = s.guestAccessToken || (typeof window !== "undefined" ? sessionStorage.getItem(`guestAccess:${eventId}`) : "");
    if (!base || !k) return "";
    return `${base}/join/${eventId}?k=${k}`;
  }, [base, eventId, s.guestAccessToken]);

  const screenUrl = useMemo(() => {
    const st =
      s.screenToken ||
      (typeof window !== "undefined" ? sessionStorage.getItem(`screenToken:${eventId}`) : "");
    if (!base || !st) return "";
    return `${base}/screen/${eventId}#s=${st}`;
  }, [base, eventId, s.screenToken]);

  const remaining = useMemo(() => {
    if (!s.roundEndsAt || !s.serverNow) return null;
    const drift = Date.now() - (s.serverNow || Date.now());
    return Math.max(0, Math.ceil((s.roundEndsAt - (Date.now() - drift)) / 1000));
  }, [s.roundEndsAt, s.serverNow, state]);

  const hostPost = useCallback(
    async (action: string, payload: Record<string, unknown> = {}) => {
      setBusy(true);
      setMsg(null);
      try {
        const res = await fetch("/api/host", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ eventId, action, payload }),
        });
        const data = await readJson<HostState & { error?: string }>(res);
        if (!res.ok) throw new Error(data.error || "Ошибка");
        setState(data as unknown as Record<string, unknown>);
        return data;
      } catch (e) {
        setMsg(e instanceof Error ? e.message : "Ошибка");
        return null;
      } finally {
        setBusy(false);
      }
    },
    [eventId, setState, token],
  );

  function applyPaste() {
    const parsed = parseQuotePaste(paste);
    if (parsed.quotes.length < 1) {
      setMsg("Не удалось разобрать цитаты. Формат: текст — Автор");
      return;
    }
    if (parsed.authors.length < 2) {
      setMsg("Нужно минимум два разных автора");
      return;
    }
    setAuthors(parsed.authors);
    setQuotes(parsed.quotes);
    setMsg(`Готово: ${parsed.quotes.length} цитат, ${parsed.authors.length} авторов`);
  }

  async function saveSetup(openLobby = false) {
    const data = await hostPost("setup", {
      companyName,
      roundSeconds,
      authors,
      quotes,
    });
    if (!data) return;
    if (openLobby) {
      await hostPost("openLobby");
      setMsg("Лобби открыто");
    } else {
      setMsg("Сохранено");
    }
  }

  async function onPhoto(authorId: string, file: File | null) {
    if (!file) return;
    try {
      const photoDataUrl = await fileToDataUrl(file);
      setAuthors((prev) => prev.map((a) => (a.id === authorId ? { ...a, photoDataUrl } : a)));
      if (s.phase && s.phase !== "setup") {
        await hostPost("setAuthorPhoto", { authorId, photoDataUrl });
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Фото не загрузилось");
    }
  }

  if (!token) {
    return (
      <div className="shell relative-z">
        <p className="panel mt-20 text-center">Откройте игру с устройства ведущего после создания.</p>
        <BrandFooter />
      </div>
    );
  }

  const phase = s.phase || "setup";
  const correctAuthor = s.authors?.find((a) => a.id === s.currentQuote?.authorId);

  return (
    <>
      <Snow />
      <div className="shell-wide relative-z">
        <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/logo.png" alt="Schmidt" className="brand-mark mb-4" />
            <h1 className="display text-3xl md:text-4xl">Кто это сказал</h1>
            <p className="mt-1" style={{ color: "var(--mute)" }}>
              {s.companyName || companyName || "Ведущий"} · гости: {s.guestCount ?? 0}
            </p>
          </div>
          <span className="chip">{phaseLabel(phase)}</span>
        </header>

        {(phase === "setup" || (phase === "lobby" && quotes.length === 0 && !(s.quotes?.length))) && (
          <section className="panel anim-rise space-y-5">
            <div>
              <label className="label">Название компании</label>
              <input className="field" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
            </div>
            <div>
              <label className="label">Секунд на раунд</label>
              <input
                className="field"
                type="number"
                min={8}
                max={90}
                value={roundSeconds}
                onChange={(e) => setRoundSeconds(Number(e.target.value) || 25)}
              />
            </div>
            <div>
              <label className="label">Массовый ввод цитат</label>
              <textarea className="textarea" value={paste} onChange={(e) => setPaste(e.target.value)} />
              <p className="mt-2 text-xs" style={{ color: "var(--mute)" }}>
                Строка: «цитата — Автор» или CSV «цитата,Автор»
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button type="button" className="btn-ghost" onClick={applyPaste} disabled={busy}>
                Разобрать
              </button>
              <button
                type="button"
                className="btn-ice"
                onClick={() => saveSetup(true)}
                disabled={busy || quotes.length < 1}
              >
                Сохранить и открыть лобби
              </button>
            </div>
          </section>
        )}

        {authors.length > 0 && (phase === "setup" || phase === "lobby") && (
          <section className="mt-6 panel anim-rise-delay">
            <h2 className="display mb-4 text-2xl">Авторы и фото</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {authors.map((a) => (
                <label key={a.id} className="flex cursor-pointer items-center gap-3 rounded-2xl border p-3" style={{ borderColor: "var(--line)" }}>
                  <AuthorAvatar name={a.name} photo={a.photoDataUrl} size={56} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{a.name}</p>
                    <p className="text-xs" style={{ color: "var(--mute)" }}>
                      Нажми — загрузить фото
                    </p>
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => onPhoto(a.id, e.target.files?.[0] || null)}
                  />
                </label>
              ))}
            </div>
            {quotes.length > 0 ? (
              <button
                type="button"
                className="btn-lime mt-5"
                disabled={busy}
                onClick={() => saveSetup(true)}
              >
                Сохранить фото и в лобби
              </button>
            ) : null}
          </section>
        )}

        {(phase === "lobby" || phase === "question" || phase === "reveal" || phase === "finished") && (
          <section className="mt-6 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="panel space-y-5">
              {phase === "lobby" && (
                <>
                  <h2 className="display text-2xl">Ждём гостей</h2>
                  <p style={{ color: "var(--mute)" }}>Цитат: {s.quoteCount ?? quotes.length}. Откройте экран зала и QR.</p>
                  <button type="button" className="btn-coral anim-pulse-glow" disabled={busy} onClick={() => hostPost("startRound")}>
                    Старт первой цитаты
                  </button>
                </>
              )}

              {(phase === "question" || phase === "reveal") && s.currentQuote && (
                <>
                  <p className="chip">
                    Цитата {(s.currentQuoteIndex ?? 0) + 1} / {s.quoteCount}
                    {remaining != null && phase === "question" ? ` · ${remaining}с` : ""}
                  </p>
                  <blockquote className="quote-display text-3xl md:text-4xl">&laquo;{s.currentQuote.text}&raquo;</blockquote>
                  {phase === "question" && (
                    <div className="flex flex-wrap gap-3">
                      <button type="button" className="btn-coral" disabled={busy} onClick={() => hostPost("reveal")}>
                        Показать ответ
                      </button>
                    </div>
                  )}
                  {phase === "reveal" && correctAuthor && (
                    <div className="anim-reveal flex items-center gap-4 rounded-3xl border p-4" style={{ borderColor: "rgba(200,245,66,0.45)" }}>
                      <AuthorAvatar name={correctAuthor.name} photo={correctAuthor.photoDataUrl} size={72} />
                      <div>
                        <p className="text-xs uppercase tracking-[0.16em]" style={{ color: "var(--lime)" }}>
                          Сказал(а)
                        </p>
                        <p className="display text-2xl">{correctAuthor.name}</p>
                      </div>
                    </div>
                  )}
                  {phase === "reveal" && s.stats && s.authors && (
                    <StatsBars stats={s.stats} authors={s.authors} />
                  )}
                  {phase === "reveal" && (
                    <button
                      type="button"
                      className="btn-ice"
                      disabled={busy}
                      onClick={() => hostPost("startRound")}
                    >
                      {(s.currentQuoteIndex ?? 0) >= (s.quoteCount ?? 1) - 1 ? "Финиш" : "Следующая цитата"}
                    </button>
                  )}
                </>
              )}

              {phase === "finished" && (
                <>
                  <h2 className="display text-3xl">Итог вечера</h2>
                  <ol className="space-y-2">
                    {(s.leaderboard || []).map((g, i) => (
                      <li key={g.id} className="flex items-center justify-between rounded-2xl border px-4 py-3" style={{ borderColor: "var(--line)" }}>
                        <span>
                          <span className="mr-3" style={{ color: "var(--ice)" }}>
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
                </>
              )}
            </div>

            <aside className="space-y-4">
              <div className="panel space-y-3">
                <h3 className="display text-xl">Ссылки</h3>
                {joinUrl && <HallQr url={joinUrl} />}
                {joinUrl && (
                  <button type="button" className="btn-ghost w-full text-sm" onClick={() => navigator.clipboard.writeText(joinUrl)}>
                    Копировать ссылку гостя
                  </button>
                )}
                {screenUrl && (
                  <a className="btn-ghost w-full text-sm" href={screenUrl} target="_blank" rel="noreferrer">
                    Открыть экран зала
                  </a>
                )}
              </div>
              {s.quotes && s.quotes.length > 0 && (
                <div className="panel">
                  <h3 className="display mb-3 text-xl">Пакет цитат</h3>
                  <ul className="max-h-64 space-y-2 overflow-auto text-sm" style={{ color: "var(--mute)" }}>
                    {s.quotes.map((q, i) => (
                      <li key={q.id}>
                        {i + 1}. {q.text.slice(0, 70)}
                        {q.text.length > 70 ? "…" : ""}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </aside>
          </section>
        )}

        {(msg || error) && (
          <p className="mt-4 text-sm" style={{ color: "var(--coral)" }}>
            {msg || error}
          </p>
        )}
        <BrandFooter />
      </div>
    </>
  );
}

function phaseLabel(phase: string) {
  switch (phase) {
    case "setup":
      return "Настройка";
    case "lobby":
      return "Лобби";
    case "question":
      return "Раунд";
    case "reveal":
      return "Ответ";
    case "finished":
      return "Финиш";
    default:
      return phase;
  }
}
