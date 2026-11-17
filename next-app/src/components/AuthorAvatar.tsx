export function AuthorAvatar({
  name,
  photo,
  size = 48,
}: {
  name: string;
  photo?: string;
  size?: number;
}) {
  const initial = (name.trim()[0] || "?").toUpperCase();
  return (
    <div
      className="relative shrink-0 overflow-hidden rounded-full border"
      style={{
        width: size,
        height: size,
        borderColor: "var(--line)",
        background: "linear-gradient(145deg, rgba(127,212,255,0.25), rgba(255,107,90,0.2))",
      }}
    >
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo} alt="" className="h-full w-full object-cover" />
      ) : (
        <span
          className="display flex h-full w-full items-center justify-center"
          style={{ fontSize: size * 0.42, color: "var(--snow)" }}
        >
          {initial}
        </span>
      )}
    </div>
  );
}
