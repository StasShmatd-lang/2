import { bearerToken, readBodyLimited } from "@/lib/auth";
import { vote } from "@/lib/game";
import { err, json } from "@/lib/json";
import { rateLimit, requestLimitKey } from "@/lib/rateLimit";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = (await readBodyLimited(req, 8_192)) as {
      eventId?: string;
      guestId?: string;
      authorId?: string;
    };
    const eventId = String(body.eventId || "").trim();
    const guestId = String(body.guestId || "").trim();
    const authorId = String(body.authorId || "").trim();
    if (!eventId || !guestId || !authorId) return err("Некорректный запрос", 400);

    const token = bearerToken(req);
    if (!token) return err("Нет токена", 401);

    const key = requestLimitKey(req, `vote:${eventId}`, token);
    if (!rateLimit(key, 60, 60_000)) return err("Слишком часто", 429);

    const state = await vote(eventId, token, guestId, authorId);
    return json(state);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Ошибка";
    const status = msg.includes("сессии") ? 401 : 400;
    return err(msg, status);
  }
}
