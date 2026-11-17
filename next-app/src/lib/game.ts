import { customAlphabet } from "nanoid";
import { sql } from "./db";
import { buildOptions } from "./parseQuotes";
import type {
  Author,
  EventData,
  Guest,
  Phase,
  PublicAuthor,
  Quote,
  QuoteStats,
  Vote,
} from "./types";

const nano = customAlphabet("abcdefghjkmnpqrstuvwxyz23456789", 10);
const secret = customAlphabet("abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789", 24);

const MAX_EVENTS = 80;
const MAX_AGE_MS = 36 * 60 * 60 * 1000;
const MAX_GUESTS = 120;
const MAX_QUOTES = 40;
const MAX_AUTHORS = 30;
const PHOTO_MAX = 360_000;

type Row = { id: string; data: EventData };

async function load(id: string): Promise<EventData | null> {
  const rows = await sql<Row>("select id, data from events where id = $1", [id]);
  const row = rows[0];
  if (!row) return null;
  return typeof row.data === "string" ? (JSON.parse(row.data) as EventData) : row.data;
}

async function save(ev: EventData) {
  ev.updatedAt = Date.now();
  await sql(
    `insert into events (id, data, updated_at) values ($1, $2::jsonb, now())
     on conflict (id) do update set data = excluded.data, updated_at = now()`,
    [ev.id, JSON.stringify(ev)],
  );
}

export async function pruneOld() {
  const cutoff = Date.now() - MAX_AGE_MS;
  await sql(`delete from events where (data->>'createdAt')::bigint < $1`, [cutoff]).catch(
    () => undefined,
  );
  const rows = await sql<{ id: string; n: string }>(
    `select id from events order by updated_at desc offset $1`,
    [MAX_EVENTS],
  ).catch(() => [] as { id: string; n: string }[]);
  for (const row of rows) {
    await sql(`delete from events where id = $1`, [row.id]).catch(() => undefined);
  }
}

function assertHost(ev: EventData, token?: string) {
  if (!token || token !== ev.hostToken) throw new Error("Нет доступа ведущего");
}

function publicAuthor(a: Author): PublicAuthor {
  return { id: a.id, name: a.name, photoDataUrl: a.photoDataUrl };
}

function maybeExpireRound(ev: EventData): boolean {
  if (ev.phase !== "question" || !ev.roundEndsAt) return false;
  if (Date.now() < ev.roundEndsAt) return false;
  ev.phase = "reveal";
  ev.roundEndsAt = null;
  return true;
}

function quoteStats(ev: EventData, quote: Quote): QuoteStats {
  const votes = ev.votes.filter((v) => v.quoteId === quote.id);
  const byAuthor = quote.optionAuthorIds.map((aid) => {
    const author = ev.authors.find((a) => a.id === aid);
    return {
      authorId: aid,
      name: author?.name || "?",
      count: votes.filter((v) => v.authorId === aid).length,
      isCorrect: aid === quote.authorId,
    };
  });
  return {
    quoteId: quote.id,
    total: votes.length,
    correct: votes.filter((v) => v.authorId === quote.authorId).length,
    byAuthor,
  };
}

function guestScore(ev: EventData, guestId: string) {
  let score = 0;
  for (const v of ev.votes.filter((x) => x.guestId === guestId)) {
    const q = ev.quotes.find((qq) => qq.id === v.quoteId);
    if (q && v.authorId === q.authorId) score += 1;
  }
  return score;
}

function sanitizePhoto(photo?: string) {
  if (!photo) return undefined;
  if (!photo.startsWith("data:image/")) throw new Error("Неверный формат фото");
  if (photo.length > PHOTO_MAX) throw new Error("Фото слишком большое");
  return photo;
}

export async function createEvent(companyName = ""): Promise<EventData> {
  const now = Date.now();
  const ev: EventData = {
    id: nano(),
    companyName: String(companyName || "").trim().slice(0, 80),
    hostToken: secret(),
    guestAccessToken: secret(),
    screenToken: secret(),
    phase: "setup",
    currentQuoteIndex: 0,
    roundEndsAt: null,
    roundSeconds: 25,
    authors: [],
    quotes: [],
    guests: [],
    votes: [],
    createdAt: now,
    updatedAt: now,
  };
  await save(ev);
  return ev;
}

