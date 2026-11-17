import { nanoid } from "nanoid";
import type { Author, Quote } from "./types";

/** Parse bulk paste: `quote — author` / `quote - author` / CSV `quote,author` / `quote|author`. */
export function parseQuotePaste(raw: string): { authors: Author[]; quotes: Quote[] } {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => !/^цитата\s*[,|;]\s*автор/i.test(l) && !/^quote\s*[,|;]\s*author/i.test(l));

  const authorByName = new Map<string, Author>();
  const quotes: Quote[] = [];

  for (const line of lines) {
    let text = "";
    let authorName = "";

    const em = line.match(/^(.+?)\s+[—–]\s+(.+)$/);
    const dash = !em ? line.match(/^(.+?)\s+-\s+(.+)$/) : null;
    const pipe = !em && !dash ? line.match(/^(.+?)\s*[|]\s*(.+)$/) : null;
    const csv = !em && !dash && !pipe ? line.match(/^(.+?)\s*,\s*(.+)$/) : null;
    const m = em || dash || pipe || csv;
    if (!m) continue;

    text = m[1].trim().replace(/^["«]|["»]$/g, "");
    authorName = m[2].trim().replace(/^["«]|["»]$/g, "");
    if (!text || !authorName) continue;

    const key = authorName.toLowerCase();
    let author = authorByName.get(key);
    if (!author) {
      author = { id: nanoid(8), name: authorName };
      authorByName.set(key, author);
    }
    quotes.push({
      id: nanoid(8),
      text,
      authorId: author.id,
      optionAuthorIds: [],
    });
  }

  const authors = [...authorByName.values()];
  for (const q of quotes) {
    q.optionAuthorIds = buildOptions(q.authorId, authors);
  }
  return { authors, quotes };
}

export function buildOptions(correctId: string, authors: Author[], max = 4): string[] {
  const others = authors.filter((a) => a.id !== correctId).map((a) => a.id);
  shuffle(others);
  const picks = [correctId, ...others.slice(0, Math.max(0, max - 1))];
  shuffle(picks);
  return picks;
}

function shuffle<T>(arr: T[]) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
