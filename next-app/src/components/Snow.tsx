export function Snow() {
  const flakes = [
    { left: "8%", delay: "0s", dur: "11s", size: 5 },
    { left: "18%", delay: "2s", dur: "13s", size: 4 },
    { left: "28%", delay: "4s", dur: "10s", size: 6 },
    { left: "42%", delay: "1s", dur: "14s", size: 3 },
    { left: "55%", delay: "3.5s", dur: "12s", size: 5 },
    { left: "67%", delay: "0.8s", dur: "15s", size: 4 },
    { left: "78%", delay: "2.8s", dur: "11s", size: 6 },
    { left: "90%", delay: "1.6s", dur: "13s", size: 3 },
  ];
  return (
    <div className="snow-layer" aria-hidden>
      {flakes.map((f, i) => (
        <span
          key={i}
          style={{
            left: f.left,
            width: f.size,
            height: f.size,
            animationDelay: f.delay,
            animationDuration: f.dur,
          }}
        />
      ))}
    </div>
  );
}