export async function hostAction(
  eventId: string,
  hostToken: string,
  action: string,
  payload: Record<string, unknown> = {},
) {
  const ev = await load(eventId);
  if (!ev) throw new Error("Событие не найдено");
  assertHost(ev, hostToken);
  maybeExpireRound(ev);

  if (action === "setup") {
    if (ev.phase !== "setup" && ev.phase !== "lobby") {
      throw new Error("Настройка только до старта раундов");
    }
    if (typeof payload.companyName === "string") {
      ev.companyName = payload.companyName.trim().slice(0, 80);
    }
    if (typeof payload.roundSeconds === "number") {
      ev.roundSeconds = Math.min(90, Math.max(8, Math.round(payload.roundSeconds)));
    }
    if (Array.isArray(payload.authors) && Array.isArray(payload.quotes)) {
      const authors = (payload.authors as Author[]).slice(0, MAX_AUTHORS).map((a) => ({
        id: String(a.id || nano()).slice(0, 16),
        name: String(a.name || "").trim().slice(0, 60),
        photoDataUrl: sanitizePhoto(a.photoDataUrl),
      }));
      if (authors.some((a) => !a.name)) throw new Error("У каждого автора должно быть имя");
      const authorIds = new Set(authors.map((a) => a.id));
      const quotes = (payload.quotes as Quote[]).slice(0, MAX_QUOTES).map((q) => {
        const authorId = String(q.authorId);
        if (!authorIds.has(authorId)) throw new Error("Цитата ссылается на неизвестного автора");
        let optionAuthorIds = Array.isArray(q.optionAuthorIds)
          ? q.optionAuthorIds.map(String).filter((id) => authorIds.has(id))
          : [];
        if (!optionAuthorIds.includes(authorId)) optionAuthorIds = buildOptions(authorId, authors);
        if (optionAuthorIds.length < 2) optionAuthorIds = authors.map((a) => a.id).slice(0, 4);
        return {
          id: String(q.id || nano()).slice(0, 16),
          text: String(q.text || "").trim().slice(0, 280),
          authorId,
          optionAuthorIds,
        };
      });
      if (quotes.some((q) => !q.text)) throw new Error("Пустая цитата");
      if (quotes.length < 1) throw new Error("Нужна хотя бы одна цитата");
      if (authors.length < 2) throw new Error("Нужно минимум два автора для вариантов");
      ev.authors = authors;
      ev.quotes = quotes;
      ev.votes = [];
      ev.currentQuoteIndex = 0;
    }
  } else if (action === "setAuthorPhoto") {
    const authorId = String(payload.authorId || "");
    const author = ev.authors.find((a) => a.id === authorId);
    if (!author) throw new Error("Автор не найден");
    author.photoDataUrl = sanitizePhoto(String(payload.photoDataUrl || "")) || undefined;
  } else if (action === "openLobby") {
    if (ev.quotes.length < 1) throw new Error("Сначала загрузите цитаты");
    if (ev.authors.length < 2) throw new Error("Нужно минимум два автора");
    ev.phase = "lobby";
    ev.currentQuoteIndex = 0;
    ev.roundEndsAt = null;
  } else if (action === "startRound") {
    if (ev.quotes.length < 1) throw new Error("Нет цитат");
    if (ev.phase === "finished") throw new Error("Игра уже завершена");
    if (ev.phase === "setup") throw new Error("Сначала откройте лобби");
    if (ev.phase === "reveal") {
      if (ev.currentQuoteIndex >= ev.quotes.length - 1) {
        ev.phase = "finished";
        ev.roundEndsAt = null;
      } else {
        ev.currentQuoteIndex += 1;
        ev.phase = "question";
        ev.roundEndsAt = Date.now() + ev.roundSeconds * 1000;
      }
    } else if (ev.phase === "lobby" || ev.phase === "question") {
      ev.phase = "question";
      ev.roundEndsAt = Date.now() + ev.roundSeconds * 1000;
    }
  } else if (action === "reveal") {
    if (ev.phase !== "question") throw new Error("Сейчас не раунд");
    ev.phase = "reveal";
    ev.roundEndsAt = null;
  } else if (action === "finish") {
    ev.phase = "finished";
    ev.roundEndsAt = null;
  } else {
    throw new Error("Неизвестное действие");
  }

  await save(ev);
  return publicState(ev, "host");
}

export async function joinGuest(eventId: string, accessToken: string, name: string) {
  const ev = await load(eventId);
  if (!ev) throw new Error("Событие не найдено");
  if (accessToken !== ev.guestAccessToken) throw new Error("Неверный код гостя");
  if (ev.phase === "setup") throw new Error("Ведущий ещё настраивает игру");
  if (ev.phase === "finished") throw new Error("Игра уже закончилась");
  if (ev.guests.length >= MAX_GUESTS) throw new Error("Зал полный");

  const clean = String(name || "").trim().slice(0, 40);
  if (clean.length < 1) throw new Error("Введите имя");

  const guest: Guest = { id: nano(), name: clean, token: secret() };
  ev.guests.push(guest);
  await save(ev);
  return { guestId: guest.id, guestToken: guest.token, companyName: ev.companyName };
}

export async function vote(
  eventId: string,
  guestToken: string,
  guestId: string,
  authorId: string,
) {
  const ev = await load(eventId);
  if (!ev) throw new Error("Событие не найдено");
  maybeExpireRound(ev);

  const guest = ev.guests.find((g) => g.id === guestId && g.token === guestToken);
  if (!guest) throw new Error("Нет гостевой сессии");
  if (ev.phase !== "question") throw new Error("Сейчас нельзя голосовать");

  const quote = ev.quotes[ev.currentQuoteIndex];
  if (!quote) throw new Error("Нет активной цитаты");
  if (!quote.optionAuthorIds.includes(authorId)) throw new Error("Нет такого варианта");

  const existing = ev.votes.find((v) => v.guestId === guestId && v.quoteId === quote.id);
  if (existing) existing.authorId = authorId;
  else ev.votes.push({ guestId, quoteId: quote.id, authorId } satisfies Vote);

  await save(ev);
  return publicState(ev, "guest", { guestId, guestToken });
}

