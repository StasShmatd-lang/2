export type Phase = "setup" | "lobby" | "question" | "reveal" | "finished";

export type Author = {
  id: string;
  name: string;
  photoDataUrl?: string;
};

export type Quote = {
  id: string;
  text: string;
  authorId: string;
  optionAuthorIds: string[];
};

export type Guest = {
  id: string;
  name: string;
  token: string;
};

export type Vote = {
  guestId: string;
  quoteId: string;
  authorId: string;
};

export type EventData = {
  id: string;
  companyName: string;
  hostToken: string;
  guestAccessToken: string;
  screenToken: string;
  phase: Phase;
  currentQuoteIndex: number;
  roundEndsAt: number | null;
  roundSeconds: number;
  authors: Author[];
  quotes: Quote[];
  guests: Guest[];
  votes: Vote[];
  createdAt: number;
  updatedAt: number;
};

export type PublicAuthor = {
  id: string;
  name: string;
  photoDataUrl?: string;
};

export type QuoteStats = {
  quoteId: string;
  total: number;
  correct: number;
  byAuthor: { authorId: string; name: string; count: number; isCorrect: boolean }[];
};
