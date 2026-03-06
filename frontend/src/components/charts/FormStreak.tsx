"use client";

interface FormStreakProps {
  results: ("W" | "D" | "L")[];
  size?: "sm" | "md";
}

const DOT_COLOR: Record<string, string> = {
  W: "#22c55e",
  D: "#f59e0b",
  L: "#ef4444",
};

export function FormStreak({ results, size = "sm" }: FormStreakProps) {
  const dim = size === "md" ? 10 : 8;
  const gap = size === "md" ? 4 : 3;

  if (!results.length) return null;

  return (
    <div className="flex items-center" style={{ gap }}>
      {results.map((r, i) => (
        <div
          key={i}
          title={r === "W" ? "Win" : r === "D" ? "Draw" : "Loss"}
          style={{
            width: dim,
            height: dim,
            borderRadius: "50%",
            backgroundColor: DOT_COLOR[r],
            opacity: 0.85,
            flexShrink: 0,
          }}
        />
      ))}
    </div>
  );
}
