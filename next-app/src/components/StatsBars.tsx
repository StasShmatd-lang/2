import type { QuoteStats } from "@/lib/types";
import { AuthorAvatar } from "./AuthorAvatar";

export function StatsBars({
  stats,
  authors,
  huge = false,
}: {
  stats: QuoteStats;
  authors: { id: string; name: string; photoDataUrl?: string }[];
  huge?: boolean;
}) {
  const max = Math.max(1, ...stats.byAuthor.map((b) => b.count));
  return (
    <div className="space-y-3">
      {stats.byAuthor.map((row) => {
        const author = authors.find((a) => a.id === row.authorId);
        const pct = Math.round((row.count / max) * 100);
        return (
          <div key={row.authorId} className="anim-rise">
            <div className="mb-1.5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <AuthorAvatar name={row.name} photo={author?.photoDataUrl} size={huge ? 44 : 32} />
                <span className={huge ? "display text-xl" : "text-sm font-medium"}>
                  {row.name}
                  {row.isCorrect ? (
                    <span className="ml-2 text-xs" style={{ color: "var(--lime)" }}>
                      верно
                    </span>
                  ) : null}
                </span>
              </div>
              <span className="tabular-nums text-sm" style={{ color: "var(--mute)" }}>
                {row.count}
              </span>
            </div>
            <div className="stat-bar">
              <span style={{ width: `${pct}%`, background: row.isCorrect ? "linear-gradient(90deg, var(--lime), #9fd400)" : undefined }} />
            </div>
          </div>
        );
      })}
      <p className="text-sm" style={{ color: "var(--mute)" }}>
        Угадали {stats.correct} из {stats.total}
        {stats.total > 0 ? ` · ${Math.round((stats.correct / stats.total) * 100)}%` : ""}
      </p>
    </div>
  );
}
