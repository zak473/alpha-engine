"use client";

/**
 * Pulsing "LIVE" badge — red dot with ping animation + "LIVE" label.
 */
export function LiveBadge({ small = false }: { small?: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-1.5"
      style={{ color: "#ef4444" }}
    >
      <span
        style={{
          position: "relative",
          display: "inline-flex",
          width: small ? 6 : 8,
          height: small ? 6 : 8,
        }}
      >
        <span
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            background: "#ef4444",
            opacity: 0.6,
            animation: "ping 1.5s cubic-bezier(0,0,0.2,1) infinite",
          }}
        />
        <span
          style={{
            position: "relative",
            display: "inline-flex",
            width: small ? 6 : 8,
            height: small ? 6 : 8,
            borderRadius: "50%",
            background: "#ef4444",
          }}
        />
      </span>
      <span
        style={{
          fontSize: small ? 9 : 11,
          fontWeight: 700,
          letterSpacing: "0.08em",
        }}
      >
        LIVE
      </span>
    </span>
  );
}