export async function getState(
  eventId: string,
  role: "host" | "guest" | "screen",
  auth: { hostToken?: string; screenToken?: string; guestToken?: string; guestId?: string },
) {
  const ev = await load(eventId);
  if (!ev) throw new Error("Событие не найдено");

  let changed = maybeExpireRound(ev);
  if (changed) await save(ev);

  if (role === "host") {
    assertHost(ev, auth.hostToken);
    return publicState(ev, "host");
  }
  if (role === "screen") {
    if (!auth.screenToken || auth.screenToken !== ev.screenToken) {
      throw new Error("Нет доступа экрана");
    }
    return publicState(ev, "screen");
  }
  const guest = ev.guests.find((g) => g.id === auth.guestId && g.token === auth.guestToken);
  if (!guest) throw new Error("Нет гостевой сессии");
  return publicState(ev, "guest", { guestId: guest.id, guestToken: guest.token });
}

function publicState(
  ev: EventData,
  role: "host" | "guest" | "screen",
  guestAuth?: { guestId: string; guestToken: string },
) {
  const quote = ev.quotes[ev.currentQuoteIndex];
  const showAnswer = ev.phase === "reveal" || ev.phase === "finished";
  const authorsPublic = ev.authors.map(publicAuthor);

  const base = {
    id: ev.id,
    companyName: ev.companyName,
    phase: ev.phase as Phase,
    currentQuoteIndex: ev.currentQuoteIndex,
    quoteCount: ev.quotes.length,
    roundEndsAt: ev.roundEndsAt,
    roundSeconds: ev.roundSeconds,
    guestCount: ev.guests.length,
    serverNow: Date.now(),
  };

  if (role === "host") {
    return {
      ...base,
      role: "host" as const,
      guestAccessToken: ev.guestAccessToken,
      screenToken: ev.screenToken,
      authors: authorsPublic,
      quotes: ev.quotes,
      guests: ev.guests.map((g) => ({
        id: g.id,
        name: g.name,
        score: guestScore(ev, g.id),
      })),
      currentQuote: quote
        ? {
            id: quote.id,
            text: quote.text,
            optionAuthorIds: quote.optionAuthorIds,
            authorId: quote.authorId,
          }
        : null,
      stats: quote ? quoteStats(ev, quote) : null,
      leaderboard: [...ev.guests]
        .map((g) => ({ id: g.id, name: g.name, score: guestScore(ev, g.id) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 10),
    };
  }

  if (role === "screen") {
    return {
      ...base,
      role: "screen" as const,
      guestAccessToken: ev.guestAccessToken,
      authors: authorsPublic,
      currentQuote: quote
        ? {
            id: quote.id,
            text: quote.text,
            optionAuthorIds: quote.optionAuthorIds,
            authorId: showAnswer ? quote.authorId : undefined,
            correctAuthor: showAnswer
              ? (() => {
                  const a = ev.authors.find((x) => x.id === quote.authorId);
                  return a ? publicAuthor(a) : undefined;
                })()
              : undefined,
          }
        : null,
      stats: showAnswer && quote ? quoteStats(ev, quote) : null,
      leaderboard:
        ev.phase === "finished"
          ? [...ev.guests]
              .map((g) => ({ id: g.id, name: g.name, score: guestScore(ev, g.id) }))
              .sort((a, b) => b.score - a.score)
              .slice(0, 8)
          : null,
    };
  }

  const myVote = quote
    ? ev.votes.find((v) => v.guestId === guestAuth!.guestId && v.quoteId === quote.id)
    : undefined;

  return {
    ...base,
    role: "guest" as const,
    guestId: guestAuth!.guestId,
    authors: authorsPublic,
    currentQuote: quote
      ? {
          id: quote.id,
          text: quote.text,
          optionAuthorIds: quote.optionAuthorIds,
          authorId: showAnswer ? quote.authorId : undefined,
          correctAuthor: showAnswer
            ? (() => {
                const a = ev.authors.find((x) => x.id === quote.authorId);
                return a ? publicAuthor(a) : undefined;
              })()
            : undefined,
        }
      : null,
    myVoteAuthorId: myVote?.authorId,
    myScore: guestScore(ev, guestAuth!.guestId),
    stats: showAnswer && quote ? quoteStats(ev, quote) : null,
    leaderboard:
      ev.phase === "finished"
        ? [...ev.guests]
            .map((g) => ({ id: g.id, name: g.name, score: guestScore(ev, g.id) }))
            .sort((a, b) => b.score - a.score)
            .slice(0, 8)
        : null,
  };
}
